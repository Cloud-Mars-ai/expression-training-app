import type { ReactNode } from "react";

type SectionHeaderProps = { eyebrow?: string; title: string; description?: string; action?: ReactNode };
export function SectionHeader({ eyebrow, title, description, action }: SectionHeaderProps) {
  return <div className="section-heading"><div className="min-w-0">{eyebrow && <p className="micro-label text-ink-muted">{eyebrow}</p>}<h2>{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-ink-soft">{description}</p>}</div>{action}</div>;
}
