import type {
  Attempt,
  AttemptFailureCode,
  Evaluation,
  Transcript,
  TranscriptSegment,
  TranscriptSegmentEdit,
} from "@expression-training/contracts";
import { AttemptRepository } from "../db/repositories.js";
import type { SqliteDatabase } from "../db/database.js";
import { AttemptApiError } from "../modules/attempts/errors.js";

type TranscriptRow = {
  id: string;
  attempt_id: string;
  input_mode: Transcript["inputMode"];
  status: Transcript["status"];
  revision: number;
  language: Transcript["language"];
  confidence: number;
  provider_id: string;
  provider_model: string;
  provider_request_id: string | null;
  full_text: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};

type SegmentRow = {
  id: string;
  ordinal: number;
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number;
};

type EvaluationRow = { payload_json: string };

export class AnalysisRepository {
  private readonly attempts: AttemptRepository;

  constructor(private readonly database: SqliteDatabase) {
    this.attempts = new AttemptRepository(database);
  }

  getTranscript(attemptId: string, ownerId: string): Transcript | null {
    const attempt = this.attempts.findOwned(attemptId, ownerId);
    if (!attempt || attempt.status === "deleted") return null;
    const row = this.database.prepare(`
      SELECT t.* FROM transcripts t
      INNER JOIN attempts a ON a.id = t.attempt_id
      WHERE t.attempt_id = ? AND a.owner_id = ? AND a.deleted_at IS NULL
    `).get(attemptId, ownerId) as TranscriptRow | undefined;
    if (!row) return null;
    return this.mapTranscript(row);
  }

  getEvaluation(attemptId: string, ownerId: string): Evaluation | null {
    const attempt = this.attempts.findOwned(attemptId, ownerId);
    if (!attempt || attempt.status === "deleted") return null;
    const row = this.database.prepare(`
      SELECT e.payload_json FROM evaluations e
      INNER JOIN attempts a ON a.id = e.attempt_id
      WHERE e.attempt_id = ? AND a.owner_id = ? AND a.deleted_at IS NULL
      ORDER BY e.created_at DESC LIMIT 1
    `).get(attemptId, ownerId) as EvaluationRow | undefined;
    return row ? JSON.parse(row.payload_json) as Evaluation : null;
  }

