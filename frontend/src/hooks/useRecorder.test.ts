import { describe, expect, it } from "vitest";
import { formatRecordingDuration } from "./useRecorder";

describe("useRecorder utilities", () => {
  it("formats elapsed recording time for the UI", () => {
    expect(formatRecordingDuration(0)).toBe("00:00");
    expect(formatRecordingDuration(61_900)).toBe("01:01");
    expect(formatRecordingDuration(-200)).toBe("00:00");
  });
});
