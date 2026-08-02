import {
  EVALUATION_DIMENSION_IDS,
  type Evaluation,
  type EvidenceReference,
  type ScorableEvaluation,
  type Transcript,
  type UnscorableEvaluation,
  type UnscorableReason,
} from "@expression-training/contracts";
import {
  ProviderTechnicalError,
  type EvaluationProvider,
  type EvaluationProviderResult,
  type EvaluationRubric,
  type ScorableEvaluationDraft,
} from "../../providers/index.js";

const DEFAULT_MINIMUM_TRANSCRIPT_CONFIDENCE = 0.55;
const DEFAULT_MINIMUM_EVALUATION_CONFIDENCE = 0.55;
const DEFAULT_MINIMUM_SPEECH_CHARACTERS = 24;
const PROHIBITED_INFERENCE_PATTERNS = [
  /(?:从|根据|通过|由).{0,18}(?:声音|音量|语速|停顿|语气|口音|发音|表达速度).{0,22}(?:判断|推断|说明|表明|证明|反映|意味着).{0,14}(?:你|用户|答题者).{0,8}(?:性格|人格|焦虑|智力|智商|聪明|心理状态|心理健康|抑郁|就业能力|录用概率)/u,
  /(?:你|用户|答题者).{0,8}(?:性格|人格|焦虑|智力|智商|聪明|心理状态|心理健康|抑郁|就业能力|录用概率).{0,22}(?:源于|来自|取决于|可以从|能够从).{0,14}(?:声音|音量|语速|停顿|语气|口音|发音|表达速度)/u,
  /(?:voice|volume|speaking rate|pause|tone|accent|pronunciation).{0,40}(?:shows?|proves?|indicates?|means?|infer).{0,30}(?:personality|anxiety|intelligence|mental health|employability)/iu,
] as const;

export class EvaluationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationInputError";
  }
}

export type EvaluateTranscriptOptions = {
  attemptId: string;
  transcript: Transcript;
  rubric: EvaluationRubric;
  provider: EvaluationProvider;
  evaluationId?: string;
  minimumTranscriptConfidence?: number;
  minimumEvaluationConfidence?: number;
  minimumSpeechCharacters?: number;
  now?: () => Date;
  signal?: AbortSignal;
};

function isUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function createUnscorable(
  options: EvaluateTranscriptOptions,
  reason: UnscorableReason,
  confidence: number,
  retryable: boolean,
  userMessage: string,
): UnscorableEvaluation {
  return {
    schemaVersion: 2,
    id: options.evaluationId ?? `evaluation-${options.attemptId}`,
    attemptId: options.attemptId,
    transcriptId: options.transcript.id,
    transcriptRevision: options.transcript.revision,
    status: "unscorable",
    reason,
    confidence,
    countsTowardProgress: false,
    retryable,
    userMessage,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
  };
}

function validateRubric(rubric: EvaluationRubric): void {
  if (!rubric.version.trim()) {
    throw new EvaluationInputError("Rubric 必须包含版本号。");
  }
  const ids = rubric.dimensions.map((dimension) => dimension.id);
  if (
    ids.length !== EVALUATION_DIMENSION_IDS.length
    || EVALUATION_DIMENSION_IDS.some((id) => !ids.includes(id))
    || new Set(ids).size !== ids.length
  ) {
    throw new EvaluationInputError("Rubric 必须且只能包含六个冻结评分维度。");
  }
}

