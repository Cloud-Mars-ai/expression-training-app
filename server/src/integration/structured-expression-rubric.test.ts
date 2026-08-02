import { describe, expect, it } from "vitest";
import { getStructuredExpressionRubric, STRUCTURED_EXPRESSION_RUBRIC } from "./structured-expression-rubric.js";

describe("research topic rubric", () => {
  it("uses the selected research topic instead of the legacy project prompt", () => {
    const rubric = getStructuredExpressionRubric("LIFE01");
    expect(rubric.exerciseId).toBe("LIFE01");
    expect(rubric.exercisePrompt).toContain("朋友迟到");
    expect(rubric.exercisePrompt).not.toContain("项目贡献");
    expect(rubric.dimensions).toHaveLength(6);
    expect(rubric.dimensions.find((item) => item.id === "evidence")?.successCriteria.join(" ")).toContain("事实");
  });

  it("keeps the legacy rubric for existing demo attempts", () => {
    expect(getStructuredExpressionRubric("l2-project-contribution")).toBe(STRUCTURED_EXPRESSION_RUBRIC);
  });
});
