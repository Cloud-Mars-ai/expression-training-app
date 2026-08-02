import { demoRepository } from "../../data/demoRepository";
import type { EvaluationResult, FrameworkId, TrainingAttempt } from "./model";
import { l2ProjectExercise } from "./content";

function createId() { return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `attempt-${Date.now()}`; }

export function createAttempt(frameworkId: FrameworkId, options?: { retryOf?: string; focusIssue?: string }): TrainingAttempt {
  const now = new Date().toISOString();
  const attempt: TrainingAttempt = { id: createId(), schemaVersion: 1, userId: "demo-user", exerciseId: l2ProjectExercise.id, exerciseVersion: l2ProjectExercise.version, frameworkId, stage: "preparing", recordingState: "idle", preparationRemaining: l2ProjectExercise.preparationSeconds, recordingElapsed: 0, retryOf: options?.retryOf, focusIssue: options?.focusIssue, createdAt: now, updatedAt: now };
  return demoRepository.saveAttempt(attempt);
}
export function getAttempt(id: string | null) { return demoRepository.getAttempt(id); }
export function saveAttempt(attempt: TrainingAttempt) { return demoRepository.saveAttempt(attempt); }
export function patchAttempt(id: string, patch: Partial<TrainingAttempt>) { const current = getAttempt(id); return current ? saveAttempt({ ...current, ...patch, id: current.id }) : null; }
export function saveEvaluation(result: EvaluationResult) { demoRepository.saveEvaluation(result); }
export function getEvaluation(attemptId: string | undefined): EvaluationResult | null { const result = demoRepository.getEvaluation(attemptId); return result?.status === "scorable" ? result : null; }
