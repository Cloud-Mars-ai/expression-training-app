import type { AttemptStatus } from "../domain/attempt";

export const ATTEMPT_TRANSITIONS = {
  created: ["permission-check", "cancelled", "deleted"],
  "permission-check": ["recording", "cancelled", "technical-failure", "deleted"],
  recording: ["uploading", "cancelled", "technical-failure", "deleted"],
  uploading: ["transcribing", "cancelled", "technical-failure", "deleted"],
  transcribing: ["transcript-review", "unscorable", "cancelled", "technical-failure", "deleted"],
  "transcript-review": ["evaluating", "cancelled", "deleted"],
  evaluating: ["ready", "unscorable", "technical-failure", "deleted"],
  ready: ["deleted"],
  cancelled: ["deleted"],
  "technical-failure": ["deleted"],
  unscorable: ["deleted"],
  deleted: [],
} as const satisfies Record<AttemptStatus, readonly AttemptStatus[]>;

export const PROGRESS_COUNTED_ATTEMPT_STATUSES = ["ready"] as const satisfies readonly AttemptStatus[];

export const NEVER_SCORE_ATTEMPT_STATUSES = [
  "cancelled",
  "technical-failure",
  "unscorable",
  "deleted",
] as const satisfies readonly AttemptStatus[];

