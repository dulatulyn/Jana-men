"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, BookOpen, CalendarDays, CircleHelp, Forward, Lock, RotateCcw, Wallet, WifiOff, Check } from "lucide-react";
import { api, API_MODE } from "@/lib/api";
import { escalateViaAi } from "@/lib/api/ai";
import type { AskResponse, AskSource, KbArticle } from "@/lib/api/types";
import { useI18n } from "@/i18n";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtRange, daysInclusive } from "@/lib/format";
import { Btn } from "@/components/shared/button";
import { Markdown } from "@/components/shared/markdown";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAssistant, type ChatMessage } from "./assistant-context";

function BotMark() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-jm-green text-[12px] font-black tracking-tight text-white" aria-hidden>
      Ń
    </span>
  );
}

export function prefillHref(action: NonNullable<AskResponse["action"]>) {
  const r = action.request;
  const q = new URLSearchParams({ type: r.type, from: "assistant" });
  if (r.type === "vacation") {
    if (r.payload.start_date) q.set("start", r.payload.start_date);
    if (r.payload.end_date) q.set("end", r.payload.end_date);
    if (r.payload.comment) q.set("comment", r.payload.comment);
  } else {
    if (r.payload.amount) q.set("amount", String(r.payload.amount));
    if (r.payload.reason) q.set("reason", r.payload.reason);
  }
  return `/requests/new?${q.toString()}`;
}

function ActionCard({ action, onOpen }: { action: NonNullable<AskResponse["action"]>; onOpen: () => void }) {
  const { t, locale } = useI18n();
  const r = action.request;
  let detail = "";
  if (r.type === "vacation" && r.payload.start_date && r.payload.end_date) {
    detail = `${fmtRange(r.payload.start_date, r.payload.end_date, locale)} · ${t.common.days(daysInclusive(r.payload.start_date, r.payload.end_date))}`;
  } else if (r.type === "advance" && r.payload.amount) {
    detail = fmtMoney(r.payload.amount);
  }
  const Icon = r.type === "vacation" ? CalendarDays : Wallet;
  return (
    <div className="mt-3 rounded-[18px] border border-jm-light/50 bg-jm-mint/60 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white">
          <Icon className="size-5 text-jm-green" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-jm-green-strong">{t.assistant.prefillTitle}</p>
          <p className="mt-0.5 text-[14px] text-jm-ink/75">
            {t.requestTypeLong[r.type]}
            {detail && ` · ${detail}`}
          </p>
        </div>
      </div>
      <Btn size="sm" className="mt-3 w-full sm:w-auto" onClick={onOpen}>
        {t.assistant.prefillOpen}
      </Btn>
    </div>
  );
}

