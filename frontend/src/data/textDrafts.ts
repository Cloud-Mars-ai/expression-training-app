const STORAGE_KEY = "expression-training:text-drafts-v1";

type TextDraft = { text: string; savedAt: string };
type DraftState = { schemaVersion: 1; drafts: Record<string, TextDraft> };

function read(): DraftState {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as DraftState | null;
    if (value?.schemaVersion === 1 && value.drafts) return value;
  } catch { /* malformed drafts are isolated from training history */ }
  return { schemaVersion: 1, drafts: {} };
}

export const textDrafts = {
  get(attemptId: string): TextDraft | null { return read().drafts[attemptId] ?? null; },
  save(attemptId: string, text: string): TextDraft {
    const state = read();
    const draft = { text, savedAt: new Date().toISOString() };
    state.drafts[attemptId] = draft;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return draft;
  },
  remove(attemptId: string): void {
    const state = read();
    delete state.drafts[attemptId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  },
};
