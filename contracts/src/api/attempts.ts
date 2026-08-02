import type { Attempt, ClientManagedAttemptStatus } from "../domain/attempt";
import type { EntityId, FrameworkId, IsoDateTime } from "../domain/common";
import type { Evaluation } from "../domain/evaluation";
import type { Transcript } from "../domain/transcript";
import type { ApiSuccess } from "./common";

export const ATTEMPT_API = {
  collection: "/v1/attempts",
  byId: (attemptId: string) => `/v1/attempts/${attemptId}`,
  status: (attemptId: string) => `/v1/attempts/${attemptId}/status`,
  audio: (attemptId: string) => `/v1/attempts/${attemptId}/audio`,
  transcript: (attemptId: string) => `/v1/attempts/${attemptId}/transcript`,
  evaluation: (attemptId: string) => `/v1/attempts/${attemptId}/evaluation`,
} as const;

export type CreateAttemptRequest = {
  exerciseId: EntityId;
  exerciseVersionId: EntityId;
  frameworkId?: FrameworkId;
  retryOfAttemptId?: EntityId;
  focusIssueId?: EntityId;
  locale: "zh-CN";
  clientTimeZone: string;
};

export type CreateAttemptResponse = ApiSuccess<Attempt>;

export type UpdateAttemptStatusRequest = {
  expectedStatusVersion: number;
  status: ClientManagedAttemptStatus;
  clientEventAt: IsoDateTime;
};

export type UpdateAttemptStatusResponse = ApiSuccess<Attempt>;

export type AudioUploadMetadata = {
  durationMs: number;
  mimeType: string;
  byteSize: number;
  sha256: string;
  clientRecordedAt: IsoDateTime;
};

export type UploadAudioResponse = ApiSuccess<Attempt>;

export type AttemptDetail = {
  attempt: Attempt;
  transcript: Transcript | null;
  evaluation: Evaluation | null;
};

export type GetAttemptResponse = ApiSuccess<AttemptDetail>;

export type TranscriptSegmentEdit = {
  segmentId: EntityId;
  text: string;
};

export type UpdateTranscriptRequest = {
  baseRevision: number;
  segments: TranscriptSegmentEdit[];
};

export type UpdateTranscriptResponse = ApiSuccess<Transcript>;

export type RequestEvaluationRequest = {
  transcriptRevision: number;
  rubricVersion: string;
};

export type RequestEvaluationResponse = ApiSuccess<Attempt>;

export type DeleteAttemptResponse = void;

