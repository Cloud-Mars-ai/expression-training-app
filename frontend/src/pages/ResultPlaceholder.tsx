import { CheckCircle2, ListChecks } from "lucide-react";
import { PlaceholderPanel } from "../components/layout/PlaceholderPanel";

export function ResultPlaceholder() {
  return <div className="flex flex-1 flex-col"><div className="surface-panel"><div className="flex items-center gap-3"><CheckCircle2 className="text-success" size={22} /><div><p className="micro-label text-success">RESULT · 结果</p><h2 className="mt-1 font-bold">你的复盘会显示在这里</h2></div></div></div><PlaceholderPanel eyebrow="Result shell" title="结果页布局已就绪" description="后续会在此接入评分、证据引用、优先改进建议和聚焦重练操作。" icon={<ListChecks size={27} />} /></div>;
}
