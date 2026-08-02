export type CapabilityId = "retelling" | "structure" | "scenario" | "impromptu";
export type FrameworkId = "PREP" | "STAR";
export type RecordingState = "idle" | "recording" | "paused" | "completed";

export type UserProfile = {
  id: string;
  displayName: string;
  roleStage: "undergraduate" | "graduate" | "new-hire" | "early-career";
  currentGoal: string;
  privacyPreferences: {
    saveSimulatedRecordings: boolean;
    retainTranscripts: boolean;
    allowModelImprovement: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type Exercise = {
  id: string;
  currentVersionId: string;
  level: "L1" | "L2" | "L3" | "L4";
  capability: CapabilityId;
  title: string;
  scene: string;
  targetSkillIds: string[];
  status: "available" | "archived";
};

export type ExerciseVersion = {
  id: string;
  exerciseId: string;
  version: string;
  prompt: string;
  preparationSeconds: number;
  speakingSeconds: number;
  successCriteria: Array<{ id: string; label: string; detail: string }>;
  supportedFrameworks: FrameworkId[];
  publishedAt: string;
};

export type AttemptState = "created" | "preparing" | "recording" | "paused" | "processing" | "result" | "technical-error" | "cancelled";

export type Attempt = {
  id: string;
  schemaVersion: 1;
  userId: string;
  exerciseId: string;
  exerciseVersion: string;
  frameworkId: FrameworkId;
  stage: AttemptState;
  recordingState: RecordingState;
  preparationRemaining: number;
  recordingElapsed: number;
  retryOf?: string;
  focusIssue?: string;
  createdAt: string;
  updatedAt: string;
};

export type EvidenceSpan = { startMs: number; endMs: number; quote: string; observation: string };
export type DimensionScore = { id: string; label: string; score: number; summary: string; evidence: EvidenceSpan[]; nextBehavior?: string };

type ScorableEvaluation = {
  schemaVersion: 1;
  attemptId: string;
  status: "scorable";
  confidence: number;
  overall: { score: number; outcome: string };
  transcript: string;
  strength: { title: string; explanation: string; evidence: EvidenceSpan };
  priorityCorrection: { dimensionId: string; title: string; whyNow: string; instruction: string; evidence: EvidenceSpan };
  improvedExample: string;
  retry: { preparationSeconds: number; speakingSeconds: number; focus: string };
  dimensions: DimensionScore[];
  review: { afterDays: number; skill: string };
  generatedAt: string;
};

type TechnicalEvaluation = {
  schemaVersion: 1;
  attemptId: string;
  status: "technical-error";
  code: "analysis-timeout" | "attempt-missing";
  message: string;
  retryable: boolean;
  occurredAt: string;
};

export type Evaluation = ScorableEvaluation | TechnicalEvaluation;

export type SkillProgress = {
  skillId: string;
  label: string;
  mastery: number;
  uncertainty: number;
  observationCount: number;
  latestScore?: number;
  lastPracticedAt?: string;
};

export type ReviewItem = {
  id: string;
  exerciseId: string;
  sourceAttemptId: string;
  skillId: string;
  dueAt: string;
  status: "pending" | "completed";
};

export type DemoFilters = { scene: string; capability?: CapabilityId };
export type CompletionStatus = { exerciseId: string; status: "not-started" | "in-progress" | "completed"; completedAt?: string };
export type RecentPractice = { attemptId: string; exerciseId: string; title: string; completedAt: string; score: number; isRetry: boolean };

export type DemoDataSnapshot = {
  userProfile: UserProfile;
  exercises: Exercise[];
  exerciseVersions: ExerciseVersion[];
  attempts: Record<string, Attempt>;
  evaluations: Record<string, Evaluation>;
  skillProgress: SkillProgress[];
  reviewItems: ReviewItem[];
  recentPractice: RecentPractice[];
  completionStatus: Record<string, CompletionStatus>;
  filters: DemoFilters;
};
