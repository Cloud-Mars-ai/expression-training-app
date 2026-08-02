import { AlertCircle, Check, Circle, Keyboard, Mic2, Pause, Play, RotateCcw, Square, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FocusStageStepper } from "../components/training/FocusStageStepper";
import { remoteAttemptSession } from "../data/remoteAttemptSession";
import { getStructuredExercise } from "../features/structured-expression/content";
import type { TrainingAttempt } from "../features/structured-expression/model";
import { getAttempt, patchAttempt } from "../features/structured-expression/storage";
import { cancelRemoteTraining, ensureRemoteRecording, startRemoteTrainingAttempt } from "../features/structured-expression/workflow";
import { useAttemptPolling } from "../hooks/useAttemptPolling";
import { useRecorder } from "../hooks/useRecorder";
import { uploadAttemptAudio } from "../services/attemptApi";
import { TextAnswerStage } from "./TextAnswerStage";

export function StructuredTrainingFocusPage() {
  const { stage } = useParams();
  const [params] = useSearchParams();
  const attempt = getAttempt(params.get("attemptId"));
  if (!attempt) return <MissingAttempt />;
  if (stage === "prepare") return <PreparationStage attempt={attempt} />;
  if (stage === "record") return attempt.inputMode === "text" ? <TextAnswerStage attempt={attempt} /> : <RecordingStage attempt={attempt} />;
  if (stage === "processing") return <ProcessingStage attempt={attempt} />;
  return <MissingAttempt />;
}

function MissingAttempt() {
  const navigate = useNavigate();
  return <div className="flex flex-1 flex-col items-center justify-center text-center"><div className="state-icon"><AlertCircle size={22} /></div><h2 className="mt-4 text-xl font-bold">训练记录未准备好</h2><p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">请从题库选择题目和表达框架后再进入专注训练。</p><button className="secondary-button mt-5" onClick={() => navigate("/training/structure")} type="button">返回训练题库</button></div>;
}

function PreparationStage({ attempt }: { attempt: TrainingAttempt }) {
  const navigate = useNavigate();
  const exercise = getStructuredExercise(attempt.exerciseId);
  const [remaining, setRemaining] = useState(Math.max(0, attempt.preparationRemaining));
  const framework = exercise.frameworks.find((item) => item.id === attempt.frameworkId)!;
  useEffect(() => {
    if (remaining <= 0) {
      patchAttempt(attempt.id, { stage: "recording", preparationRemaining: 0 });
      const timer = window.setTimeout(() => navigate(`/focus/record?attemptId=${attempt.id}`, { replace: true }), 450);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setRemaining((value) => {
      const next = Math.max(0, value - 1);
      patchAttempt(attempt.id, { preparationRemaining: next });
      return next;
    }), 1_000);
    return () => window.clearTimeout(timer);
  }, [attempt.id, navigate, remaining]);
  const skip = () => {
    patchAttempt(attempt.id, { stage: "recording", preparationRemaining: remaining });
    navigate(`/focus/record?attemptId=${attempt.id}`);
  };
  return <div className="flex flex-1 flex-col"><FocusStageStepper current="prepare" /><div className="mt-5 flex items-end justify-between gap-4"><div><p className="micro-label text-primary-strong">{exercise.preparationSeconds} 秒准备</p><h2 className="mt-2 text-xl font-bold">只记关键词，不写完整句子</h2></div><div aria-label={`剩余 ${remaining} 秒`} className="focus-timer">{String(remaining).padStart(2, "0")}</div></div><div className="timer-track mt-4"><span style={{ width: `${remaining / exercise.preparationSeconds * 100}%` }} /></div>{attempt.focusIssue && <div className="focus-callout mt-5"><p className="micro-label text-warning">本次只改一个问题</p><p className="mt-2 text-sm leading-6">{attempt.focusIssue}</p></div>}<section className="focus-prompt mt-5"><p className="micro-label text-ink-muted">TASK · 题目</p><h3 className="mt-3 text-xl font-bold leading-8">{exercise.prompt}</h3><div className="mt-6 grid gap-3">{framework.steps.map((step, index) => <div className="focus-outline-row" key={`${step.key}-${index}`}><span>{step.key}</span><div><strong>{step.label}</strong><p>{step.prompt}</p></div></div>)}</div></section><div className="mt-auto pt-5"><button className="primary-button w-full bg-primary text-white hover:bg-primary-strong" onClick={skip} type="button">提前开始表达 <Play size={17} /></button><p className="mt-3 text-center text-xs text-ink-muted">倒计时结束后会自动进入表达阶段</p></div></div>;
}

