import "@fastify/multipart";
import type { FastifyRequest } from "fastify";
import { AUDIO_UPLOAD_LIMITS } from "./config.js";
import {
  parseAudioUploadMetadata,
  UploadValidationError,
  validateAudioUpload,
  type ValidatedAudioUpload,
} from "./upload-validation.js";

export async function readAudioMultipart(request: FastifyRequest): Promise<ValidatedAudioUpload> {
  if (!request.isMultipart()) {
    throw new UploadValidationError("INVALID_REQUEST", "该端点只接受 multipart/form-data。");
  }

  let audioBuffer: Buffer | null = null;
  let audioMimeType = "";
  let metadataText: string | null = null;

  try {
    const parts = request.parts({
      limits: {
        files: 1,
        fields: 1,
        parts: 2,
        fileSize: AUDIO_UPLOAD_LIMITS.maxByteSize + 1,
      },
    });
    for await (const part of parts) {
      if (part.type === "file") {
        if (part.fieldname !== "audio" || audioBuffer) {
          part.file.resume();
          throw new UploadValidationError("INVALID_REQUEST", "只能上传一个名为 audio 的文件字段。");
        }
        audioMimeType = part.mimetype;
        audioBuffer = await part.toBuffer();
        if (part.file.truncated || audioBuffer.length > AUDIO_UPLOAD_LIMITS.maxByteSize) {
          throw new UploadValidationError("AUDIO_TOO_LARGE", "录音文件超过 20 MB 上限。");
        }
      } else if (part.fieldname === "metadata" && metadataText === null) {
        metadataText = String(part.value);
      } else {
        throw new UploadValidationError("INVALID_REQUEST", "multipart 只允许 audio 和 metadata 字段。");
      }
    }
  } catch (error) {
    if (error instanceof UploadValidationError) throw error;
    const code = (error as { code?: string }).code;
    if (code === "FST_REQ_FILE_TOO_LARGE") {
      throw new UploadValidationError("AUDIO_TOO_LARGE", "录音文件超过 20 MB 上限。");
    }
    throw error;
  }

  if (!audioBuffer || metadataText === null) {
    throw new UploadValidationError("INVALID_REQUEST", "必须同时提供 audio 文件和 metadata 字段。", {
      ...(!audioBuffer ? { audio: "缺少音频文件。" } : {}),
      ...(metadataText === null ? { metadata: "缺少音频 metadata。" } : {}),
    });
  }

  const completeAudioBuffer = audioBuffer;
  return validateAudioUpload({
    buffer: completeAudioBuffer,
    multipartMimeType: audioMimeType,
    metadata: parseAudioUploadMetadata(metadataText),
  });
}
