import { beforeEach, describe, expect, it } from "vitest";
import { RESEARCH_METHODS, RESEARCH_SOURCES, RESEARCH_TOPICS, RESEARCH_TOPIC_SNAPSHOT_META } from "@expression-training/contracts";
import { textDrafts } from "../../data/textDrafts";

describe("研究数据库快照", () => {
  it("保持题目分类配额与方法、来源数量", () => {
    expect(RESEARCH_TOPICS).toHaveLength(80);
    expect(RESEARCH_METHODS).toHaveLength(28);
    expect(RESEARCH_SOURCES).toHaveLength(97);
    expect(RESEARCH_TOPIC_SNAPSHOT_META.categoryCounts).toEqual({
      "生活化讨论": 20,
      "经典辩论": 12,
      "社会讨论": 16,
      "校园与个人成长": 12,
      "求职与初入职场": 12,
      "写作方法迁移": 8,
    });
  });
});

describe("文字草稿保护", () => {
  beforeEach(() => localStorage.clear());
  it("切换模式前可保存并恢复文字草稿", () => {
    textDrafts.save("attempt-1", "这是不会静默丢失的草稿");
    expect(textDrafts.get("attempt-1")?.text).toBe("这是不会静默丢失的草稿");
  });
});