function validateEvidence(reference: EvidenceReference, transcript: Transcript): void {
  if (reference.transcriptId !== transcript.id) {
    throw new Error("反馈证据引用了错误的 transcriptId。");
  }
  if (reference.transcriptRevision !== transcript.revision) {
    throw new Error("反馈证据引用了错误的 transcript revision。");
  }
  if (reference.segmentIds.length === 0) {
    throw new Error("反馈证据必须引用至少一个 segment ID。");
  }

  const referencedSegments = reference.segmentIds.map((segmentId) => {
    const segment = transcript.segments.find((candidate) => candidate.id === segmentId);
    if (!segment) {
      throw new Error("反馈证据引用了不存在的 segment ID。");
    }
    return segment;
  });
  const expectedStart = Math.min(...referencedSegments.map((segment) => segment.startMs));
  const expectedEnd = Math.max(...referencedSegments.map((segment) => segment.endMs));
  if (reference.startMs !== expectedStart || reference.endMs !== expectedEnd) {
    throw new Error("反馈证据时间戳必须覆盖所引用的 segment。");
  }
  const sourceText = referencedSegments.map((segment) => segment.text).join("");
  if (!reference.quote.trim() || !sourceText.includes(reference.quote)) {
    throw new Error("反馈证据 quote 必须来自所引用的转写片段。");
  }
  if (!reference.observation.trim()) {
    throw new Error("反馈证据必须说明观察结论。");
  }
}

function generatedFeedbackText(draft: ScorableEvaluationDraft): string[] {
  return [
    draft.overall.outcome,
    draft.strength.title,
    draft.strength.explanation,
    draft.priorityIssue.title,
    draft.priorityIssue.whyNow,
    draft.priorityIssue.instruction,
    draft.improvedExample.text,
    draft.retryPlan.instruction,
    ...draft.strength.evidence.map((item) => item.observation),
    ...draft.priorityIssue.evidence.map((item) => item.observation),
    ...draft.dimensions.flatMap((dimension) => [
      dimension.summary,
      dimension.nextBehavior ?? "",
      ...dimension.evidence.map((item) => item.observation),
    ]),
  ];
}

function validateNoProhibitedInference(draft: ScorableEvaluationDraft): void {
  const generatedText = generatedFeedbackText(draft).join("\n").toLocaleLowerCase("zh-CN");
  const matchedPattern = PROHIBITED_INFERENCE_PATTERNS.find((pattern) => pattern.test(generatedText));
  if (matchedPattern) {
    throw new Error("评分反馈包含从语音表现推断人格、心理、智力或就业能力的内容。");
  }
}

function validateScorableDraft(draft: ScorableEvaluationDraft, transcript: Transcript): void {
  if (!isUnitInterval(draft.confidence)) {
    throw new Error("评分置信度必须在 0 到 1 之间。");
  }
  if (!Number.isFinite(draft.overall.score) || draft.overall.score < 0 || draft.overall.score > 100) {
    throw new Error("总分必须在 0 到 100 之间。");
  }
  if (!draft.overall.outcome.trim()) {
    throw new Error("总体结果不能为空。");
  }
  if (draft.strength.evidence.length === 0 || draft.priorityIssue.evidence.length === 0) {
    throw new Error("优点和最高优先级问题都必须提供转写证据。");
  }
  if (draft.priorityIssue.id !== draft.retryPlan.focusIssueId) {
    throw new Error("重练计划必须针对唯一的最高优先级问题。");
  }
  if (!draft.improvedExample.text.trim() || draft.improvedExample.preservesUserIntent !== true) {
    throw new Error("改进示例必须明确保留用户原意。");
  }
  if (
    draft.policyChecks.transcriptEvidenceOnly !== true
    || draft.policyChecks.prohibitedInferenceChecked !== true
  ) {
    throw new Error("Provider 必须完成证据和禁止推断策略检查。");
  }

  const dimensionIds = draft.dimensions.map((dimension) => dimension.id);
  if (
    dimensionIds.length !== EVALUATION_DIMENSION_IDS.length
    || EVALUATION_DIMENSION_IDS.some((id) => !dimensionIds.includes(id))
    || new Set(dimensionIds).size !== dimensionIds.length
  ) {
    throw new Error("评分结果必须且只能包含六个冻结评分维度。");
  }
  for (const dimension of draft.dimensions) {
    if (!Number.isFinite(dimension.score) || dimension.score < 0 || dimension.score > 100) {
      throw new Error(`维度 ${dimension.id} 的分数无效。`);
    }
    if (!dimension.summary.trim() || dimension.evidence.length === 0) {
      throw new Error(`维度 ${dimension.id} 必须包含总结和证据。`);
    }
    dimension.evidence.forEach((item) => validateEvidence(item, transcript));
  }
  draft.strength.evidence.forEach((item) => validateEvidence(item, transcript));
  draft.priorityIssue.evidence.forEach((item) => validateEvidence(item, transcript));
  validateNoProhibitedInference(draft);
}

