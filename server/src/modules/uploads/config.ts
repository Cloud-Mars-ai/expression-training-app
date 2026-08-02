export const AUDIO_UPLOAD_LIMITS = {
  allowedMimeTypes: ["audio/webm", "audio/ogg", "audio/mp4", "audio/wav"] as const,
  maxByteSize: 20 * 1024 * 1024,
  minDurationMs: 1_000,
  maxDurationMs: 5 * 60_000,
  durationToleranceMs: 1_000,
} as const;

export type SupportedAudioMimeType = (typeof AUDIO_UPLOAD_LIMITS.allowedMimeTypes)[number];

export function normalizeAudioMimeType(value: string): string {
  const mime = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mime === "audio/x-wav" || mime === "audio/wave") return "audio/wav";
  if (mime === "video/webm") return "audio/webm";
  return mime;
}

export function extensionForMimeType(mimeType: SupportedAudioMimeType): string {
  switch (mimeType) {
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/mp4":
      return "m4a";
    case "audio/wav":
      return "wav";
  }
}
