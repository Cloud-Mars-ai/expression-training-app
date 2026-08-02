import type { Transcript, TranscriptSegment } from "@expression-training/contracts";
import type {
  EvaluationRubric,
  TranscriptionAudioInput,
} from "../../src/providers/index.js";

export const STRUCTURED_EXPRESSION_ATTEMPT_ID = "attempt-structured-demo-001";

export const structuredExpressionAudioFixture: TranscriptionAudioInput = {
  assetId: "audio-structured-demo-001",
  mimeType: "audio/webm;codecs=opus",
  byteSize: 128_000,
  durationMs: 60_000,
  sha256: "95f323b846eb5ee67a42a103f807d52ee5bf3f61c4fd5b8f90ca160a0b367d10",
  bytes: new Uint8Array([26, 45, 223, 163, 64, 15, 107, 9]),
};

export const structuredExpressionSegmentsFixture: TranscriptSegment[] = [
  {
    id: "segment-zh-001",
    ordinal: 1,
    startMs: 0,
    endMs: 9_800,
    text: "我参与了校园物品循环平台项目，目标是让闲置物品更快找到需要的人。",
    confidence: 0.97,
  },
  {
    id: "segment-zh-002",
    ordinal: 2,
    startMs: 9_800,
    endMs: 20_400,
    text: "我主要负责梳理发布流程，并完成前端交互和数据埋点。",
    confidence: 0.95,
  },
  {
    id: "segment-zh-003",
    ordinal: 3,
    startMs: 20_400,
    endMs: 37_600,
    text: "发现同学常在填写分类时退出后，我访谈了八位用户，把发布步骤从五步缩短为三步。",
    confidence: 0.93,
  },
  {
    id: "segment-zh-004",
    ordinal: 4,
    startMs: 37_600,
    endMs: 48_900,
    text: "改版上线两周后，发布完成率从百分之五十八提升到百分之七十六。",
    confidence: 0.96,
  },
  {
    id: "segment-zh-005",
    ordinal: 5,
    startMs: 48_900,
    endMs: 58_500,
    text: "这次经历让我确认，先找到阻塞点再做方案，比直接增加功能更有效。",
    confidence: 0.94,
  },
];

export function createReviewedTranscriptFixture(
  overrides: Partial<Transcript> = {},
): Transcript {
  const segments = overrides.segments ?? structuredExpressionSegmentsFixture.map((segment) => ({
    ...segment,
  }));
  const base: Transcript = {
    schemaVersion: 1,
    id: "transcript-structured-demo-001",
    attemptId: STRUCTURED_EXPRESSION_ATTEMPT_ID,
    status: "user-reviewed",
    revision: 2,
    language: "zh-CN",
    confidence: 0.95,
    provider: {
      providerId: "mock-transcription",
      model: "deterministic-zh-cn-v1",
      requestId: "mock-asr-structured-demo-001",
    },
    segments,
    fullText: segments.map((segment) => segment.text).join(""),
    createdAt: "2026-08-02T02:00:00.000Z",
    updatedAt: "2026-08-02T02:03:00.000Z",
    reviewedAt: "2026-08-02T02:03:00.000Z",
  };
  return { ...base, ...overrides };
}

export function createLowConfidenceTranscriptFixture(): Transcript {
  return createReviewedTranscriptFixture({
    confidence: 0.31,
    segments: structuredExpressionSegmentsFixture.map((segment) => ({
      ...segment,
      confidence: 0.3,
    })),
  });
}

export const structuredExpressionRubricFixture: EvaluationRubric = {
  version: "structured-expression-l2-v1",
  exerciseId: "exercise-project-contribution-l2",
  exercisePrompt: "请用 60 秒介绍一个你参与过的项目，并说明你的具体贡献。",
  dimensions: [
    {
      id: "task-fulfillment",
      label: "任务完成度",
      successCriteria: ["说明项目目标", "说明本人职责", "交代行动与结果"],
    },
    {
      id: "structure",
      label: "结构",
      successCriteria: ["开头给出回答主线", "背景、行动和结果顺序清楚"],
    },
    {
      id: "relevance",
      label: "相关性",
      successCriteria: ["信息直接支持具体贡献", "不加入与任务无关的经历"],
    },
    {
      id: "evidence",
      label: "证据",
      successCriteria: ["至少提供一项可核对的行动细节", "结果有事实或数字支撑"],
    },
    {
      id: "concision",
      label: "简洁度",
      successCriteria: ["重点信息在 60 秒内完成", "减少重复背景和泛化总结"],
    },
    {
      id: "delivery",
      label: "表达流畅度",
      successCriteria: ["仅根据转写文本判断句间推进", "不得从声音推断个人属性"],
    },
  ],
  policy: {
    evidenceMustComeFromTranscript: true,
    allowOnlyOnePriorityIssue: true,
    prohibitedInferences: [
      "personality",
      "anxiety",
      "intelligence",
      "mental-health",
      "employability",
    ],
  },
};
