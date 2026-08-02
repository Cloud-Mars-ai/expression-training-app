import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(process.env.RESEARCH_DATA_SOURCE ?? resolve(projectRoot, "..", "07-全网蒸馏研究"));
const contentRoot = resolve(projectRoot, "contracts", "src", "content");

const topicFields = [
  "topic_id", "title", "category", "scene", "target_user", "level", "prep_seconds", "answer_seconds",
  "core_skill", "background", "prompt", "followups", "support_direction", "challenge_direction",
  "conditional_view", "personal_experience", "public_case", "keyword_definition", "fact_opinion_boundary",
  "common_fallacy", "low_quality_signal", "qualified_standard", "excellent_standard", "scoring_dimensions",
  "ai_feedback_strategy", "recommended_format", "source_ids", "timeliness", "safety_risk", "needs_update",
  "experience_answerable",
];
const methodFields = [
  "method_id", "method_name", "method_type", "evidence_basis", "target_level", "target_skill", "user_action",
  "coach_action", "duration", "difficulty_progression", "success_signal", "failure_handling", "oral_transfer",
  "privacy_note", "source_ids",
];
const sourceFields = [
  "source_id", "platform", "title", "author_or_publisher", "published_date", "collected_date", "url",
  "source_type", "target_user", "content_category", "discussion_theme", "core_summary", "evidence_excerpt",
  "trainable_skill", "convertible_format", "reliability_score", "relevance_score", "novelty_score",
  "actionability_score", "commercial_promotion", "stance_bias", "repost", "copyright_notes",
  "verification_status", "access_note", "score_basis",
];
const expectedCategories = {
  "生活化讨论": 20,
  "经典辩论": 12,
  "社会讨论": 16,
  "校园与个人成长": 12,
  "求职与初入职场": 12,
  "写作方法迁移": 8,
};

const topics = await readJson("topics.json");
const methods = await readJson("methods.json");
const sources = (await readJson("sources.json")).map((source) => {
  const normalized = Object.fromEntries(sourceFields.map((field) => [field, source[field] ?? ""]));
  const numericId = Number.parseInt(String(normalized.source_id).slice(1), 10);
  if (!normalized.collected_date && numericId >= 83 && numericId <= 97) normalized.collected_date = "2026-08-02";
  return normalized;
});
validateCollection(topics, 80, "题目", "topic_id", topicFields, true);
validateCollection(methods, 28, "方法", "method_id", methodFields, true);
validateCollection(sources, 97, "来源", "source_id", sourceFields, false);

const categoryCounts = Object.fromEntries(Object.keys(expectedCategories).map((category) => [
  category,
  topics.filter((topic) => topic.category === category).length,
]));
for (const [category, expected] of Object.entries(expectedCategories)) {
  if (categoryCounts[category] !== expected) throw new Error(`${category} 应为 ${expected} 题，实际 ${categoryCounts[category]} 题。`);
}
for (const topic of topics) {
  if (!Number.isInteger(topic.prep_seconds) || topic.prep_seconds < 10 || topic.prep_seconds > 600) throw new Error(`${topic.topic_id} 的 prep_seconds 无效。`);
  if (!Number.isInteger(topic.answer_seconds) || topic.answer_seconds < 10 || topic.answer_seconds > 600) throw new Error(`${topic.topic_id} 的 answer_seconds 无效。`);
}
const sourceIds = new Set(sources.map((source) => source.source_id));
for (const item of [...topics, ...methods]) {
  for (const sourceId of splitIds(item.source_ids)) {
    if (!sourceIds.has(sourceId)) throw new Error(`${item.topic_id ?? item.method_id} 引用了不存在的来源 ${sourceId}。`);
  }
}

const meta = {
  schemaVersion: 2,
  sourceFile: "topics.json",
  topicCount: topics.length,
  methodCount: methods.length,
  sourceCount: sources.length,
  categoryCounts,
  generatedAt: new Date().toISOString(),
  topicsSha256: sha(topics),
  methodsSha256: sha(methods),
  sourcesSha256: sha(sources),
};
await writeGenerated("research-topics.generated.ts", "RESEARCH_TOPIC_SNAPSHOT_META", meta, "RESEARCH_TOPICS", topics, "ResearchTopicSnapshotMeta", "ResearchTopic");
await writeGenerated("research-methods.generated.ts", null, null, "RESEARCH_METHODS", methods, null, "ResearchMethod");
await writeGenerated("research-sources.generated.ts", null, null, "RESEARCH_SOURCES", sources, null, "ResearchSource");
process.stdout.write(`已同步 ${topics.length} 题、${methods.length} 个方法、${sources.length} 个来源。\n`);

async function readJson(name) {
  const parsed = JSON.parse(await readFile(resolve(sourceRoot, name), "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${name} 顶层必须是数组。`);
  return parsed;
}
function validateCollection(items, expected, label, idField, fields, requireAllValues) {
  if (items.length !== expected) throw new Error(`${label}预期 ${expected} 条，实际 ${items.length} 条。`);
  const ids = new Set();
  items.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`第 ${index + 1} 条${label}不是对象。`);
    for (const field of fields) {
      if (!(field in item)) throw new Error(`${item[idField] ?? index + 1} 缺少字段 ${field}。`);
      if (requireAllValues && (item[field] === "" || item[field] === null)) throw new Error(`${item[idField] ?? index + 1} 的字段 ${field} 为空。`);
    }
    if (!item[idField] || !(item.title || item.method_name)) throw new Error(`第 ${index + 1} 条${label}缺少 ID 或标题。`);
    if (ids.has(item[idField])) throw new Error(`${idField} 重复：${item[idField]}`);
    ids.add(item[idField]);
  });
}
function splitIds(value) { return String(value).split(/[;；,，]/u).map((id) => id.trim()).filter(Boolean); }
function sha(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function writeGenerated(fileName, metaName, metaValue, dataName, dataValue, metaType, dataType) {
  const imports = [dataType, metaType].filter(Boolean).join(", ");
  const metaBlock = metaName ? `export const ${metaName} = ${JSON.stringify(metaValue, null, 2)} as const satisfies ${metaType};\n\n` : "";
  const output = `// Generated by scripts/sync-research-topics.mjs. Do not edit manually.\nimport type { ${imports} } from "./research-topic.js";\n\n${metaBlock}export const ${dataName} = ${JSON.stringify(dataValue, null, 2)} as const satisfies readonly ${dataType}[];\n`;
  await writeFile(resolve(contentRoot, fileName), output, "utf8");
}
