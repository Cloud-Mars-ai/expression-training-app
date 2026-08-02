import type { EvaluationProvider, EvaluationProviderResult } from "../../providers/index.js";
import { describe, expect, it, vi } from "vitest";
import { MockEvaluationProvider } from "../../providers/index.js";
import {
  STRUCTURED_EXPRESSION_ATTEMPT_ID,
  createLowConfidenceTranscriptFixture,
  createReviewedTranscriptFixture,
  structuredExpressionRubricFixture,
} from "../../../test/fixtures/structured-expression.js";
import { EvaluationInputError, evaluateTranscript } from "./evaluate-transcript.js";

describe("evaluateTranscript", () => {
  it("生成六维、单一优先问题且每条反馈都有 revision/segment/timestamp/quote 证据", async () => {
    const transcript = createReviewedTranscriptFixture();
    const evaluation = await evaluateTranscript({
      attemptId: STRUCTURED_EXPRESSION_ATTEMPT_ID,
      transcript,
      rubric: structuredExpressionRubricFixture,
      provider: new MockEvaluationProvider(),
      now: () => new Date("2026-08-02T03:10:00.000Z"),
    });

    expect(evaluation.status).toBe("scorable");
    if (evaluation.status !== "scorable") return;
    expect(evaluation.dimensions.map((dimension) => dimension.id)).toEqual([
      "task-fulfillment",
      "structure",
      "relevance",
      "evidence",
      "concision",
      "delivery",
    ]);
    expect(evaluation.priorityIssue.id).toBe(evaluation.retryPlan.focusIssueId);
    expect(evaluation.improvedExample.preservesUserIntent).toBe(true);
    expect(evaluation.countsTowardProgress).toBe(true);

    const references = [
      ...evaluation.strength.evidence,
      ...evaluation.priorityIssue.evidence,
      ...evaluation.dimensions.flatMap((dimension) => dimension.evidence),
    ];
    expect(references).toHaveLength(8);
    for (const reference of references) {
      expect(reference.transcriptId).toBe(transcript.id);
      expect(reference.transcriptRevision).toBe(transcript.revision);
      expect(reference.segmentIds.length).toBeGreaterThan(0);
      expect(reference.endMs).toBeGreaterThan(reference.startMs);
      expect(reference.quote.length).toBeGreaterThan(0);
      expect(reference.observation.length).toBeGreaterThan(0);
    }
  });

  it("转写低置信度时直接返回 unscorable，不调用评分 Provider，也不生成低分", async () => {
    const evaluate = vi.fn<EvaluationProvider["evaluate"]>();
    const provider: EvaluationProvider = { providerId: "never-called", evaluate };
    const evaluation = await evaluateTranscript({
      attemptId: STRUCTURED_EXPRESSION_ATTEMPT_ID,
      transcript: createLowConfidenceTranscriptFixture(),
      rubric: structuredExpressionRubricFixture,
      provider,
      now: () => new Date("2026-08-02T03:20:00.000Z"),
    });

    expect(evaluate).not.toHaveBeenCalled();
    expect(evaluation).toMatchObject({
      status: "unscorable",
      reason: "transcript-low-confidence",
      countsTowardProgress: false,
      retryable: true,
    });
    expect("overall" in evaluation).toBe(false);
  });

  it("评分 Provider 置信度低时丢弃分数草稿并返回 unscorable", async () => {
    const transcript = createReviewedTranscriptFixture();
    const draft = await new MockEvaluationProvider().evaluate({
      attemptId: STRUCTURED_EXPRESSION_ATTEMPT_ID,
      transcript,
      rubric: structuredExpressionRubricFixture,
    });
    expect(draft.kind).toBe("scorable");
    if (draft.kind !== "scorable") return;

    const provider = new MockEvaluationProvider({
      result: {
        kind: "scorable",
        evaluation: { ...draft.evaluation, confidence: 0.32 },
      },
    });
    const evaluation = await evaluateTranscript({
      attemptId: STRUCTURED_EXPRESSION_ATTEMPT_ID,
      transcript,
      rubric: structuredExpressionRubricFixture,
      provider,
    });

    expect(evaluation).toMatchObject({
      status: "unscorable",
      reason: "insufficient-evidence",
      confidence: 0.32,
      countsTowardProgress: false,
    });
    expect("overall" in evaluation).toBe(false);
  });

  it.each([
    ["性格", "从声音可以判断你的性格不适合团队协作。"],
    ["焦虑", "从停顿可以判断你处于焦虑状态。"],
    ["智力", "从表达速度可以判断你的智力水平。"],
    ["心理状态", "从语气可以判断你的心理状态不稳定。"],
    ["就业能力", "从声音可以判断你的就业能力较低。"],
  ])("拒绝禁止推断：%s", async (_label, unsafeText) => {
    const transcript = createReviewedTranscriptFixture();
    const good = await new MockEvaluationProvider().evaluate({
      attemptId: STRUCTURED_EXPRESSION_ATTEMPT_ID,
      transcript,
      rubric: structuredExpressionRubricFixture,
    });
    expect(good.kind).toBe("scorable");
    if (good.kind !== "scorable") return;

    const unsafe: EvaluationProviderResult = {
      kind: "scorable",
      evaluation: {
        ...good.evaluation,
        priorityIssue: {
          ...good.evaluation.priorityIssue,
          whyNow: unsafeText,
        },
      },
    };
    const provider: EvaluationProvider = {
      providerId: "unsafe-provider",
      evaluate: vi.fn(async () => unsafe),
    };

    await expect(evaluateTranscript({
      attemptId: STRUCTURED_EXPRESSION_ATTEMPT_ID,
      transcript,
      rubric: structuredExpressionRubricFixture,
      provider,
    })).rejects.toMatchObject({
      name: "ProviderTechnicalError",
      stage: "evaluation",
      retryable: false,
    });
  });

  it("Provider 技术失败作为异常返回，不创建 Evaluation", async () => {
    await expect(evaluateTranscript({
      attemptId: STRUCTURED_EXPRESSION_ATTEMPT_ID,
      transcript: createReviewedTranscriptFixture(),
      rubric: structuredExpressionRubricFixture,
      provider: new MockEvaluationProvider({
        failWith: { message: "模拟评分服务不可用", retryable: true },
      }),
    })).rejects.toMatchObject({
      stage: "evaluation",
      retryable: true,
    });
  });

  it("只允许用户校对后的 Transcript 进入评分", async () => {
    await expect(evaluateTranscript({
      attemptId: STRUCTURED_EXPRESSION_ATTEMPT_ID,
      transcript: createReviewedTranscriptFixture({ status: "provider-draft", revision: 1 }),
      rubric: structuredExpressionRubricFixture,
      provider: new MockEvaluationProvider(),
    })).rejects.toBeInstanceOf(EvaluationInputError);
  });
});
