import { ArrowRight, Clock3, Database, Network, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SectionHeader } from "../components/ui/SectionHeader";
import {
  researchTopicCategories,
  researchTopics,
  researchTopicSnapshot,
} from "../features/structured-expression/content";

export function StructuredExpressionLandingPage() {
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return researchTopics.filter((topic) => {
      const categoryMatches = category === "全部" || topic.category === category;
      const keywordMatches = !keyword || [topic.title, topic.prompt, topic.scene, topic.core_skill]
        .some((value) => value.toLowerCase().includes(keyword));
      return categoryMatches && keywordMatches;
    });
  }, [category, query]);

  return <div className="page-container">
    <section className="training-intro">
      <div>
        <p className="micro-label text-success">RESEARCH LIBRARY · STRUCTURED EXPRESSION</p>
        <h2 className="mt-2 text-2xl font-bold">表达议题训练库</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">从生活沟通、校园成长、求职职场、经典辩论和社会讨论中选择题目，用可校对转写与证据反馈完成练习。</p>
      </div>
      <div className="icon-tile bg-success-soft text-success"><Network size={23} /></div>
    </section>

    <section className="mt-8">
      <SectionHeader
        eyebrow={`DATABASE · ${researchTopicSnapshot.topicCount} 道`}
        title="选择今天想练的议题"
        description={`题库来自结构化研究快照：${researchTopicSnapshot.methodCount} 个训练方法、${researchTopicSnapshot.sourceCount} 个来源；按训练阶段逐步展示，不一次堆叠长字段。`}
      />
      <label className="mt-4 flex min-h-12 items-center gap-3 rounded-md border border-line bg-surface px-4">
        <Search className="shrink-0 text-ink-muted" size={18} />
        <span className="sr-only">搜索训练题目</span>
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索题目、场景或核心能力"
          type="search"
          value={query}
        />
      </label>
      <div className="chip-row mt-4">
        <div className="chip-row-scroll">
          {["全部", ...researchTopicCategories].map((item) => <button
            aria-pressed={category === item}
            className={`chip ${category === item ? "chip-active" : ""}`}
            key={item}
            onClick={() => setCategory(item)}
            type="button"
          >{item}</button>)}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 text-sm text-ink-soft">
        <span>当前显示 {filtered.length} 道</span>
        <span className="inline-flex items-center gap-1"><Database size={14} />快照 {researchTopicSnapshot.topicsSha256.slice(0, 8)}</span>
      </div>

      <div className="mt-4 grid gap-4">
        {filtered.map((topic) => <article className="exercise-card" key={topic.topic_id}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="level-badge">{topic.category}</span>
              <span className="status-label"><Clock3 size={13} />准备 {topic.prep_seconds}s · 表达 {topic.answer_seconds}s</span>
            </div>
            <h3 className="mt-3 break-words text-lg font-bold leading-7">{topic.title}</h3>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{topic.prompt}</p>
            <p className="mt-3 text-xs text-ink-muted">{topic.scene} · 核心能力：{topic.core_skill} · 来源 {topic.source_ids}</p>
          </div>
          <Link aria-label={`查看${topic.title}`} className="exercise-action" to={`/exercise/${topic.topic_id}`}>
            <span>查看任务</span><ArrowRight size={17} />
          </Link>
        </article>)}
      </div>
      {filtered.length === 0 && <div className="mt-6 rounded-md bg-surface-muted p-6 text-center text-sm text-ink-soft">没有匹配的题目，请换一个关键词或分类。</div>}
    </section>
  </div>;
}
