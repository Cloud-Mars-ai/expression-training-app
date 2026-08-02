import type { ReactNode } from "react";

type PlaceholderPanelProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
};

export function PlaceholderPanel({ eyebrow, title, description, icon }: PlaceholderPanelProps) {
  return (
    <section className="mx-auto flex min-h-[min(60vh,560px)] w-full max-w-[720px] flex-col items-center justify-center text-center">
      <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-lg bg-primary-soft text-primary-strong">{icon}</div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{eyebrow}</p>
      <h2 className="text-2xl font-bold tracking-normal text-ink">{title}</h2>
      <p className="mt-3 max-w-sm text-sm leading-6 text-ink-soft">{description}</p>
    </section>
  );
}
