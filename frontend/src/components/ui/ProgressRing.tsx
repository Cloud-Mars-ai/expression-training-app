type ProgressRingProps = { value: number; label?: string; size?: number; tone?: "primary" | "success" };
export function ProgressRing({ value, label = "完成度", size = 92, tone = "primary" }: ProgressRingProps) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - Math.min(100, Math.max(0, value)) / 100 * circumference;
  return <div aria-label={`${label} ${value}%`} className="progress-ring" role="img" style={{ height: size, width: size }}><svg aria-hidden="true" className="-rotate-90" height={size} viewBox="0 0 100 100" width={size}><circle className="fill-none stroke-surface-muted" cx="50" cy="50" r={radius} strokeWidth="6" /><circle className={`fill-none ${tone === "success" ? "stroke-success" : "stroke-primary"}`} cx="50" cy="50" r={radius} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" strokeWidth="6" /></svg><div className="absolute inset-0 flex flex-col items-center justify-center"><strong className="text-xl font-bold leading-none">{value}%</strong><span className="mt-1 text-[10px] text-ink-muted">{label}</span></div></div>;
}
