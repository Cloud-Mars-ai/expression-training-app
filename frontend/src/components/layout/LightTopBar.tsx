import { Bell, Menu } from "lucide-react";

type LightTopBarProps = { title: string };

export function LightTopBar({ title }: LightTopBarProps) {
  return (
    <header className="flex h-[calc(var(--header-height)+env(safe-area-inset-top))] shrink-0 items-end px-4 pb-3 pt-[env(safe-area-inset-top)] sm:px-8">
      <div className="flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">YANXU · EXPRESS</p>
        <h1 className="text-xl font-bold leading-tight text-ink">{title}</h1>
      </div>
      <div className="flex items-center gap-1">
        <button aria-label="通知" className="tap-target rounded-full text-ink-soft transition hover:bg-surface-muted hover:text-ink" type="button">
          <Bell aria-hidden="true" size={19} strokeWidth={1.8} />
        </button>
        <button aria-label="更多菜单" className="tap-target rounded-full text-ink-soft transition hover:bg-surface-muted hover:text-ink" type="button">
          <Menu aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
