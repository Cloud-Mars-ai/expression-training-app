import { ArrowLeft, Bell, MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";

type PageHeaderProps = { eyebrow?: string; title: string; back?: boolean; action?: "notifications" | "more" };

export function PageHeader({ eyebrow = "YANXU · EXPRESS", title, back = false, action }: PageHeaderProps) {
  const navigate = useNavigate();
  return <header className="page-header">
    <div className="flex min-w-0 flex-1 items-end gap-3">
      {back && <button aria-label="返回上一页" className="tap-target shrink-0 rounded-full text-ink-soft hover:bg-surface-muted hover:text-ink" onClick={() => navigate(-1)} type="button"><ArrowLeft aria-hidden="true" size={20} /></button>}
      <div className="min-w-0"><p className="micro-label text-ink-muted">{eyebrow}</p><h1 className="mt-1 break-words text-xl font-bold leading-tight text-ink">{title}</h1></div>
    </div>
    {action === "notifications" && <button aria-label="通知" className="tap-target rounded-full text-ink-soft hover:bg-surface-muted hover:text-ink" type="button"><Bell aria-hidden="true" size={19} /></button>}
    {action === "more" && <button aria-label="更多操作" className="tap-target rounded-full text-ink-soft hover:bg-surface-muted hover:text-ink" type="button"><MoreHorizontal aria-hidden="true" size={20} /></button>}
  </header>;
}
