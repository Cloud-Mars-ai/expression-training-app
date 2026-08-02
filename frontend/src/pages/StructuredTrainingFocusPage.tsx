import { AlertCircle, Check, Circle, Pause, Play, RotateCcw, Square, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FocusStageStepper } from "../components/training/FocusStageStepper";
import { l2ProjectExercise } from "../features/structured-expression/content";
import { buildMockEvaluation } from "../features/structured-expression/mockEvaluation";
import type { RecordingState, TrainingAttempt } from "../features/structured-expression/model";
import { getAttempt, patchAttempt, saveEvaluation } from "../features/structured-expression/storage";

export function StructuredTrainingFocusPage() {
  const { stage } = useParams();
  const [params] = useSearchParams();
  const attempt = getAttempt(params.get("attemptId"));
  if (!attempt) return <MissingAttempt />;
  if (stage === "prepare") return <PreparationStage attempt={attempt} />;
  if (stage === "record") return <RecordingStage attempt={attempt} />;
  if (stage === "processing") return <ProcessingStage attempt={attempt} simulateError={params.get("simulateError") === "1"} />;
  return <MissingAttempt />;
}

function MissingAttempt() {
  const navigate = useNavigate();
  return <div className="flex flex-1 flex-col items-center justify-center text-center"><div className="state-icon"><AlertCircle size={22} /></div><h2 className="mt-4 text-xl font-bold">训练记录未准备好</h2><p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">请从任务页面选择框架后再进入专注训练。</p><button className="secondary-button mt-5" onClick={() => navigate(`/exercise/${l2ProjectExercise.id}`)} type="button">返回训练任务</button></div>;
}

function PreparationStage({ attempt }: { attempt: TrainingAttempt }) {
  const navigate = useNavigate();
  const [remaining, setRemaining] = useState(Math.max(0, attempt.preparationRemaining));
  const framework = l2ProjectExercise.frameworks.find((item) => item.id === attempt.frameworkId)!;
  useEffect(() => {
    if (remaining <= 0) { patchAttempt(attempt.id, { stage: "recording", preparationRemaining: 0 }); const timer = window.setTimeout(() => navigate(`/focus/record?attemptId=${attempt.id}`, { replace: true }), 450); return () => window.clearTimeout(timer); }
    const timer = window.setTimeout(() => setRemaining((value) => { const next = Math.max(0, value - 1); patchAttempt(attempt.id, { preparationRemaining: next }); return next; }), 1000);
    return () => window.clearTimeout(timer);
  }, [attempt.id, navigate, remaining]);
  const skip = () => { patchAttempt(attempt.id, { stage: "recording", preparationRemaining: remaining }); navigate(`/focus/record?attemptId=${attempt.id}`); };
  return <div className="flex flex-1 flex-col"><FocusStageStepper current="prepare" /><div className="mt-5 flex items-end justify-between gap-4"><div><p className="micro-label text-primary-strong">30 秒准备</p><h2 className="mt-2 text-xl font-bold">只记关键词，不写完整句子</h2></div><div aria-label={`剩余 ${remaining} 秒`} className="focus-timer">{String(remaining).padStart(2, "0")}</div></div><div className="timer-track mt-4"><span style={{ width: `${remaining / l2ProjectExercise.preparationSeconds * 100}%` }} /></div>{attempt.focusIssue && <div className="focus-callout mt-5"><p className="micro-label text-warning">本次只改一个问题</p><p className="mt-2 text-sm leading-6">{attempt.focusIssue}</p></div>}<section className="focus-prompt mt-5"><p className="micro-label text-ink-muted">TASK · 题目</p><h3 className="mt-3 text-xl font-bold leading-8">{l2ProjectExercise.prompt}</h3><div className="mt-6 grid gap-3">{framework.steps.map((step, index) => <div className="focus-outline-row" key={`${step.key}-${index}`}><span>{step.key}</span><div><strong>{step.label}</strong><p>{step.prompt}</p></div></div>)}</div></section><div className="mt-auto pt-5"><button className="primary-button w-full bg-primary text-white hover:bg-primary-strong" onClick={skip} type="button">提前开始表达 <Play size={17} /></button><p className="mt-3 text-center text-xs text-ink-muted">倒计时结束后会自动进入表达阶段</p></div></div>;
}

