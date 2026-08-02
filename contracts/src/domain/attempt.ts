import type { EntityId, FrameworkId, IsoDateTime } from "./common";

export const ATTEMPT_STATUSES = [
  "created",
  "permission-check",
  "recording",
  "uploading",
  "transcribing",
  "transcript-review",
  "evaluating",
  "ready",
  "cancelled",
  "technical-failure",
  "unscorable",
  "deleted",
] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];
export type ClientManagedAttemptStatus = "permission-check" | "recording" | "cancelled";
export type ProgressDisposition = "pending" | "counted" | "not-counted";

export type AttemptFailureCode =
  | "upload-storage-failure"
  | "transcription-provider-failure"
  | "evaluation-provider-failure"
  | "processing-timeout"
  | "internal-failure";

export type AttemptFailure = {
  code: AttemptFailureCode;
  stage: "uploading" | "transcribing" | "evaluating";
  message: string;
  retryable: boolean;
  occurredAt: IsoDateTime;
};

export type AudioAssetSummary = {
  id: EntityId;
  mimeType: string;
  byteSize: number;
  durationMs: number;
  sha256: string;
  uploadedAt: IsoDateTime;
};

export type Attempt = {
  schemaVersion: 2;
  id: EntityId;
  ownerId: EntityId;
  exerciseId: EntityId;
  exerciseVersionId: EntityId;
  frameworkId?: FrameworkId;
  status: AttemptStatus;
  statusVersion: number;
  retryOfAttemptId?: EntityId;
  focusIssueId?: EntityId;
  audio: AudioAssetSummary | null;
  transcriptId: EntityId | null;
  evaluationId: EntityId | null;
  progressDisposition: ProgressDisposition;
  failure: AttemptFailure | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  readyAt?: IsoDateTime;
  deletedAt?: IsoDateTime;
};

