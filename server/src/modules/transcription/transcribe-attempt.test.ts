import { describe, expect, it } from "vitest";
import { MockTranscriptionProvider } from "../../providers/index.js";
import {
  STRUCTURED_EXPRESSION_ATTEMPT_ID,
  structuredExpressionAudioFixture,
} from "../../../test/fixtures/structured-expression.js";
import { transcribeAttempt } from "./transcribe-attempt.js";

describe("transcribeAttempt", () => {
  it("创建带中文片段 ID、时间戳、置信度和全文的 provider draft", async () => {
    const transcript = await transcribeAttempt({
      attemptId: STRUCTURED_EXPRESSION_ATTEMPT_ID,
      language: "zh-CN",
      audio: structuredExpressionAudioFixture,
      provider: new MockTranscriptionProvider(),
      transcriptId: "transcript-fixed-001",
      now: () => new Date("2026-08-02T03:00:00.000Z"),
    });

    expect(transcript).toMatchObject({
      id: "transcript-fixed-001",
      status: "provider-draft",
      revision: 1,
      confidence: 0.95,
      createdAt: "2026-08-02T03:00:00.000Z",
    });
    expect(transcript.segments).toHaveLength(5);
    expect(transcript.segments.every((segment) => segment.id.includes("片段"))).toBe(true);
    expect(transcript.segments[0]).toMatchObject({ startMs: 0, ordinal: 1 });
    expect(transcript.segments.at(-1)?.endMs).toBe(60_000);
    expect(transcript.fullText).toContain("发布完成率");
    expect(transcript.fullText).toBe(transcript.segments.map((segment) => segment.text).join(""));
  });

  it("把 Provider 技术异常作为异常返回，不伪造 Transcript", async () => {
    await expect(transcribeAttempt({
      attemptId: STRUCTURED_EXPRESSION_ATTEMPT_ID,
      language: "zh-CN",
      audio: structuredExpressionAudioFixture,
      provider: new MockTranscriptionProvider({
        failWith: { message: "模拟转写服务不可用", retryable: true },
      }),
    })).rejects.toMatchObject({
      name: "ProviderTechnicalError",
      stage: "transcription",
      retryable: true,
    });
  });

  it("拒绝时间戳超出音频范围的 Provider 结果", async () => {
    const provider = new MockTranscriptionProvider({
      result: {
        language: "zh-CN",
        confidence: 0.9,
        provider: { providerId: "bad-mock", model: "bad-v1" },
        segments: [{
          id: "segment-invalid",
          ordinal: 1,
          startMs: 0,
          endMs: 99_000,
          text: "这是一段超出音频时长的转写。",
          confidence: 0.9,
        }],
        fullText: "这是一段超出音频时长的转写。",
      },
    });

    await expect(transcribeAttempt({
      attemptId: STRUCTURED_EXPRESSION_ATTEMPT_ID,
      language: "zh-CN",
      audio: structuredExpressionAudioFixture,
      provider,
    })).rejects.toMatchObject({
      stage: "transcription",
      retryable: false,
    });
  });
});
