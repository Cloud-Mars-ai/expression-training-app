import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ExternalEvaluationProvider } from "../src/providers/external-evaluation-provider.js";
import { STRUCTURED_EXPRESSION_RUBRIC } from "../src/integration/structured-expression-rubric.js";

loadLocalEnvironment(resolve(process.cwd(), ".env.local"));

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) throw new Error("DEEPSEEK_API_KEY 尚未配置。请先填写项目根目录的 .env.local。");

const provider = new ExternalEvaluationProvider({
  baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
  apiKey,
  providerId: "deepseek-connectivity-check",
  timeoutMs: Number.parseInt(process.env.EXTERNAL_LLM_TIMEOUT_MS ?? "90000", 10),
});

const result = await provider.evaluate({
  attemptId: "deepseek-connectivity-check",
  rubric: STRUCTURED_EXPRESSION_RUBRIC,
  transcript: {
    schemaVersion: 1,
    id: "transcript-connectivity-check",
    attemptId: "deepseek-connectivity-check",
    status: "user-reviewed",
    revision: 2,
    language: "zh-CN",
    confidence: 1,
    provider: { providerId: "synthetic", model: "manual" },
    segments: [{
      id: "segment-connectivity-check",
      ordinal: 1,
      startMs: 0,
      endMs: 5_000,
      text: "这是一次不包含用户数据的接口连通性测试，我的回答重点是确认服务可以返回结构化结果。",
      confidence: 1,
    }],
    fullText: "这是一次不包含用户数据的接口连通性测试，我的回答重点是确认服务可以返回结构化结果。",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reviewedAt: new Date().toISOString(),
  },
});

if (result.kind !== "scorable") throw new Error(`DeepSeek 返回不可评分结果：${result.reason}`);
process.stdout.write(`DeepSeek 连接成功：provider=${provider.providerId}, score=${result.evaluation.overall.score}\n`);

function loadLocalEnvironment(path: string): void {
  let content: string;
  try { content = readFileSync(path, "utf8"); } catch { return; }
  for (const line of content.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
    if (!match || line.trimStart().startsWith("#")) continue;
    const key = match[1];
    let value = match[2] ?? "";
    if (!key || process.env[key] !== undefined) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}
