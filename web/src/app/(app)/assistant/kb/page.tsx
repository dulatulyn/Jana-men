"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, MessagesSquare, Search, ShieldCheck } from "lucide-react";
import { useKb } from "@/hooks/queries";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { groupByCategory, kbBody, readMinutes } from "@/lib/kb";
import { ErrorState, LoadingRows, Skeleton } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { Markdown } from "@/components/shared/markdown";
import { PageHeader } from "@/components/shell/page-header";

function KnowledgeBase() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const { data: kb, error } = useKb();
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const found = useMemo(() => (kb ?? []).filter((a) => !q || `${a.title}\n${a.body_md}`.toLowerCase().includes(q)), [kb, q]);
  const groups = useMemo(() => groupByCategory(found), [found]);
  const article = kb?.find((a) => a.slug === sp.get("a")) ?? found[0] ?? kb?.[0];
  const body = article ? kbBody(article) : "";
  const label = (c: string) => (t.assistant.kbCategories as Record<string, string>)[c] ?? c;

  const open = (slug: string) => {
    router.replace(`/assistant/kb?a=${encodeURIComponent(slug)}`, { scroll: false });
    if (window.matchMedia("(max-width: 1023px)").matches) document.getElementById("kb-article")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const ask = (
    <Btn size="sm" asChild>
      <Link href="/assistant">
        <MessagesSquare /> {t.assistant.kbAsk}
      </Link>
    </Btn>
  );

  return (
    <div className="stack">
      <PageHeader
        title={t.assistant.kbTitle}
        subtitle={kb ? t.assistant.kbSubtitle(kb.length) : undefined}
        back={{ href: "/assistant", label: t.assistant.title }}
        actions={ask}
      />
      {error ? (
        <ErrorState error={error} />
      ) : (
        <div className="grid-12 items-start">
          <div className="col-span-12 lg:sticky lg:top-[calc(var(--header-h)+var(--page-y))] lg:col-span-4">
            <div className="overflow-hidden rounded-[20px] bg-white">
              <div className="border-b border-jm-line p-3">
                <label className="flex h-11 items-center gap-2.5 rounded-full bg-[#f3f5f4] px-4 ring-1 ring-transparent transition-shadow focus-within:bg-white focus-within:ring-jm-light">
                  <Search className="size-4 shrink-0 text-jm-muted" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t.assistant.kbSearch}
                    aria-label={t.assistant.kbSearch}
                    className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-[#9aa49f]"
                  />
                </label>
              </div>
              <div className="py-1 lg:max-h-[calc(100dvh-var(--header-h)-var(--page-y)*2-70px)] lg:overflow-y-auto">
                {!kb ? (
                  <LoadingRows rows={5} />
                ) : groups.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[14px] text-jm-muted">{t.assistant.kbEmpty}</p>
                ) : (
                  groups.map(([cat, items]) => (
                    <div key={cat} className="border-b border-jm-line last:border-b-0">
                      <p className="px-5 pt-3 pb-1 text-[11.5px] font-semibold tracking-[0.06em] text-jm-muted uppercase">{label(cat)}</p>
                      {items.map((a) => {
                        const active = a.slug === article?.slug;
                        return (
                          <button
                            key={a.slug}
                            type="button"
                            onClick={() => open(a.slug)}
                            aria-current={active ? "true" : undefined}
                            className={cn(
                              "flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors",
                              active ? "bg-jm-mint text-jm-green-strong" : "hover:bg-[#f8faf9] hover:text-jm-green-strong",
                            )}
                          >
                            <BookOpen className={cn("size-4 shrink-0", active ? "text-jm-green" : "text-jm-green/75")} strokeWidth={1.9} />
                            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{a.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <article id="kb-article" className="col-span-12 scroll-mt-[calc(var(--header-h)+var(--page-y))] overflow-hidden rounded-[20px] bg-white lg:col-span-8">
            {!article ? (
              <div className="space-y-3 p-8">
                <Skeleton className="h-5 w-1/3 rounded-full" />
                <Skeleton className="h-8 w-2/3 rounded-full" />
                <Skeleton className="h-40 rounded-2xl" />
              </div>
            ) : (
              <>
                <header className="flex items-start gap-4 border-b border-jm-line px-6 py-5 sm:px-8 sm:py-6">
                  <span className="hidden size-12 shrink-0 place-items-center rounded-2xl bg-jm-mint text-jm-green sm:grid">
                    <BookOpen className="size-6" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-jm-muted">
                      <span className="rounded-full bg-jm-mint px-2.5 py-0.5 font-semibold text-jm-green-strong">{label(article.category)}</span>
                      <span>{t.assistant.readTime(readMinutes(body))}</span>
                      {article.updated_at && <span className="hidden sm:inline">· {t.assistant.updated(fmtDate(article.updated_at, locale))}</span>}
                    </div>
                    <h2 className="mt-2 text-[22px] leading-tight font-bold tracking-tight text-jm-ink sm:text-[26px]">{article.title}</h2>
                  </div>
                </header>
                <div className="px-6 py-6 sm:px-8 sm:py-7">
                  <Markdown source={body} className="max-w-[68ch] [&>:first-child]:mt-0 [&_h2]:mt-7 [&_h2]:text-[18px]" />
                </div>
                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-jm-line bg-[#fafbfa] px-6 py-3.5 sm:px-8">
                  <p className="flex min-w-0 items-center gap-2 text-[13px] text-jm-muted">
                    <ShieldCheck className="size-4 shrink-0 text-jm-green" />
                    <span>{t.assistant.articleFooter}</span>
                  </p>
                  {ask}
                </footer>
              </>
            )}
          </article>
        </div>
      )}
    </div>
  );
}

export default function KnowledgeBasePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[420px] rounded-[20px]" />}>
      <KnowledgeBase />
    </Suspense>
  );
}
