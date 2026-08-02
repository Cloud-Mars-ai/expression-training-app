import { randomUUID } from "node:crypto";
import type {
  Attempt,
  Evaluation,
  RequestEvaluationRequest,
  Transcript,
  TranscriptSegmentEdit,
} from "@expression-training/contracts";
import { AttemptRepository } from "../db/repositories.js";
import type { SqliteDatabase } from "../db/database.js";
import { evaluateTranscript } from "../modules/evaluation/index.js";
import { transcribeAttempt } from "../modules/transcription/index.js";
import type { ReadableAudioStorage } from "../modules/uploads/storage.js";
import {
  MockEvaluationProvider,
  MockTranscriptionProvider,
  ProviderTechnicalError,
  type EvaluationProvider,
  type TranscriptionProvider,
} from "../providers/index.js";
import { AnalysisRepository } from "./analysis-repository.js";
import { getStructuredExpressionRubric, STRUCTURED_EXPRESSION_RUBRIC } from "./structured-expression-rubric.js";

export class AnalysisPipeline {
  readonly readers;
  private readonly attempts: AttemptRepository;
  private readonly analysis: AnalysisRepository;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    database: SqliteDatabase,
    private readonly storage: ReadableAudioStorage,
    private readonly transcriptionProvider: TranscriptionProvider = new MockTranscriptionProvider(),
    private readonly evaluationProvider: EvaluationProvider = new MockEvaluationProvider(),
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.attempts = new AttemptRepository(database);
    this.analysis = new AnalysisRepository(database);
    this.readers = {
      getTranscript: async (attemptId: string, ownerId: string) => this.analysis.getTranscript(attemptId, ownerId),
      getEvaluation: async (attemptId: string, ownerId: string) => this.analysis.getEvaluation(attemptId, ownerId),
    };
  }

  enqueueTranscription(ownerId: string, attemptId: string): void {
    this.track(this.processTranscription(ownerId, attemptId));
  }

  enqueueEvaluation(ownerId: string, attemptId: string): void {
    this.track(this.processEvaluation(ownerId, attemptId));
  }

  resumePending(): void {
    for (const attempt of this.attempts.findByStatuses(["transcribing", "evaluating"])) {
      if (attempt.status === "transcribing") this.enqueueTranscription(attempt.ownerId, attempt.id);
      if (attempt.status === "evaluating") this.enqueueEvaluation(attempt.ownerId, attempt.id);
    }
  }

  async drain(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
  }

  async processTranscription(ownerId: string, attemptId: string): Promise<void> {
    const attempt = this.attempts.findOwned(attemptId, ownerId);
    if (!attempt || attempt.status !== "transcribing") return;
    const audio = this.attempts.findAudioRecord(attemptId);
    if (!audio || audio.deletedAt) {
      this.analysis.markTechnicalFailure({
        ownerId,
        attemptId,
        stage: "transcribing",
        message: "录音文件不存在，无法完成转写。",
        retryable: false,
        now: this.clock().toISOString(),
      });
      return;
    }
    let transcript: Transcript;
    try {
      const bytes = await this.storage.read(audio.storageKey);
      transcript = await transcribeAttempt({
        provider: this.transcriptionProvider,
        attemptId,
        language: "zh-CN",
        audio: {
          assetId: audio.id,
          mimeType: audio.mimeType,
          byteSize: audio.byteSize,
          durationMs: audio.durationMs,
          sha256: audio.sha256,
          bytes,
        },
        now: this.clock,
      });
    } catch (error) {
      const providerError = error instanceof ProviderTechnicalError ? error : null;
      this.analysis.markTechnicalFailure({
        ownerId,
        attemptId,
        stage: "transcribing",
        message: providerError?.message ?? "转写处理失败，请稍后重试。",
        retryable: providerError?.retryable ?? true,
        now: this.clock().toISOString(),
      });
      return;
    }
    try {
      this.analysis.saveTranscription(ownerId, transcript);
    } catch {
      this.analysis.markTechnicalFailure({
        ownerId,
        attemptId,
        stage: "transcribing",
        code: "internal-failure",
        message: "转写结果暂时无法保存，请稍后重新录音。",
        retryable: true,
        now: this.clock().toISOString(),
      });
    }
  }

  reviewTranscript(input: {
    ownerId: string;
    attemptId: string;
    baseRevision: number;
    segments: TranscriptSegmentEdit[];
  }): Transcript {
    return this.analysis.reviewTranscript({ ...input, edits: input.segments, now: this.clock().toISOString() });
  }

  submitTextAnswer(ownerId: string, attemptId: string, text: string): Transcript {
    return this.analysis.saveTextAnswer({ ownerId, attemptId, text, now: this.clock().toISOString(), createId: randomUUID });
  }

  beginEvaluation(ownerId: string, attemptId: string, request: RequestEvaluationRequest): Attempt {
    return this.analysis.beginEvaluation({
      ownerId,
      attemptId,
      transcriptRevision: request.transcriptRevision,
      rubricVersion: request.rubricVersion,
      expectedRubricVersion: STRUCTURED_EXPRESSION_RUBRIC.version,
      now: this.clock().toISOString(),
    });
  }

  async processEvaluation(ownerId: string, attemptId: string): Promise<void> {
    const attempt = this.attempts.findOwned(attemptId, ownerId);
    if (!attempt || attempt.status !== "evaluating") return;
    const transcript = this.analysis.getTranscript(attemptId, ownerId);
    if (!transcript) {
      this.analysis.markTechnicalFailure({
        ownerId,
        attemptId,
        stage: "evaluating",
        message: "转写内容不存在，无法完成评分。",
        retryable: false,
        now: this.clock().toISOString(),
      });
      return;
    }
    let evaluation: Evaluation;
    try {
      evaluation = await evaluateTranscript({
        provider: this.evaluationProvider,
        attemptId,
        transcript,
        rubric: getStructuredExpressionRubric(attempt.exerciseId, attempt.inputMode),
        now: this.clock,
      });
    } catch (error) {
      const providerError = error instanceof ProviderTechnicalError ? error : null;
      this.analysis.markTechnicalFailure({
        ownerId,
        attemptId,
        stage: "evaluating",
        message: providerError?.message ?? "评分处理失败，请稍后重试。",
        retryable: providerError?.retryable ?? true,
        now: this.clock().toISOString(),
      });
      return;
    }
    try {
      this.analysis.saveEvaluation(ownerId, evaluation);
    } catch {
      this.analysis.markTechnicalFailure({
        ownerId,
        attemptId,
        stage: "evaluating",
        code: "internal-failure",
        message: "评分结果暂时无法保存，请稍后重新练习。",
        retryable: true,
        now: this.clock().toISOString(),
      });
    }
  }

  private track(task: Promise<void>): void {
    const guarded = task.catch(() => undefined).finally(() => this.inFlight.delete(guarded));
    this.inFlight.add(guarded);
  }
}
