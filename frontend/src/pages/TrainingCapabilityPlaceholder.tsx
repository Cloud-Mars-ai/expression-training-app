import { ArrowLeft, Layers3 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PlaceholderPanel } from "../components/layout/PlaceholderPanel";

export function TrainingCapabilityPlaceholder() {
  const { capability } = useParams();
  return <div className="page-container"><Link className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink" to="/training"><ArrowLeft size={17} /> 返回训练中心</Link><PlaceholderPanel eyebrow={`Capability · ${capability?.toUpperCase() ?? "LEVEL"}`} title="能力详情布局已就绪" description="后续会在这里接入筛选、练习卡片、推荐状态和开始训练操作。" icon={<Layers3 size={27} />} /></div>;
}
