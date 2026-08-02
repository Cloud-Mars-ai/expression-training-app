import type { EntityId, EvaluationDimensionId, IsoDateTime } from "./common";

export type EvidenceReference = {
  transcriptId: EntityId;
  transcriptRevision: number;
  segmentIds: EntityId[];
  startMs: number;
  endMs: number;
  quote: string;
  observation: string;
};

export type EvaluationDimension = {
  id: EvaluationDimensionId;
  score: number;
  summary: string;
  evidence: EvidenceReference[];
  nextBehavior?: string;
};

export type ScorableEvaluation = {
  schemaVersion: 2;
  id: EntityId;
  attemptId: EntityId;
  transcriptId: EntityId;
  transcriptRevision: number;
  rubricVersion: string;
  status: "scorable";
  confidence: number;
  countsTowardProgress: true;
  overall: {
    score: number;
    outcome: string;
  };
  strength: {
    title: string;
    explanation: string;
    evidence: EvidenceReference[];
  };
  priorityIssue: {
    id: EntityId;
    dimensionId: EvaluationDimensionId;
    title: string;
    whyNow: string;
    instruction: string;
    evidence: EvidenceReference[];
  };
  improvedExample: {
    text: string;
    preservesUserIntent: true;
  };
  retryPlan: {
    focusIssueId: EntityId;
    preparationSeconds: number;
    speakingSeconds: number;
    instruction: string;
  };
  dimensions: EvaluationDimension[];
  policyChecks: {
    transcriptEvidenceOnly: true;
    prohibitedInferenceChecked: true;
  };
  generatedAt: IsoDateTime;
};

export type UnscorableReason =
  | "transcript-low-confidence"
  | "insufficient-speech"
  | "insufficient-evidence";

export type UnscorableEvaluation = {
  schemaVersion: 2;
  id: EntityId;
  attemptId: EntityId;
  transcriptId: EntityId | null;
  transcriptRevision: number | null;
  status: "unscorable";
  reason: UnscorableReason;
  confidence: number;
  countsTowardProgress: false;
  retryable: boolean;
  userMessage: string;
  generatedAt: IsoDateTime;
};

export type Evaluation = ScorableEvaluation | UnscorableEvaluation;

