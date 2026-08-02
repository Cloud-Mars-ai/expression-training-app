import type { EvaluationProvider, EvaluationProviderRequest, EvaluationProviderResult } from "./evaluation-provider.js";
import { createEvaluationMessages, EVALUATION_OUTPUT_JSON_SCHEMA, parseEvaluationContent } from "./local-evaluation-provider.js";
import { ProviderTechnicalError } from "./provider-error.js";

type ExternalEvaluationProviderOptions = {
  baseUrl: string;
  model: string;
  apiKey: string;
  providerId?: string;
  timeoutMs?: number;
};

export class ExternalEvaluationProvider implements EvaluationProvider {
  readonly providerId: string;
  private readonly options: {
    baseUrl: string;
    model: string;
    apiKey: string;
    timeoutMs: number;
  };

  constructor(options: ExternalEvaluationProviderOptions) {
    const baseUrl = validateExternalBaseUrl(options.baseUrl);
    if (!options.apiKey.trim()) throw new Error("外部分析 API Key 不能为空。");
    if (!options.model.trim()) throw new Error("外部分析模型名称不能为空。");
    this.providerId = options.providerId ?? "external-openai-compatible";
    this.options = {
      baseUrl,
      model: options.model.trim(),
      apiKey: options.apiKey.trim(),
      timeoutMs: options.timeoutMs ?? 90_000,
    };
  }

  async evaluate(request: EvaluationProviderRequest, signal?: AbortSignal): Promise<EvaluationProviderResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          stream: false,
          temperature: 0,
          max_tokens: 2_000,
          response_format: { type: "json_object" },
          messages: createExternalEvaluationMessages(request),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw new ProviderTechnicalError("evaluation", `DeepSeek API 返回 HTTP ${response.status}，本次不生成分数。`, {
          retryable,
          cause: new Error(detail),
        });
      }
      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new ProviderTechnicalError("evaluation", "DeepSeek API 没有返回可用结果，本次不生成分数。", { retryable: true });
      }
      return parseEvaluationContent(request, content, "DeepSeek API");
    } catch (error) {
      if (error instanceof ProviderTechnicalError) throw error;
      if (signal?.aborted) {
        throw new ProviderTechnicalError("evaluation", "DeepSeek 分析请求已取消。", { retryable: true, cause: signal.reason });
      }
      throw new ProviderTechnicalError("evaluation", "无法连接 DeepSeek API，本次不生成分数。", { retryable: true, cause: error });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
}

function createExternalEvaluationMessages(request: EvaluationProviderRequest) {
  const messages = createEvaluationMessages(request);
  const system = messages[0];
  if (!system) return messages;
  return [
    {
      ...system,
      content: `${system.content}\n必须逐字段遵循下面的 JSON Schema；不得改名、合并、删减字段，不得用字符串代替对象：\n${JSON.stringify(EVALUATION_OUTPUT_JSON_SCHEMA)}`,
    },
    ...messages.slice(1),
  ];
}

function validateExternalBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("外部分析 API 地址必须是有效 URL。");
  }
  if (url.protocol !== "https:") throw new Error("外部分析 API 必须使用 HTTPS。");
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("外部分析 API 地址不能包含账号、查询参数或片段。");
  }
  return url.toString().replace(/\/$/u, "");
}
