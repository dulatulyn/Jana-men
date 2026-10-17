"use client";

import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

export function LangSwitch({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  const opts = [
    { v: "ru", l: "RU" },
    { v: "kk", l: "KZ" },
  ] as const;
  return (
    <div role="group" aria-label="Язык / Тіл" className={cn("flex h-10 items-center rounded-full bg-white p-1", className)}>
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => setLocale(o.v)}
          aria-pressed={locale === o.v}
          className={cn(
            "h-8 rounded-full px-3 text-[13px] font-semibold transition-colors",
            locale === o.v ? "bg-jm-green text-white" : "text-jm-muted hover:text-jm-ink",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
