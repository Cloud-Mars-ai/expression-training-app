import { ArrowRight, BookOpenText, MessageCircle, Network, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import type { Capability } from "../../types";

const icons = { book: BookOpenText, network: Network, message: MessageCircle, spark: Sparkles };
const tones = { coral: "bg-danger-soft text-danger", green: "bg-success-soft text-success", amber: "bg-warning-soft text-warning", violet: "bg-violet-soft text-violet" };

export function CapabilityCard({ capability }: { capability: Capability }) {
  const Icon = icons[capability.icon];
  return <Link className="capability-card group" to={`/training/${capability.key}`}><div className={`icon-tile ${tones[capability.accent]}`}><Icon aria-hidden="true" size={22} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="level-badge">{capability.level}</span><h3>{capability.title}</h3></div><p className="mt-1 text-sm leading-5 text-ink-soft">{capability.descriptor}</p><div className="mt-3 flex items-center gap-2"><div className="progress-track"><span style={{ width: `${capability.progress}%` }} /></div><span className="text-xs text-ink-muted">{capability.progress}%</span></div><p className="mt-2 text-xs text-ink-muted">{capability.exerciseCount} 个练习 · {capability.method}</p></div><ArrowRight aria-hidden="true" className="shrink-0 text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-primary" size={19} /></Link>;
}
