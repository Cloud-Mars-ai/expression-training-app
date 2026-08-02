import type { Attempt, DemoDataSnapshot, DemoFilters, Evaluation, Exercise, ExerciseVersion, SkillProgress, UserProfile } from "../domain/models";
import { getStructuredExercise, researchTopics } from "../features/structured-expression/content";

const STORAGE_KEY = "expression-training:demo-data-v1";
const LEGACY_KEYS = ["expression-training:l2-attempts-v1", "expression-training:l2-results-v1"];
const CHANGE_EVENT = "expression-training:data-changed";

type PersistedDemoState = { schemaVersion: 2; savedAt: string; data: DemoDataSnapshot };
let memorySnapshot: DemoDataSnapshot | null = null;

function now() { return new Date().toISOString(); }
function buildContent(createdAt: string) {
  const exercises: Exercise[] = researchTopics.map((topic) => {
    const structured = getStructuredExercise(topic.topic_id);
    return { id: structured.id, currentVersionId: `${structured.id}@${structured.version}`, level: structured.level, capability: structured.level === "L1" ? "retelling" : structured.level === "L2" ? "structure" : structured.level === "L3" ? "scenario" : "impromptu", title: structured.title, scene: topic.category, targetSkillIds: [topic.core_skill, topic.recommended_format].filter(Boolean), status: "available" };
  });
  const exerciseVersions: ExerciseVersion[] = researchTopics.map((topic) => {
    const structured = getStructuredExercise(topic.topic_id);
    return { id: `${structured.id}@${structured.version}`, exerciseId: structured.id, version: structured.version, prompt: structured.prompt, preparationSeconds: structured.preparationSeconds, speakingSeconds: structured.speakingSeconds, successCriteria: structured.successCriteria, supportedFrameworks: structured.frameworks.map((item) => item.id), publishedAt: createdAt };
  });
  return { exercises, exerciseVersions };
}
function buildSeedData(): DemoDataSnapshot {
  const createdAt = now();
  const content = buildContent(createdAt);
  const profile: UserProfile = { id: "demo-user", displayName: "言序体验者", roleStage: "new-hire", currentGoal: "清楚说明项目贡献", privacyPreferences: { saveSimulatedRecordings: false, retainTranscripts: true, allowModelImprovement: false }, createdAt, updatedAt: createdAt };
  const skills: SkillProgress[] = [
    { skillId: "task-fulfillment", label: "任务完成度", mastery: 0.58, uncertainty: 0.32, observationCount: 0 },
    { skillId: "structure", label: "结构", mastery: 0.52, uncertainty: 0.34, observationCount: 0 },
    { skillId: "relevance", label: "相关性", mastery: 0.61, uncertainty: 0.30, observationCount: 0 },
    { skillId: "evidence", label: "证据", mastery: 0.44, uncertainty: 0.38, observationCount: 0 },
    { skillId: "concision", label: "简洁度", mastery: 0.57, uncertainty: 0.32, observationCount: 0 },
    { skillId: "delivery", label: "表达流畅度", mastery: 0.55, uncertainty: 0.34, observationCount: 0 },
  ];
  return { userProfile: profile, ...content, attempts: {}, evaluations: {}, skillProgress: skills, reviewItems: [], recentPractice: [], completionStatus: Object.fromEntries(content.exercises.map((exercise) => [exercise.id, { exerciseId: exercise.id, status: "not-started" as const }])), filters: { scene: "all" } };
}

function migrateData(data: DemoDataSnapshot): DemoDataSnapshot {
  const content = buildContent(now());
  const attempts = Object.fromEntries(Object.entries(data.attempts ?? {}).map(([id, attempt]) => [id, { ...attempt, schemaVersion: 2 as const, inputMode: attempt.inputMode ?? "voice" as const }]));
  const completionStatus = Object.fromEntries(content.exercises.map((exercise) => [exercise.id, data.completionStatus?.[exercise.id] ?? { exerciseId: exercise.id, status: "not-started" as const }]));
  return { ...data, ...content, attempts, completionStatus };
}

function write(data: DemoDataSnapshot) {
  const snapshot = { ...data };
  memorySnapshot = snapshot;
  const payload: PersistedDemoState = { schemaVersion: 2, savedAt: now(), data: snapshot };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return snapshot;
}
function read(): DemoDataSnapshot {
  if (memorySnapshot) return memorySnapshot;
  try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return write(buildSeedData()); const parsed = JSON.parse(raw) as { schemaVersion?: number; data?: DemoDataSnapshot }; if (!parsed.data || ![1, 2].includes(parsed.schemaVersion ?? 0)) throw new Error("Unsupported demo schema"); return write(migrateData(parsed.data)); } catch { return write(buildSeedData()); }
}
function createId(prefix: string) { return `${prefix}-${typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Date.now()}`; }

