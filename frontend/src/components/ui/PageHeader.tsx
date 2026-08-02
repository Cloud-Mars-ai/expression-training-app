import { ArrowLeft, Bell, MoreHorizontal, Palette } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../theme";

type PageHeaderProps = { eyebrow?: string; title: string; back?: boolean; action?: "notifications" | "more" };

export function PageHeader({ eyebrow = "YANXU · EXPRESS", title, back = false, action }: PageHeaderProps) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  return <header className="page-header">
    <div className="flex min-w-0 flex-1 items-end gap-3">
      {back && <button aria-label="返回上一页" className="tap-target shrink-0 rounded-full text-ink-soft hover:bg-surface-muted hover:text-ink" onClick={() => navigate(-1)} type="button"><ArrowLeft aria-hidden="true" size={20} /></button>}
      <div className="min-w-0"><p className="micro-label text-ink-muted">{eyebrow}</p><h1 className="mt-1 break-words text-xl font-bold leading-tight text-ink">{title}</h1></div>
    </div>
    <button aria-label={`切换到${theme === "light" ? "淡黄色莫兰迪" : "白色浅色"}主题`} className="tap-target rounded-full text-ink-soft hover:bg-surface-muted hover:text-ink" onClick={toggleTheme} title="切换主题" type="button"><Palette aria-hidden="true" size={19} /></button>
    {action === "notifications" && <button aria-label="通知" className="tap-target rounded-full text-ink-soft hover:bg-surface-muted hover:text-ink" type="button"><Bell aria-hidden="true" size={19} /></button>}
    {action === "more" && <button aria-label="更多操作" className="tap-target rounded-full text-ink-soft hover:bg-surface-muted hover:text-ink" type="button"><MoreHorizontal aria-hidden="true" size={20} /></button>}
  </header>;
}
