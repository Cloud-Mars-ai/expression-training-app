import type { AudioUploadMetadata } from "@expression-training/contracts";
import { z } from "zod";
import { AudioInspectionError, inspectAudio, type AudioInspection } from "./audio-inspection.js";
import {
  AUDIO_UPLOAD_LIMITS,
  normalizeAudioMimeType,
  type SupportedAudioMimeType,
} from "./config.js";

export type UploadValidationErrorCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "AUDIO_TOO_LARGE"
  | "AUDIO_TOO_SHORT"
  | "AUDIO_DURATION_MISMATCH";

export class UploadValidationError extends Error {
  constructor(
    readonly code: UploadValidationErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "UploadValidationError";
  }
}

const metadataSchema = z.object({
  durationMs: z.number().int().positive(),
  mimeType: z.string().min(1).max(100),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f\d]{64}$/i),
  clientRecordedAt: z.iso.datetime(),
});

export function parseAudioUploadMetadata(raw: string): AudioUploadMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UploadValidationError("INVALID_REQUEST", "metadata 必须是有效 JSON。", {
      metadata: "无法解析 JSON。",
    });
  }
  const result = metadataSchema.safeParse(parsed);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) fieldErrors[issue.path.join(".") || "metadata"] = issue.message;
    throw new UploadValidationError("INVALID_REQUEST", "音频 metadata 不完整或格式错误。", fieldErrors);
  }
  return result.data;
}

export type ValidatedAudioUpload = {
  buffer: Buffer;
  mimeType: SupportedAudioMimeType;
  byteSize: number;
  durationMs: number;
  sha256: string;
  clientRecordedAt: string;
};

export function validateAudioUpload(input: {
  buffer: Buffer;
  multipartMimeType: string;
  metadata: AudioUploadMetadata;
}): ValidatedAudioUpload {
  if (input.buffer.length > AUDIO_UPLOAD_LIMITS.maxByteSize) {
    throw new UploadValidationError("AUDIO_TOO_LARGE", "录音文件超过 20 MB 上限。");
  }
  if (input.metadata.byteSize !== input.buffer.length) {
    throw new UploadValidationError("INVALID_REQUEST", "metadata.byteSize 与实际文件大小不一致。", {
      byteSize: "必须与实际上传字节数一致。",
    });
  }

  let inspection: AudioInspection;
  try {
    inspection = inspectAudio(input.buffer);
  } catch (error) {
    if (error instanceof AudioInspectionError) {
      throw new UploadValidationError("UNSUPPORTED_MEDIA_TYPE", error.message);
    }
    throw error;
  }

  const declaredMime = normalizeAudioMimeType(input.metadata.mimeType);
  const multipartMime = normalizeAudioMimeType(input.multipartMimeType);
  if (declaredMime !== inspection.mimeType || multipartMime !== inspection.mimeType) {
    throw new UploadValidationError(
      "UNSUPPORTED_MEDIA_TYPE",
      `音频内容为 ${inspection.mimeType}，与上传声明不一致。`,
      { mimeType: "metadata、multipart 与文件内容必须一致。" },
    );
  }
  if (inspection.sha256 !== input.metadata.sha256.toLowerCase()) {
    throw new UploadValidationError("INVALID_REQUEST", "metadata.sha256 与实际文件摘要不一致。", {
      sha256: "必须是实际上传文件的 SHA-256。",
    });
  }
  if (inspection.durationMs < AUDIO_UPLOAD_LIMITS.minDurationMs) {
    throw new UploadValidationError("AUDIO_TOO_SHORT", "录音时长不足 1 秒，请重新录制。");
  }
  if (inspection.durationMs > AUDIO_UPLOAD_LIMITS.maxDurationMs) {
    throw new UploadValidationError("INVALID_REQUEST", "录音时长超过 5 分钟上限。", {
      durationMs: "不能超过 300000 毫秒。",
    });
  }
  if (Math.abs(inspection.durationMs - input.metadata.durationMs) > AUDIO_UPLOAD_LIMITS.durationToleranceMs) {
    throw new UploadValidationError(
      "AUDIO_DURATION_MISMATCH",
      "metadata.durationMs 与音频容器中的实际时长差异过大。",
      { durationMs: `检测时长为 ${inspection.durationMs} 毫秒。` },
    );
  }

  return {
    buffer: input.buffer,
    mimeType: inspection.mimeType,
    byteSize: input.buffer.length,
    durationMs: inspection.durationMs,
    sha256: inspection.sha256,
    clientRecordedAt: input.metadata.clientRecordedAt,
  };
}
