import type { ScorableEvaluation, Transcript } from "@expression-training/contracts";
import type { EvaluationResult } from "./model";

const DIMENSION_LABELS: Record<string, string> = {
  "task-fulfillment": "任务完成度",
  structure: "结构",
  relevance: "相关性",
  evidence: "证据",
  concision: "简洁度",
  delivery: "表达流畅度",
};

export function adaptRemoteEvaluation(evaluation: ScorableEvaluation, transcript: Transcript): EvaluationResult {
  const strengthEvidence = evaluation.strength.evidence[0];
  const priorityEvidence = evaluation.priorityIssue.evidence[0];
  if (!strengthEvidence || !priorityEvidence) throw new Error("评分结果缺少必要证据。");
  return {
    schemaVersion: 1,
    attemptId: evaluation.attemptId,
    status: "scorable",
    confidence: evaluation.confidence,
    overall: evaluation.overall,
    transcript: transcript.fullText,
    strength: {
      title: evaluation.strength.title,
      explanation: evaluation.strength.explanation,
      evidence: toLegacyEvidence(strengthEvidence),
    },
    priorityCorrection: {
      dimensionId: evaluation.priorityIssue.dimensionId,
      title: evaluation.priorityIssue.title,
      whyNow: evaluation.priorityIssue.whyNow,
      instruction: evaluation.priorityIssue.instruction,
      evidence: toLegacyEvidence(priorityEvidence),
    },
    improvedExample: evaluation.improvedExample.text,
    retry: {
      preparationSeconds: evaluation.retryPlan.preparationSeconds,
      speakingSeconds: evaluation.retryPlan.speakingSeconds,
      focus: evaluation.retryPlan.instruction,
    },
    dimensions: evaluation.dimensions.map((dimension) => ({
      id: dimension.id,
      label: DIMENSION_LABELS[dimension.id] ?? dimension.id,
      score: dimension.score,
      summary: dimension.summary,
      evidence: dimension.evidence.map(toLegacyEvidence),
      ...(dimension.nextBehavior ? { nextBehavior: dimension.nextBehavior } : {}),
    })),
    review: { afterDays: 3, skill: evaluation.priorityIssue.dimensionId },
    generatedAt: evaluation.generatedAt,
  };
}

function toLegacyEvidence(evidence: ScorableEvaluation["strength"]["evidence"][number]) {
  return {
    startMs: evidence.startMs,
    endMs: evidence.endMs,
    quote: evidence.quote,
    observation: evidence.observation,
  };
}
