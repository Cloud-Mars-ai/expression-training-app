import type { EvidenceReference, EvaluationDimension } from "@expression-training/contracts";
import { ArrowRight, CheckCircle2, ChevronDown, Clock3, Quote, RotateCcw, ShieldCheck, Sparkles, Target, Trash2, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FixedActionBar } from "../components/ui/FixedActionBar";
import { ProgressRing } from "../components/ui/ProgressRing";
import { demoRepository } from "../data/demoRepository";
import { remoteAttemptSession } from "../data/remoteAttemptSession";
import { adaptRemoteEvaluation } from "../features/structured-expression/evaluationAdapter";
import { startRemoteTrainingAttempt } from "../features/structured-expression/workflow";
import { useAttemptPolling } from "../hooks/useAttemptPolling";
import { deleteRemoteAttempt } from "../services/attemptApi";

const DIMENSION_LABELS: Record<string, string> = { "task-fulfillment": "任务完成度", structure: "结构", relevance: "相关性", evidence: "证据", concision: "简洁度", delivery: "表达流畅度" };

export function TrainingResultPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const { detail, error, loading, refresh } = useAttemptPolling(attemptId);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const evaluation = detail?.evaluation;
  const transcript = detail?.transcript;
  const attempt = detail?.attempt;

  useEffect(() => {
    if (!attempt || !transcript || evaluation?.status !== "scorable") return;
    if (!demoRepository.getEvaluation(attempt.id)) demoRepository.saveEvaluation(adaptRemoteEvaluation(evaluation, transcript));
  }, [attempt, evaluation, transcript]);

  if (loading) return <ResultLoading />;
  if (error || !attempt || !evaluation) return <MissingResult message={error?.message} onRetry={refresh} />;
  const session = remoteAttemptSession.get(attempt.id);
  const frameworkId = attempt.frameworkId ?? session?.frameworkId ?? "STAR";
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setActionError(null);
    try { await operation(); } catch (cause) { setActionError(cause instanceof Error ? cause.message : "操作失败，请重试。"); setBusy(false); }
  };
  const remove = () => run(async () => {
    await deleteRemoteAttempt(attempt.id);
    remoteAttemptSession.remove(attempt.id);
    demoRepository.removeAttempt(attempt.id);
    navigate("/home", { replace: true });
  });
  const retry = () => run(async () => {
    if (evaluation.status !== "scorable") {
      const next = await startRemoteTrainingAttempt({ exerciseId: attempt.exerciseId, frameworkId, inputMode: attempt.inputMode, retryOfAttemptId: attempt.id, focusInstruction: attempt.inputMode === "voice" ? "重新录音，确保内容完整且可辨识。" : "补充完整观点、理由或例子。" });
      navigate(`/focus/prepare?attemptId=${next.local.id}`);
      return;
    }
    const next = await startRemoteTrainingAttempt({
      exerciseId: attempt.exerciseId,
      frameworkId,
      inputMode: attempt.inputMode,
      retryOfAttemptId: attempt.id,
      focusIssueId: evaluation.retryPlan.focusIssueId,
      focusInstruction: evaluation.retryPlan.instruction,
    });
    navigate(`/focus/prepare?attemptId=${next.local.id}`);
  });

  if (evaluation.status === "unscorable") {
    return <UnscorableResult message={evaluation.userMessage} busy={busy} actionError={actionError} onDelete={() => setConfirmDelete(true)} onRetry={() => void retry()} />;
  }
  if (!transcript) return <MissingResult message="评分存在，但转写证据缺失。" onRetry={refresh} />;
  const isRetry = Boolean(attempt.retryOfAttemptId);
  return <div className="mx-auto w-full max-w-[720px] pb-28">
    <section className="result-summary"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="level-badge">L2 · {frameworkId}</span><span className="status-label"><CheckCircle2 size={14} />本次可评分</span></div><h2 className="mt-4 text-2xl font-bold">{evaluation.overall.outcome}</h2><p className="mt-3 text-sm leading-6 text-ink-soft">评分仅依据当前任务和你确认后的转写证据生成。</p><div className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-primary-soft px-3 text-sm font-semibold text-primary-strong"><ShieldCheck size={17} />AI 评估置信度 {Math.round(evaluation.confidence * 100)}%</div></div><ProgressRing label="本次得分" size={108} value={evaluation.overall.score} /></section>
    <section className="result-section"><div className="result-section-title text-success"><CheckCircle2 size={20} /><div><p className="micro-label">STRENGTH · 有证据的优点</p><h3>{evaluation.strength.title}</h3></div></div><p className="mt-4 text-sm leading-6 text-ink-soft">{evaluation.strength.explanation}</p><EvidenceQuote evidence={evaluation.strength.evidence[0]} /></section>
    <section className="result-section result-priority"><div className="result-section-title text-warning"><Target size={20} /><div><p className="micro-label">PRIORITY · 优先改进</p><h3>{evaluation.priorityIssue.title}</h3></div></div><p className="mt-4 text-sm leading-6 text-ink">{evaluation.priorityIssue.whyNow}</p><div className="mt-4 flex items-start gap-2 rounded-md bg-warning-soft p-3 text-sm leading-6 text-warning"><ArrowRight className="mt-1 shrink-0" size={16} /><span>{evaluation.priorityIssue.instruction}</span></div></section>
    <section className="result-section"><div className="result-section-title"><Quote className="text-primary-strong" size={20} /><div><p className="micro-label text-ink-muted">YOUR EVIDENCE · 原回答证据</p><h3>问题出现在这里</h3></div></div><EvidenceQuote evidence={evaluation.priorityIssue.evidence[0]} /><details className="transcript-details mt-4"><summary>查看完整校对转写 <ChevronDown size={16} /></summary><p>{transcript.fullText}</p></details></section>
    <section className="result-section"><div className="result-section-title"><Sparkles className="text-violet" size={20} /><div><p className="micro-label text-ink-muted">IMPROVED EXAMPLE · 改进示例</p><h3>保留原意，补全行动和结果</h3></div></div><p className="mt-4 text-[15px] leading-7 text-ink">{evaluation.improvedExample.text}</p><p className="mt-3 text-xs leading-5 text-ink-muted">示例用于展示信息结构，不要求逐字背诵。</p></section>
    <section className="py-7"><div className="flex items-center gap-2"><Clock3 className="text-primary-strong" size={20} /><div><p className="micro-label text-ink-muted">{isRetry ? "TRANSFER · 重练完成" : "RETRY · 立即重练"}</p><h3 className="mt-1 text-lg font-bold">{isRetry ? "本次改进已经写入成长记录" : evaluation.retryPlan.instruction}</h3></div></div><p className="mt-3 text-sm leading-6 text-ink-soft">{isRetry ? "前往成长页查看维度变化、最近练习和待复习项目。" : `准备 ${evaluation.retryPlan.preparationSeconds} 秒，仍使用 ${frameworkId}，表达上限 ${evaluation.retryPlan.speakingSeconds} 秒。`}</p></section>
    {attempt.inputMode === "text" && <section className="result-section"><div className="result-section-title"><ShieldCheck className="text-primary-strong" size={20} /><div><p className="micro-label text-ink-muted">MODE LIMITATION · 模式限制</p><h3>语音表现：本模式不可评估</h3></div></div><p className="mt-3 text-sm leading-6 text-ink-soft">文字作答没有音频证据，因此不评价语速、停顿、口头禅、音量、发音或声音流畅度，也不会因此扣分。</p></section>}
    <section className="border-t border-line pt-7"><div><p className="micro-label text-ink-muted">DIMENSIONS · 维度评分</p><h3 className="mt-1 text-lg font-bold">展开查看评分证据</h3></div><div className="mt-4 divide-y divide-line border-y border-line">{evaluation.dimensions.map((dimension) => <DimensionDetail dimension={dimension} inputMode={attempt.inputMode} key={dimension.id} />)}</div></section>
    {actionError && <div className="mt-5 rounded-md bg-danger-soft p-3 text-sm font-semibold text-danger" role="alert">{actionError}</div>}
    {confirmDelete ? <div className="reset-confirm mt-6"><h3 className="font-bold">删除本次录音和分析数据？</h3><p className="mt-2 text-sm leading-6 text-ink-soft">本机服务中的音频、转写和评分会被删除，成长页的对应投影也会移除。</p><div className="mt-4 grid grid-cols-2 gap-3"><button className="secondary-button" onClick={() => setConfirmDelete(false)} type="button">保留</button><button className="primary-button bg-danger text-white" disabled={busy} onClick={() => void remove()} type="button"><Trash2 size={16} />确认删除</button></div></div> : <button className="mx-auto mt-6 flex min-h-11 items-center gap-2 px-3 text-sm font-semibold text-danger" onClick={() => setConfirmDelete(true)} type="button"><Trash2 size={16} />删除本次数据</button>}
    <FixedActionBar secondary={<button className="secondary-button" onClick={() => navigate("/home")} type="button">返回首页</button>} primary={isRetry ? <button className="primary-button" onClick={() => navigate("/growth")} type="button"><TrendingUp size={17} />查看成长</button> : <button aria-label="根据优先问题再次练习" className="primary-button" disabled={busy} onClick={() => void retry()} type="button"><RotateCcw size={17} />{busy ? "正在创建…" : "聚焦重练"}</button>} />
  </div>;
}

