import { demoRepository } from "../../data/demoRepository";
import type { EvaluationResult, FrameworkId, InputMode, TrainingAttempt } from "./model";
import { getStructuredExercise } from "./content";

export function createLocalAttempt(id: string, frameworkId: FrameworkId, exerciseId: string, inputMode: InputMode, options?: { retryOf?: string; focusIssue?: string }): TrainingAttempt {
  const now = new Date().toISOString();
  const exercise = getStructuredExercise(exerciseId);
  const attempt: TrainingAttempt = { id, schemaVersion: 2, userId: "demo-user", exerciseId: exercise.id, exerciseVersion: exercise.version, frameworkId, inputMode, stage: "preparing", recordingState: "idle", preparationRemaining: exercise.preparationSeconds, recordingElapsed: 0, retryOf: options?.retryOf, focusIssue: options?.focusIssue, createdAt: now, updatedAt: now };
  return demoRepository.saveAttempt(attempt);
}
export function getAttempt(id: string | null) { return demoRepository.getAttempt(id); }
export function saveAttempt(attempt: TrainingAttempt) { return demoRepository.saveAttempt(attempt); }
export function patchAttempt(id: string, patch: Partial<TrainingAttempt>) { const current = getAttempt(id); return current ? saveAttempt({ ...current, ...patch, id: current.id }) : null; }
export function saveEvaluation(result: EvaluationResult) { demoRepository.saveEvaluation(result); }
export function getEvaluation(attemptId: string | undefined): EvaluationResult | null { const result = demoRepository.getEvaluation(attemptId); return result?.status === "scorable" ? result : null; }
