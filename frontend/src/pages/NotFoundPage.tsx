import { Compass, Home, MoveLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return <main className="flex min-h-screen items-center justify-center bg-canvas px-6 text-center text-ink"><div className="max-w-sm"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-surface-muted text-ink-soft"><Compass size={27} /></div><p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">404 · NOT FOUND</p><h1 className="mt-2 text-3xl font-bold">这页还没有准备好</h1><p className="mt-3 text-sm leading-6 text-ink-soft">地址可能已经变化，回到首页继续今天的练习。</p><Link className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white transition hover:bg-primary-strong" to="/home"><Home size={17} /> 返回首页</Link><button className="mx-auto mt-3 flex h-11 items-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink" onClick={() => window.history.back()} type="button"><MoveLeft size={16} /> 返回上一页</button></div></main>;
}
