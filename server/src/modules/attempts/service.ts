import { randomUUID } from "node:crypto";
import type {
  Attempt,
  AttemptDetail,
  AttemptStatus,
  CreateAttemptRequest,
  Evaluation,
  Transcript,
  UpdateAttemptStatusRequest,
} from "@expression-training/contracts";
import { ATTEMPT_TRANSITIONS } from "@expression-training/contracts";
import { AttemptRepository } from "../../db/repositories.js";
import type { AudioStorage } from "../uploads/storage.js";
import { createAudioStorageKey } from "../uploads/storage.js";
import type { ValidatedAudioUpload } from "../uploads/upload-validation.js";
import { AttemptApiError } from "./errors.js";

export type AttemptAggregateReaders = {
  getTranscript(attemptId: string, ownerId: string): Promise<Transcript | null>;
  getEvaluation(attemptId: string, ownerId: string): Promise<Evaluation | null>;
};

const EMPTY_READERS: AttemptAggregateReaders = {
  getTranscript: async () => null,
  getEvaluation: async () => null,
};

export class AttemptService {
  private readonly readers: AttemptAggregateReaders;

  constructor(
    private readonly repository: AttemptRepository,
    private readonly storage: AudioStorage,
    options: {
      readers?: AttemptAggregateReaders;
      clock?: () => Date;
      createId?: () => string;
    } = {},
  ) {
    this.readers = options.readers ?? EMPTY_READERS;
    this.clock = options.clock ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  private readonly clock: () => Date;
  private readonly createId: () => string;

  createAttempt(ownerId: string, request: CreateAttemptRequest): Attempt {
    if (request.retryOfAttemptId) {
      const original = this.repository.findOwned(request.retryOfAttemptId, ownerId);
      if (!original || original.status === "deleted") {
        throw new AttemptApiError(404, "NOT_FOUND", "未找到可重练的原练习记录。");
      }
    }
    return this.repository.create({
      ...request,
      id: this.createId(),
      ownerId,
      now: this.clock().toISOString(),
    });
  }

  updateStatus(ownerId: string, attemptId: string, request: UpdateAttemptStatusRequest): Attempt {
    const attempt = this.requireActiveAttempt(ownerId, attemptId);
    if (attempt.statusVersion !== request.expectedStatusVersion) {
      throw this.statusConflict(attempt, request.expectedStatusVersion);
    }
    this.assertTransition(attempt.status, request.status);
    const updated = this.repository.transition({
      id: attempt.id,
      ownerId,
      expectedStatus: attempt.status,
      expectedStatusVersion: attempt.statusVersion,
      nextStatus: request.status,
      now: this.clock().toISOString(),
      ...(request.status === "cancelled" ? { progressDisposition: "not-counted" as const } : {}),
    });
    if (!updated) throw this.statusConflict(this.requireActiveAttempt(ownerId, attemptId), request.expectedStatusVersion);
    return this.repository.requireOwned(attemptId, ownerId);
  }

  async uploadAudio(ownerId: string, attemptId: string, upload: ValidatedAudioUpload): Promise<Attempt> {
    const attempt = this.requireActiveAttempt(ownerId, attemptId);
    if (attempt.status !== "recording") {
      throw new AttemptApiError(409, "STATE_CONFLICT", "只有 recording 状态可以上传录音。", false, {
        status: `当前状态为 ${attempt.status}。`,
      });
    }
    this.assertTransition(attempt.status, "uploading");
    const now = this.clock().toISOString();
    const movedToUploading = this.repository.transition({
      id: attempt.id,
      ownerId,
      expectedStatus: attempt.status,
      expectedStatusVersion: attempt.statusVersion,
      nextStatus: "uploading",
      now,
    });
    if (!movedToUploading) throw this.statusConflict(this.requireActiveAttempt(ownerId, attemptId), attempt.statusVersion);

    const audioAssetId = this.createId();
    const storageKey = createAudioStorageKey({
      ownerId,
      attemptId,
      audioAssetId,
      mimeType: upload.mimeType,
    });
    try {
      await this.storage.put({ storageKey, data: upload.buffer });
    } catch {
      this.markUploadTechnicalFailure(ownerId, attemptId, "录音文件暂时无法保存，请稍后重试。");
      throw new AttemptApiError(500, "INTERNAL_ERROR", "录音存储失败。", true);
    }

    try {
      this.repository.runInTransaction(() => {
        const uploading = this.repository.requireOwned(attemptId, ownerId);
        if (uploading.status !== "uploading") {
          throw new AttemptApiError(409, "STATE_CONFLICT", "上传期间练习状态已改变。");
        }
        this.repository.attachAudio({
          id: audioAssetId,
          attemptId,
          storageKey,
          mimeType: upload.mimeType,
          byteSize: upload.byteSize,
          durationMs: upload.durationMs,
          sha256: upload.sha256,
          createdAt: now,
        });
        const transitioned = this.repository.transition({
          id: attemptId,
          ownerId,
          expectedStatus: "uploading",
          expectedStatusVersion: uploading.statusVersion,
          nextStatus: "transcribing",
          now: this.clock().toISOString(),
        });
        if (!transitioned) throw new AttemptApiError(409, "STATE_CONFLICT", "无法进入转写状态。");
      });
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      if (error instanceof AttemptApiError) throw error;
      this.markUploadTechnicalFailure(ownerId, attemptId, "录音信息写入失败，请稍后重试。");
      throw new AttemptApiError(500, "INTERNAL_ERROR", "录音信息写入失败。", true);
    }

    return this.repository.requireOwned(attemptId, ownerId);
  }

  async getAttemptDetail(ownerId: string, attemptId: string): Promise<AttemptDetail> {
    const attempt = this.requireActiveAttempt(ownerId, attemptId);
    const [transcript, evaluation] = await Promise.all([
      this.readers.getTranscript(attemptId, ownerId),
      this.readers.getEvaluation(attemptId, ownerId),
    ]);
    return { attempt, transcript, evaluation };
  }

  async deleteAttempt(ownerId: string, attemptId: string): Promise<void> {
    const attempt = this.repository.findOwned(attemptId, ownerId);
    if (!attempt) return;
    const audioRecord = this.repository.findAudioRecord(attemptId);

    if (attempt.status !== "deleted") {
      this.assertTransition(attempt.status, "deleted");
      const transitioned = this.repository.transition({
        id: attemptId,
        ownerId,
        expectedStatus: attempt.status,
        expectedStatusVersion: attempt.statusVersion,
        nextStatus: "deleted",
        now: this.clock().toISOString(),
        progressDisposition: "not-counted",
      });
      if (!transitioned) throw new AttemptApiError(409, "STATE_CONFLICT", "删除期间练习状态已改变。", true);
    }

    if (audioRecord && !audioRecord.deletedAt) {
      try {
        await this.storage.delete(audioRecord.storageKey);
        this.repository.markAudioDeleted(attemptId, this.clock().toISOString());
      } catch {
        // The attempt tombstone remains authoritative. A later idempotent DELETE retries file cleanup.
      }
    }
  }

  private requireActiveAttempt(ownerId: string, attemptId: string): Attempt {
    const attempt = this.repository.findOwned(attemptId, ownerId);
    if (!attempt) throw new AttemptApiError(404, "NOT_FOUND", "未找到该练习记录。");
    if (attempt.status === "deleted") throw new AttemptApiError(410, "GONE", "该练习记录已删除。");
    return attempt;
  }

  private assertTransition(from: AttemptStatus, to: AttemptStatus): void {
    const allowed = ATTEMPT_TRANSITIONS[from] as readonly AttemptStatus[];
    if (!allowed.includes(to)) {
      throw new AttemptApiError(409, "STATE_CONFLICT", `不允许从 ${from} 转换到 ${to}。`, false, {
        status: `允许的后续状态：${allowed.join("、") || "无"}`,
      });
    }
  }

  private statusConflict(current: Attempt, expectedVersion: number): AttemptApiError {
    return new AttemptApiError(409, "STATE_CONFLICT", "练习状态已被其他请求更新，请刷新后重试。", true, {
      expectedStatusVersion: `请求版本 ${expectedVersion}，当前版本 ${current.statusVersion}。`,
    });
  }

  private markUploadTechnicalFailure(ownerId: string, attemptId: string, message: string): void {
    const current = this.repository.findOwned(attemptId, ownerId);
    if (!current || current.status !== "uploading") return;
    const occurredAt = this.clock().toISOString();
    this.repository.transition({
      id: attemptId,
      ownerId,
      expectedStatus: "uploading",
      expectedStatusVersion: current.statusVersion,
      nextStatus: "technical-failure",
      now: occurredAt,
      progressDisposition: "not-counted",
      failure: {
        code: "upload-storage-failure",
        stage: "uploading",
        message,
        retryable: true,
        occurredAt,
      },
    });
  }
}
