import { Check } from "lucide-react";

const stages = [
  { key: "prepare", label: "准备" },
  { key: "record", label: "表达" },
  { key: "processing", label: "分析" },
] as const;

export function FocusStageStepper({ current }: { current: "prepare" | "record" | "processing" }) {
  const currentIndex = stages.findIndex((stage) => stage.key === current);
  return <ol aria-label="训练进度" className="focus-stepper">{stages.map((stage, index) => <li className={`focus-step ${index === currentIndex ? "focus-step-active" : ""} ${index < currentIndex ? "focus-step-complete" : ""}`} key={stage.key}><span className="focus-step-dot">{index < currentIndex ? <Check aria-hidden="true" size={12} /> : index + 1}</span><span>{stage.label}</span>{index < stages.length - 1 && <i aria-hidden="true" />}</li>)}</ol>;
}
