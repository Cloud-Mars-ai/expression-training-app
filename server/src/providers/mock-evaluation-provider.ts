import type {
  EvidenceReference,
  EvaluationDimension,
  Transcript,
  TranscriptSegment,
} from "@expression-training/contracts";
import type {
  EvaluationProvider,
  EvaluationProviderRequest,
  EvaluationProviderResult,
  ScorableEvaluationDraft,
} from "./evaluation-provider.js";
import { ProviderTechnicalError } from "./provider-error.js";

export type MockEvaluationProviderOptions = {
  result?: EvaluationProviderResult;
  failWith?: {
    message: string;
    retryable: boolean;
  };
};

function pickSegment(transcript: Transcript, preferredIndex: number): TranscriptSegment {
  const segment = transcript.segments[preferredIndex] ?? transcript.segments[0];
  if (!segment) {
    throw new ProviderTechnicalError("evaluation", "没有可引用的转写片段。", {
      retryable: false,
    });
  }
  return segment;
}

function evidence(
  transcript: Transcript,
  preferredIndex: number,
  observation: string,
): EvidenceReference {
  const segment = pickSegment(transcript, preferredIndex);
  return {
    transcriptId: transcript.id,
    transcriptRevision: transcript.revision,
    segmentIds: [segment.id],
    startMs: segment.startMs,
    endMs: segment.endMs,
    quote: segment.text,
    observation,
  };
}

function createDimensions(transcript: Transcript): EvaluationDimension[] {
  return [
    {
      id: "task-fulfillment",
      score: 86,
      summary: "回答同时交代了项目目标、本人职责、采取的行动和结果。",
      evidence: [evidence(transcript, 1, "该片段明确说明本人负责的工作，能够回应“具体贡献”。")],
    },
    {
      id: "structure",
      score: 76,
      summary: "内容有背景、行动和结果，但开头还可以更早亮出个人贡献。",
      evidence: [evidence(transcript, 0, "开头先介绍项目目标，个人贡献要到下一片段才出现。")],
      nextBehavior: "第一句先概括项目与个人贡献，再补充行动和结果。",
    },
    {
      id: "relevance",
      score: 88,
      summary: "各片段围绕项目贡献展开，没有偏离任务。",
      evidence: [evidence(transcript, 2, "用户访谈和流程改造都直接用于解释个人贡献。")],
    },
    {
      id: "evidence",
      score: 93,
      summary: "回答提供了访谈人数、流程步数和完成率变化等可核对细节。",
      evidence: [evidence(transcript, 3, "前后完成率形成了清晰、具体的结果证据。")],
    },
    {
      id: "concision",
      score: 81,
      summary: "信息密度较高，结尾复盘略占用任务回答时间。",
      evidence: [evidence(transcript, 4, "结尾经验总结有价值，但可以压缩为更短的一句。")],
      nextBehavior: "把经验总结压缩到一句，并把时间留给个人行动。",
    },
    {
      id: "delivery",
      score: 79,
      summary: "仅依据转写文本看，句间推进清楚；本项不评价声音特征。",
      evidence: [evidence(transcript, 2, "“发现问题—访谈—缩短步骤”的动作链连贯。")],
      nextBehavior: "使用“我负责、我发现、我推动、最终”作为口头路标。",
    },
  ];
}

function createDefaultEvaluation(request: EvaluationProviderRequest): ScorableEvaluationDraft {
  const { transcript } = request;
  const issueId = `${request.attemptId}-priority-structure`;

  return {
    confidence: 0.9,
    overall: {
      score: 84,
      outcome: "已完整说明项目贡献，并用结果数据支撑；结构上仍可更快突出本人作用。",
    },
    strength: {
      title: "贡献结果有具体证据",
      explanation: "不仅描述做了什么，还给出了改版前后的完成率变化，使贡献可验证。",
      evidence: [evidence(transcript, 3, "该数据直接连接行动与项目结果。")],
    },
    priorityIssue: {
      id: issueId,
      dimensionId: "structure",
      title: "个人贡献出现得偏晚",
      whyNow: "听者要到第二个片段才知道你的职责，前几秒缺少回答主线。",
      instruction: "开头先用一句话说清项目、职责和结果，再按“问题—行动—结果”展开。",
      evidence: [evidence(transcript, 0, "首段只有项目目标，没有出现本人职责或贡献结论。")],
    },
    improvedExample: {
      text: "我参与校园物品循环平台项目，主要负责重构发布流程。发现同学常在分类环节退出后，我访谈了八位用户，把流程从五步缩短为三步，并完成前端交互与数据埋点。上线两周后，发布完成率从58%提升到76%。这让我验证了先定位阻塞点、再精简流程的做法。",
      preservesUserIntent: true,
    },
    retryPlan: {
      focusIssueId: issueId,
      preparationSeconds: 20,
      speakingSeconds: 60,
      instruction: "只练一个变化：前十秒先说清你的职责和可量化结果。",
    },
    dimensions: createDimensions(transcript),
    policyChecks: {
      transcriptEvidenceOnly: true,
      prohibitedInferenceChecked: true,
    },
  };
}

export class MockEvaluationProvider implements EvaluationProvider {
  readonly providerId = "mock-evaluation";
  private readonly options: MockEvaluationProviderOptions;

  constructor(options: MockEvaluationProviderOptions = {}) {
    this.options = options;
  }

  async evaluate(
    request: EvaluationProviderRequest,
    signal?: AbortSignal,
  ): Promise<EvaluationProviderResult> {
    if (signal?.aborted) {
      throw new ProviderTechnicalError("evaluation", "评分请求已取消。", {
        retryable: true,
        cause: signal.reason,
      });
    }

    if (this.options.failWith) {
      throw new ProviderTechnicalError("evaluation", this.options.failWith.message, {
        retryable: this.options.failWith.retryable,
      });
    }

    return this.options.result ?? {
      kind: "scorable",
      evaluation: createDefaultEvaluation(request),
    };
  }
}
