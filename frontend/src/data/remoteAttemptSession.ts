import type { AttemptStatus, FrameworkId, InputMode } from "@expression-training/contracts";
import { createIdempotencyKey, deleteRemoteAttempt } from "../services/attemptApi";

const STORAGE_KEY = "expression-training:remote-attempt-sessions-v1";

export type RemoteAttemptSession = {
  attemptId: string;
  frameworkId: FrameworkId;
  inputMode: InputMode;
  retryOfAttemptId?: string;
  focusIssueId?: string;
  focusInstruction?: string;
  lastKnownStatus: AttemptStatus;
  uploadKey: string;
  evaluationKey: string;
  createdAt: string;
  updatedAt: string;
};

type PersistedSessions = { schemaVersion: 2; sessions: Record<string, RemoteAttemptSession> };

function read(): PersistedSessions {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as { schemaVersion?: number; sessions?: Record<string, Partial<RemoteAttemptSession>> } | null;
    if (parsed?.sessions) return {
      schemaVersion: 2,
      sessions: Object.fromEntries(Object.entries(parsed.sessions).map(([id, session]) => [id, { ...session, inputMode: session.inputMode ?? "voice" } as RemoteAttemptSession])),
    };
  } catch { /* reset malformed local data */ }
  return { schemaVersion: 2, sessions: {} };
}

function write(data: PersistedSessions): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export const remoteAttemptSession = {
  create(input: Omit<RemoteAttemptSession, "uploadKey" | "evaluationKey" | "createdAt" | "updatedAt">) {
    const data = read();
    const now = new Date().toISOString();
    const session: RemoteAttemptSession = {
      ...input,
      uploadKey: createIdempotencyKey(),
      evaluationKey: createIdempotencyKey(),
      createdAt: now,
      updatedAt: now,
    };
    data.sessions[input.attemptId] = session;
    write(data);
    return session;
  },
  get(attemptId: string | null | undefined) {
    return attemptId ? read().sessions[attemptId] ?? null : null;
  },
  updateStatus(attemptId: string, lastKnownStatus: AttemptStatus) {
    const data = read();
    const current = data.sessions[attemptId];
    if (!current) return null;
    const next = { ...current, lastKnownStatus, updatedAt: new Date().toISOString() };
    data.sessions[attemptId] = next;
    write(data);
    return next;
  },
  list() { return Object.values(read().sessions); },
  remove(attemptId: string) {
    const data = read();
    delete data.sessions[attemptId];
    write(data);
  },
  async deleteAllRemote() {
    const sessions = Object.values(read().sessions);
    const failures: string[] = [];
    for (const session of sessions) {
      try { await deleteRemoteAttempt(session.attemptId); } catch { failures.push(session.attemptId); }
    }
    if (failures.length === 0) localStorage.removeItem(STORAGE_KEY);
    return failures;
  },
};
