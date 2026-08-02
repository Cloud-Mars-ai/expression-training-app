export type RecorderStatus =
  | "idle"
  | "requesting-permission"
  | "ready"
  | "recording"
  | "paused"
  | "stopping"
  | "recorded"
  | "cancelled"
  | "error";

export type RecorderErrorCode =
  | "permission-denied"
  | "no-device"
  | "device-busy"
  | "unsupported"
  | "recording-interrupted"
  | "silent-input"
  | "too-short"
  | "empty-recording"
  | "invalid-state"
  | "cancelled"
  | "unknown";

export type RecorderErrorInfo = {
  code: RecorderErrorCode;
  message: string;
  recoverable: boolean;
};

export type RecordedAudio = {
  blob: Blob;
  durationMs: number;
  durationSeconds: number;
  mimeType: string;
  previewUrl: string;
  peakLevel: number;
};

export type RecorderSnapshot = {
  status: RecorderStatus;
  durationMs: number;
  inputLevel: number;
  peakLevel: number;
  hasLiveStream: boolean;
  result: RecordedAudio | null;
  error: RecorderErrorInfo | null;
};

export const initialRecorderSnapshot: RecorderSnapshot = {
  status: "idle",
  durationMs: 0,
  inputLevel: 0,
  peakLevel: 0,
  hasLiveStream: false,
  result: null,
  error: null,
};
