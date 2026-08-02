export type IsoDateTime = string;
export type EntityId = string;
export type FrameworkId = "PREP" | "STAR" | "SCQA";
export type InputMode = "voice" | "text";

export const EVALUATION_DIMENSION_IDS = [
  "task-fulfillment",
  "structure",
  "relevance",
  "evidence",
  "concision",
  "delivery",
] as const;

export type EvaluationDimensionId = (typeof EVALUATION_DIMENSION_IDS)[number];
