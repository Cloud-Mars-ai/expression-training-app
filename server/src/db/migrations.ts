export type Migration = {
  id: number;
  name: string;
  sql: string;
};

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: "initial_attempt_pipeline",
    sql: `
      CREATE TABLE attempts (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        exercise_version_id TEXT NOT NULL,
        framework_id TEXT,
        status TEXT NOT NULL,
        status_version INTEGER NOT NULL,
        retry_of_attempt_id TEXT,
        focus_issue_id TEXT,
        progress_disposition TEXT NOT NULL,
        failure_code TEXT,
        failure_stage TEXT,
        failure_message TEXT,
        failure_retryable INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        ready_at TEXT,
        deleted_at TEXT,
        FOREIGN KEY (retry_of_attempt_id) REFERENCES attempts(id)
      );

      CREATE INDEX attempts_owner_created_idx
        ON attempts(owner_id, created_at DESC);
      CREATE INDEX attempts_owner_status_idx
        ON attempts(owner_id, status);

      CREATE TABLE audio_assets (
        id TEXT PRIMARY KEY,
        attempt_id TEXT NOT NULL UNIQUE,
        storage_key TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (attempt_id) REFERENCES attempts(id)
      );

      CREATE TABLE transcripts (
        id TEXT PRIMARY KEY,
        attempt_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        revision INTEGER NOT NULL,
        language TEXT NOT NULL,
        confidence REAL NOT NULL,
        provider_id TEXT NOT NULL,
        provider_model TEXT NOT NULL,
        provider_request_id TEXT,
        full_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        reviewed_at TEXT,
        FOREIGN KEY (attempt_id) REFERENCES attempts(id)
      );

      CREATE TABLE transcript_segments (
        id TEXT NOT NULL,
        transcript_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        ordinal INTEGER NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        text TEXT NOT NULL,
        confidence REAL NOT NULL,
        PRIMARY KEY (id, revision),
        UNIQUE (transcript_id, revision, ordinal),
        FOREIGN KEY (transcript_id) REFERENCES transcripts(id)
      );

      CREATE INDEX transcript_segments_revision_idx
        ON transcript_segments(transcript_id, revision, ordinal);

      CREATE TABLE evaluations (
        id TEXT PRIMARY KEY,
        attempt_id TEXT NOT NULL,
        transcript_id TEXT,
        transcript_revision INTEGER,
        status TEXT NOT NULL,
        rubric_version TEXT NOT NULL,
        confidence REAL NOT NULL,
        overall_score REAL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (attempt_id) REFERENCES attempts(id),
        FOREIGN KEY (transcript_id) REFERENCES transcripts(id)
      );

      CREATE INDEX evaluations_attempt_created_idx
        ON evaluations(attempt_id, created_at DESC);

      CREATE TABLE idempotency_keys (
        owner_id TEXT NOT NULL,
        method TEXT NOT NULL,
        route TEXT NOT NULL,
        key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        response_status INTEGER NOT NULL,
        response_body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, method, route, key)
      );

      CREATE INDEX idempotency_expiry_idx ON idempotency_keys(expires_at);
    `,
  },
] as const;
