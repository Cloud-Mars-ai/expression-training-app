import type { Attempt, AttemptState, DimensionScore, Evaluation, EvidenceSpan, FrameworkId, RecordingState } from "../../domain/models";

export type { AttemptState, DimensionScore, EvidenceSpan, FrameworkId, RecordingState };
export type AttemptStage = AttemptState;
export type TrainingAttempt = Attempt;
export type EvaluationResult = Extract<Evaluation, { status: "scorable" }>;
export type TechnicalFailure = Extract<Evaluation, { status: "technical-error" }>;

export type FrameworkOption = {
  id: FrameworkId;
  name: string;
  shortDescription: string;
  recommended?: boolean;
  steps: Array<{ key: string; label: string; prompt: string }>;
};

export type StructuredExercise = {
  id: string;
  version: string;
  level: "L2";
  title: string;
  prompt: string;
  scene: string;
  targetSkill: string;
  preparationSeconds: number;
  speakingSeconds: number;
  successCriteria: Array<{ id: string; label: string; detail: string }>;
  frameworks: FrameworkOption[];
};
