import type { Attempt, FrameworkId, InputMode } from "@expression-training/contracts";
import { remoteAttemptSession } from "../../data/remoteAttemptSession";
import {
  createIdempotencyKey,
  createRemoteAttempt,
  getRemoteAttempt,
  updateRemoteAttemptStatus,
} from "../../services/attemptApi";
import { getStructuredExercise } from "./content";
import { createLocalAttempt } from "./storage";

export async function startRemoteTrainingAttempt(input: {
  exerciseId: string;
  frameworkId: FrameworkId;
  inputMode: InputMode;
  createKey?: string;
  retryOfAttemptId?: string;
  focusIssueId?: string;
  focusInstruction?: string;
}) {
  const exercise = getStructuredExercise(input.exerciseId);
  const created = await createRemoteAttempt({
    exerciseId: exercise.id,
    exerciseVersionId: `${exercise.id}@${exercise.version}`,
    frameworkId: input.frameworkId,
    inputMode: input.inputMode,
    ...(input.retryOfAttemptId ? { retryOfAttemptId: input.retryOfAttemptId } : {}),
    ...(input.focusIssueId ? { focusIssueId: input.focusIssueId } : {}),
    locale: "zh-CN",
    clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
  }, input.createKey ?? createIdempotencyKey());
  const entry = await updateRemoteAttemptStatus(created.id, created.statusVersion, input.inputMode === "voice" ? "permission-check" : "text-entry");
  remoteAttemptSession.create({
    attemptId: entry.id,
    frameworkId: input.frameworkId,
    inputMode: input.inputMode,
    ...(input.retryOfAttemptId ? { retryOfAttemptId: input.retryOfAttemptId } : {}),
    ...(input.focusIssueId ? { focusIssueId: input.focusIssueId } : {}),
    ...(input.focusInstruction ? { focusInstruction: input.focusInstruction } : {}),
    lastKnownStatus: entry.status,
  });
  const local = createLocalAttempt(entry.id, input.frameworkId, exercise.id, input.inputMode, {
    ...(input.retryOfAttemptId ? { retryOf: input.retryOfAttemptId } : {}),
    ...(input.focusInstruction ? { focusIssue: input.focusInstruction } : {}),
  });
  return { remote: entry, local };
}

export async function ensureRemoteRecording(attemptId: string): Promise<Attempt> {
  const detail = await getRemoteAttempt(attemptId);
  if (detail.attempt.status === "recording") return detail.attempt;
  if (detail.attempt.status !== "permission-check") return detail.attempt;
  const updated = await updateRemoteAttemptStatus(attemptId, detail.attempt.statusVersion, "recording");
  remoteAttemptSession.updateStatus(attemptId, updated.status);
  return updated;
}

export async function cancelRemoteTraining(attemptId: string): Promise<void> {
  const detail = await getRemoteAttempt(attemptId);
  if (!["created", "permission-check", "text-entry", "recording"].includes(detail.attempt.status)) return;
  const updated = await updateRemoteAttemptStatus(attemptId, detail.attempt.statusVersion, "cancelled");
  remoteAttemptSession.updateStatus(attemptId, updated.status);
}
