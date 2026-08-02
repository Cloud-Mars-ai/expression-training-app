import { Keyboard, Mic2, Save, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FocusStageStepper } from "../components/training/FocusStageStepper";
import { remoteAttemptSession } from "../data/remoteAttemptSession";
import { textDrafts } from "../data/textDrafts";
import { getStructuredExercise } from "../features/structured-expression/content";
import type { TrainingAttempt } from "../features/structured-expression/model";
import { patchAttempt } from "../features/structured-expression/storage";
import { cancelRemoteTraining, startRemoteTrainingAttempt } from "../features/structured-expression/workflow";
import { submitAttemptText } from "../services/attemptApi";

export function TextAnswerStage({ attempt }: { attempt: TrainingAttempt }) {
  const navigate = useNavigate();
  const exercise = getStructuredExercise(attempt.exerciseId);
  const restored = textDrafts.get(attempt.id);
  const isL1 = exercise.level === "L1";
  const [restoredAnswer = "", restoredSummary = ""] = (restored?.text ?? "").split("\n\n【30字缩句】");
  const [answer, setAnswer] = useState(restoredAnswer);
  const [summary, setSummary] = useState(restoredSummary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const length = Array.from(answer.trim()).length;
  const summaryLength = Array.from(summary.trim()).length;
  const isValid = length >= 10 && (!isL1 || (summaryLength >= 1 && summaryLength <= 30));
  const draftValue = isL1 ? `${answer}\n\n【30字缩句】${summary}` : answer;

  useEffect(() => {
    const timer = window.setTimeout(() => textDrafts.save(attempt.id, draftValue), 350);
    return () => window.clearTimeout(timer);
  }, [attempt.id, draftValue]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败，请重试。"); }
    finally { setBusy(false); }
  };
  const submit = () => run(async () => {
    if (!isValid) throw new Error(isL1 ? "请完成复述，并把缩句控制在 1–30 个字符。" : "请至少输入 10 个字符，并说明完整观点、理由或例子。");
    await submitAttemptText(attempt.id, isL1 ? `【复述】${answer.trim()}\n【30字缩句】${summary.trim()}` : answer.trim());
    textDrafts.remove(attempt.id);
    remoteAttemptSession.updateStatus(attempt.id, "transcript-review");
    patchAttempt(attempt.id, { stage: "processing" });
    navigate(`/attempt/${attempt.id}/transcript`, { replace: true });
  });
  const switchToVoice = () => run(async () => {
    if (length > 0 && !window.confirm("文字草稿会保留在本机。确定切换到语音输入吗？")) return;
    textDrafts.save(attempt.id, draftValue);
    await cancelRemoteTraining(attempt.id);
    const next = await startRemoteTrainingAttempt({
      exerciseId: attempt.exerciseId,
      frameworkId: attempt.frameworkId,
      inputMode: "voice",
      retryOfAttemptId: attempt.id,
      ...(attempt.focusIssue ? { focusInstruction: attempt.focusIssue } : {}),
    });
    navigate(`/focus/record?attemptId=${next.local.id}`, { replace: true });
  });
  const cancel = () => run(async () => {
    textDrafts.save(attempt.id, draftValue);
    await cancelRemoteTraining(attempt.id);
    patchAttempt(attempt.id, { stage: "cancelled" });
    navigate(`/exercise/${exercise.id}`);
  });

  return <div className="flex flex-1 flex-col"><FocusStageStepper current="record" /><div className="mt-5"><p className="micro-label text-primary-strong">TEXT RESPONSE · 文字作答</p><h2 className="mt-2 text-xl font-bold leading-8">{exercise.prompt}</h2></div><div aria-label="作答输入方式" className="input-mode-switch mt-4" role="group"><button aria-pressed="false" disabled={busy} onClick={() => void switchToVoice()} type="button"><Mic2 size={17} />语音输入</button><button aria-pressed="true" className="active" type="button"><Keyboard size={17} />文字输入</button></div><section className="mt-5 rounded-lg border border-line bg-surface p-4"><label className="block" htmlFor="text-answer"><span className="text-sm font-bold">{isL1 ? "REPEAT · 用自己的话复述" : "写下你的完整回答"}</span><span className="mt-1 block text-xs leading-5 text-ink-muted">建议按 {attempt.frameworkId} 组织。文字会自动保存在本机草稿中，不会请求麦克风权限。</span></label><textarea autoFocus className="mt-4 min-h-56 w-full resize-y rounded-md border border-line bg-canvas p-4 text-[15px] leading-7 text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" id="text-answer" maxLength={8000} onChange={(event) => setAnswer(event.target.value)} placeholder={isL1 ? "不看原文，复述主旨和关键事实……" : "先给出你的观点，再补充理由、例子和条件边界……"} value={answer} />{isL1 && <label className="mt-4 block" htmlFor="l1-summary"><span className="text-sm font-bold">SUMMARY · 一句话缩句</span><span className="mt-1 block text-xs text-ink-muted">不超过 30 个字符，只保留最核心的信息。</span><input className="mt-2 min-h-12 w-full rounded-md border border-line bg-canvas px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" id="l1-summary" maxLength={30} onChange={(event) => setSummary(event.target.value)} placeholder="用一句话概括" value={summary} /><span className={summaryLength > 30 || summaryLength === 0 ? "mt-2 block text-xs text-danger" : "mt-2 block text-xs text-ink-muted"}>{summaryLength} / 30 字符</span></label>}<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="inline-flex items-center gap-1 text-success"><Save size={14} />{restored?.text ? "已恢复本机草稿，正在自动保存" : "草稿自动保存"}</span><span className={length < 10 ? "text-danger" : "text-ink-muted"}>{length} / 8000 字符 · 最少 10 字符</span></div></section>{error && <div className="mt-4 rounded-md bg-danger-soft p-3 text-sm font-semibold text-danger" role="alert">{error}</div>}{confirmSubmit ? <div className="cancel-confirm mt-4"><div><strong>确认提交这版文字？</strong><p>提交后将作为用户确认后的转写；下一页仍可最后校对，再发送至 DeepSeek。</p></div><div className="flex gap-2"><button className="secondary-button" disabled={busy} onClick={() => setConfirmSubmit(false)} type="button">继续修改</button><button className="primary-button" disabled={busy || !isValid} onClick={() => void submit()} type="button"><Send size={16} />{busy ? "提交中…" : "确认提交"}</button></div></div> : <button className="primary-button mt-5 w-full" disabled={busy || !isValid} onClick={() => setConfirmSubmit(true)} type="button"><Send size={17} />提交文字回答</button>}<button className="mx-auto mt-3 inline-flex min-h-11 items-center gap-2 px-3 text-sm font-semibold text-ink-muted hover:text-ink" disabled={busy} onClick={() => void cancel()} type="button"><X size={16} />保存草稿并退出</button></div>;
}