function RecordingStage({ attempt }: { attempt: TrainingAttempt }) {
  const navigate = useNavigate();
  const sourceExercise = getStructuredExercise(attempt.exerciseId);
  const exercise = sourceExercise.level === "L1" ? { ...sourceExercise, prompt: `${sourceExercise.prompt} 请先复述主旨和关键事实，再用一句不超过 30 字的话概括。` } : sourceExercise;
  const recorder = useRecorder({ minDurationMs: 1_500, silenceThreshold: 0.01 });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const session = remoteAttemptSession.get(attempt.id);
  const framework = exercise.frameworks.find((item) => item.id === attempt.frameworkId)!;
  const waves = useMemo(() => [0.55, 0.82, 1, 0.68, 0.92, 0.72, 1, 0.61, 0.88, 0.52, 0.95, 0.7, 0.84, 0.59, 0.9, 0.64], []);

  useEffect(() => {
    if (recorder.status === "recording" && recorder.durationMs >= exercise.speakingSeconds * 1_000) {
      void recorder.stop().catch(() => undefined);
    }
  }, [exercise.speakingSeconds, recorder]);

  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true); setActionError(null);
    try { await operation(); } catch (cause) { setActionError(cause instanceof Error ? cause.message : "操作失败，请重试。"); }
    finally { setBusy(false); }
  };
  const requestPermission = () => run(() => recorder.requestPermission());
  const start = () => run(async () => {
    const remote = await ensureRemoteRecording(attempt.id);
    if (remote.status !== "recording") throw new Error(`当前训练状态为 ${remote.status}，无法开始录音。`);
    await recorder.start();
    patchAttempt(attempt.id, { stage: "recording", recordingState: "recording" });
  });
  const stop = () => run(async () => {
    const result = await recorder.stop();
    patchAttempt(attempt.id, { recordingState: "completed", recordingElapsed: Math.round(result.durationMs / 1_000) });
  });
  const rerecord = () => run(async () => {
    await recorder.rerecord();
    patchAttempt(attempt.id, { recordingState: "idle", recordingElapsed: 0 });
  });
  const submit = () => run(async () => {
    if (!recorder.result || !session) throw new Error("录音或远端训练会话不存在，请重新进入任务。");
    const remote = await uploadAttemptAudio({
      attemptId: attempt.id,
      blob: recorder.result.blob,
      durationMs: recorder.result.durationMs,
      mimeType: recorder.result.mimeType,
      idempotencyKey: session.uploadKey,
    });
    remoteAttemptSession.updateStatus(attempt.id, remote.status);
    patchAttempt(attempt.id, { stage: "processing", recordingState: "completed", recordingElapsed: Math.round(recorder.result.durationMs / 1_000) });
    navigate(`/focus/processing?attemptId=${attempt.id}`);
  });
  const cancel = () => run(async () => {
    await recorder.cancel().catch(() => undefined);
    await cancelRemoteTraining(attempt.id);
    patchAttempt(attempt.id, { stage: "cancelled" });
    navigate(`/exercise/${exercise.id}`);
  });
  const switchToText = () => run(async () => {
    const hasRecording = ["recording", "paused", "recorded", "stopping"].includes(recorder.status);
    if (hasRecording && !window.confirm("切换到文字输入会结束当前录音。确定切换吗？")) return;
    await recorder.cancel().catch(() => undefined);
    await cancelRemoteTraining(attempt.id);
    const next = await startRemoteTrainingAttempt({ exerciseId: attempt.exerciseId, frameworkId: attempt.frameworkId, inputMode: "text", retryOfAttemptId: attempt.id, ...(attempt.focusIssue ? { focusInstruction: attempt.focusIssue } : {}) });
    navigate(`/focus/record?attemptId=${next.local.id}`, { replace: true });
  });

  const statusText = recorder.status === "requesting-permission" ? "正在请求麦克风权限" : recorder.status === "ready" ? "麦克风已就绪" : recorder.status === "recording" ? "真实录音中" : recorder.status === "paused" ? "录音已暂停" : recorder.status === "stopping" ? "正在生成录音" : recorder.status === "recorded" ? "录音已完成" : recorder.status === "error" ? "录音出现问题" : "尚未启用麦克风";
  const helper = recorder.status === "recorded" ? `已录制 ${Math.round(recorder.durationMs / 1_000)} 秒，可试听、重录或提交` : recorder.status === "paused" ? "录音已暂停，计时不会增加" : recorder.status === "ready" ? "点击录音按钮后开始计时" : `使用 ${framework.id} 提示组织内容`;
  const level = recorder.status === "recording" ? Math.max(0.12, recorder.inputLevel) : recorder.status === "recorded" ? Math.max(0.2, recorder.peakLevel) : 0.18;
  const primaryAction = recorder.status === "idle" || recorder.status === "cancelled" || recorder.status === "error"
    ? requestPermission
    : recorder.status === "ready"
      ? start
      : recorder.status === "recording"
        ? () => run(async () => recorder.pause())
        : recorder.status === "paused"
          ? () => run(async () => recorder.resume())
          : undefined;
  const primaryLabel = recorder.status === "idle" || recorder.status === "cancelled" || recorder.status === "error" ? "启用麦克风" : recorder.status === "ready" ? "开始录音" : recorder.status === "recording" ? "暂停录音" : recorder.status === "paused" ? "继续录音" : "录音处理中";

  return <div className="flex flex-1 flex-col"><FocusStageStepper current="record" /><div className="mt-5"><p className="micro-label text-primary-strong">{exercise.speakingSeconds} 秒表达</p><h2 className="mt-2 text-xl font-bold leading-8">{exercise.prompt}</h2></div><InputModeSwitch mode="voice" onText={() => void switchToText()} /><div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-primary/25 bg-primary-soft px-3 py-2"><span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-primary-strong"><Circle className={recorder.status === "recording" ? "fill-record text-record" : "text-primary-strong"} size={12} /><span className="break-words">{statusText}</span></span><span className="shrink-0 text-xs text-primary-strong/70">麦克风录音</span></div><section className="recording-panel mt-5"><div className="text-center"><span className="recording-time">{recorder.formattedDuration}</span><p className="mt-2 text-sm text-ink-soft">建议充分回答 · 最长 {exercise.speakingSeconds} 秒</p></div><div aria-label={`当前输入音量 ${Math.round(recorder.inputLevel * 100)}%`} className={`waveform ${recorder.status === "recording" ? "waveform-active" : ""}`} role="meter">{waves.map((height, index) => <i key={index} style={{ height: Math.max(10, 62 * height * Math.min(1, level * 3.5)) }} />)}</div><div className="record-controls"><button aria-label="重录" className="record-side-control" disabled={busy || recorder.status !== "recorded"} onClick={() => void rerecord()} type="button"><RotateCcw size={18} /><span>重录</span></button><button aria-label={primaryLabel} className={`record-main-control ${recorder.status === "recording" ? "record-main-active" : ""}`} disabled={busy || !primaryAction} onClick={() => primaryAction?.()} type="button">{recorder.status === "recording" ? <Pause size={24} /> : recorder.status === "paused" || recorder.status === "ready" ? <Play size={25} /> : recorder.status === "idle" || recorder.status === "error" || recorder.status === "cancelled" ? <Mic2 size={23} /> : <Circle className="fill-current" size={22} />}</button>{recorder.status === "recording" || recorder.status === "paused" ? <button aria-label="停止录音" className="record-side-control" disabled={busy} onClick={() => void stop()} type="button"><Square size={17} /><span>停止</span></button> : <button aria-label="提交录音并开始分析" className="record-side-control" disabled={busy || recorder.status !== "recorded"} onClick={() => void submit()} type="button"><Check size={18} /><span>提交</span></button>}</div>{recorder.result && <audio className="mt-4 w-full" controls preload="metadata" src={recorder.result.previewUrl}>你的浏览器不支持音频预览。</audio>}<p className="mt-4 text-center text-xs text-ink-muted">{helper}</p></section>{(actionError || recorder.error) && <div className="mt-4 rounded-md bg-danger-soft p-3 text-sm font-semibold text-danger" role="alert">{actionError ?? recorder.error?.message}</div>}{confirmCancel ? <div className="cancel-confirm mt-4"><div><strong>取消本次训练？</strong><p>当前录音会停止，本次记录不计入成长数据。</p></div><div className="flex gap-2"><button className="secondary-button" onClick={() => setConfirmCancel(false)} type="button">继续训练</button><button className="secondary-button text-danger" disabled={busy} onClick={() => void cancel()} type="button">确认取消</button></div></div> : <button className="mx-auto mt-4 inline-flex min-h-11 items-center gap-2 px-3 text-sm font-semibold text-ink-muted hover:text-ink" onClick={() => setConfirmCancel(true)} type="button"><X size={16} />取消训练</button>}</div>;
}

