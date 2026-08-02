import { Check } from "lucide-react";

type Chip = { key: string; label: string };
type ChipRowProps = { label?: string; chips: readonly Chip[]; value: string; onChange: (key: string) => void };
export function ChipRow({ label, chips, value, onChange }: ChipRowProps) {
  return <div className="chip-row" aria-label={label}><div className="chip-row-scroll">{chips.map((chip) => { const selected = chip.key === value; return <button aria-pressed={selected} className={`chip ${selected ? "chip-active" : ""}`} key={chip.key} onClick={() => onChange(chip.key)} type="button"><span aria-hidden="true" className="inline-flex w-3.5 justify-center">{selected && <Check size={14} strokeWidth={2.5} />}</span>{chip.label}</button>; })}</div></div>;
}