function RecordingStage({ attempt }: { attempt: TrainingAttempt }) {
  const navigate = useNavigate();
  const initialState: RecordingState = attempt.recordingState === "recording" ? "paused" : attempt.recordingState;
  const [state, setState] = useState<RecordingState>(initialState);
  const [elapsed, setElapsed] = useState(attempt.recordingElapsed);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const framework = l2ProjectExercise.frameworks.find((item) => item.id === attempt.frameworkId)!;
  useEffect(() => {
    if (state !== "recording") return;
    const timer = window.setInterval(() => setElapsed((value) => { const next = Math.min(l2ProjectExercise.speakingSeconds, value + 1); const nextState = next >= l2ProjectExercise.speakingSeconds ? "completed" : "recording"; patchAttempt(attempt.id, { recordingElapsed: next, recordingState: nextState }); if (nextState === "completed") setState("completed"); return next; }), 1000);
    return () => window.clearInterval(timer);
  }, [attempt.id, state]);
  const setRecordingState = (next: RecordingState) => { setState(next); patchAttempt(attempt.id, { recordingState: next, stage: "recording" }); };
  const reset = () => { setElapsed(0); setRecordingState("idle"); patchAttempt(attempt.id, { recordingElapsed: 0 }); };
  const submit = () => { if (elapsed === 0) return; patchAttempt(attempt.id, { stage: "processing", recordingState: "completed", recordingElapsed: elapsed }); navigate(`/focus/processing?attemptId=${attempt.id}`); };
  const cancel = () => { patchAttempt(attempt.id, { stage: "cancelled", recordingState: state, recordingElapsed: elapsed }); navigate(`/exercise/${l2ProjectExercise.id}`); };
  const status = state === "recording" ? "模拟录音中" : state === "paused" ? "已暂停" : state === "completed" ? "模拟录音完成" : "等待开始";
  const waves = useMemo(() => [20, 34, 46, 28, 54, 38, 62, 32, 48, 24, 58, 36, 44, 26, 52, 30], []);
  const helper = state === "paused" ? "录音已暂停，计时不会增加" : state === "completed" ? elapsed >= l2ProjectExercise.speakingSeconds ? "已到 60 秒，可以重录或提交" : `已录制 ${elapsed} 秒，可以重录或提交` : `使用 ${framework.id} 提示组织内容`;
  return <div className="flex flex-1 flex-col"><FocusStageStepper current="record" /><div className="mt-5"><p className="micro-label text-primary-strong">60 秒表达</p><h2 className="mt-2 text-xl font-bold leading-8">{l2ProjectExercise.prompt}</h2></div><div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-primary/25 bg-primary-soft px-3 py-2"><span className="flex items-center gap-2 text-sm font-semibold text-primary-strong"><Circle className={state === "recording" ? "fill-record text-record" : "text-primary-strong"} size={12} />{status}</span><span className="text-xs text-primary-strong/70">模拟状态 · 不使用麦克风</span></div><section className="recording-panel mt-5"><div className="text-center"><span className="recording-time">{formatTime(elapsed)}</span><p className="mt-2 text-sm text-ink-soft">建议 45-60 秒 · 最长 60 秒</p></div><div aria-hidden="true" className={`waveform ${state === "recording" ? "waveform-active" : ""}`}>{waves.map((height, index) => <i key={index} style={{ height }} />)}</div><div className="record-controls"><button aria-label="重录" className="record-side-control" disabled={elapsed === 0} onClick={reset} type="button"><RotateCcw size={18} /><span>重录</span></button><button aria-label={state === "recording" ? "暂停模拟录音" : state === "paused" ? "继续模拟录音" : "开始模拟录音"} className={`record-main-control ${state === "recording" ? "record-main-active" : ""}`} onClick={() => setRecordingState(state === "recording" ? "paused" : "recording")} type="button">{state === "recording" ? <Pause size={24} /> : state === "paused" ? <Play size={25} /> : <Circle className="fill-current" size={22} />}</button><button aria-label="完成并提交分析" className="record-side-control" disabled={elapsed === 0} onClick={submit} type="button"><Square size={17} /><span>提交</span></button></div><p className="mt-4 text-center text-xs text-ink-muted">{helper}</p></section>{confirmCancel ? <div className="cancel-confirm mt-4"><div><strong>取消本次训练？</strong><p>当前模拟录音会保留为已取消记录，不计入成长数据。</p></div><div className="flex gap-2"><button className="secondary-button" onClick={() => setConfirmCancel(false)} type="button">继续训练</button><button className="secondary-button text-danger" onClick={cancel} type="button">确认取消</button></div></div> : <button className="mx-auto mt-4 inline-flex min-h-11 items-center gap-2 px-3 text-sm font-semibold text-ink-muted hover:text-ink" onClick={() => { if (state === "recording") setRecordingState("paused"); setConfirmCancel(true); }} type="button"><X size={16} />取消训练</button>}</div>;
}

function ProcessingStage({ attempt, simulateError }: { attempt: TrainingAttempt; simulateError: boolean }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  useEffect(() => {
    const first = window.setTimeout(() => setStep(1), 650);
    const second = window.setTimeout(() => setStep(2), 1350);
    const finish = window.setTimeout(() => { if (simulateError) { patchAttempt(attempt.id, { stage: "technical-error" }); navigate(`/technical-error/${attempt.id}?code=analysis-timeout`, { replace: true }); return; } const evaluation = buildMockEvaluation(attempt); saveEvaluation(evaluation); patchAttempt(attempt.id, { stage: "result" }); navigate(`/result/${attempt.id}`, { replace: true }); }, 2200);
    return () => { window.clearTimeout(first); window.clearTimeout(second); window.clearTimeout(finish); };
  }, [attempt, navigate, simulateError]);
  const stages = ["整理模拟录音", "检查任务与结构", "生成证据反馈"];
  return <div className="flex flex-1 flex-col"><FocusStageStepper current="processing" /><div className="flex flex-1 flex-col items-center justify-center py-8 text-center"><div className="analysis-spinner"><span /><span /><span /></div><p className="micro-label mt-7 text-primary-strong">ANALYZING · 模拟分析</p><h2 className="mt-2 text-2xl font-bold">正在生成你的训练复盘</h2><p className="mt-3 max-w-sm text-sm leading-6 text-ink-soft">保留任务和录音状态，不会因离开页面消耗额外训练次数。</p><ol className="mt-8 w-full max-w-sm text-left">{stages.map((label, index) => <li className={`analysis-step ${index <= step ? "analysis-step-active" : ""}`} key={label}>{index < step ? <Check size={16} /> : <span>{index + 1}</span>}<p>{label}</p></li>)}</ol></div></div>;
}

function formatTime(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
