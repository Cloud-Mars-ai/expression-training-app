import type { RecorderStatus } from "./types";

export type RecorderEvent =
  | "request-permission"
  | "permission-granted"
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "complete"
  | "cancel"
  | "reset"
  | "fail";

const transitions: Record<RecorderStatus, Partial<Record<RecorderEvent, RecorderStatus>>> = {
  idle: { "request-permission": "requesting-permission", cancel: "cancelled", reset: "idle", fail: "error" },
  "requesting-permission": { "permission-granted": "ready", cancel: "cancelled", reset: "idle", fail: "error" },
  ready: { start: "recording", cancel: "cancelled", reset: "idle", fail: "error" },
  recording: { pause: "paused", stop: "stopping", cancel: "cancelled", reset: "idle", fail: "error" },
  paused: { resume: "recording", stop: "stopping", cancel: "cancelled", reset: "idle", fail: "error" },
  stopping: { complete: "recorded", cancel: "cancelled", reset: "idle", fail: "error" },
  recorded: { "request-permission": "requesting-permission", cancel: "cancelled", reset: "idle", fail: "error" },
  cancelled: { "request-permission": "requesting-permission", reset: "idle", cancel: "cancelled", fail: "error" },
  error: { "request-permission": "requesting-permission", cancel: "cancelled", reset: "idle", fail: "error" },
};

export function transitionRecorderStatus(status: RecorderStatus, event: RecorderEvent): RecorderStatus | null {
  return transitions[status][event] ?? null;
}

export function canTransitionRecorder(status: RecorderStatus, event: RecorderEvent): boolean {
  return transitionRecorderStatus(status, event) !== null;
}

export function isRecorderNavigationUnsafe(status: RecorderStatus): boolean {
  return status === "recording" || status === "paused" || status === "stopping";
}
