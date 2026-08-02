import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalTranscriptionProvider } from "./local-transcription-provider.js";

afterEach(() => vi.unstubAllGlobals());

describe("LocalTranscriptionProvider", () => {
  it("shows a retryable recording-quality message for no-speech 422 responses", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ detail: "no speech detected" }), { status: 422 })));
    const provider = new LocalTranscriptionProvider({ baseUrl: "http://127.0.0.1:9000/v1", model: "small" });

    await expect(provider.transcribe({
      attemptId: "attempt-no-speech",
      language: "zh-CN",
      audio: {
        assetId: "audio-no-speech",
        mimeType: "audio/webm",
        byteSize: 4,
        durationMs: 2_000,
        sha256: "hash",
        bytes: new Uint8Array([1, 2, 3, 4]),
      },
    })).rejects.toMatchObject({
      name: "ProviderTechnicalError",
      stage: "transcription",
      retryable: true,
      message: "录音中没有检测到可可靠识别的语音。请靠近麦克风、提高说话音量后重录。",
    });
  });
});
