import { AlertCircle, CheckCircle2, FileText, RefreshCw, Send } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { STRUCTURED_EXPRESSION_RUBRIC_VERSION, type Transcript } from "@expression-training/contracts";
import { remoteAttemptSession } from "../data/remoteAttemptSession";
import { useAttemptPolling } from "../hooks/useAttemptPolling";
import { requestRemoteEvaluation, reviewRemoteTranscript } from "../services/attemptApi";

export function TranscriptReviewPage() {
  const { attemptId } = useParams();
  const { detail, error, loading, refresh } = useAttemptPolling(attemptId);

  if (loading) return <ReviewLoading />;
  if (error || !attemptId || !detail?.transcript) return <ReviewError message={error?.message ?? "转写尚未生成。"} onRetry={refresh} />;
  return <TranscriptEditor attemptId={attemptId} key={`${detail.transcript.id}:${detail.transcript.revision}`} onRefresh={refresh} transcript={detail.transcript} />;
}

function TranscriptEditor({ attemptId, transcript, onRefresh }: { attemptId: string; transcript: Transcript; onRefresh: () => void }) {
  const navigate = useNavigate();
  const [segments, setSegments] = useState(() => transcript.segments.map((segment) => ({ segmentId: segment.id, text: segment.text })));
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const session = remoteAttemptSession.get(attemptId);
  const updateSegment = (segmentId: string, text: string) => setSegments((current) => current.map((item) => item.segmentId === segmentId ? { ...item, text } : item));
  const hasEmptySegment = segments.some((segment) => !segment.text.trim());
  const submit = async () => {
    if (!session || hasEmptySegment) return;
    setBusy(true); setSubmitError(null);
    try {
      const reviewed = await reviewRemoteTranscript(attemptId, transcript.revision, segments.map((segment) => ({ ...segment, text: segment.text.trim() })));
      const evaluating = await requestRemoteEvaluation(attemptId, {
        transcriptRevision: reviewed.revision,
        rubricVersion: STRUCTURED_EXPRESSION_RUBRIC_VERSION,
      }, session.evaluationKey);
      remoteAttemptSession.updateStatus(attemptId, evaluating.status);
      navigate(`/focus/processing?attemptId=${attemptId}`, { replace: true });
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "提交评分失败，请重试。");
      setBusy(false);
    }
  };

  return <div className="mx-auto w-full max-w-[720px] pb-28"><section className="border-b border-line pb-6"><div className="flex items-center gap-2 text-primary-strong"><FileText size={20} /><p className="micro-label">TRANSCRIPT REVIEW · {transcript.inputMode === "text" ? "文字确认" : "转写校对"}</p></div><h2 className="mt-3 text-2xl font-bold">先确认文字，再开始评分</h2><p className="mt-3 text-sm leading-6 text-ink-soft">{transcript.inputMode === "voice" ? "自动转写可能听错专有名词。请只修正文字，不需要润色表达；" : "这是你提交的文字回答；可以在发送前做最后校对。"}点击确认后，本页文字、当前题目和评分标准会发送到 DeepSeek API，评分证据会引用你确认后的版本。</p><div className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-primary-soft px-3 text-sm font-semibold text-primary-strong"><CheckCircle2 size={17} />{transcript.inputMode === "text" ? "文字输入已由用户确认" : `转写置信度 ${Math.round(transcript.confidence * 100)}%`}</div></section><section className="mt-6"><div className="flex items-center justify-between gap-3"><div><p className="micro-label text-ink-muted">SEGMENTS · 分段文本</p><h3 className="mt-1 text-lg font-bold">核对原回答</h3></div><span className="text-xs text-ink-muted">版本 {transcript.revision}</span></div><div className="mt-4 divide-y divide-line border-y border-line">{transcript.segments.map((segment, index) => <label className="block py-4" key={segment.id}><span className="flex items-center justify-between gap-3 text-xs font-semibold text-ink-muted"><span>片段 {index + 1}</span>{transcript.inputMode === "voice" && <span>{formatTimestamp(segment.startMs)}–{formatTimestamp(segment.endMs)}</span>}</span><textarea aria-label={`回答片段 ${index + 1}`} className="mt-2 min-h-24 w-full resize-y rounded-md border border-line bg-surface p-3 text-sm leading-6 text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" maxLength={2000} onChange={(event) => updateSegment(segment.id, event.target.value)} value={segments.find((item) => item.segmentId === segment.id)?.text ?? ""} /></label>)}</div></section>{hasEmptySegment && <p className="mt-4 text-sm font-semibold text-danger" role="alert">每个回答片段都需要保留文字。</p>}{submitError && <div className="mt-4 rounded-md bg-danger-soft p-3 text-sm font-semibold text-danger" role="alert">{submitError}</div>}<div className="fixed-action-bar"><div className="mx-auto flex w-full max-w-[720px] gap-3 px-4 sm:px-8"><button className="secondary-button" disabled={busy} onClick={onRefresh} type="button"><RefreshCw size={16} />刷新</button><button className="primary-button flex-1" disabled={busy || hasEmptySegment} onClick={() => void submit()} type="button"><Send size={17} />{busy ? "正在提交…" : "确认并发送至 DeepSeek"}</button></div></div></div>;
}

function ReviewLoading() { return <div className="flex min-h-[60vh] flex-col items-center justify-center text-center"><div className="analysis-spinner"><span /><span /><span /></div><h2 className="mt-5 text-xl font-bold">正在读取转写</h2></div>; }
function ReviewError({ message, onRetry }: { message: string; onRetry: () => void }) { const navigate = useNavigate(); return <div className="flex min-h-[60vh] flex-col items-center justify-center text-center"><div className="technical-icon"><AlertCircle size={24} /></div><h2 className="mt-5 text-xl font-bold">暂时无法校对转写</h2><p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">{message}</p><div className="mt-5 flex gap-3"><button className="secondary-button" onClick={() => navigate(-1)} type="button">返回</button><button className="primary-button" onClick={onRetry} type="button"><RefreshCw size={16} />重试</button></div></div>; }
function formatTimestamp(milliseconds: number) { const seconds = Math.floor(milliseconds / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
