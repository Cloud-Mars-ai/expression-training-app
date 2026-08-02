import type { Transcript, TranscriptSegment } from "@expression-training/contracts";
import {
  ProviderTechnicalError,
  type TranscriptionProvider,
  type TranscriptionProviderRequest,
  type TranscriptionProviderResult,
} from "../../providers/index.js";

export type TranscribeAttemptOptions = TranscriptionProviderRequest & {
  provider: TranscriptionProvider;
  transcriptId?: string;
  now?: () => Date;
  signal?: AbortSignal;
};

function isUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateSegment(
  segment: TranscriptSegment,
  previous: TranscriptSegment | undefined,
  audioDurationMs: number,
): void {
  if (!segment.id.trim()) {
    throw new Error("转写片段缺少 ID。");
  }
  if (!Number.isInteger(segment.ordinal) || segment.ordinal < 1) {
    throw new Error("转写片段 ordinal 必须是正整数。");
  }
  if (previous && segment.ordinal <= previous.ordinal) {
    throw new Error("转写片段 ordinal 必须严格递增。");
  }
  if (!Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs)) {
    throw new Error("转写片段时间戳必须是有限数值。");
  }
  if (segment.startMs < 0 || segment.endMs <= segment.startMs) {
    throw new Error("转写片段时间范围无效。");
  }
  if (previous && segment.startMs < previous.endMs) {
    throw new Error("转写片段时间范围不能重叠或逆序。");
  }
  if (segment.endMs > audioDurationMs + 1_000) {
    throw new Error("转写片段时间范围超出音频时长容差。");
  }
  if (!segment.text.trim()) {
    throw new Error("转写片段文本不能为空。");
  }
  if (!isUnitInterval(segment.confidence)) {
    throw new Error("转写片段置信度必须在 0 到 1 之间。");
  }
}

function validateFullText(result: TranscriptionProviderResult): void {
  if (!result.fullText.trim()) {
    throw new Error("转写全文不能为空。");
  }

  let cursor = 0;
  for (const segment of result.segments) {
    const nextIndex = result.fullText.indexOf(segment.text, cursor);
    if (nextIndex < cursor) {
      throw new Error("转写全文必须按顺序包含全部片段文本。");
    }
    cursor = nextIndex + segment.text.length;
  }
}

function validateProviderResult(
  result: TranscriptionProviderResult,
  audioDurationMs: number,
): void {
  if (result.language !== "zh-CN") {
    throw new Error("第一版只接受 zh-CN 转写结果。");
  }
  if (!isUnitInterval(result.confidence)) {
    throw new Error("转写总体置信度必须在 0 到 1 之间。");
  }
  if (!result.provider.providerId.trim() || !result.provider.model.trim()) {
    throw new Error("转写结果必须包含 Provider 与模型标识。");
  }
  if (result.segments.length === 0) {
    throw new Error("转写结果至少需要一个片段。");
  }

  const segmentIds = new Set<string>();
  result.segments.forEach((segment, index) => {
    validateSegment(segment, result.segments[index - 1], audioDurationMs);
    if (segmentIds.has(segment.id)) {
      throw new Error("转写片段 ID 必须唯一。");
    }
    segmentIds.add(segment.id);
  });
  validateFullText(result);
}

export async function transcribeAttempt(options: TranscribeAttemptOptions): Promise<Transcript> {
  const now = options.now ?? (() => new Date());
  try {
    const result = await options.provider.transcribe(
      {
        attemptId: options.attemptId,
        language: options.language,
        audio: options.audio,
      },
      options.signal,
    );
    validateProviderResult(result, options.audio.durationMs);
    const timestamp = now().toISOString();

    return {
      schemaVersion: 2,
      inputMode: "voice",
      id: options.transcriptId ?? `transcript-${options.attemptId}`,
      attemptId: options.attemptId,
      status: "provider-draft",
      revision: 1,
      language: result.language,
      confidence: result.confidence,
      provider: { ...result.provider },
      segments: result.segments.map((segment) => ({ ...segment })),
      fullText: result.fullText,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  } catch (error) {
    if (error instanceof ProviderTechnicalError) {
      throw error;
    }
    throw new ProviderTechnicalError("transcription", "转写服务返回了无法使用的结果。", {
      retryable: false,
      cause: error,
    });
  }
}