  saveTranscription(ownerId: string, transcript: Transcript): Attempt {
    const attempt = this.requireStatus(ownerId, transcript.attemptId, "transcribing");
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO transcripts (
          id, attempt_id, input_mode, status, revision, language, confidence,
          provider_id, provider_model, provider_request_id, full_text,
          created_at, updated_at, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        transcript.id,
        transcript.attemptId,
        transcript.inputMode,
        transcript.status,
        transcript.revision,
        transcript.language,
        transcript.confidence,
        transcript.provider.providerId,
        transcript.provider.model,
        transcript.provider.requestId ?? null,
        transcript.fullText,
        transcript.createdAt,
        transcript.updatedAt,
        transcript.reviewedAt ?? null,
      );
      this.insertSegments(transcript.id, transcript.revision, transcript.segments);
      const moved = this.attempts.transition({
        id: attempt.id,
        ownerId,
        expectedStatus: "transcribing",
        expectedStatusVersion: attempt.statusVersion,
        nextStatus: "transcript-review",
        now: transcript.updatedAt,
      });
      if (!moved) throw new AttemptApiError(409, "STATE_CONFLICT", "转写完成时练习状态已改变。", true);
    })();
    return this.attempts.requireOwned(attempt.id, ownerId);
  }

  saveTextAnswer(input: { ownerId: string; attemptId: string; text: string; now: string; createId: () => string }): Transcript {
    const attempt = this.requireStatus(input.ownerId, input.attemptId, "text-entry");
    if (attempt.inputMode !== "text") throw new AttemptApiError(409, "STATE_CONFLICT", "该训练不是文字输入模式。", false);
    const text = input.text.trim();
    if (text.length < 10) throw new AttemptApiError(400, "INVALID_REQUEST", "文字回答至少需要 10 个字符。", false, { text: "请补充完整观点、理由或例子。" });
    if (text.length > 8_000) throw new AttemptApiError(400, "INVALID_REQUEST", "文字回答不能超过 8000 个字符。", false);
    const transcriptId = input.createId();
    const segmentId = input.createId();
    const transcript: Transcript = {
      schemaVersion: 2,
      id: transcriptId,
      attemptId: input.attemptId,
      inputMode: "text",
      status: "user-reviewed",
      revision: 1,
      language: "zh-CN",
      confidence: 1,
      provider: { providerId: "user-text", model: "direct-input-v1" },
      segments: [{ id: segmentId, ordinal: 1, startMs: 0, endMs: 0, text, confidence: 1 }],
      fullText: text,
      createdAt: input.now,
      updatedAt: input.now,
      reviewedAt: input.now,
    };
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO transcripts (
          id, attempt_id, input_mode, status, revision, language, confidence,
          provider_id, provider_model, provider_request_id, full_text,
          created_at, updated_at, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        transcript.id, transcript.attemptId, transcript.inputMode, transcript.status, transcript.revision,
        transcript.language, transcript.confidence, transcript.provider.providerId, transcript.provider.model,
        null, transcript.fullText, transcript.createdAt, transcript.updatedAt, transcript.reviewedAt,
      );
      this.insertSegments(transcript.id, transcript.revision, transcript.segments);
      const moved = this.attempts.transition({
        id: attempt.id,
        ownerId: input.ownerId,
        expectedStatus: "text-entry",
        expectedStatusVersion: attempt.statusVersion,
        nextStatus: "transcript-review",
        now: input.now,
      });
      if (!moved) throw new AttemptApiError(409, "STATE_CONFLICT", "提交文字回答时训练状态已改变。", true);
    })();
    return transcript;
  }

  reviewTranscript(input: {
    ownerId: string;
    attemptId: string;
    baseRevision: number;
    edits: TranscriptSegmentEdit[];
    now: string;
  }): Transcript {
    this.requireStatus(input.ownerId, input.attemptId, "transcript-review");
    const current = this.getTranscript(input.attemptId, input.ownerId);
    if (!current) throw new AttemptApiError(404, "NOT_FOUND", "转写内容尚未生成。", true);
    if (current.revision !== input.baseRevision) {
      throw new AttemptApiError(409, "REVISION_CONFLICT", "转写内容已更新，请刷新后重新校对。", true, {
        baseRevision: `请求版本 ${input.baseRevision}，当前版本 ${current.revision}。`,
      });
    }

    const editMap = new Map(input.edits.map((edit) => [edit.segmentId, edit.text.trim()]));
    if (editMap.size !== current.segments.length || current.segments.some((segment) => !editMap.has(segment.id))) {
      throw new AttemptApiError(400, "INVALID_REQUEST", "必须提交当前转写的全部片段。", false);
    }
    const nextSegments = current.segments.map((segment) => ({ ...segment, text: editMap.get(segment.id) ?? "" }));
    if (nextSegments.some((segment) => !segment.text)) {
      throw new AttemptApiError(400, "INVALID_REQUEST", "转写片段不能为空。", false);
    }

    const next: Transcript = {
      ...current,
      status: "user-reviewed",
      revision: current.revision + 1,
      segments: nextSegments,
      fullText: nextSegments.map((segment) => segment.text).join(""),
      updatedAt: input.now,
      reviewedAt: input.now,
    };

    this.database.transaction(() => {
      const updated = this.database.prepare(`
        UPDATE transcripts SET status = ?, revision = ?, full_text = ?, updated_at = ?, reviewed_at = ?
        WHERE id = ? AND revision = ?
      `).run(next.status, next.revision, next.fullText, next.updatedAt, next.reviewedAt, next.id, current.revision);
      if (updated.changes !== 1) {
        throw new AttemptApiError(409, "REVISION_CONFLICT", "转写内容已更新，请刷新后重新校对。", true);
      }
      this.insertSegments(next.id, next.revision, next.segments);
    })();
    return next;
  }

  beginEvaluation(input: {
    ownerId: string;
    attemptId: string;
    transcriptRevision: number;
    rubricVersion: string;
    expectedRubricVersion: string;
    now: string;
  }): Attempt {
    const attempt = this.attempts.findOwned(input.attemptId, input.ownerId);
    if (!attempt) throw new AttemptApiError(404, "NOT_FOUND", "未找到该练习记录。", false);
    const canRetryEvaluation = attempt.status === "technical-failure" && attempt.failure?.stage === "evaluating";
    if (attempt.status !== "transcript-review" && !canRetryEvaluation) {
      throw new AttemptApiError(409, "STATE_CONFLICT", `当前状态为 ${attempt.status}，无法开始评分。`, false);
    }
    const transcript = this.getTranscript(input.attemptId, input.ownerId);
    if (!transcript || transcript.status !== "user-reviewed") {
      throw new AttemptApiError(409, "STATE_CONFLICT", "请先校对并确认转写文本。", false);
    }
    if (transcript.revision !== input.transcriptRevision) {
      throw new AttemptApiError(409, "REVISION_CONFLICT", "评分请求使用了过期转写版本。", true);
    }
    if (input.rubricVersion !== input.expectedRubricVersion) {
      throw new AttemptApiError(400, "INVALID_REQUEST", "评分规则版本不匹配。", false);
    }
    const moved = this.attempts.transition({
      id: attempt.id,
      ownerId: input.ownerId,
      expectedStatus: attempt.status,
      expectedStatusVersion: attempt.statusVersion,
      nextStatus: "evaluating",
      now: input.now,
    });
    if (!moved) throw new AttemptApiError(409, "STATE_CONFLICT", "提交评分时练习状态已改变。", true);
    return this.attempts.requireOwned(attempt.id, input.ownerId);
  }

  saveEvaluation(ownerId: string, evaluation: Evaluation): Attempt {
    const attempt = this.requireStatus(ownerId, evaluation.attemptId, "evaluating");
    const nextStatus = evaluation.status === "scorable" ? "ready" : "unscorable";
    const progressDisposition = evaluation.status === "scorable" ? "counted" : "not-counted";
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO evaluations (
          id, attempt_id, transcript_id, transcript_revision, status,
          rubric_version, confidence, overall_score, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        evaluation.id,
        evaluation.attemptId,
        evaluation.transcriptId,
        evaluation.transcriptRevision,
        evaluation.status,
        evaluation.status === "scorable" ? evaluation.rubricVersion : "unscorable-v1",
        evaluation.confidence,
        evaluation.status === "scorable" ? evaluation.overall.score : null,
        JSON.stringify(evaluation),
        evaluation.generatedAt,
      );
      const moved = this.attempts.transition({
        id: attempt.id,
        ownerId,
        expectedStatus: "evaluating",
        expectedStatusVersion: attempt.statusVersion,
        nextStatus,
        now: evaluation.generatedAt,
        progressDisposition,
      });
      if (!moved) throw new AttemptApiError(409, "STATE_CONFLICT", "保存评分时练习状态已改变。", true);
    })();
    return this.attempts.requireOwned(attempt.id, ownerId);
  }

  markTechnicalFailure(input: {
    ownerId: string;
    attemptId: string;
    stage: "transcribing" | "evaluating";
    code?: AttemptFailureCode;
    message: string;
    retryable: boolean;
    now: string;
  }): void {
    const attempt = this.attempts.findOwned(input.attemptId, input.ownerId);
    if (!attempt || attempt.status !== input.stage) return;
    this.attempts.transition({
      id: input.attemptId,
      ownerId: input.ownerId,
      expectedStatus: input.stage,
      expectedStatusVersion: attempt.statusVersion,
      nextStatus: "technical-failure",
      now: input.now,
      progressDisposition: "not-counted",
      failure: {
        code: input.code ?? (input.stage === "transcribing" ? "transcription-provider-failure" : "evaluation-provider-failure"),
        stage: input.stage,
        message: input.message,
        retryable: input.retryable,
        occurredAt: input.now,
      },
    });
  }

  private requireStatus(ownerId: string, attemptId: string, status: Attempt["status"]): Attempt {
    const attempt = this.attempts.findOwned(attemptId, ownerId);
    if (!attempt) throw new AttemptApiError(404, "NOT_FOUND", "未找到该练习记录。", false);
    if (attempt.status !== status) {
      throw new AttemptApiError(409, "STATE_CONFLICT", `当前状态为 ${attempt.status}，需要 ${status}。`, false);
    }
    return attempt;
  }

  private insertSegments(transcriptId: string, revision: number, segments: TranscriptSegment[]): void {
    const statement = this.database.prepare(`
      INSERT INTO transcript_segments (
        id, transcript_id, revision, ordinal, start_ms, end_ms, text, confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const segment of segments) {
      statement.run(
        segment.id,
        transcriptId,
        revision,
        segment.ordinal,
        segment.startMs,
        segment.endMs,
        segment.text,
        segment.confidence,
      );
    }
  }

  private mapTranscript(row: TranscriptRow): Transcript {
    const segments = this.database.prepare(`
      SELECT id, ordinal, start_ms, end_ms, text, confidence
      FROM transcript_segments
      WHERE transcript_id = ? AND revision = ?
      ORDER BY ordinal
    `).all(row.id, row.revision) as SegmentRow[];
    return {
      schemaVersion: 2,
      id: row.id,
      attemptId: row.attempt_id,
      inputMode: row.input_mode,
      status: row.status,
      revision: row.revision,
      language: row.language,
      confidence: row.confidence,
      provider: {
        providerId: row.provider_id,
        model: row.provider_model,
        ...(row.provider_request_id ? { requestId: row.provider_request_id } : {}),
      },
      segments: segments.map((segment) => ({
        id: segment.id,
        ordinal: segment.ordinal,
        startMs: segment.start_ms,
        endMs: segment.end_ms,
        text: segment.text,
        confidence: segment.confidence,
      })),
      fullText: row.full_text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}),
    };
  }
}
