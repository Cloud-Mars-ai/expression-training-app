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
