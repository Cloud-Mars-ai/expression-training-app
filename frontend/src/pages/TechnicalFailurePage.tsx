import { STRUCTURED_EXPRESSION_RUBRIC_VERSION } from "@expression-training/contracts";
import { AlertTriangle, Mic2, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { demoRepository } from "../data/demoRepository";
import { remoteAttemptSession } from "../data/remoteAttemptSession";
import { startRemoteTrainingAttempt } from "../features/structured-expression/workflow";
import { useAttemptPolling } from "../hooks/useAttemptPolling";
import { createIdempotencyKey, deleteRemoteAttempt, requestRemoteEvaluation } from "../services/attemptApi";

export function TechnicalFailurePage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const { detail, error, loading, refresh } = useAttemptPolling(attemptId);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const session = remoteAttemptSession.get(attemptId);
  const localAttempt = demoRepository.getAttempt(attemptId ?? null);
  const exerciseId = detail?.attempt.exerciseId ?? localAttempt?.exerciseId ?? "l2-project-contribution";
  const failure = detail?.attempt.failure;
  const canRetryEvaluation = failure?.stage === "evaluating" && detail?.transcript?.status === "user-reviewed";
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setActionError(null);
    try { await operation(); } catch (cause) { setActionError(cause instanceof Error ? cause.message : "操作失败，请重试。"); setBusy(false); }
  };
  const rerecord = () => run(async () => {
    const next = await startRemoteTrainingAttempt({
      exerciseId,
      frameworkId: detail?.attempt.frameworkId ?? session?.frameworkId ?? "STAR",
      inputMode: detail?.attempt.inputMode ?? session?.inputMode ?? "voice",
      ...(attemptId ? { retryOfAttemptId: attemptId } : {}),
      focusInstruction: "技术处理中断，请重新完成一次作答。",
    });
    navigate(`/focus/prepare?attemptId=${next.local.id}`);
  });
  const remove = () => run(async () => {
    if (!attemptId) return;
    await deleteRemoteAttempt(attemptId);
    remoteAttemptSession.remove(attemptId);
    demoRepository.removeAttempt(attemptId);
    navigate("/home", { replace: true });
  });
  const retryEvaluation = () => run(async () => {
    if (!attemptId || !detail?.transcript) return;
    const evaluating = await requestRemoteEvaluation(attemptId, {
      transcriptRevision: detail.transcript.revision,
      rubricVersion: STRUCTURED_EXPRESSION_RUBRIC_VERSION,
    }, createIdempotencyKey());
    remoteAttemptSession.updateStatus(attemptId, evaluating.status);
    navigate(`/focus/processing?attemptId=${attemptId}`, { replace: true });
  });
  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-sm text-ink-muted">正在读取技术状态…</div>;
  return <div className="mx-auto flex min-h-[70vh] w-full max-w-[620px] flex-col justify-center"><div className="technical-icon"><AlertTriangle size={25} /></div><p className="micro-label mt-5 text-danger">TECHNICAL ERROR · 技术失败</p><h2 className="mt-2 text-2xl font-bold">分析没有完成，本次不计分</h2><p className="mt-3 text-sm leading-6 text-ink-soft">{failure?.message ?? error?.message ?? "分析服务没有可靠完成处理。"}</p><div className="mt-6 border-y border-line py-5"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 shrink-0 text-ink-soft" size={19} /><div><h3 className="font-bold">为什么没有分数？</h3><p className="mt-1 text-sm leading-6 text-ink-soft">没有可靠完成分析时，我们不会把技术质量误当成表达能力，也不会更新成长进度。</p>{failure && <p className="mt-2 text-xs text-ink-muted">阶段：{failure.stage} · {canRetryEvaluation ? "可以直接重新分析本次回答" : failure.retryable ? "可通过新练习重试" : "建议删除后重录"}</p>}</div></div></div>{actionError && <p className="mt-4 text-sm font-semibold text-danger" role="alert">{actionError}</p>}<div className="mt-6 grid gap-3 sm:grid-cols-2">{canRetryEvaluation ? <button className="primary-button" disabled={busy} onClick={() => void retryEvaluation()} type="button"><RefreshCw size={17} />重新分析本次回答</button> : <button className="primary-button" disabled={busy} onClick={() => void rerecord()} type="button"><Mic2 size={17} />创建新录音</button>}<button className="secondary-button text-danger" disabled={busy || !attemptId} onClick={() => void remove()} type="button"><Trash2 size={17} />删除失败记录</button></div>{error && <button className="mx-auto mt-4 min-h-11 px-3 text-sm font-semibold text-primary-strong" onClick={refresh} type="button">重新读取状态</button>}<button className="mx-auto mt-2 min-h-11 px-3 text-sm font-semibold text-ink-soft hover:text-ink" onClick={() => navigate(`/exercise/${exerciseId}`)} type="button">返回任务详情</button></div>;
}
