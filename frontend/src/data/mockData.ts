import type { Capability, Exercise } from "../types";

export const capabilities: Capability[] = [
  { key: "retelling", level: "L1", title: "精准复述", descriptor: "抓住核心观点，去掉多余信息", method: "听清重点，再用自己的话讲回来", accent: "coral", icon: "book", progress: 68, exerciseCount: 12 },
  { key: "structure", level: "L2", title: "逻辑框架", descriptor: "用结构组织你的结论与依据", method: "先结论，后依据，最后给出下一步", accent: "green", icon: "network", progress: 52, exerciseCount: 18 },
  { key: "scenario", level: "L3", title: "情境回应", descriptor: "在真实场景里说清楚下一步", method: "看清对象、目标和边界，再开口", accent: "amber", icon: "message", progress: 36, exerciseCount: 16 },
  { key: "impromptu", level: "L4", title: "即兴表达", descriptor: "面对追问也能保持方向感", method: "快速形成观点，并回应新的信息", accent: "violet", icon: "spark", progress: 24, exerciseCount: 10 },
];

export const exercises: Exercise[] = [
  { id: "l2-project-contribution", capability: "structure", title: "用 60 秒说清你的项目贡献", excerpt: "介绍一个参与过的项目，区分团队成果和你的具体贡献。", scene: "interview", sceneLabel: "面试", difficulty: "D2", duration: "约 4 分钟", wordCount: "60 秒表达", status: "new", actionLabel: "开始训练", framework: "STAR / PREP" },
  { id: "meeting-risk-update", capability: "scenario", title: "在会议里同步一个项目风险", excerpt: "让团队听懂风险、影响和你希望得到的支持。", scene: "meeting", sceneLabel: "会议", difficulty: "D2", duration: "4 分钟", wordCount: "约 60 秒", status: "in-progress", actionLabel: "继续训练", framework: "结果 - 风险 - 请求" },
  { id: "presentation-opening", capability: "structure", title: "把汇报开场压缩成三句话", excerpt: "面对跨专业听众，先让大家知道重点在哪里。", scene: "presentation", sceneLabel: "汇报", difficulty: "D1", duration: "3 分钟", wordCount: "约 45 秒", status: "review", actionLabel: "重练一次", framework: "结论先行" },
  { id: "campus-clarify", capability: "retelling", title: "向老师确认论文方向", excerpt: "把已经知道的信息说清楚，再提出一个具体问题。", scene: "campus", sceneLabel: "校园", difficulty: "D2", duration: "3 分钟", wordCount: "约 60 秒", status: "completed", actionLabel: "查看结果", framework: "事实 - 判断 - 问题" },
  { id: "collaboration-boundary", capability: "scenario", title: "拒绝临时加塞，同时给出替代方案", excerpt: "不解释过多，把当前优先级和下一步安排说完整。", scene: "collaboration", sceneLabel: "协作", difficulty: "D3", duration: "4 分钟", wordCount: "约 75 秒", status: "new", actionLabel: "开始训练", framework: "DESC" },
  { id: "interview-intro", capability: "retelling", title: "用 30 秒讲清你的优势", excerpt: "从一次具体经历出发，让优势和岗位要求产生联系。", scene: "interview", sceneLabel: "面试", difficulty: "D1", duration: "2 分钟", wordCount: "约 30 秒", status: "completed", actionLabel: "查看结果", framework: "经历 - 能力 - 价值" },
  { id: "presentation-decision", capability: "impromptu", title: "临时被问到：为什么选这个方案？", excerpt: "先表明倾向，再补充一个关键依据和风险边界。", scene: "presentation", sceneLabel: "汇报", difficulty: "D3", duration: "4 分钟", wordCount: "约 60 秒", status: "new", actionLabel: "开始训练", framework: "观点 - 依据 - 边界" },
];

export const dailyTasks = [
  { label: "新练习 · 先说结论", state: "待开始", icon: "new" },
  { label: "重练 · 会议风险同步", state: "进行中", icon: "retry" },
  { label: "复习 · 论文方向确认", state: "待复习", icon: "review" },
] as const;

export const sceneFilters = [
  { key: "all", label: "全部场景" },
  { key: "interview", label: "面试" },
  { key: "presentation", label: "汇报" },
  { key: "meeting", label: "会议" },
  { key: "campus", label: "校园" },
  { key: "collaboration", label: "协作" },
] as const;
