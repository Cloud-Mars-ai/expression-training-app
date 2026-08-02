import { ArrowRight, Check, Lightbulb, ListTree } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { l2ProjectExercise } from "../features/structured-expression/content";
import { createAttempt } from "../features/structured-expression/storage";
import type { FrameworkId } from "../features/structured-expression/model";

export function FrameworkSelectionPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<FrameworkId>("STAR");
  const confirm = () => { const attempt = createAttempt(selected); navigate(`/focus/prepare?attemptId=${attempt.id}`); };
  return <div className="mx-auto w-full max-w-[720px] pb-8"><section className="border-b border-line pb-6"><p className="micro-label text-ink-muted">STEP 2 · 选择框架</p><h2 className="mt-2 text-2xl font-bold">选一个你说得顺的结构</h2><p className="mt-2 text-sm leading-6 text-ink-soft">框架只是准备提示。正式表达时，你不需要逐字复述这些标签。</p></section><div className="mt-6 grid gap-4">{l2ProjectExercise.frameworks.map((framework) => { const active = selected === framework.id; return <button aria-pressed={active} className={`framework-option ${active ? "framework-option-active" : ""}`} key={framework.id} onClick={() => setSelected(framework.id)} type="button"><div className="flex items-start gap-3"><div className="framework-check">{active ? <Check aria-hidden="true" size={17} /> : <ListTree aria-hidden="true" size={18} />}</div><div className="min-w-0 flex-1 text-left"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{framework.name}</h3>{framework.recommended && <span className="status-label text-success"><Lightbulb size={13} />本题推荐</span>}</div><p className="mt-1 text-sm leading-6 text-ink-soft">{framework.shortDescription}</p></div></div><ol className="mt-5 grid gap-2 sm:grid-cols-2">{framework.steps.map((step, index) => <li className="framework-step" key={`${step.key}-${index}`}><span>{step.key}</span><div><strong>{step.label}</strong><p>{step.prompt}</p></div></li>)}</ol></button>; })}</div><button className="primary-button mt-6 w-full" onClick={confirm} type="button">使用 {selected}，开始准备 <ArrowRight aria-hidden="true" size={17} /></button></div>;
}
