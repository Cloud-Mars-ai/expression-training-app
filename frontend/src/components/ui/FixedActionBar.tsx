import type { ReactNode } from "react";
type FixedActionBarProps = { secondary: ReactNode; primary: ReactNode };
export function FixedActionBar({ secondary, primary }: FixedActionBarProps) { return <div className="fixed-action-bar"><div className="mx-auto grid w-full max-w-[720px] grid-cols-2 gap-3">{secondary}{primary}</div></div>; }
