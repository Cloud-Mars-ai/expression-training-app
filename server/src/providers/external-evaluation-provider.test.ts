import { afterEach, describe, expect, it, vi } from "vitest";
import { createReviewedTranscriptFixture, structuredExpressionRubricFixture } from "../../test/fixtures/structured-expression.js";
import { ExternalEvaluationProvider } from "./external-evaluation-provider.js";

afterEach(() => vi.unstubAllGlobals());

describe("ExternalEvaluationProvider", () => {
  it("只向 DeepSeek 发送题目、评分标准和确认后的分段转写", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(validEvaluationJson()) } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ExternalEvaluationProvider({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      apiKey: "test-server-key",
    });
    const transcript = createReviewedTranscriptFixture();

    const result = await provider.evaluate({
      attemptId: transcript.attemptId,
      transcript,
      rubric: structuredExpressionRubricFixture,
    });

    expect(result.kind).toBe("scorable");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
    const serialized = JSON.stringify(body);
    expect(serialized).toContain(transcript.segments[0]?.text);
    expect(serialized).toContain(structuredExpressionRubricFixture.exercisePrompt);
    expect(serialized).not.toContain("test-server-key");
    expect(serialized).not.toContain("audio");
    expect(serialized).not.toContain("demo-user");
  });

  it("拒绝非 HTTPS 外部端点", () => {
    expect(() => new ExternalEvaluationProvider({
      baseUrl: "http://api.deepseek.com",
      model: "deepseek-chat",
      apiKey: "test-server-key",
    })).toThrow("必须使用 HTTPS");
  });

  it("鉴权失败作为技术失败返回且不产生评分", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response("unauthorized", { status: 401 })));
    const provider = new ExternalEvaluationProvider({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      apiKey: "invalid-key",
    });
    const transcript = createReviewedTranscriptFixture();
    await expect(provider.evaluate({
      attemptId: transcript.attemptId,
      transcript,
      rubric: structuredExpressionRubricFixture,
    })).rejects.toMatchObject({
      name: "ProviderTechnicalError",
      stage: "evaluation",
      retryable: false,
    });
  });
});

function validEvaluationJson() {
  const ids = ["task-fulfillment", "structure", "relevance", "evidence", "concision", "delivery"];
  return {
    confidence: 88,
    scores: ids.map((id) => ({ id, score: 76, evidenceSegmentOrdinal: 1 })),
    strength: { title: "中心明确", explanation: "开头直接说明了主要贡献。", evidenceSegmentOrdinal: 1 },
    priorityIssue: {
      dimensionId: "evidence",
      title: "补充结果证据",
      whyNow: "原回答对结果的说明较少。",
      instruction: "补充原回答中已经提到的结果，并说明其影响。",
      evidenceSegmentOrdinal: 1,
    },
    improvedExample: "我负责梳理需求并推进协作，最终完成了原回答中提到的交付。",
  };
}
