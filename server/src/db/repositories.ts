import type {
  Attempt,
  AttemptFailure,
  AttemptStatus,
  AudioAssetSummary,
  CreateAttemptRequest,
  ProgressDisposition,
} from "@expression-training/contracts";
import type { SqliteDatabase } from "./database.js";

type AttemptRow = {
  id: string;
  owner_id: string;
  exercise_id: string;
  exercise_version_id: string;
  framework_id: "PREP" | "STAR" | null;
  status: AttemptStatus;
  status_version: number;
  retry_of_attempt_id: string | null;
  focus_issue_id: string | null;
  progress_disposition: ProgressDisposition;
  failure_code: AttemptFailure["code"] | null;
  failure_stage: AttemptFailure["stage"] | null;
  failure_message: string | null;
  failure_retryable: number | null;
  created_at: string;
  updated_at: string;
  ready_at: string | null;
  deleted_at: string | null;
  transcript_id: string | null;
  evaluation_id: string | null;
};

export type AudioAssetRecord = {
  id: string;
  attemptId: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  durationMs: number;
  sha256: string;
  createdAt: string;
  deletedAt: string | null;
};

type AudioAssetRow = {
  id: string;
  attempt_id: string;
  storage_key: string;
  mime_type: string;
  byte_size: number;
  duration_ms: number;
  sha256: string;
  created_at: string;
  deleted_at: string | null;
};

export type CreateAttemptRecord = CreateAttemptRequest & {
  id: string;
  ownerId: string;
  now: string;
};

export type CreateAudioAssetRecord = Omit<AudioAssetRecord, "deletedAt">;

const ATTEMPT_SELECT = `
  SELECT
    a.*,
    (SELECT t.id FROM transcripts t WHERE t.attempt_id = a.id LIMIT 1) AS transcript_id,
    (SELECT e.id FROM evaluations e WHERE e.attempt_id = a.id ORDER BY e.created_at DESC LIMIT 1) AS evaluation_id
  FROM attempts a
`;

export class AttemptRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(input: CreateAttemptRecord): Attempt {
    this.database
      .prepare(`
        INSERT INTO attempts (
          id, owner_id, exercise_id, exercise_version_id, framework_id,
          status, status_version, retry_of_attempt_id, focus_issue_id,
          progress_disposition, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'created', 1, ?, ?, 'pending', ?, ?)
      `)
      .run(
        input.id,
        input.ownerId,
        input.exerciseId,
        input.exerciseVersionId,
        input.frameworkId ?? null,
        input.retryOfAttemptId ?? null,
        input.focusIssueId ?? null,
        input.now,
        input.now,
      );

