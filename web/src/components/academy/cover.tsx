import Image from "next/image";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const COVERS: Record<string, string> = {
  onboarding: "/covers/onboarding.svg",
  safety: "/covers/safety.svg",
  service: "/covers/service.svg",
};

export function CourseCover({ cover, className, size = "md" }: { cover: string; className?: string; size?: "sm" | "md" }) {
  const src = COVERS[cover];
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-jm-mint text-jm-green",
        size === "sm" ? "size-12 rounded-2xl" : "h-[120px] rounded-[16px]",
        className,
      )}
    >
      {src ? (
        <Image src={src} alt="" aria-hidden fill unoptimized sizes={size === "sm" ? "48px" : "(min-width: 1024px) 480px, 100vw"} className="object-cover" />
      ) : (
        <BookOpen className={size === "sm" ? "size-6" : "size-9"} strokeWidth={1.6} />
      )}
    </div>
  );
}
