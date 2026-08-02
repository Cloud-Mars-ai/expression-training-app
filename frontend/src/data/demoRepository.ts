import type { Attempt, DemoDataSnapshot, DemoFilters, Evaluation, Exercise, ExerciseVersion, SkillProgress, UserProfile } from "../domain/models";
import { l2ProjectExercise } from "../features/structured-expression/content";

const STORAGE_KEY = "expression-training:demo-data-v1";
const LEGACY_KEYS = ["expression-training:l2-attempts-v1", "expression-training:l2-results-v1"];
const CHANGE_EVENT = "expression-training:data-changed";

type PersistedDemoStateV1 = { schemaVersion: 1; savedAt: string; data: DemoDataSnapshot };
let memorySnapshot: DemoDataSnapshot | null = null;

function now() { return new Date().toISOString(); }
function buildSeedData(): DemoDataSnapshot {
  const createdAt = now();
  const exerciseVersionId = `${l2ProjectExercise.id}@${l2ProjectExercise.version}`;
  const exercise: Exercise = { id: l2ProjectExercise.id, currentVersionId: exerciseVersionId, level: "L2", capability: "structure", title: l2ProjectExercise.title, scene: l2ProjectExercise.scene, targetSkillIds: ["structured-project-answer", "specific-contribution-evidence"], status: "available" };
  const version: ExerciseVersion = { id: exerciseVersionId, exerciseId: exercise.id, version: l2ProjectExercise.version, prompt: l2ProjectExercise.prompt, preparationSeconds: l2ProjectExercise.preparationSeconds, speakingSeconds: l2ProjectExercise.speakingSeconds, successCriteria: l2ProjectExercise.successCriteria, supportedFrameworks: ["STAR", "PREP"], publishedAt: createdAt };
  const profile: UserProfile = { id: "demo-user", displayName: "言序体验者", roleStage: "new-hire", currentGoal: "清楚说明项目贡献", privacyPreferences: { saveSimulatedRecordings: false, retainTranscripts: true, allowModelImprovement: false }, createdAt, updatedAt: createdAt };
  const skills: SkillProgress[] = [
    { skillId: "task-fulfillment", label: "任务完成度", mastery: 0.58, uncertainty: 0.32, observationCount: 0 },
    { skillId: "structure", label: "结构", mastery: 0.52, uncertainty: 0.34, observationCount: 0 },
    { skillId: "relevance", label: "相关性", mastery: 0.61, uncertainty: 0.30, observationCount: 0 },
    { skillId: "evidence", label: "证据", mastery: 0.44, uncertainty: 0.38, observationCount: 0 },
    { skillId: "concision", label: "简洁度", mastery: 0.57, uncertainty: 0.32, observationCount: 0 },
    { skillId: "delivery", label: "表达流畅度", mastery: 0.55, uncertainty: 0.34, observationCount: 0 },
  ];
  return { userProfile: profile, exercises: [exercise], exerciseVersions: [version], attempts: {}, evaluations: {}, skillProgress: skills, reviewItems: [], recentPractice: [], completionStatus: { [exercise.id]: { exerciseId: exercise.id, status: "not-started" } }, filters: { scene: "all" } };
}

function write(data: DemoDataSnapshot) {
  const snapshot = { ...data };
  memorySnapshot = snapshot;
  const payload: PersistedDemoStateV1 = { schemaVersion: 1, savedAt: now(), data: snapshot };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return snapshot;
}
function read(): DemoDataSnapshot {
  if (memorySnapshot) return memorySnapshot;
  try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return write(buildSeedData()); const parsed = JSON.parse(raw) as PersistedDemoStateV1; if (parsed.schemaVersion !== 1 || !parsed.data) throw new Error("Unsupported demo schema"); memorySnapshot = parsed.data; return parsed.data; } catch { return write(buildSeedData()); }
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
        data.recentPractice = [{ attemptId: attempt.id, exerciseId: attempt.exerciseId, title: l2ProjectExercise.title, completedAt: evaluation.generatedAt, score: evaluation.overall.score, isRetry: Boolean(attempt.retryOf) }, ...data.recentPractice.filter((item) => item.attemptId !== attempt.id)].slice(0, 6);
        data.skillProgress = data.skillProgress.map((skill) => { const dimension = evaluation.dimensions.find((item) => item.id === skill.skillId); if (!dimension) return skill; return { ...skill, mastery: dimension.score / 100, uncertainty: Math.max(0.12, skill.uncertainty - 0.08), observationCount: skill.observationCount + 1, latestScore: dimension.score, lastPracticedAt: evaluation.generatedAt }; });
        const dueAt = new Date(Date.now() + evaluation.review.afterDays * 86400000).toISOString();
        data.reviewItems = [{ id: createId("review"), exerciseId: attempt.exerciseId, sourceAttemptId: attempt.id, skillId: evaluation.review.skill, dueAt, status: "pending" }, ...data.reviewItems.filter((item) => item.sourceAttemptId !== attempt.id)];
      }
    }
    write(data);
  },
  getFilters: () => read().filters,
  saveFilters(filters: DemoFilters) { const data = read(); data.filters = filters; write(data); },
  updatePrivacyPreferences(preferences: UserProfile["privacyPreferences"]) { const data = read(); data.userProfile = { ...data.userProfile, privacyPreferences: preferences, updatedAt: now() }; write(data); return data.userProfile; },
  reset() { memorySnapshot = null; localStorage.removeItem(STORAGE_KEY); LEGACY_KEYS.forEach((key) => localStorage.removeItem(key)); const seed = buildSeedData(); write(seed); return seed; },
};
