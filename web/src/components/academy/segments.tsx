import { cn } from "@/lib/utils";

export function Segments({ value, count = 5, className, tone = "green" }: { value: number; count?: number; className?: string; tone?: "green" | "white" }) {
  const per = 100 / count;
  return (
    <div className={cn("flex gap-1", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: count }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, (value - i * per) / per));
        return (
          <div key={i} className={cn("h-[6px] flex-1 overflow-hidden rounded-full", tone === "white" ? "bg-white/25" : "bg-[#e6ebe8]")}>
            <div className={cn("h-full rounded-full transition-[width] duration-700", tone === "white" ? "bg-white" : "bg-jm-green")} style={{ width: `${fill * 100}%` }} />
          </div>
        );
      })}
    </div>
  );
}
