"use client";

import { useMemo, useState } from "react";
import { BookOpen, ChevronRight, Forward, Library, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { useKb } from "@/hooks/queries";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { LoadingRows, Panel } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { PageHeader } from "@/components/shell/page-header";
import { ArticleDialog, Chat } from "@/components/assistant/chat";
import { useAssistant } from "@/components/assistant/assistant-context";

export default function AssistantPage() {
  const { t } = useI18n();
  const { me } = useSession();
  const { messages, reset } = useAssistant();
  const { data: kb } = useKb();
  const [open, setOpen] = useState<string | null>(null);
  const talking = messages.length > 0;

  const groups = useMemo(() => {
    const map = new Map<string, { slug: string; title: string }[]>();
    for (const a of kb ?? []) {
      const list = map.get(a.category) ?? [];
      list.push({ slug: a.slug, title: a.title });
      map.set(a.category, list);
    }
    return [...map.entries()];
  }, [kb]);

  const label = (c: string) => (t.assistant.kbCategories as Record<string, string>)[c] ?? c;
  const caps = [
    { icon: BookOpen, text: t.assistant.capAnswer },
    { icon: Sparkles, text: t.assistant.capPrefill },
    { icon: me?.role === "hr" ? ShieldCheck : Forward, text: me?.role === "hr" ? t.assistant.capHr : t.assistant.capEscalate },
  ];

  return (
    <div className="stack">
      <PageHeader
        title={t.assistant.title}
        subtitle={t.assistant.subtitle}
        inlineSubtitle={false}
        actions={
          talking ? (
            <Btn variant="outline" size="sm" onClick={reset}>
              <RotateCcw /> {t.assistant.newChat}
            </Btn>
          ) : undefined
        }
      />
      <div className="grid-12 items-start">
        <div className="col-span-12 lg:col-span-8">
          <Chat />
        </div>
        <aside
          className={cn(
            "col-span-12 hidden flex-col gap-(--gutter) lg:col-span-4 lg:flex",
            talking && "lg:h-[calc(100dvh-var(--header-h)-var(--page-y)*2)]",
          )}
        >
          <Panel title={t.assistant.kbTitle} icon={Library} count={kb?.length} className="min-h-0 flex-1" bodyClassName="overflow-y-auto">
            {!kb ? (
              <LoadingRows rows={4} />
            ) : (
              groups.map(([cat, items]) => (
                <div key={cat} className="border-b border-jm-line last:border-b-0">
                  <p className="px-5 pt-3 pb-1 text-[11.5px] font-semibold tracking-[0.06em] text-jm-muted uppercase">{label(cat)}</p>
                  {items.map((a) => (
                    <button
                      key={a.slug}
                      type="button"
                      onClick={() => setOpen(a.slug)}
                      className="group flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-[#f8faf9]"
                    >
                      <BookOpen className="size-4 shrink-0 text-jm-green" strokeWidth={1.9} />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium group-hover:text-jm-green-strong">{a.title}</span>
                      <ChevronRight className="size-4 shrink-0 text-[#b6bdb9]" />
                    </button>
                  ))}
                </div>
              ))
            )}
          </Panel>
          <div className="rounded-[20px] bg-white p-5">
            <p className="text-[14px] font-semibold">{t.assistant.capsTitle}</p>
            <ul className="mt-3 space-y-3">
              {caps.map((c, i) => (
                <li key={i} className="flex items-start gap-3 text-[13.5px] leading-snug text-jm-ink/80">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-jm-mint text-jm-green">
                    <c.icon className="size-4" strokeWidth={1.9} />
                  </span>
                  <span className="pt-1.5">{c.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
      <ArticleDialog slug={open} onClose={() => setOpen(null)} />
    </div>
  );
}
