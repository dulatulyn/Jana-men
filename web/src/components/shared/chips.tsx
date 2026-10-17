"use client";

import { cn } from "@/lib/utils";

export function Chips<T extends string>({
  value,
  options,
  onChange,
  surface = "page",
  label,
  className,
}: {
  value: T;
  options: { v: T; label: string; n?: number }[];
  onChange: (v: T) => void;
  surface?: "page" | "card";
  label?: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("scrollbar-none flex gap-1.5 overflow-x-auto", className)}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          aria-pressed={value === o.v}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
            value === o.v ? "bg-jm-ink text-white" : surface === "card" ? "bg-jm-page text-jm-ink/75 hover:text-jm-ink" : "bg-white text-jm-ink/75 hover:text-jm-ink",
          )}
        >
          {o.label}
          {o.n !== undefined && <span className={cn("tabular text-[12px]", value === o.v ? "text-white/70" : "text-jm-muted")}>{o.n}</span>}
        </button>
      ))}
    </div>
  );
}
