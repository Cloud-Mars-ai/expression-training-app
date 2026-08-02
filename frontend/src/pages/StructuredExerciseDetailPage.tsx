import { ArrowRight, CheckCircle2, Clock3, Database, Goal, Layers3, Mic2, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { getRecommendedMethods, getResearchTopic, getStructuredExercise } from "../features/structured-expression/content";

export function StructuredExerciseDetailPage() {
  const { exerciseId } = useParams();
  const exercise = getStructuredExercise(exerciseId);
  const topic = getResearchTopic(exerciseId);
  const methods = topic ? getRecommendedMethods(topic) : [];
  return <div className="mx-auto w-full max-w-[720px] pb-8">
    <section className="border-b border-line pb-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="level-badge">{topic?.category ?? "L2 · 结构化表达"}</span>
        <span className="status-label"><Clock3 aria-hidden="true" size={14} />约 {Math.ceil((exercise.preparationSeconds + exercise.speakingSeconds) / 60) + 2} 分钟</span>
      </div>
      <h2 className="mt-4 break-words text-2xl font-bold leading-tight">{exercise.title}</h2>
      <p className="mt-3 text-sm leading-6 text-ink-soft">{exercise.scene} · 目标能力：{exercise.targetSkill}</p>
    </section>
    <section className="py-6">
      <p className="micro-label text-ink-muted">TASK · 训练任务</p>
      <blockquote className="mt-3 border-l-4 border-primary pl-4 text-xl font-bold leading-8 text-ink">“{exercise.prompt}”</blockquote>
      {topic && <p className="mt-4 text-sm leading-6 text-ink-soft">{topic.background}</p>}
      <div className="mt-5 flex flex-wrap gap-3 text-sm text-ink-soft">
        <span className="meta-pill"><Clock3 size={15} />准备 {exercise.preparationSeconds} 秒</span>
        <span className="meta-pill"><Mic2 size={15} />表达 {exercise.speakingSeconds} 秒</span>
        <span className="meta-pill"><Layers3 size={15} />PREP 或 STAR</span>
      </div>
    </section>
    <section className="border-t border-line py-6">
      <div className="flex items-center gap-2"><Goal className="text-primary-strong" size={20} /><h3 className="text-lg font-bold">成功标准</h3></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{exercise.successCriteria.map((criterion) => <div className="criterion-row" key={criterion.id}><CheckCircle2 className="mt-0.5 shrink-0 text-success" size={18} /><div><h4 className="font-bold leading-5">{criterion.label}</h4><p className="mt-1 text-sm leading-5 text-ink-soft">{criterion.detail}</p></div></div>)}</div>
    </section>
    {topic && <section className="border-t border-line py-6">
      <div className="flex items-center gap-2"><Database className="text-primary-strong" size={19} /><h3 className="text-lg font-bold">讨论线索</h3></div>
      <div className="mt-4 grid gap-3">
        <div className="criterion-row"><div><h4 className="font-bold">支持方向</h4><p className="mt-1 text-sm leading-5 text-ink-soft">{topic.support_direction}</p></div></div>
        <div className="criterion-row"><div><h4 className="font-bold">挑战方向</h4><p className="mt-1 text-sm leading-5 text-ink-soft">{topic.challenge_direction}</p></div></div>
        <div className="criterion-row"><div><h4 className="font-bold">追问</h4><p className="mt-1 text-sm leading-5 text-ink-soft">{topic.followups}</p></div></div>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-muted">来源编号：{topic.source_ids} · 时效：{topic.timeliness} · 需要更新：{topic.needs_update}</p>
      <details className="transcript-details mt-4"><summary>查看推荐训练方法 <ArrowRight size={16} /></summary><div className="grid gap-3 pt-3">{methods.map((method) => <div className="criterion-row" key={method.method_id}><div><h4 className="font-bold">{method.method_name} · {method.duration}</h4><p className="mt-1 text-sm leading-5 text-ink-soft">{method.user_action}</p><p className="mt-2 text-xs leading-5 text-ink-muted">达标信号：{method.success_signal}</p></div></div>)}</div></details>
    </section>}
    <section className="border-t border-line pt-6">
      <div className="flex items-start gap-3 rounded-md bg-primary-soft p-4">
        <ShieldCheck className="mt-0.5 shrink-0 text-primary-strong" size={19} />
        <div><h3 className="text-sm font-bold text-primary-strong">隐私边界</h3><p className="mt-1 text-sm leading-5 text-primary-strong/80">原始录音只交给本机转写服务；只有你校对确认后的文字、当前题目和评分标准会发送到 DeepSeek API。技术失败不生成低分，也不计入有效练习。</p>{topic?.safety_risk && <p className="mt-2 text-xs leading-5 text-primary-strong/70">本题提示：{topic.safety_risk}</p>}</div>
      </div>
      <Link className="primary-button mt-6 w-full" to={`/exercise/${exercise.id}/framework`}>选择表达框架 <ArrowRight aria-hidden="true" size={17} /></Link>
    </section>
  </div>;
}
