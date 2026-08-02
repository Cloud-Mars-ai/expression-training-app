import { MockEvaluationProvider } from "./mock-evaluation-provider.js";
import { MockTranscriptionProvider } from "./mock-transcription-provider.js";
import { ExternalEvaluationProvider } from "./external-evaluation-provider.js";
import { ExternalTranscriptionProvider } from "./external-transcription-provider.js";
import { LocalEvaluationProvider } from "./local-evaluation-provider.js";
import { LocalTranscriptionProvider } from "./local-transcription-provider.js";
import { ProviderTechnicalError } from "./provider-error.js";
import type { EvaluationProvider } from "./evaluation-provider.js";
import type { TranscriptionProvider } from "./transcription-provider.js";

class UnconfiguredTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "unconfigured-asr";
  constructor(private readonly message = "尚未配置本地语音识别服务。请在 .env.local 中填写 LOCAL_ASR_BASE_URL 和 LOCAL_ASR_MODEL。") {}
  async transcribe(): Promise<never> { throw new ProviderTechnicalError("transcription", this.message, { retryable: false }); }
}
class UnconfiguredEvaluationProvider implements EvaluationProvider {
  readonly providerId = "unconfigured-evaluation";
  constructor(private readonly message = "尚未配置分析服务。") {}
  async evaluate(): Promise<never> { throw new ProviderTechnicalError("evaluation", this.message, { retryable: false }); }
}

export function createRuntimeProviders(): { transcription: TranscriptionProvider; evaluation: EvaluationProvider } {
  if (process.env.NODE_ENV === "test") return { transcription: new MockTranscriptionProvider(), evaluation: new MockEvaluationProvider() };
  const asrTimeout = readTimeout("LOCAL_ASR_TIMEOUT_MS");
  const llmTimeout = readTimeout("LOCAL_LLM_TIMEOUT_MS");
  const externalTimeout = readTimeout("EXTERNAL_LLM_TIMEOUT_MS");
  const transcription = createTranscriptionProvider(asrTimeout);
  const evaluation = createEvaluationProvider(llmTimeout, externalTimeout);
  return { transcription, evaluation };
}

function createTranscriptionProvider(localTimeout?: number): TranscriptionProvider {
  const provider = (process.env.ASR_PROVIDER ?? "local").trim().toLowerCase();
  if (["cloud", "external", "openai-compatible"].includes(provider)) {
    const baseUrl = process.env.CLOUD_ASR_BASE_URL;
    const model = process.env.CLOUD_ASR_MODEL;
    const apiKey = process.env.CLOUD_ASR_API_KEY;
    if (!baseUrl || !model || !apiKey) {
      return new UnconfiguredTranscriptionProvider("云端语音识别尚未完整配置。请填写 CLOUD_ASR_BASE_URL、CLOUD_ASR_MODEL 和 CLOUD_ASR_API_KEY。");
    }
    const cloudTimeout = readTimeout("CLOUD_ASR_TIMEOUT_MS");
    return new ExternalTranscriptionProvider({
      baseUrl,
      model,
      apiKey,
      providerId: process.env.CLOUD_ASR_PROVIDER_ID ?? `cloud-asr-${model}`,
      ...(cloudTimeout !== undefined ? { timeoutMs: cloudTimeout } : {}),
    });
  }
  if (provider !== "local") {
    return new UnconfiguredTranscriptionProvider(`不支持的 ASR_PROVIDER：${provider}。`);
  }
  return process.env.LOCAL_ASR_BASE_URL && process.env.LOCAL_ASR_MODEL
    ? new LocalTranscriptionProvider({
        baseUrl: process.env.LOCAL_ASR_BASE_URL,
        model: process.env.LOCAL_ASR_MODEL,
        ...(process.env.LOCAL_ASR_API_KEY ? { apiKey: process.env.LOCAL_ASR_API_KEY } : {}),
        ...(localTimeout !== undefined ? { timeoutMs: localTimeout } : {}),
      })
    : new UnconfiguredTranscriptionProvider();
}

function createEvaluationProvider(localTimeout?: number, externalTimeout?: number): EvaluationProvider {
  const provider = (process.env.EVALUATION_PROVIDER ?? "deepseek").trim().toLowerCase();
  if (["deepseek", "external", "openai-compatible"].includes(provider)) {
    const baseUrl = process.env.DEEPSEEK_BASE_URL ?? process.env.EXTERNAL_LLM_BASE_URL ?? "https://api.deepseek.com";
    const model = process.env.DEEPSEEK_MODEL ?? process.env.EXTERNAL_LLM_MODEL ?? "deepseek-chat";
    const apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.EXTERNAL_LLM_API_KEY;
    if (!apiKey) {
      return new UnconfiguredEvaluationProvider("DeepSeek API 尚未配置。请在 .env.local 中填写 DEEPSEEK_API_KEY；密钥只保存在服务端。");
    }
    return new ExternalEvaluationProvider({
      baseUrl,
      model,
      apiKey,
      providerId: process.env.EXTERNAL_LLM_PROVIDER_ID ?? `deepseek-${model}`,
      ...(externalTimeout !== undefined ? { timeoutMs: externalTimeout } : {}),
    });
  }
  if (provider === "local") {
    if (!process.env.LOCAL_LLM_BASE_URL || !process.env.LOCAL_LLM_MODEL) {
      return new UnconfiguredEvaluationProvider("本地分析服务尚未配置。请填写 LOCAL_LLM_BASE_URL 和 LOCAL_LLM_MODEL。");
    }
    return new LocalEvaluationProvider({
      baseUrl: process.env.LOCAL_LLM_BASE_URL,
      model: process.env.LOCAL_LLM_MODEL,
      ...(process.env.LOCAL_LLM_API_KEY ? { apiKey: process.env.LOCAL_LLM_API_KEY } : {}),
      providerId: process.env.LOCAL_LLM_PROVIDER_ID ?? "local-llm",
      apiStyle: process.env.LOCAL_LLM_API_STYLE === "ollama" ? "ollama" : "openai-compatible",
      ...(localTimeout !== undefined ? { timeoutMs: localTimeout } : {}),
    });
  }
  return new UnconfiguredEvaluationProvider(`不支持的 EVALUATION_PROVIDER：${provider}。`);
}

function readTimeout(name: string): number | undefined {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value >= 1_000 ? value : undefined;
}
