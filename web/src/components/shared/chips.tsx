"use client";

import { cn } from "@/lib/utils";

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string; n?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          aria-pressed={value === o.v}
          className={cn(
            "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold transition-colors",
            value === o.v ? "bg-jm-ink text-white" : "bg-white text-jm-ink/75 hover:text-jm-ink",
          )}
        >
          {o.label}
          {o.n !== undefined && <span className={cn("tabular text-[12px]", value === o.v ? "text-white/70" : "text-jm-muted")}>{o.n}</span>}
        </button>
      ))}
    </div>
  );
}

