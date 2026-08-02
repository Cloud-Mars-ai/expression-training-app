import { ArrowRight, Check, Keyboard, Lightbulb, ListTree, Mic2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getStructuredExercise } from "../features/structured-expression/content";
import type { FrameworkId, InputMode } from "../features/structured-expression/model";
import { startRemoteTrainingAttempt } from "../features/structured-expression/workflow";
import { createIdempotencyKey } from "../services/attemptApi";

export function FrameworkSelectionPage() {
  const navigate = useNavigate();
  const { exerciseId } = useParams();
  const exercise = getStructuredExercise(exerciseId);
  const initialFramework = exercise.frameworks.find((item) => item.recommended)?.id ?? exercise.frameworks[0]?.id ?? "PREP";
  const [selected, setSelected] = useState<FrameworkId>(initialFramework);
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createKey] = useState(createIdempotencyKey);
  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      const { local } = await startRemoteTrainingAttempt({ exerciseId: exercise.id, frameworkId: selected, inputMode, createKey });
      navigate(`/focus/prepare?attemptId=${local.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建训练失败，请重试。");
      setBusy(false);
    }
  };
  return <div className="mx-auto w-full max-w-[720px] pb-8">
    <section className="border-b border-line pb-6"><p className="micro-label text-ink-muted">STEP 2 · 选择框架</p><h2 className="mt-2 text-2xl font-bold">选一个你说得顺的结构</h2><p className="mt-2 text-sm leading-6 text-ink-soft">当前题目：{exercise.title}。框架只是准备提示，不需要逐字复述标签。</p></section>
    <section className="mt-6"><p className="micro-label text-ink-muted">INPUT · 作答方式</p><div aria-label="选择作答方式" className="input-mode-switch mt-3" role="group"><button aria-pressed={inputMode === "voice"} className={inputMode === "voice" ? "active" : ""} onClick={() => setInputMode("voice")} type="button"><Mic2 size={17} />语音输入</button><button aria-pressed={inputMode === "text"} className={inputMode === "text" ? "active" : ""} onClick={() => setInputMode("text")} type="button"><Keyboard size={17} />文字输入</button></div><p className="mt-2 text-xs leading-5 text-ink-muted">{inputMode === "voice" ? "录音仅发送到本机语音识别；校对确认后的文字才会进入评分。" : "不会请求麦克风权限；确认后的文字与语音转写使用同一评分标准。"}</p></section>
    <div className="mt-6 grid gap-4">{exercise.frameworks.map((framework) => { const active = selected === framework.id; return <button aria-pressed={active} className={`framework-option ${active ? "framework-option-active" : ""}`} disabled={busy} key={framework.id} onClick={() => setSelected(framework.id)} type="button"><div className="flex items-start gap-3"><div className="framework-check">{active ? <Check aria-hidden="true" size={17} /> : <ListTree aria-hidden="true" size={18} />}</div><div className="min-w-0 flex-1 text-left"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{framework.name}</h3>{framework.recommended && <span className="status-label text-success"><Lightbulb size={13} />本题推荐</span>}</div><p className="mt-1 text-sm leading-6 text-ink-soft">{framework.shortDescription}</p></div></div><ol className="mt-5 grid gap-2 sm:grid-cols-2">{framework.steps.map((step, index) => <li className="framework-step" key={`${step.key}-${index}`}><span>{step.key}</span><div><strong>{step.label}</strong><p>{step.prompt}</p></div></li>)}</ol></button>; })}</div>
    {error && <div className="mt-4 rounded-md bg-danger-soft p-3 text-sm font-semibold text-danger" role="alert">{error}</div>}
    <button className="primary-button mt-6 w-full" disabled={busy} onClick={() => void confirm()} type="button">{busy ? "正在创建训练…" : <>使用 {selected} · {inputMode === "voice" ? "语音" : "文字"}，开始准备 <ArrowRight aria-hidden="true" size={17} /></>}</button>
  </div>;
}