function SourceChips({ sources, onOpen }: { sources: AskSource[]; onOpen: (s: AskSource) => void }) {
  const { t } = useI18n();
  if (!sources.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[12px] font-medium text-jm-muted">{t.assistant.sources}:</span>
      {sources.map((s) => (
        <button
          key={s.slug}
          onClick={() => onOpen(s)}
          className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-jm-mint px-3 text-[12.5px] font-semibold text-jm-green-strong transition-colors hover:bg-[#cdf3de]"
        >
          <BookOpen className="size-3.5 shrink-0" />
          <span className="truncate">{s.title}</span>
        </button>
      ))}
    </div>
  );
}

function AssistantBubble({ m, onSource, onClose }: { m: ChatMessage; onSource: (s: AskSource) => void; onClose?: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const { invalidate } = useSession();
  const { markEscalated } = useAssistant();
  const [busy, setBusy] = useState(false);
  const r = m.response;

  if (m.failed) {
    return (
      <div className="flex max-w-[620px] items-start gap-3 rounded-[20px] bg-[#f1f3f2] px-4 py-3.5 text-[14.5px] text-jm-ink/80">
        <WifiOff className="mt-0.5 size-[18px] shrink-0 text-jm-muted" />
        <p>{m.text}</p>
      </div>
    );
  }
  if (!r) return null;

  const calm = r.status !== "answered";
  const escalate = async () => {
    setBusy(true);
    const ok = await escalateViaAi(r.log_id);
    try {
      if (API_MODE === "mock") await api.escalate(r.log_id ?? 0, m.question);
      else if (!ok) await api.escalate(r.log_id ?? 0);
      markEscalated(m.id);
      invalidate();
      toast.success(t.assistant.escalated);
    } catch {
      toast.error(t.common.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("max-w-[620px] rounded-[20px] px-4 py-3.5 sm:px-5 sm:py-4", calm ? "border border-dashed border-[#cfd6d2] bg-[#f8f9f8]" : "bg-white")}>
      {calm && (
        <p className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-jm-muted">
          {r.status === "refused" ? <Lock className="size-4" /> : <CircleHelp className="size-4" />}
          {r.status === "refused" ? t.assistant.refusedTitle : t.assistant.noAnswerTitle}
        </p>
      )}
      <Markdown breaks source={r.answer} className="[&_p]:my-1.5 [&_p]:text-[15px] [&_ul]:my-2 [&_ol]:my-2" />
      <SourceChips sources={r.sources} onOpen={onSource} />
      {r.action && (
        <ActionCard
          action={r.action}
          onOpen={() => {
            onClose?.();
            router.push(prefillHref(r.action!));
          }}
        />
      )}
      {(r.status === "no_answer" || (calm && r.can_escalate)) && (
        <div className="mt-3">
          {m.escalated ? (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-jm-mint px-4 text-[14px] font-semibold text-jm-green-strong">
              <Check className="size-4" /> {t.assistant.escalatedLabel}
            </span>
          ) : (
            <Btn size="sm" onClick={escalate} disabled={busy}>
              <Forward /> {t.assistant.escalate}
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}

function ArticleSheet({ source, onClose }: { source: AskSource | null; onClose: () => void }) {
  const { t } = useI18n();
  const [articles, setArticles] = useState<KbArticle[] | null>(null);
  useEffect(() => {
    if (!source || articles) return;
    api.kb().then(setArticles).catch(() => setArticles([]));
  }, [source, articles]);
  const a = articles?.find((x) => x.slug === source?.slug);
  return (
    <Sheet open={!!source} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto border-0 p-0 sm:max-w-[520px]">
        <div className="border-b border-jm-line px-6 pt-6 pb-4">
          <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-jm-green uppercase">
            <BookOpen className="size-3.5" /> {t.assistant.article}
          </p>
          <SheetTitle className="pr-8 text-[20px] leading-tight font-bold tracking-tight text-jm-ink">{source?.title}</SheetTitle>
          <SheetDescription className="mt-1 font-mono text-[12px] text-jm-muted">{source?.slug}</SheetDescription>
        </div>
        <div className="px-6 py-4">
          {a ? (
            <Markdown source={a.body_md.replace(/^#\s.*\n/, "")} />
          ) : articles ? (
            <p className="text-[14px] text-jm-muted">{t.assistant.sourceNoBody}</p>
          ) : (
            <div className="h-40 animate-pulse rounded-2xl bg-[#eef1ef]" />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Chat({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const { me } = useSession();
  const { messages, pending, send, reset } = useAssistant();
  const [text, setText] = useState("");
  const [source, setSource] = useState<AskSource | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  const submit = (q?: string) => {
    const v = (q ?? text).trim();
    if (!v) return;
    setText("");
    void send(v);
    inputRef.current?.focus();
  };

  const empty = messages.length === 0;

  return (
    <div className={cn("flex min-h-0 flex-col", compact ? "h-full" : "h-[calc(100dvh-64px-96px-env(safe-area-inset-bottom))] lg:h-[calc(100dvh-76px-48px)]")}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className={cn("flex flex-col", compact ? "px-5 pt-6" : "min-h-full pt-4 sm:justify-center sm:pt-0 sm:pb-16")}>
            <div className="mb-6 flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-full bg-jm-green text-[18px] font-black text-white">Ń</span>
              <div>
                <p className="text-[19px] font-bold tracking-tight">{t.assistant.title}</p>
                <p className="text-[14px] text-jm-muted">{t.assistant.subtitle}</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {t.assistant.starters.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="rounded-[18px] border border-transparent bg-white px-4 py-3.5 text-left text-[15px] font-medium transition-colors hover:border-jm-light/60 hover:text-jm-green-strong"
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-5 flex items-center gap-2 text-[13px] text-jm-muted">
              <Lock className="size-3.5" /> {t.assistant.disclaimer}
            </p>
          </div>
        ) : (
          <div className={cn("space-y-4 pb-4", compact ? "px-4 pt-4" : "pt-2")}>
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[80%] rounded-[20px] rounded-br-md bg-jm-green px-4 py-2.5 text-[15px] leading-snug whitespace-pre-wrap text-white">{m.text}</p>
                </div>
              ) : (
                <div key={m.id} className="flex items-start gap-2.5">
                  <BotMark />
                  <AssistantBubble m={m} onSource={setSource} onClose={onNavigate} />
                </div>
              ),
            )}
            {pending && (
              <div className="flex items-center gap-2.5">
                <BotMark />
                <div className="flex items-center gap-2 rounded-[20px] bg-white px-4 py-3 text-[14px] text-jm-muted">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="size-1.5 animate-bounce rounded-full bg-jm-light" style={{ animationDelay: `${i * 120}ms` }} />
                    ))}
                  </span>
                  {t.assistant.thinking}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className={cn("shrink-0 pt-2", compact ? "border-t border-jm-line bg-white px-4 pb-4" : "pb-1")}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className={cn("flex items-end gap-2 rounded-[26px] bg-white p-1.5 pl-5 ring-1 ring-transparent focus-within:ring-jm-light", compact && "bg-[#f4f6f5]")}
        >
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={t.assistant.placeholder}
            aria-label={t.assistant.placeholder}
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-[#9aa49f] [field-sizing:content]"
          />
          <button
            type="submit"
            disabled={!text.trim() || pending}
            aria-label={t.assistant.send}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-jm-green text-white transition-colors hover:bg-jm-green-strong disabled:bg-[#cfe3cf]"
          >
            <ArrowUp className="size-5" strokeWidth={2.4} />
          </button>
        </form>
        {!empty && (
          <button onClick={reset} className="mx-auto mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-jm-muted hover:text-jm-green">
            <RotateCcw className="size-3.5" /> {t.assistant.newChat}
          </button>
        )}
      </div>
      <ArticleSheet source={source} onClose={() => setSource(null)} />
      <span className="sr-only">{me?.full_name}</span>
    </div>
  );
}
