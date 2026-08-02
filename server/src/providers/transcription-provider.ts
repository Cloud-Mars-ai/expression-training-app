import type { TranscriptProviderInfo, TranscriptSegment } from "@expression-training/contracts";

export type TranscriptionAudioInput = {
  assetId: string;
  mimeType: string;
  byteSize: number;
  durationMs: number;
  sha256: string;
  bytes: Uint8Array;
};

export type TranscriptionProviderRequest = {
  attemptId: string;
  language: "zh-CN";
  audio: TranscriptionAudioInput;
};

export type TranscriptionProviderResult = {
  language: "zh-CN";
  confidence: number;
  provider: TranscriptProviderInfo;
  segments: TranscriptSegment[];
  fullText: string;
};

export interface TranscriptionProvider {
  readonly providerId: string;
  transcribe(
    request: TranscriptionProviderRequest,
    signal?: AbortSignal,
  ): Promise<TranscriptionProviderResult>;
}