export const demoRepository = {
  getSnapshot: () => read(),
  subscribe(listener: () => void) { const onStorage = () => { memorySnapshot = null; listener(); }; window.addEventListener(CHANGE_EVENT, listener); window.addEventListener("storage", onStorage); return () => { window.removeEventListener(CHANGE_EVENT, listener); window.removeEventListener("storage", onStorage); }; },
  getAttempt(id: string | null) { return id ? read().attempts[id] ?? null : null; },
  saveAttempt(attempt: Attempt) { const data = read(); const next = { ...attempt, updatedAt: now() }; data.attempts[next.id] = next; data.completionStatus[next.exerciseId] = { exerciseId: next.exerciseId, status: next.stage === "result" ? "completed" : "in-progress", completedAt: next.stage === "result" ? next.updatedAt : undefined }; write(data); return next; },
  getEvaluation(attemptId: string | undefined) { return attemptId ? read().evaluations[attemptId] ?? null : null; },
  saveEvaluation(evaluation: Evaluation) {
    const data = read();
    const storedEvaluation = evaluation.status === "scorable" && !data.userProfile.privacyPreferences.retainTranscripts ? { ...evaluation, transcript: "" } : evaluation;
    data.evaluations[evaluation.attemptId] = storedEvaluation;
    if (evaluation.status === "scorable") {
      const attempt = data.attempts[evaluation.attemptId];
      if (attempt) {
        data.completionStatus[attempt.exerciseId] = { exerciseId: attempt.exerciseId, status: "completed", completedAt: evaluation.generatedAt };
        data.recentPractice = [{ attemptId: attempt.id, exerciseId: attempt.exerciseId, title: getStructuredExercise(attempt.exerciseId).title, completedAt: evaluation.generatedAt, score: evaluation.overall.score, isRetry: Boolean(attempt.retryOf) }, ...data.recentPractice.filter((item) => item.attemptId !== attempt.id)].slice(0, 6);
        data.skillProgress = data.skillProgress.map((skill) => { const dimension = evaluation.dimensions.find((item) => item.id === skill.skillId); if (!dimension) return skill; return { ...skill, mastery: dimension.score / 100, uncertainty: Math.max(0.12, skill.uncertainty - 0.08), observationCount: skill.observationCount + 1, latestScore: dimension.score, lastPracticedAt: evaluation.generatedAt }; });
        const dueAt = new Date(Date.now() + evaluation.review.afterDays * 86400000).toISOString();
        data.reviewItems = [{ id: createId("review"), exerciseId: attempt.exerciseId, sourceAttemptId: attempt.id, skillId: evaluation.review.skill, dueAt, status: "pending" }, ...data.reviewItems.filter((item) => item.sourceAttemptId !== attempt.id)];
      }
    }
    write(data);
  },
  removeAttempt(attemptId: string) {
    const data = read();
    const attempt = data.attempts[attemptId];
    delete data.attempts[attemptId];
    delete data.evaluations[attemptId];
    data.recentPractice = data.recentPractice.filter((item) => item.attemptId !== attemptId);
    data.reviewItems = data.reviewItems.filter((item) => item.sourceAttemptId !== attemptId);
    if (attempt && data.recentPractice.every((item) => item.exerciseId !== attempt.exerciseId)) {
      data.completionStatus[attempt.exerciseId] = { exerciseId: attempt.exerciseId, status: "not-started" };
    }
    if (data.recentPractice.length === 0) data.skillProgress = buildSeedData().skillProgress;
    write(data);
  },
  getFilters: () => read().filters,
  saveFilters(filters: DemoFilters) { const data = read(); data.filters = filters; write(data); },
  updatePrivacyPreferences(preferences: UserProfile["privacyPreferences"]) { const data = read(); data.userProfile = { ...data.userProfile, privacyPreferences: preferences, updatedAt: now() }; write(data); return data.userProfile; },
  reset() { memorySnapshot = null; localStorage.removeItem(STORAGE_KEY); LEGACY_KEYS.forEach((key) => localStorage.removeItem(key)); const seed = buildSeedData(); write(seed); return seed; },
};
