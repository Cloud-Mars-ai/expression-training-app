import { ArrowLeft } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

export function ResultShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const isExercise = location.pathname.startsWith("/exercise/");
  const isTechnicalError = location.pathname.startsWith("/technical-error/");
  const eyebrow = isExercise ? "L2 · STRUCTURED" : isTechnicalError ? "RECOVERY" : "REVIEW";
  const title = isExercise ? "结构化表达" : isTechnicalError ? "技术恢复" : "训练复盘";

  return (
    <div data-shell="result" className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-[720px] flex-col">
        <header className="flex h-[calc(var(--header-height)+env(safe-area-inset-top))] shrink-0 items-end px-4 pb-3 pt-[env(safe-area-inset-top)]">
          <button
            aria-label="返回上一页"
            className="tap-target inline-flex items-center justify-center rounded-full text-ink-soft transition hover:bg-surface-muted hover:text-ink"
            onClick={() => navigate(-1)}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.8} />
          </button>
          <div className="flex-1 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{eyebrow}</p>
            <h1 className="text-sm font-semibold text-ink">{title}</h1>
          </div>
          <div className="tap-target" aria-hidden="true" />
        </header>
        <main className="flex-1 px-4 pb-[calc(24px+var(--safe-bottom))] pt-3 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
