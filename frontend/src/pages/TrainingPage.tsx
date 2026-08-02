import { ArrowRight, Bookmark, SlidersHorizontal } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { capabilities, exercises, sceneFilters } from "../data/mockData";
import { CapabilityCard } from "../components/ui/CapabilityCard";
import { ChipRow } from "../components/ui/ChipRow";
import { EmptyState } from "../components/ui/EmptyState";
import { ExerciseCard } from "../components/ui/ExerciseCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { demoRepository } from "../data/demoRepository";

export function TrainingPage() {
  const [params, setParams] = useSearchParams();
  const storedScene = demoRepository.getFilters().scene;
  const scene = params.get("scene") ?? storedScene ?? "all";
  useEffect(() => {
    if (!params.has("scene") && storedScene !== "all") setParams({ scene: storedScene }, { replace: true });
  }, [params, setParams, storedScene]);
  const recommendedPool = exercises.filter((exercise) => exercise.status !== "completed");
  const filteredExercises = scene === "all" ? recommendedPool : recommendedPool.filter((exercise) => exercise.scene === scene);
  const recent = exercises.filter((exercise) => exercise.status === "in-progress" || exercise.status === "completed").slice(0, 2);
  const updateScene = (value: string) => { const next = new URLSearchParams(params); if (value === "all") next.delete("scene"); else next.set("scene", value); demoRepository.saveFilters({ scene: value }); setParams(next); };
  const clearFilters = () => { demoRepository.saveFilters({ scene: "all" }); setParams({}); };
  return <div className="page-container">
    <section className="training-intro"><div><p className="micro-label text-primary-strong">TRAINING CENTER · 训练中心</p><h2 className="mt-2 text-2xl font-bold leading-tight">找到适合今天的表达练习</h2><p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">从一个真实场景开始，练习清楚、简短、能推动下一步的表达。</p></div><button aria-label="打开筛选说明" className="icon-button" type="button"><SlidersHorizontal aria-hidden="true" size={19} /></button></section>
    <section className="mt-7"><SectionHeader eyebrow="SCENE · 场景" title="你想为哪种场合准备？" /><div className="mt-3"><ChipRow chips={sceneFilters} label="场景筛选" onChange={updateScene} value={scene} /></div></section>
    <section className="mt-8"><SectionHeader eyebrow="CAPABILITIES · 能力地图" title="四类能力，逐步练习" description="每个方向都从短任务开始，逐渐减少提示。" /><div className="mt-4 grid gap-3 sm:grid-cols-2">{capabilities.map((capability) => <CapabilityCard capability={capability} key={capability.key} />)}</div></section>
    <section className="mt-8"><SectionHeader eyebrow="RECOMMENDED · 推荐训练" title={scene === "all" ? "现在最适合你的练习" : `${sceneFilters.find((filter) => filter.key === scene)?.label ?? "当前场景"}练习`} action={<span className="text-xs text-ink-muted">{filteredExercises.length} 个练习</span>} /><div className="mt-4 grid gap-3">{filteredExercises.length > 0 ? filteredExercises.slice(0, 3).map((exercise) => <ExerciseCard exercise={exercise} key={exercise.id} />) : <EmptyState description="这个场景暂时没有匹配练习，清除筛选后可以浏览全部内容。" onAction={clearFilters} title="没有找到匹配练习" actionLabel="清除场景筛选" />}</div></section>
    <section className="mt-8"><SectionHeader eyebrow="RECENT · 最近练习" title="接着上次的进度继续" action={<Link className="text-sm font-semibold text-primary-strong" to="/growth">查看成长 <ArrowRight aria-hidden="true" className="ml-1 inline" size={15} /></Link>} /><div className="mt-4 grid gap-3">{recent.map((exercise) => <ExerciseCard exercise={exercise} key={exercise.id} />)}</div></section>
    <section className="mt-8"><SectionHeader eyebrow="SAVED · 已收藏" title="留给之后的练习" /><div className="mt-4 flex items-start gap-3 rounded-lg border border-line bg-surface p-4 shadow-card"><Bookmark className="mt-0.5 shrink-0 text-ink-muted" size={19} /><p className="text-sm leading-6 text-ink-soft">收藏功能将在训练详情页开放。你可以先从推荐练习开始。</p></div></section>
  </div>;
}
