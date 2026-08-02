import { RESEARCH_TOPICS, STRUCTURED_EXPRESSION_RUBRIC_VERSION } from "@expression-training/contracts";
import type { EvaluationRubric } from "../providers/index.js";

export const STRUCTURED_EXPRESSION_RUBRIC: EvaluationRubric = {
  version: STRUCTURED_EXPRESSION_RUBRIC_VERSION,
  exerciseId: "l2-project-contribution",
  exercisePrompt: "请用 60 秒介绍一个你参与过的项目，并说明你的具体贡献。",
  dimensions: [
    { id: "task-fulfillment", label: "任务完成度", successCriteria: ["说明项目目标", "说明本人职责", "交代行动与结果"] },
    { id: "structure", label: "结构", successCriteria: ["开头给出回答主线", "背景、行动和结果顺序清楚"] },
    { id: "relevance", label: "相关性", successCriteria: ["信息直接支持具体贡献", "不加入无关经历"] },
    { id: "evidence", label: "证据", successCriteria: ["提供可核对的行动细节", "结果有事实或数字支撑"] },
    { id: "concision", label: "简洁度", successCriteria: ["在 60 秒内完成重点", "减少重复背景"] },
    { id: "delivery", label: "表达流畅度", successCriteria: ["只根据转写判断推进", "不从声音推断个人属性"] },
  ],
  policy: {
    evidenceMustComeFromTranscript: true,
    allowOnlyOnePriorityIssue: true,
    prohibitedInferences: ["personality", "anxiety", "intelligence", "mental-health", "employability"],
  },
};

export function getStructuredExpressionRubric(exerciseId: string, inputMode: "voice" | "text" = "voice"): EvaluationRubric {
  const topic = RESEARCH_TOPICS.find((item) => item.topic_id === exerciseId);
  if (!topic) return inputMode === "voice" ? STRUCTURED_EXPRESSION_RUBRIC : {
    ...STRUCTURED_EXPRESSION_RUBRIC,
    dimensions: STRUCTURED_EXPRESSION_RUBRIC.dimensions.map((dimension) => dimension.id === "delivery" ? {
      ...dimension,
      label: "文本推进（语音表现不可评估）",
      successCriteria: ["只判断句间衔接与内容推进", "不得评价语速、停顿、口头禅、音量、发音或流利度", "不得把缺少音频指标视为扣分项"],
    } : dimension),
  };
  return {
    version: STRUCTURED_EXPRESSION_RUBRIC_VERSION,
    exerciseId: topic.topic_id,
    exercisePrompt: `${topic.title}\n${topic.prompt}`,
    dimensions: [
      { id: "task-fulfillment", label: "任务完成度", successCriteria: [topic.qualified_standard, `回应题目：${topic.prompt}`, `核心能力：${topic.core_skill}`] },
      { id: "structure", label: "结构", successCriteria: ["开头给出中心判断", "理由、例子与结论顺序清楚", topic.conditional_view] },
      { id: "relevance", label: "相关性", successCriteria: ["信息直接服务当前议题", `回应至少一个追问方向：${topic.followups}`, "不把网络热词直接当事实"] },
      { id: "evidence", label: "理由与证据", successCriteria: [topic.fact_opinion_boundary, topic.personal_experience, topic.excellent_standard] },
      { id: "concision", label: "简洁度", successCriteria: [`在约 ${topic.answer_seconds} 秒内完成重点`, "减少重复和无关铺垫", `避免低质量信号：${topic.low_quality_signal}`] },
      { id: "delivery", label: inputMode === "text" ? "文本推进（语音表现不可评估）" : "表达推进", successCriteria: inputMode === "text" ? ["只判断句间衔接与内容推进", "不得评价语速、停顿、口头禅、音量、发音或流利度", "不得把缺少音频指标视为扣分项"] : ["只根据确认后的转写判断内容推进", "能呈现听者可理解的连接和转折", "不从声音推断个人属性"] },
    ],
    policy: STRUCTURED_EXPRESSION_RUBRIC.policy,
  };
}
