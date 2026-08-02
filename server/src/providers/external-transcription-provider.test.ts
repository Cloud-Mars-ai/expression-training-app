import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalTranscriptionProvider } from "./external-transcription-provider.js";

afterEach(() => vi.unstubAllGlobals());

const request = {
  attemptId: "attempt-cloud-1",
  language: "zh-CN" as const,
  audio: {
    assetId: "audio-1",
    mimeType: "audio/wav",
    byteSize: 8,
    durationMs: 2_000,
    sha256: "hash",
    bytes: new Uint8Array([1, 2, 3, 4]),
  },
};

describe("ExternalTranscriptionProvider", () => {
  it("sends only the audio and transcription fields to an HTTPS cloud endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const form = init?.body as FormData;
      expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
      expect(form.get("language")).toBe("zh");
      expect(form.get("file")).toBeInstanceOf(Blob);
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer server-secret");
      expect([...form.entries()].filter(([name]) => name !== "file").map((entry) => entry.join(":"))).not.toContain("server-secret");
      return new Response(JSON.stringify({
        text: "我先说明观点，再给出理由。",
        confidence: 0.91,
        segments: [{ start: 0, end: 2, text: "我先说明观点，再给出理由。", avg_logprob: -0.1 }],
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ExternalTranscriptionProvider({
      baseUrl: "https://speech.example.test/v1",
      model: "gpt-4o-mini-transcribe",
      apiKey: "server-secret",
    });

    const result = await provider.transcribe(request);

    expect(result.provider.providerId).toBe("cloud-asr");
    expect(result.provider.model).toBe("gpt-4o-mini-transcribe");
    expect(result.fullText).toContain("说明观点");
    expect(result.segments[0]?.startMs).toBe(0);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("turns a cloud no-speech response into a retryable user-facing error", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ detail: "no speech detected" }), { status: 422 })));
    const provider = new ExternalTranscriptionProvider({
      baseUrl: "https://speech.example.test/v1",
      model: "whisper-1",
      apiKey: "test-key",
    });

    await expect(provider.transcribe(request)).rejects.toMatchObject({
      name: "ProviderTechnicalError",
      stage: "transcription",
      retryable: true,
      message: "云端语音识别没有检测到可可靠识别的语音。请靠近麦克风、提高说话音量后重录。",
    });
  });

  it("rejects non-HTTPS endpoints", () => {
    expect(() => new ExternalTranscriptionProvider({
      baseUrl: "http://speech.example.test/v1",
      model: "whisper-1",
      apiKey: "test-key",
    })).toThrow("必须使用 HTTPS");
  });
});
