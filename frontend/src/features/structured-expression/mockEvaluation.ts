import type { EvaluationResult, TrainingAttempt } from "./model";

const firstTranscript = "我参与的是校园二手交易平台改版。当时我们想提升发布效率，我主要负责梳理发布流程，也跟开发和设计沟通，最后上线后效果还不错。";
const retryTranscript = "我参与了校园二手交易平台的发布流程改版。我负责梳理原有流程，访谈了 8 名学生，发现图片上传步骤最容易中断。我据此把发布流程从 6 步调整为 4 步，并推动设计和开发完成上线。上线后的反馈比之前顺畅。";

export function buildMockEvaluation(attempt: TrainingAttempt): EvaluationResult {
  const isRetry = Boolean(attempt.retryOf);
  const vagueEvidence = { startMs: 18800, endMs: 35700, quote: "我主要负责梳理发布流程，也跟开发和设计沟通", observation: "表达了责任范围，但没有说明你做出的具体判断或动作。" };
  const resultEvidence = { startMs: 46200, endMs: 54800, quote: "上线后的反馈比之前顺畅", observation: "表达了改善方向，但没有给出完成率、时长或用户反馈数量。" };
  const actionEvidence = { startMs: 12800, endMs: 45200, quote: "访谈了 8 名学生……把发布流程从 6 步调整为 4 步", observation: "行动、判断和流程变化已经能够验证个人贡献。" };
  const priorityEvidence = isRetry ? resultEvidence : vagueEvidence;
  const transcript = isRetry ? retryTranscript : firstTranscript;
  return {
    schemaVersion: 1, attemptId: attempt.id, status: "scorable", confidence: isRetry ? 0.91 : 0.88,
    overall: { score: isRetry ? 84 : 76, outcome: isRetry ? "贡献和行动已经更具体，结果仍可再量化。" : "任务已完成，但个人贡献的证据还不够具体。" }, transcript,
    strength: isRetry ? { title: "个人行动已经能够被验证", explanation: "你补充了访谈数量、问题发现和流程调整，听者可以判断你的具体贡献。", evidence: actionEvidence } : { title: "项目背景和目标交代得很快", explanation: "你在开头两句话内说明了项目类型和改版目标，听者能迅速建立上下文。", evidence: { startMs: 1200, endMs: 12200, quote: "校园二手交易平台改版，当时我们想提升发布效率", observation: "项目与目标出现在回答开头。" } },
    priorityCorrection: { dimensionId: "evidence", title: isRetry ? "把“反馈更顺畅”换成一个可观察结果" : "把“负责沟通”改成一个可验证的具体行动", whyNow: isRetry ? "行动已经具体，当前最影响说服力的是结果仍然无法验证。" : "这是当前最影响说服力的问题。面试官仍然无法判断你的个人判断、执行和结果。", instruction: isRetry ? "下一次补一个上线前后可比较的结果，例如发布完成率、平均耗时或反馈人数。" : "重练时只补一件事：说出你发现了什么、决定了什么，以及这个动作带来了什么变化。", evidence: priorityEvidence },
    improvedExample: "我参与了校园二手交易平台的发布流程改版，目标是降低用户发布商品的操作成本。我负责梳理原有流程，访谈了 8 名学生，发现图片上传和分类选择是主要阻塞点。我据此把发布流程从 6 步调整为 4 步，并与设计、开发推进上线。改版后，发布完成率提升了 18%。",
    retry: { preparationSeconds: 30, speakingSeconds: 60, focus: isRetry ? "补全一个可比较的结果指标" : "补全一个具体行动和一个可观察结果" },
    dimensions: [
      { id: "task-fulfillment", label: "任务完成度", score: isRetry ? 88 : 82, summary: "完成了项目介绍，也提到了个人职责。", evidence: [{ startMs: 1200, endMs: 35700, quote: "我参与的是……我主要负责……", observation: "覆盖了项目和个人职责两个任务要点。" }] },
      { id: "structure", label: "结构", score: isRetry ? 86 : 78, summary: `整体顺序接近 ${attempt.frameworkId}，但行动与结果的边界不够清晰。`, evidence: [isRetry ? actionEvidence : vagueEvidence], nextBehavior: "用“我发现、我决定、结果是”标出结构转换。" },
      { id: "relevance", label: "相关性", score: isRetry ? 90 : 86, summary: "内容围绕项目和个人贡献，没有明显跑题。", evidence: [{ startMs: 1200, endMs: 52000, quote: "校园二手交易平台改版……最后上线", observation: "回答持续围绕同一个项目。" }] },
      { id: "evidence", label: "证据", score: isRetry ? 80 : 60, summary: isRetry ? "行动证据已经具体，结果仍缺少可比较指标。" : "缺少能验证个人贡献的动作和结果数据。", evidence: [priorityEvidence], nextBehavior: "加入一个调研数量、流程变化或上线指标。" },
      { id: "concision", label: "简洁度", score: isRetry ? 85 : 81, summary: isRetry ? "回答紧凑，结尾可以用更高信息密度的结果替代概括。" : "回答长度合适，但“沟通”“效果不错”信息密度偏低。", evidence: [isRetry ? resultEvidence : { startMs: 35700, endMs: 50800, quote: "最后上线后效果还不错", observation: "结尾简短，但信息不可验证。" }] },
      { id: "delivery", label: "表达流畅度", score: isRetry ? 83 : 79, summary: "语速稳定，出现两次短暂停顿，不影响理解。", evidence: [{ startMs: 14000, endMs: 18000, quote: "当时……我们想提升", observation: "停顿自然，句子仍然连贯。" }] },
    ],
    review: { afterDays: 3, skill: "specific-contribution-evidence" }, generatedAt: new Date().toISOString(),
  };
}
