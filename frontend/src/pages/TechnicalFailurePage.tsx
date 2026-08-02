import { AlertTriangle, Mic2, RefreshCw, ShieldAlert } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { l2ProjectExercise } from "../features/structured-expression/content";
import { getAttempt, patchAttempt } from "../features/structured-expression/storage";

export function TechnicalFailurePage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const attempt = getAttempt(attemptId ?? null);
  const retryAnalysis = () => { if (!attempt) { navigate(`/exercise/${l2ProjectExercise.id}`); return; } patchAttempt(attempt.id, { stage: "processing" }); navigate(`/focus/processing?attemptId=${attempt.id}`); };
  const rerecord = () => { if (!attempt) { navigate(`/exercise/${l2ProjectExercise.id}`); return; } patchAttempt(attempt.id, { stage: "recording", recordingState: "idle", recordingElapsed: 0 }); navigate(`/focus/record?attemptId=${attempt.id}`); };
  return <div className="mx-auto flex min-h-[70vh] w-full max-w-[620px] flex-col justify-center"><div className="technical-icon"><AlertTriangle size={25} /></div><p className="micro-label mt-5 text-danger">TECHNICAL ERROR · 技术失败</p><h2 className="mt-2 text-2xl font-bold">分析没有完成，本次不计分</h2><p className="mt-3 text-sm leading-6 text-ink-soft">模拟分析服务超时。你的表达内容和训练次数不会因为这次技术问题受到影响。</p><div className="mt-6 border-y border-line py-5"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 shrink-0 text-ink-soft" size={19} /><div><h3 className="font-bold">为什么没有分数？</h3><p className="mt-1 text-sm leading-6 text-ink-soft">没有可靠完成分析时，我们不会把技术质量误当成表达能力，也不会生成低分。</p></div></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><button className="primary-button" onClick={retryAnalysis} type="button"><RefreshCw size={17} />重新分析</button><button className="secondary-button" onClick={rerecord} type="button"><Mic2 size={17} />重新模拟表达</button></div><button className="mx-auto mt-4 min-h-11 px-3 text-sm font-semibold text-ink-soft hover:text-ink" onClick={() => navigate(`/exercise/${l2ProjectExercise.id}`)} type="button">返回任务详情</button></div>;
}
