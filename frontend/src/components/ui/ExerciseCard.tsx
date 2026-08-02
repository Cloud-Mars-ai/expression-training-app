import { ArrowRight, BookOpenText, CirclePlay, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import type { Exercise } from "../../types";

const statusCopy = { new: "新练习", "in-progress": "进行中", completed: "已完成", review: "待复习" } as const;
const statusIcon = { new: CirclePlay, "in-progress": CirclePlay, completed: BookOpenText, review: RotateCcw } as const;
export function ExerciseCard({ exercise }: { exercise: Exercise }) {
  const StatusIcon = statusIcon[exercise.status];
  const target = exercise.id === "l2-project-contribution" ? `/exercise/${exercise.id}` : `/focus/prepare?exerciseId=${exercise.id}`;
  return <article className="exercise-card"><div className="flex min-w-0 flex-1 gap-3"><div className="exercise-status-icon"><StatusIcon aria-hidden="true" size={19} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="level-badge level-badge-muted">{exercise.difficulty}</span><span className="status-label"><StatusIcon aria-hidden="true" size={13} />{statusCopy[exercise.status]}</span></div><h3 className="mt-2 break-words text-base font-bold leading-6">{exercise.title}</h3><p className="mt-1 line-clamp-2 text-sm leading-5 text-ink-soft">{exercise.excerpt}</p><div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted"><span>{exercise.sceneLabel}</span><span>{exercise.duration}</span><span>{exercise.wordCount}</span>{exercise.framework && <span>{exercise.framework}</span>}</div></div></div><Link aria-label={`${exercise.actionLabel}：${exercise.title}`} className="exercise-action" to={target}><span>{exercise.actionLabel}</span><ArrowRight aria-hidden="true" size={17} /></Link></article>;
}
