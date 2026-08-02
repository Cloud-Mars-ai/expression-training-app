import { RESEARCH_METHODS, RESEARCH_SOURCES, RESEARCH_TOPICS, RESEARCH_TOPIC_SNAPSHOT_META, type ResearchMethod, type ResearchTopic } from "@expression-training/contracts";
import type { StructuredExercise } from "./model";

export const l2ProjectExercise: StructuredExercise = {
  id: "l2-project-contribution",
  version: "2026-08-01.1",
  level: "L2",
  title: "项目经历：说清你的具体贡献",
  prompt: "请用 60 秒介绍一个你参与过的项目，并说明你的具体贡献。",
  scene: "面试 · 项目经历",
  targetSkill: "用结构化证据说明个人贡献",
  preparationSeconds: 30,
  speakingSeconds: 60,
  successCriteria: [
    { id: "context", label: "交代项目和目标", detail: "用一到两句话说明项目要解决什么问题。" },
    { id: "ownership", label: "说清个人责任", detail: "明确区分“团队做了什么”和“我具体负责什么”。" },
    { id: "action", label: "给出具体行动", detail: "至少说明一个由你推动的判断、行动或协作。" },
    { id: "result", label: "落到结果", detail: "用数据、变化或可观察结果收尾。" },
  ],
  frameworks: [
    { id: "STAR", name: "STAR 项目叙述", shortDescription: "适合把项目背景、任务、行动和结果说完整。", recommended: true, steps: [
      { key: "S", label: "情境", prompt: "项目是什么，为什么要做？" },
      { key: "T", label: "任务", prompt: "你承担的具体责任是什么？" },
      { key: "A", label: "行动", prompt: "你做了哪些关键动作或判断？" },
      { key: "R", label: "结果", prompt: "结果发生了什么可观察变化？" },
    ] },
    { id: "PREP", name: "PREP 结论表达", shortDescription: "适合先亮出核心贡献，再用理由和例子证明。", steps: [
      { key: "P", label: "观点", prompt: "你最重要的贡献是什么？" },
      { key: "R", label: "理由", prompt: "为什么这项贡献重要？" },
      { key: "E", label: "例证", prompt: "用一个动作或结果证明。" },
      { key: "P", label: "重申", prompt: "用一句话总结你的价值。" },
    ] },
  ],
};

export const researchTopics = RESEARCH_TOPICS;
export const researchMethods = RESEARCH_METHODS;
export const researchSources = RESEARCH_SOURCES;
export const researchTopicSnapshot = RESEARCH_TOPIC_SNAPSHOT_META;
export const researchTopicCategories = [...new Set(RESEARCH_TOPICS.map((topic) => topic.category))];

export function getResearchTopic(topicId: string | undefined): ResearchTopic | null {
  if (!topicId) return null;
  return RESEARCH_TOPICS.find((topic) => topic.topic_id === topicId) ?? null;
}

export function getStructuredExercise(exerciseId: string | undefined): StructuredExercise {
  const topic = getResearchTopic(exerciseId);
  return topic ? topicToExercise(topic) : l2ProjectExercise;
}

export function getRecommendedMethods(topic: ResearchTopic): readonly ResearchMethod[] {
  const levelTokens = topic.level.split("-");
  const skills = `${topic.core_skill} ${topic.recommended_format}`;
  return RESEARCH_METHODS
    .map((method) => ({ method, score: levelTokens.filter((token) => method.target_level.includes(token)).length * 2 + method.target_skill.split(/[;；、，,]/u).filter((token) => token && skills.includes(token)).length }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((item) => item.method);
}

function topicToExercise(topic: ResearchTopic): StructuredExercise {
  const preferExperience = topic.experience_answerable === "是" && ["生活化讨论", "校园与个人成长", "求职与初入职场"].includes(topic.category);
  return {
    id: topic.topic_id,
    version: `research-${RESEARCH_TOPIC_SNAPSHOT_META.topicsSha256.slice(0, 12)}`,
    level: topic.category === "经典辩论" || topic.category === "社会讨论" ? "L4" : topic.category === "写作方法迁移" ? "L1" : topic.category === "生活化讨论" ? "L3" : "L2",
    title: topic.title,
    prompt: topic.prompt,
    scene: `${topic.category} · ${topic.scene}`,
    targetSkill: topic.core_skill,
    preparationSeconds: topic.prep_seconds,
    speakingSeconds: topic.answer_seconds,
    successCriteria: [
      { id: "qualified", label: "完成基本论述", detail: topic.qualified_standard },
      { id: "evidence", label: "区分事实与判断", detail: topic.fact_opinion_boundary },
      { id: "condition", label: "说明条件边界", detail: topic.conditional_view },
      { id: "excellent", label: "回应不同视角", detail: topic.excellent_standard },
    ],
    frameworks: [
      {
        id: "PREP",
        name: "PREP 观点表达",
        shortDescription: "先给结论，再用理由和例子说明，最后补充条件或重申判断。",
        recommended: !preferExperience,
        steps: [
          { key: "P", label: "观点", prompt: "你当前的判断是什么？" },
          { key: "R", label: "理由", prompt: topic.support_direction },
          { key: "E", label: "例证", prompt: topic.personal_experience },
          { key: "P", label: "边界", prompt: topic.conditional_view },
        ],
      },
      {
        id: "SCQA",
        name: "SCQA 情境推进",
        shortDescription: "从情境和冲突进入核心问题，再给出清楚回答。",
        steps: [
          { key: "S", label: "情境", prompt: topic.background },
          { key: "C", label: "冲突", prompt: topic.challenge_direction },
          { key: "Q", label: "问题", prompt: topic.prompt },
          { key: "A", label: "回答", prompt: topic.conditional_view },
        ],
      },
      {
        id: "STAR",
        name: "STAR 情境回应",
        shortDescription: "适合从一段亲历或具体情境出发，说明判断、行动和结果。",
        recommended: preferExperience,
        steps: [
          { key: "S", label: "情境", prompt: topic.background },
          { key: "T", label: "问题", prompt: topic.prompt },
          { key: "A", label: "回应", prompt: topic.personal_experience },
          { key: "R", label: "反思", prompt: topic.followups },
        ],
      },
    ],
  };
}
