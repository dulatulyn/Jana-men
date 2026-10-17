import { HardHat, Package, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export function CourseCover({ cover, className, size = "md" }: { cover: string; className?: string; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "size-6" : "size-9";
  const icon = cover === "safety" ? <HardHat className={cls} strokeWidth={1.6} /> : cover === "onboarding" ? <Package className={cls} strokeWidth={1.6} /> : <BookOpen className={cls} strokeWidth={1.6} />;
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden",
        cover === "safety" ? "bg-[#fff2dc] text-[#b86e00]" : "bg-jm-mint text-jm-green",
        size === "sm" ? "size-12 rounded-2xl" : "h-[120px] rounded-[18px]",
        className,
      )}
    >
      <svg className="absolute inset-0 h-full w-full opacity-[0.18]" aria-hidden>
        <defs>
          <pattern id={`p-${cover}`} width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#p-${cover})`} />
      </svg>
      <span className="relative">{icon}</span>
    </div>
  );
}