function toEvaluation(
  options: EvaluateTranscriptOptions,
  result: EvaluationProviderResult,
): Evaluation {
  if (result.kind === "unscorable") {
    if (!isUnitInterval(result.confidence)) {
      throw new Error("不可评分结果的置信度无效。");
    }
    return createUnscorable(
      options,
      result.reason,
      result.confidence,
      result.retryable,
      result.userMessage,
    );
  }

  if (!isUnitInterval(result.evaluation.confidence)) {
    throw new Error("评分置信度必须在 0 到 1 之间。");
  }
  const minimumEvaluationConfidence = options.minimumEvaluationConfidence
    ?? DEFAULT_MINIMUM_EVALUATION_CONFIDENCE;
  if (result.evaluation.confidence < minimumEvaluationConfidence) {
    return createUnscorable(
      options,
      "insufficient-evidence",
      result.evaluation.confidence,
      true,
      "分析证据置信度不足，本次不显示分数，也不计入有效练习。请校对文本后重试或重新录音。",
    );
  }

  validateScorableDraft(result.evaluation, options.transcript);
  const evaluation: ScorableEvaluation = {
    schemaVersion: 2,
    id: options.evaluationId ?? `evaluation-${options.attemptId}`,
    attemptId: options.attemptId,
    transcriptId: options.transcript.id,
    transcriptRevision: options.transcript.revision,
    rubricVersion: options.rubric.version,
    status: "scorable",
    countsTowardProgress: true,
    ...result.evaluation,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
  };
  return evaluation;
}

export async function evaluateTranscript(options: EvaluateTranscriptOptions): Promise<Evaluation> {
  validateRubric(options.rubric);
  if (options.transcript.attemptId !== options.attemptId) {
    throw new EvaluationInputError("Transcript 不属于当前 Attempt。");
  }
  if (options.transcript.status !== "user-reviewed") {
    throw new EvaluationInputError("只有用户校对后的 Transcript 才能提交评分。");
  }

  const minimumConfidence = options.minimumTranscriptConfidence
    ?? DEFAULT_MINIMUM_TRANSCRIPT_CONFIDENCE;
  if (options.transcript.confidence < minimumConfidence) {
    return createUnscorable(
      options,
      "transcript-low-confidence",
      options.transcript.confidence,
      true,
      "转写置信度不足，本次不显示分数，也不计入有效练习。请校对文本后重试或重新录音。",
    );
  }

  const spokenCharacters = options.transcript.fullText.replace(/\s/gu, "").length;
  const minimumCharacters = options.minimumSpeechCharacters ?? DEFAULT_MINIMUM_SPEECH_CHARACTERS;
  if (spokenCharacters < minimumCharacters) {
    return createUnscorable(
      options,
      "insufficient-speech",
      options.transcript.confidence,
      true,
      "有效表达内容过短，本次不显示分数，也不计入有效练习。请补充完整回答后重试。",
    );
  }

  try {
    const result = await options.provider.evaluate(
      {
        attemptId: options.attemptId,
        transcript: options.transcript,
        rubric: options.rubric,
      },
      options.signal,
    );
    return toEvaluation(options, result);
  } catch (error) {
    if (error instanceof ProviderTechnicalError) {
      throw error;
    }
    throw new ProviderTechnicalError("evaluation", "评分服务返回了无法使用的结果。", {
      retryable: false,
      cause: error,
    });
  }
}
