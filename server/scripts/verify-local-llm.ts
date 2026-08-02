import type { EvaluationProviderRequest } from "../src/providers/evaluation-provider.js";
import { LocalEvaluationProvider } from "../src/providers/local-evaluation-provider.js";

const provider = new LocalEvaluationProvider({
  baseUrl: process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:11434",
  model: process.env.LOCAL_LLM_MODEL ?? "qwen3.6:27b",
  providerId: "local-qwen-verification",
  apiStyle: "ollama",
  timeoutMs: Number.parseInt(process.env.LOCAL_LLM_TIMEOUT_MS ?? "180000", 10),
});

const now = new Date().toISOString();
const request: EvaluationProviderRequest = {
  attemptId: "local-provider-verification",
  transcript: {
    schemaVersion: 1,
    id: "transcript-local-provider-verification",
    attemptId: "local-provider-verification",
    status: "user-reviewed",
    revision: 2,
    language: "zh-CN",
    confidence: 0.95,
    provider: { providerId: "verification", model: "fixture" },
    segments: [
      { id: "segment-1", ordinal: 1, startMs: 0, endMs: 12_000, confidence: 0.95, text: "我参与了校园二手书交换项目，主要负责整理需求和设计发布流程。" },
      { id: "segment-2", ordinal: 2, startMs: 12_000, endMs: 28_000, confidence: 0.95, text: "我访谈了六位同学，把原来的五步发布流程缩短为三步。" },
      { id: "segment-3", ordinal: 3, startMs: 28_000, endMs: 43_000, confidence: 0.95, text: "上线两周后，完整发布率从百分之六十提升到了百分之七十八。" },
    ],
    fullText: "我参与了校园二手书交换项目，主要负责整理需求和设计发布流程。我访谈了六位同学，把原来的五步发布流程缩短为三步。上线两周后，完整发布率从百分之六十提升到了百分之七十八。",
    createdAt: now,
    updatedAt: now,
    reviewedAt: now,
  },
  rubric: {
    version: "verification-v1",
    exerciseId: "verification",
    exercisePrompt: "请介绍一个你参与的项目并说明具体贡献。",
    dimensions: [
      { id: "task-fulfillment", label: "任务完成度", successCriteria: ["说明项目和贡献"] },
      { id: "structure", label: "结构", successCriteria: ["顺序清楚"] },
      { id: "relevance", label: "相关性", successCriteria: ["围绕题目"] },
      { id: "evidence", label: "证据", successCriteria: ["提供事实"] },
      { id: "concision", label: "简洁度", successCriteria: ["减少重复"] },
      { id: "delivery", label: "表达流畅度", successCriteria: ["只根据转写判断"] },
    ],
    policy: {
      evidenceMustComeFromTranscript: true,
      allowOnlyOnePriorityIssue: true,
      prohibitedInferences: ["personality", "anxiety", "intelligence", "mental-health", "employability"],
    },
  },
};

const result = await provider.evaluate(request);
console.log(JSON.stringify(result, null, 2));
