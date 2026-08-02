import { describe, expect, it } from "vitest";
import { openDatabase } from "../db/database.js";
import { AttemptRepository } from "../db/repositories.js";
import { AnalysisPipeline } from "./analysis-pipeline.js";
import { getStructuredExpressionRubric } from "./structured-expression-rubric.js";

describe("文字输入闭环", () => {
  it("从 text-entry 创建用户确认转写且不创建音频", () => {
    const database = openDatabase(":memory:");
    const attempts = new AttemptRepository(database);
    const attempt = attempts.create({
      id: "attempt-text",
      ownerId: "user-1",
      exerciseId: "T001",
      exerciseVersionId: "T001@research",
      frameworkId: "PREP",
      inputMode: "text",
      locale: "zh-CN",
      clientTimeZone: "Asia/Shanghai",
      now: "2026-08-02T00:00:00.000Z",
    });
    attempts.transition({ id: attempt.id, ownerId: attempt.ownerId, expectedStatus: "created", expectedStatusVersion: attempt.statusVersion, nextStatus: "text-entry", now: "2026-08-02T00:00:01.000Z" });
    const pipeline = new AnalysisPipeline(database, { read: async () => Buffer.alloc(0), put: async () => undefined, delete: async () => undefined });
    const transcript = pipeline.submitTextAnswer("user-1", attempt.id, "我认为应先说明判断，再给出理由和具体例子。");
    expect(transcript.inputMode).toBe("text");
    expect(transcript.status).toBe("user-reviewed");
    expect(transcript.provider.providerId).toBe("user-text");
    expect(attempts.requireOwned(attempt.id, "user-1").audio).toBeNull();
    expect(attempts.requireOwned(attempt.id, "user-1").status).toBe("transcript-review");
    database.close();
  });

  it("文字模式评分规则明确排除音频指标", () => {
    const rubric = getStructuredExpressionRubric("T001", "text");
    const delivery = rubric.dimensions.find((item) => item.id === "delivery");
    expect(delivery?.label).toContain("不可评估");
    expect(delivery?.successCriteria.join(" ")).toContain("不得评价语速");
    expect(delivery?.successCriteria.join(" ")).toContain("不得把缺少音频指标视为扣分项");
  });
});