function InputModeSwitch({ mode, onVoice, onText }: { mode: "voice" | "text"; onVoice?: () => void; onText?: () => void }) {
  return <div aria-label="作答输入方式" className="input-mode-switch mt-4" role="group"><button aria-pressed={mode === "voice"} className={mode === "voice" ? "active" : ""} onClick={onVoice} type="button"><Mic2 size={17} />语音输入</button><button aria-pressed={mode === "text"} className={mode === "text" ? "active" : ""} onClick={onText} type="button"><Keyboard size={17} />文字输入</button></div>;
}

function ProcessingStage({ attempt }: { attempt: TrainingAttempt }) {
  const navigate = useNavigate();
  const { detail, error, loading, refresh } = useAttemptPolling(attempt.id);
  useEffect(() => {
    const status = detail?.attempt.status;
    if (!status) return;
    remoteAttemptSession.updateStatus(attempt.id, status);
    if (status === "transcript-review") navigate(`/attempt/${attempt.id}/transcript`, { replace: true });
    if (status === "ready" || status === "unscorable") navigate(`/result/${attempt.id}`, { replace: true });
    if (status === "technical-failure") navigate(`/technical-error/${attempt.id}`, { replace: true });
  }, [attempt.id, detail?.attempt.status, navigate]);
  const status = detail?.attempt.status;
  const activeStep = status === "evaluating" ? 2 : status === "transcribing" ? 1 : 0;
  const stages = ["录音上传完成", "生成可校对转写", "根据证据生成反馈"];
  return <div className="flex flex-1 flex-col"><FocusStageStepper current="processing" /><div className="flex flex-1 flex-col items-center justify-center py-8 text-center"><div className="analysis-spinner"><span /><span /><span /></div><p className="micro-label mt-7 text-primary-strong">PROCESSING · 证据分析</p><h2 className="mt-2 text-2xl font-bold">{status === "evaluating" ? "DeepSeek 正在生成证据反馈" : "正在整理你的表达"}</h2><p className="mt-3 max-w-sm text-sm leading-6 text-ink-soft">录音只发送到当前配置的语音识别服务生成转写；只有你确认后的文字、题目和评分标准会发送到 DeepSeek。技术失败不会生成低分，也不会消耗有效练习次数。</p><ol className="mt-8 w-full max-w-sm text-left">{stages.map((label, index) => <li className={`analysis-step ${index <= activeStep ? "analysis-step-active" : ""}`} key={label}>{index < activeStep ? <Check size={16} /> : <span>{index + 1}</span>}<p>{label}</p></li>)}</ol>{loading && <p className="mt-5 text-sm text-ink-muted">正在读取处理状态…</p>}{error && <div className="mt-5 w-full max-w-sm rounded-md bg-danger-soft p-3 text-sm text-danger" role="alert"><p>{error.message}</p><button className="secondary-button mt-3" onClick={refresh} type="button">重新连接</button></div>}</div></div>;
}
