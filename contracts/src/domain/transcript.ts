import type { EntityId, InputMode, IsoDateTime } from "./common.js";

export type TranscriptStatus = "provider-draft" | "user-reviewed";

export type TranscriptSegment = {
  id: EntityId;
  ordinal: number;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number;
};

export type TranscriptProviderInfo = {
  providerId: string;
  model: string;
  requestId?: string;
};

export type Transcript = {
  schemaVersion: 2;
  id: EntityId;
  attemptId: EntityId;
  inputMode: InputMode;
  status: TranscriptStatus;
  revision: number;
  language: "zh-CN";
  confidence: number;
  provider: TranscriptProviderInfo;
  segments: TranscriptSegment[];
  fullText: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  reviewedAt?: IsoDateTime;
};
