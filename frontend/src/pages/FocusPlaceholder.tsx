import { CircleDot, Mic2, Timer } from "lucide-react";
import { PlaceholderPanel } from "../components/layout/PlaceholderPanel";

export function FocusPlaceholder() {
  return <div className="flex flex-1 flex-col"><div className="flex items-center justify-center gap-2 py-4 text-xs text-ink-muted"><span className="flex items-center gap-1 text-primary"><CircleDot size={13} /> 准备</span><span className="h-px w-8 bg-line" /><span className="flex items-center gap-1"><CircleDot size={13} /> 表达</span><span className="h-px w-8 bg-line" /><span className="flex items-center gap-1"><CircleDot size={13} /> 复盘</span></div><PlaceholderPanel eyebrow="Focus stage" title="专注训练布局已就绪" description="这里将承载准备、录音、提交和技术失败恢复状态。当前仅展示路由与深色 Shell。" icon={<><Timer size={18} /><Mic2 className="-ml-1" size={18} /></>} /></div>;
}
