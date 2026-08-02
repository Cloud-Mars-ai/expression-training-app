export type CapabilityKey = "retelling" | "structure" | "scenario" | "impromptu";
export type SceneKey = "interview" | "presentation" | "meeting" | "campus" | "collaboration";
export type ExerciseStatus = "new" | "in-progress" | "completed" | "review";

export type Capability = {
  key: CapabilityKey;
  level: "L1" | "L2" | "L3" | "L4";
  title: string;
  descriptor: string;
  method: string;
  accent: "coral" | "green" | "amber" | "violet";
  icon: "book" | "network" | "message" | "spark";
  progress: number;
  exerciseCount: number;
};

export type Exercise = {
  id: string;
  capability: CapabilityKey;
  title: string;
  excerpt: string;
  scene: SceneKey;
  sceneLabel: string;
  difficulty: "D1" | "D2" | "D3" | "D4";
  duration: string;
  wordCount: string;
  status: ExerciseStatus;
  actionLabel: string;
  framework?: string;
};
