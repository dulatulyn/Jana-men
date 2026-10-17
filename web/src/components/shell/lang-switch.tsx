"use client";

import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

export function LangSwitch({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  const { locale, setLocale, t } = useI18n();
  const opts = [
    { v: "ru", l: "RU" },
    { v: "kk", l: "KZ" },
  ] as const;
  return (
    <div role="group" aria-label={t.common.language} className={cn("flex items-center rounded-full bg-jm-page p-[3px]", size === "sm" ? "h-8" : "h-9", className)}>
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => setLocale(o.v)}
          aria-pressed={locale === o.v}
          className={cn(
            "h-full rounded-full font-semibold transition-colors",
            size === "sm" ? "px-2.5 text-[12px]" : "px-3 text-[12.5px]",
            locale === o.v ? "bg-white text-jm-green-strong shadow-[0_1px_2px_rgba(22,33,27,0.12)]" : "text-jm-muted hover:text-jm-ink",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
