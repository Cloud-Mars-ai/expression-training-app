import type {
  TranscriptionProvider,
  TranscriptionProviderRequest,
  TranscriptionProviderResult,
} from "./transcription-provider.js";
import { ProviderTechnicalError } from "./provider-error.js";

export type MockTranscriptionProviderOptions = {
  result?: TranscriptionProviderResult;
  failWith?: {
    message: string;
    retryable: boolean;
  };
};

const DEFAULT_TEXTS = [
  "我参与了校园物品循环平台项目，目标是让闲置物品更快找到需要的人。",
  "我主要负责梳理发布流程，并完成前端交互和数据埋点。",
  "发现同学常在填写分类时退出后，我访谈了八位用户，把发布步骤从五步缩短为三步。",
  "改版上线两周后，发布完成率从百分之五十八提升到百分之七十六。",
  "这次经历让我确认，先找到阻塞点再做方案，比直接增加功能更有效。",
] as const;

function createDefaultResult(request: TranscriptionProviderRequest): TranscriptionProviderResult {
  const usableDuration = Math.max(request.audio.durationMs, DEFAULT_TEXTS.length * 1_000);
  const segmentDuration = Math.floor(usableDuration / DEFAULT_TEXTS.length);
  const segments = DEFAULT_TEXTS.map((text, index) => {
    const startMs = index * segmentDuration;
    const endMs = index === DEFAULT_TEXTS.length - 1
      ? usableDuration
      : (index + 1) * segmentDuration;

    return {
      id: `${request.attemptId}-片段-${String(index + 1).padStart(2, "0")}`,
      ordinal: index + 1,
      startMs,
      endMs,
      text,
      confidence: [0.97, 0.95, 0.93, 0.96, 0.94][index] ?? 0.94,
    };
  });

  return {
    language: "zh-CN",
    confidence: 0.95,
    provider: {
      providerId: "mock-transcription",
      model: "deterministic-zh-cn-v1",
      requestId: `mock-asr-${request.attemptId}`,
    },
    segments,
    fullText: segments.map((segment) => segment.text).join(""),
  };
}

export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "mock-transcription";
  private readonly options: MockTranscriptionProviderOptions;

  constructor(options: MockTranscriptionProviderOptions = {}) {
    this.options = options;
  }

  async transcribe(
    request: TranscriptionProviderRequest,
    signal?: AbortSignal,
  ): Promise<TranscriptionProviderResult> {
    if (signal?.aborted) {
      throw new ProviderTechnicalError("transcription", "转写请求已取消。", {
        retryable: true,
        cause: signal.reason,
      });
    }

    if (this.options.failWith) {
      throw new ProviderTechnicalError("transcription", this.options.failWith.message, {
        retryable: this.options.failWith.retryable,
      });
    }

    return this.options.result ?? createDefaultResult(request);
  }
}
