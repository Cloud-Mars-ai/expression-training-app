import { BookOpen, ChartNoAxesCombined, House, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/home", label: "首页", icon: House },
  { to: "/training", label: "训练", icon: BookOpen },
  { to: "/growth", label: "成长", icon: ChartNoAxesCombined },
  { to: "/me", label: "我的", icon: UserRound },
];

export function BottomTabBar() {
  return <nav aria-label="主导航" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[var(--safe-bottom)] backdrop-blur sm:sticky sm:bottom-0"><div className="mx-auto grid h-[var(--tabbar-height)] max-w-[1120px] grid-cols-4">{items.map(({ to, label, icon: Icon }) => <NavLink className={({ isActive }) => `flex min-h-[var(--tap-target)] flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${isActive ? "text-primary-strong" : "text-ink-muted hover:text-ink"}`} key={to} to={to}>{({ isActive }) => <><Icon aria-hidden="true" size={20} strokeWidth={isActive ? 2.3 : 1.8} /><span>{label}</span>{isActive && <span className="sr-only">，当前页面</span>}</>}</NavLink>)}</div></nav>;
}
