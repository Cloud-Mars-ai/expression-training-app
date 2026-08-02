import { describe, expect, it } from "vitest";
import { canTransitionRecorder, isRecorderNavigationUnsafe, transitionRecorderStatus } from "./recorderMachine";
import type { RecorderStatus } from "./types";

describe("recorderMachine", () => {
  it("follows the complete browser recording lifecycle", () => {
    const events = ["request-permission", "permission-granted", "start", "pause", "resume", "stop", "complete"] as const;
    const expected = ["requesting-permission", "ready", "recording", "paused", "recording", "stopping", "recorded"];
    let status: RecorderStatus = "idle";
    events.forEach((event, index) => {
      const next = transitionRecorderStatus(status, event);
      expect(next).toBe(expected[index]);
      status = next!;
    });
  });

  it("rejects invalid transitions without inventing Attempt states", () => {
    expect(canTransitionRecorder("idle", "pause")).toBe(false);
    expect(transitionRecorderStatus("recorded", "resume")).toBeNull();
    expect(transitionRecorderStatus("paused", "resume")).toBe("recording");
  });

  it("warns on page leave only while captured audio can be lost", () => {
    expect(isRecorderNavigationUnsafe("recording")).toBe(true);
    expect(isRecorderNavigationUnsafe("paused")).toBe(true);
    expect(isRecorderNavigationUnsafe("stopping")).toBe(true);
    expect(isRecorderNavigationUnsafe("ready")).toBe(false);
    expect(isRecorderNavigationUnsafe("recorded")).toBe(false);
    expect(isRecorderNavigationUnsafe("error")).toBe(false);
  });
});
