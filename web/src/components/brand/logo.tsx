import { useId } from "react";
import { cn } from "@/lib/utils";

type Tone = "green" | "white";

export function LogoMark({ size = 32, tone = "green", className }: { size?: number; tone?: Tone; className?: string }) {
  const id = useId();
  const glyph = tone === "white" ? "#1b8918" : "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={cn("shrink-0", className)} aria-hidden focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#24a320" />
          <stop offset="1" stopColor="#167f14" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={tone === "white" ? "#ffffff" : `url(#${id})`} />
      <path fill={glyph} d="M12.6 30.5V16h4.4l6.4 9.4V16h4.2v14.5h-4.3l-6.5-9.5v9.5z" />
      <path fill={glyph} d="M18 13.4h2.6l3.6-4.4h-2.7z" />
    </svg>
  );
}

export function Logo({ tone = "green", size = 32, className }: { tone?: Tone; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)} role="img" aria-label="JanaMen">
      <LogoMark size={size} tone={tone} />
      <span
        className={cn("leading-none font-bold tracking-[-0.025em]", tone === "white" ? "text-white" : "text-jm-ink")}
        style={{ fontSize: Math.round(size * 0.53) }}
        aria-hidden
      >
        Jana<span className={tone === "white" ? "text-white/75" : "text-jm-green"}>Men</span>
      </span>
    </span>
  );
}
