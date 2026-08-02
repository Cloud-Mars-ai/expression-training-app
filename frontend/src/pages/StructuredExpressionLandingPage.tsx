import { ArrowRight, Clock3, Network } from "lucide-react";
import { Link } from "react-router-dom";
import { SectionHeader } from "../components/ui/SectionHeader";
import { l2ProjectExercise } from "../features/structured-expression/content";

export function StructuredExpressionLandingPage() {
  return <div className="page-container"><section className="training-intro"><div><p className="micro-label text-success">L2 · STRUCTURED EXPRESSION</p><h2 className="mt-2 text-2xl font-bold">结构化表达</h2><p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">把“我做过”变成听者能够理解、判断和追问的具体贡献。</p></div><div className="icon-tile bg-success-soft text-success"><Network size={23} /></div></section><section className="mt-8"><SectionHeader eyebrow="DEMO · 完整训练" title="项目经历专项" description="任务、框架、准备、模拟表达、分析、复盘和聚焦重练。" /><article className="mt-4 exercise-card"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="level-badge">D2 · 支持练习</span><span className="status-label"><Clock3 size={13} />约 4 分钟</span></div><h3 className="mt-3 break-words text-lg font-bold leading-7">{l2ProjectExercise.prompt}</h3><p className="mt-2 text-sm leading-6 text-ink-soft">可选 STAR 或 PREP，完成后得到证据支持的单点改进建议。</p></div><Link aria-label="查看项目经历训练任务" className="exercise-action" to={`/exercise/${l2ProjectExercise.id}`}><span>查看任务</span><ArrowRight size={17} /></Link></article></section></div>;
}
