import { describe, expect, it } from "vitest";
import { AudioRecorderError, mapAudioRecorderError } from "./audioErrors";

function browserError(name: string) {
  return Object.assign(new Error(name), { name });
}

describe("audio recorder error mapping", () => {
  it.each([
    ["NotAllowedError", "permission-denied"],
    ["SecurityError", "permission-denied"],
    ["NotFoundError", "no-device"],
    ["NotReadableError", "device-busy"],
    ["AbortError", "recording-interrupted"],
    ["NotSupportedError", "unsupported"],
    ["InvalidStateError", "invalid-state"],
  ])("maps %s to %s", (name, code) => {
    expect(mapAudioRecorderError(browserError(name)).code).toBe(code);
  });

  it("preserves a typed recorder error and safe user-facing metadata", () => {
    const source = new AudioRecorderError("silent-input");
    expect(mapAudioRecorderError(source)).toBe(source);
    expect(source.toInfo()).toEqual({
      code: "silent-input",
      message: "没有检测到清晰声音，请检查麦克风后重新录音。",
      recoverable: true,
    });
  });

  it("uses a technical unknown error instead of a user ability judgement", () => {
    const mapped = mapAudioRecorderError(new Error("encoder crashed"));
    expect(mapped.code).toBe("unknown");
    expect(mapped.message).toContain("技术问题");
    expect(mapped.message).not.toMatch(/低分|能力低|表达差/);
  });
});