    return this.requireOwned(input.id, input.ownerId);
  }

  findOwned(id: string, ownerId: string): Attempt | null {
    const row = this.database
      .prepare(`${ATTEMPT_SELECT} WHERE a.id = ? AND a.owner_id = ?`)
      .get(id, ownerId) as AttemptRow | undefined;
    if (!row) return null;
    return this.mapAttempt(row, this.findAudioRecord(id));
  }

  requireOwned(id: string, ownerId: string): Attempt {
    const attempt = this.findOwned(id, ownerId);
    if (!attempt) throw new Error(`Attempt ${id} was not found after persistence operation.`);
    return attempt;
  }

  transition(input: {
    id: string;
    ownerId: string;
    expectedStatus: AttemptStatus;
    expectedStatusVersion: number;
    nextStatus: AttemptStatus;
    now: string;
    progressDisposition?: ProgressDisposition;
    failure?: AttemptFailure | null;
  }): boolean {
    const failure = input.failure ?? null;
    const result = this.database
      .prepare(`
        UPDATE attempts SET
          status = ?,
          status_version = status_version + 1,
          progress_disposition = COALESCE(?, progress_disposition),
          failure_code = ?,
          failure_stage = ?,
          failure_message = ?,
          failure_retryable = ?,
          updated_at = ?,
          ready_at = CASE WHEN ? = 'ready' THEN ? ELSE ready_at END,
          deleted_at = CASE WHEN ? = 'deleted' THEN ? ELSE deleted_at END
        WHERE id = ? AND owner_id = ? AND status = ? AND status_version = ?
      `)
      .run(
        input.nextStatus,
        input.progressDisposition ?? null,
        failure?.code ?? null,
        failure?.stage ?? null,
        failure?.message ?? null,
        failure ? Number(failure.retryable) : null,
        input.now,
        input.nextStatus,
        input.now,
        input.nextStatus,
        input.now,
        input.id,
        input.ownerId,
        input.expectedStatus,
        input.expectedStatusVersion,
      );
    return result.changes === 1;
  }

  attachAudio(input: CreateAudioAssetRecord): void {
    this.database
      .prepare(`
        INSERT INTO audio_assets (
          id, attempt_id, storage_key, mime_type, byte_size,
          duration_ms, sha256, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.id,
        input.attemptId,
        input.storageKey,
        input.mimeType,
        input.byteSize,
        input.durationMs,
        input.sha256,
        input.createdAt,
      );
  }

  findAudioRecord(attemptId: string): AudioAssetRecord | null {
    const row = this.database
      .prepare("SELECT * FROM audio_assets WHERE attempt_id = ?")
      .get(attemptId) as AudioAssetRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      attemptId: row.attempt_id,
      storageKey: row.storage_key,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      durationMs: row.duration_ms,
      sha256: row.sha256,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
    };
  }

  markAudioDeleted(attemptId: string, now: string): void {
    this.database
      .prepare("UPDATE audio_assets SET deleted_at = COALESCE(deleted_at, ?) WHERE attempt_id = ?")
      .run(now, attemptId);
  }

  runInTransaction<T>(operation: () => T): T {
    return this.database.transaction(operation)();
  }

  private mapAttempt(row: AttemptRow, audioRecord: AudioAssetRecord | null): Attempt {
    const audio: AudioAssetSummary | null =
      audioRecord && !audioRecord.deletedAt
        ? {
            id: audioRecord.id,
            mimeType: audioRecord.mimeType,
            byteSize: audioRecord.byteSize,
            durationMs: audioRecord.durationMs,
            sha256: audioRecord.sha256,
            uploadedAt: audioRecord.createdAt,
          }
        : null;

    const failure: AttemptFailure | null =
      row.failure_code && row.failure_stage && row.failure_message !== null
        ? {
            code: row.failure_code,
            stage: row.failure_stage,
            message: row.failure_message,
            retryable: Boolean(row.failure_retryable),
            occurredAt: row.updated_at,
          }
        : null;

    return {
      schemaVersion: 2,
      id: row.id,
      ownerId: row.owner_id,
      exerciseId: row.exercise_id,
      exerciseVersionId: row.exercise_version_id,
      ...(row.framework_id ? { frameworkId: row.framework_id } : {}),
      status: row.status,
      statusVersion: row.status_version,
      ...(row.retry_of_attempt_id ? { retryOfAttemptId: row.retry_of_attempt_id } : {}),
      ...(row.focus_issue_id ? { focusIssueId: row.focus_issue_id } : {}),
      audio,
      transcriptId: row.transcript_id,
      evaluationId: row.evaluation_id,
      progressDisposition: row.progress_disposition,
      failure,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.ready_at ? { readyAt: row.ready_at } : {}),
      ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
    };
  }
}

export type IdempotencyRecord = {
  fingerprint: string;
  responseStatus: number;
  responseBody: string;
  expiresAt: string;
};

export class IdempotencyRepository {
  constructor(private readonly database: SqliteDatabase) {}

  find(input: { ownerId: string; method: string; route: string; key: string; now: string }): IdempotencyRecord | null {
    this.database.prepare("DELETE FROM idempotency_keys WHERE expires_at <= ?").run(input.now);
    const row = this.database
      .prepare(`
        SELECT request_fingerprint, response_status, response_body, expires_at
        FROM idempotency_keys
        WHERE owner_id = ? AND method = ? AND route = ? AND key = ?
      `)
      .get(input.ownerId, input.method, input.route, input.key) as
      | {
          request_fingerprint: string;
          response_status: number;
          response_body: string;
          expires_at: string;
        }
      | undefined;
    return row
      ? {
          fingerprint: row.request_fingerprint,
          responseStatus: row.response_status,
          responseBody: row.response_body,
          expiresAt: row.expires_at,
        }
      : null;
  }

  save(input: {
    ownerId: string;
    method: string;
    route: string;
    key: string;
    fingerprint: string;
    responseStatus: number;
    responseBody: string;
    createdAt: string;
    expiresAt: string;
  }): void {
    this.database
      .prepare(`
        INSERT INTO idempotency_keys (
          owner_id, method, route, key, request_fingerprint,
          response_status, response_body, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.ownerId,
        input.method,
        input.route,
        input.key,
        input.fingerprint,
        input.responseStatus,
        input.responseBody,
        input.createdAt,
        input.expiresAt,
      );
  }
}
