import { cn } from "@/lib/utils";

export function Logo({ tone = "green", className }: { tone?: "green" | "white"; className?: string }) {
  const color = tone === "white" ? "text-white" : "text-jm-green";
  return (
    <span className={cn("inline-flex flex-col leading-none select-none", color, className)} aria-label="JanaMen">
      <span className="text-[1.45em] font-black tracking-[-0.045em]" aria-hidden>
        JAŃA
      </span>
      <span className="mt-[0.12em] pl-[0.08em] text-[0.5em] font-bold tracking-[0.32em]" aria-hidden>
        MEN
      </span>
    </span>
  );
}