function EvidenceQuote({ evidence }: { evidence: EvidenceReference | undefined }) { if (!evidence) return <p className="mt-4 text-sm text-danger">证据片段缺失。</p>; return <div className="evidence-quote mt-4"><Quote aria-hidden="true" size={17} /><div><blockquote>“{evidence.quote}”</blockquote><p>{evidence.observation}</p><span className="mt-2 block text-[11px] text-ink-muted">{formatMs(evidence.startMs)}–{formatMs(evidence.endMs)} · 转写版本 {evidence.transcriptRevision}</span></div></div>; }
function DimensionDetail({ dimension, inputMode }: { dimension: EvaluationDimension; inputMode: "voice" | "text" }) { if (inputMode === "text" && dimension.id === "delivery") return <div className="flex min-h-[74px] items-center justify-between gap-3"><div><span className="font-bold">语音表现</span><p className="mt-1 text-xs text-ink-soft">本模式不可评估</p></div><span className="text-xs font-semibold text-ink-muted">N/A</span></div>; return <details className="dimension-detail"><summary><div className="min-w-0 flex-1"><span className="font-bold">{DIMENSION_LABELS[dimension.id] ?? dimension.id}</span><p>{dimension.summary}</p></div><strong>{dimension.score}</strong><ChevronDown size={17} /></summary><div className="dimension-body"><EvidenceQuote evidence={dimension.evidence[0]} />{dimension.nextBehavior && <p className="mt-3 text-sm leading-6 text-primary-strong">下一次：{dimension.nextBehavior}</p>}</div></details>; }
function ResultLoading() { return <div className="flex min-h-[60vh] flex-col items-center justify-center"><div className="analysis-spinner"><span /><span /><span /></div><h2 className="mt-5 text-xl font-bold">正在读取训练结果</h2></div>; }
function MissingResult({ message, onRetry }: { message?: string; onRetry: () => void }) { const navigate = useNavigate(); return <div className="state-panel"><h2 className="text-lg font-bold">结果还没有准备好</h2><p className="mt-2 text-sm leading-6 text-ink-soft">{message ?? "训练记录可能仍在处理，请重新读取。"}</p><div className="mt-5 flex gap-3"><button className="secondary-button" onClick={() => navigate("/training/structure")} type="button">返回题库</button><button className="primary-button" onClick={onRetry} type="button">重新读取</button></div></div>; }
function UnscorableResult({ message, busy, actionError, onDelete, onRetry }: { message: string; busy: boolean; actionError: string | null; onDelete: () => void; onRetry: () => void }) { const navigate = useNavigate(); return <div className="mx-auto flex min-h-[70vh] w-full max-w-[620px] flex-col justify-center"><div className="technical-icon"><ShieldCheck size={25} /></div><p className="micro-label mt-5 text-warning">UNSCORABLE · 证据不足</p><h2 className="mt-2 text-2xl font-bold">本次不显示分数</h2><p className="mt-3 text-sm leading-6 text-ink-soft">{message}</p><div className="mt-6 border-y border-line py-5"><p className="text-sm leading-6 text-ink-soft">这不是低分，也不会计入成长进度。你可以重新录音，让表达内容更完整、清晰。</p></div>{actionError && <p className="mt-4 text-sm font-semibold text-danger" role="alert">{actionError}</p>}<div className="mt-6 grid gap-3 sm:grid-cols-2"><button className="primary-button" disabled={busy} onClick={onRetry} type="button"><RotateCcw size={17} />重新录音</button><button className="secondary-button" onClick={() => navigate("/home")} type="button">返回首页</button></div><button className="mx-auto mt-4 flex min-h-11 items-center gap-2 px-3 text-sm font-semibold text-danger" onClick={onDelete} type="button"><Trash2 size={16} />删除本次数据</button></div>; }
function formatMs(value: number) { const seconds = Math.floor(value / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
