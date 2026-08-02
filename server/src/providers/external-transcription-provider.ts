import type { TranscriptProviderInfo, TranscriptSegment } from "@expression-training/contracts";
import { ProviderTechnicalError } from "./provider-error.js";
import type { TranscriptionProvider, TranscriptionProviderRequest, TranscriptionProviderResult } from "./transcription-provider.js";

type Options = {
  baseUrl: string;
  model: string;
  apiKey: string;
  providerId?: string;
  timeoutMs?: number;
};

type RawSegment = {
  start?: number;
  end?: number;
  text?: string;
  confidence?: number;
  avg_logprob?: number;
};

type RawResponse = {
  text?: string;
  confidence?: number;
  segments?: RawSegment[];
};

type ProviderErrorResponse = {
  detail?: string | { message?: string };
  error?: { message?: string };
};

export class ExternalTranscriptionProvider implements TranscriptionProvider {
  readonly providerId: string;
  private readonly options: {
    baseUrl: string;
    model: string;
    apiKey: string;
    timeoutMs: number;
  };

  constructor(options: Options) {
    this.providerId = options.providerId?.trim() || "cloud-asr";
    this.options = {
      baseUrl: validateExternalBaseUrl(options.baseUrl),
      model: options.model.trim(),
      apiKey: options.apiKey.trim(),
      timeoutMs: options.timeoutMs ?? 120_000,
    };
    if (!this.options.model) throw new Error("云端语音识别模型名不能为空。");
    if (!this.options.apiKey) throw new Error("云端语音识别 API Key 不能为空。");
  }

  async transcribe(request: TranscriptionProviderRequest, signal?: AbortSignal): Promise<TranscriptionProviderResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const form = new FormData();
      form.append("file", new Blob([Uint8Array.from(request.audio.bytes).buffer], { type: request.audio.mimeType }), `attempt-${request.attemptId}.${extensionForMimeType(request.audio.mimeType)}`);
      form.append("model", this.options.model);
      form.append("language", "zh");
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "segment");

      const response = await fetch(`${this.options.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.options.apiKey}` },
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await readProviderError(response);
        if (response.status === 422 && /no speech detected|speech not detected|未检测到.*语音/iu.test(detail)) {
          throw new ProviderTechnicalError("transcription", "云端语音识别没有检测到可可靠识别的语音。请靠近麦克风、提高说话音量后重录。", { retryable: true });
        }
        const credentialHint = response.status === 401 || response.status === 403 ? "请检查云端语音服务的 API Key 和权限。" : "";
        throw new ProviderTechnicalError("transcription", `云端语音识别返回 HTTP ${response.status}${detail ? `：${detail}` : ""}。${credentialHint}`, {
          retryable: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
        });
      }

      const raw = await response.json() as RawResponse;
      const fullText = raw.text?.trim() ?? "";
      if (!fullText) {
        throw new ProviderTechnicalError("transcription", "云端语音识别没有返回可用文字，请重录后再试。", { retryable: true });
      }
      const segments = normalizeSegments(raw.segments, fullText, request.audio.durationMs, request.attemptId);
      const requestId = response.headers.get("x-request-id");
      const provider: TranscriptProviderInfo = {
        providerId: this.providerId,
        model: this.options.model,
        ...(requestId ? { requestId } : {}),
      };
      return {
        language: "zh-CN",
        confidence: clamp01(raw.confidence ?? averageConfidence(segments)),
        provider,
        segments,
        fullText,
      };
    } catch (error) {
      if (error instanceof ProviderTechnicalError) throw error;
      if (signal?.aborted) {
        throw new ProviderTechnicalError("transcription", "云端语音识别请求已取消。", { retryable: true, cause: signal.reason });
      }
      throw new ProviderTechnicalError("transcription", "无法连接云端语音识别服务，请稍后重试。", { retryable: true, cause: error });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
}

function normalizeSegments(input: RawSegment[] | undefined, fullText: string, durationMs: number, attemptId: string): TranscriptSegment[] {
  const valid = (input ?? []).map((segment, index) => ({
    ordinal: index + 1,
    startMs: Math.max(0, Math.round((segment.start ?? 0) * 1_000)),
    endMs: Math.min(durationMs, Math.round((segment.end ?? durationMs / 1_000) * 1_000)),
    text: segment.text?.trim() ?? "",
    confidence: confidenceFor(segment),
  })).filter((segment) => segment.text && segment.endMs > segment.startMs);
  if (valid.length > 0) {
    return valid.map((segment, index) => ({ id: `${attemptId}-cloud-asr-${String(index + 1).padStart(3, "0")}`, ...segment }));
  }
  return [{ id: `${attemptId}-cloud-asr-001`, ordinal: 1, startMs: 0, endMs: Math.max(1, durationMs), text: fullText, confidence: 0.78 }];
}

async function readProviderError(response: Response): Promise<string> {
  const raw = (await response.text()).slice(0, 500);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as ProviderErrorResponse;
    if (typeof parsed.detail === "string") return parsed.detail;
    if (typeof parsed.detail === "object" && parsed.detail?.message) return parsed.detail.message;
    return parsed.error?.message ?? raw;
  } catch {
    return raw;
  }
}

function validateExternalBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("云端语音识别 API 地址必须是有效 URL。");
  }
  if (url.protocol !== "https:") throw new Error("云端语音识别 API 必须使用 HTTPS。");
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("云端语音识别 API 地址不能包含账号、查询参数或片段。");
  }
  return url.toString().replace(/\/$/u, "");
}

function confidenceFor(segment: RawSegment): number {
  if (typeof segment.confidence === "number") return clamp01(segment.confidence);
  if (typeof segment.avg_logprob === "number") return clamp01(Math.exp(segment.avg_logprob));
  return 0.78;
}

function averageConfidence(segments: TranscriptSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.confidence, 0) / Math.max(1, segments.length);
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.78;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "audio/wav") return "wav";
  return "webm";
}
