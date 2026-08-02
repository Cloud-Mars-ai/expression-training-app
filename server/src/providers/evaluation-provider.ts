import type {
  EvaluationDimensionId,
  ScorableEvaluation,
  Transcript,
  UnscorableReason,
} from "@expression-training/contracts";

export type EvaluationRubricDimension = {
  id: EvaluationDimensionId;
  label: string;
  successCriteria: readonly string[];
};

export type EvaluationRubric = {
  version: string;
  exerciseId: string;
  exercisePrompt: string;
  dimensions: readonly EvaluationRubricDimension[];
  policy: {
    evidenceMustComeFromTranscript: true;
    allowOnlyOnePriorityIssue: true;
    prohibitedInferences: readonly string[];
  };
};

export type EvaluationProviderRequest = {
  attemptId: string;
  transcript: Transcript;
  rubric: EvaluationRubric;
};

export type ScorableEvaluationDraft = Pick<
  ScorableEvaluation,
  | "confidence"
  | "overall"
  | "strength"
  | "priorityIssue"
  | "improvedExample"
  | "retryPlan"
  | "dimensions"
  | "policyChecks"
>;

export type EvaluationProviderResult =
  | {
      kind: "scorable";
      evaluation: ScorableEvaluationDraft;
    }
  | {
      kind: "unscorable";
      reason: UnscorableReason;
      confidence: number;
      retryable: boolean;
      userMessage: string;
    };

export interface EvaluationProvider {
  readonly providerId: string;
  evaluate(
    request: EvaluationProviderRequest,
    signal?: AbortSignal,
  ): Promise<EvaluationProviderResult>;
}
