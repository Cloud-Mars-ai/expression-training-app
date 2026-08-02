import { ArrowLeft } from "lucide-react";
import { Outlet, useNavigate } from "react-router-dom";

export function FocusShell() {
  const navigate = useNavigate();

  return (
    <div data-shell="focus" className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-[720px] flex-col">
        <header className="flex h-[calc(var(--header-height)+env(safe-area-inset-top))] shrink-0 items-end px-4 pb-3 pt-[env(safe-area-inset-top)]">
          <button
            aria-label="退出专注训练"
            className="tap-target inline-flex items-center justify-center rounded-full text-ink-soft transition hover:bg-surface-raised hover:text-ink"
            onClick={() => navigate(-1)}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.8} />
          </button>
          <div className="flex-1 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">FOCUS MODE</p>
            <h1 className="text-sm font-semibold text-ink">结构化表达</h1>
          </div>
          <div className="tap-target" aria-hidden="true" />
        </header>
        <main className="flex flex-1 flex-col px-4 pb-[calc(24px+var(--safe-bottom))] pt-3 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
