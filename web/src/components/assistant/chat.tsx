"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, BookOpen, CalendarDays, Check, CircleHelp, Forward, Library, Loader2, Lock, RotateCcw, ShieldCheck, Wallet, WifiOff, X } from "lucide-react";
import { isApiError } from "@/lib/api";
import { escalateQuestion } from "@/lib/api/ai";
import type { AskSource, PrefillAction } from "@/lib/api/types";
import { useKb } from "@/hooks/queries";
import { useI18n } from "@/i18n";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { daysInclusive, fmtDate, fmtMoney, fmtRange } from "@/lib/format";
import { kbBody, readMinutes } from "@/lib/kb";
import { Btn } from "@/components/shared/button";
import { Markdown } from "@/components/shared/markdown";
import { LogoMark } from "@/components/brand/logo";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAssistant, type ChatMessage } from "./assistant-context";

export function prefillHref(action: PrefillAction) {
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

function ActionCard({ action, onOpen }: { action: PrefillAction; onOpen: () => void }) {
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
    <div className="mt-3 flex flex-col gap-3 rounded-[18px] border border-jm-light/50 bg-jm-mint/60 p-4 @[460px]:flex-row @[460px]:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white">
          <Icon className="size-5 text-jm-green" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="text-[14.5px] font-semibold text-jm-green-strong">{t.assistant.prefillTitle}</p>
          <p className="mt-0.5 text-[13.5px] text-jm-ink/75">
            {t.requestTypeLong[r.type]}
            {detail && ` · ${detail}`}
          </p>
        </div>
      </div>
      <Btn size="sm" onClick={onOpen} className="self-start @[460px]:self-auto">
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
          type="button"
          onClick={() => onOpen(s)}
          disabled={s.slug === "profile"}
          className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-jm-mint px-3 text-[12.5px] font-semibold text-jm-green-strong transition-colors hover:bg-[#cdf3de] disabled:cursor-default disabled:hover:bg-jm-mint"
        >
          <BookOpen className="size-3.5 shrink-0" />
          <span className="truncate">{s.title}</span>
        </button>
      ))}
    </div>
  );
}

type Tone = "page" | "dock";

function Thinking({ tone }: { tone: Tone }) {
  const { t } = useI18n();
  return (
    <div className={cn("flex items-center gap-2.5 rounded-[20px] px-4 py-3 text-[14px] text-jm-muted", tone === "page" ? "bg-white" : "bg-[#f4f6f5]")} role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-dot rounded-full bg-jm-green" style={{ animationDelay: `${i * 160}ms` }} />
        ))}
      </span>
      {t.assistant.thinking}
    </div>
  );
}

const Caret = () => <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-caret rounded-full bg-jm-green" aria-hidden />;

function AssistantBubble({ m, onSource, onNavigate, tone }: { m: ChatMessage; onSource: (s: AskSource) => void; onNavigate?: () => void; tone: Tone }) {
  const { t } = useI18n();
  const router = useRouter();
  const { me, invalidate } = useSession();
  const { markEscalated } = useAssistant();
  const [busy, setBusy] = useState(false);

  if (m.phase === "thinking") return <Thinking tone={tone} />;
  if (m.phase === "failed") {
    return (
      <div className="flex items-start gap-3 rounded-[20px] bg-[#f1f3f2] px-4 py-3.5 text-[14.5px] text-jm-ink/80">
        <WifiOff className="mt-0.5 size-[18px] shrink-0 text-jm-muted" />
        <p>{m.text}</p>
      </div>
    );
  }

  const meta = m.meta;
  const streaming = m.phase === "streaming";
  const calm = !!meta && meta.status !== "answered";
  const canEscalate = !!meta && me?.role !== "hr" && !!meta.log_id && (meta.status === "no_answer" || (calm && meta.can_escalate));

  const escalate = async () => {
    if (!meta?.log_id) return;
    setBusy(true);
    try {
      await escalateQuestion(meta.log_id);
      markEscalated(m.id);
      invalidate();
      toast.success(t.assistant.escalated);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : t.common.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn("min-w-0 rounded-[20px] px-4 py-3.5 sm:px-5 sm:py-4", calm ? "border border-dashed border-[#cfd6d2] bg-[#f8f9f8]" : tone === "page" ? "bg-white" : "bg-[#f4f6f5]")}
      aria-live={streaming ? "polite" : undefined}
      aria-busy={streaming}
    >
      {calm && (
        <p className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-jm-muted">
          {meta.status === "refused" ? <Lock className="size-4" /> : <CircleHelp className="size-4" />}
          {meta.status === "refused" ? t.assistant.refusedTitle : t.assistant.noAnswerTitle}
        </p>
      )}
      <Markdown breaks source={m.text} tail={streaming ? <Caret /> : null} className="[&_ol]:my-2 [&_p]:my-1.5 [&_p]:text-[15px] [&_ul]:my-2" />
      {m.phase === "done" && (
        <div className="animate-fade-up">
          {m.interrupted && <p className="mt-2 text-[12.5px] text-jm-amber">{t.assistant.interrupted}</p>}
          {meta && <SourceChips sources={meta.sources} onOpen={onSource} />}
          {meta?.action && (
            <ActionCard
              action={meta.action}
              onOpen={() => {
                onNavigate?.();
                router.push(prefillHref(meta.action!));
              }}
            />
          )}
          {canEscalate && (
            <div className="mt-3">
              {m.escalated ? (
                <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-jm-mint px-4 text-[14px] font-semibold text-jm-green-strong">
                  <Check className="size-4" /> {t.assistant.escalatedLabel}
                </span>
              ) : (
                <Btn size="sm" onClick={escalate} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Forward />} {t.assistant.escalate}
                </Btn>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ArticleDialog({ slug, title, onClose }: { slug: string | null; title?: string; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { data: articles } = useKb();
  const a = articles?.find((x) => x.slug === slug);
  const body = a ? kbBody(a) : "";
  const minutes = readMinutes(body);
  const category = a ? (t.assistant.kbCategories as Record<string, string>)[a.category] ?? a.category : null;
  return (
    <Dialog open={!!slug} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-[#0d2414]/35 supports-backdrop-filter:backdrop-blur-none"
        className="flex max-h-[min(860px,calc(100dvh-2rem))] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden rounded-[28px] bg-white p-0 text-jm-ink shadow-[0_32px_90px_-24px_rgba(13,36,20,0.45)] ring-0 sm:max-w-[720px]"
      >
        <header className="flex items-start gap-4 border-b border-jm-line px-6 py-5 sm:px-8 sm:py-6">
          <span className="hidden size-12 shrink-0 place-items-center rounded-2xl bg-jm-mint text-jm-green sm:grid">
            <BookOpen className="size-6" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-jm-muted">
              <span className="rounded-full bg-jm-mint px-2.5 py-0.5 font-semibold text-jm-green-strong">{category ?? t.assistant.article}</span>
              {a && <span>{t.assistant.readTime(minutes)}</span>}
              {a?.updated_at && <span className="hidden sm:inline">· {t.assistant.updated(fmtDate(a.updated_at, locale))}</span>}
            </div>
            <DialogTitle className="mt-2 text-[22px] leading-tight font-bold tracking-tight text-jm-ink sm:text-[26px]">{a?.title ?? title}</DialogTitle>
            <DialogDescription className="sr-only">{t.assistant.article}</DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              aria-label={t.common.close}
              className="-mt-1 -mr-2 grid size-10 shrink-0 place-items-center rounded-full text-jm-muted transition-colors hover:bg-[#f1f4f2] hover:text-jm-ink"
            >
              <X className="size-5" />
            </button>
          </DialogClose>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-7">
          {a ? (
            <Markdown source={body} className="max-w-[66ch] [&>:first-child]:mt-0 [&_h2]:mt-7 [&_h2]:text-[18px]" />
          ) : articles ? (
            <p className="text-[15px] text-jm-muted">{t.assistant.sourceNoBody}</p>
          ) : (
            <div className="space-y-3">
              <div className="h-5 w-1/3 animate-pulse rounded-full bg-[#eef1ef]" />
              <div className="h-24 animate-pulse rounded-2xl bg-[#eef1ef]" />
              <div className="h-24 animate-pulse rounded-2xl bg-[#eef1ef]" />
            </div>
          )}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-jm-line bg-[#fafbfa] px-6 py-3.5 sm:px-8">
          <p className="flex min-w-0 items-center gap-2 text-[13px] text-jm-muted">
            <ShieldCheck className="size-4 shrink-0 text-jm-green" />
            <span className="truncate">{t.assistant.articleFooter}</span>
          </p>
          <Btn size="sm" variant="outline" onClick={onClose}>
            {t.common.close}
          </Btn>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function Composer({ big, onSend, disabled, surface = "gray" }: { big?: boolean; onSend: (v: string) => void; disabled: boolean; surface?: "gray" | "white" }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const submit = () => {
    const v = text.trim();
    if (!v || disabled) return;
    setText("");
    onSend(v);
    ref.current?.focus();
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn(
        "flex items-end gap-2 p-1.5 pl-5 ring-1 ring-transparent transition-shadow focus-within:ring-jm-light",
        surface === "white" ? "rounded-[26px] bg-white" : "rounded-[24px] bg-[#f3f5f4] focus-within:bg-white",
        big && "p-2 pl-5",
      )}
    >
      <textarea
        ref={ref}
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
        className={cn("max-h-36 flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-[#9aa49f] [field-sizing:content]", big ? "min-h-11" : "min-h-10")}
      />
      <button
        type="submit"
        disabled={!text.trim() || disabled}
        aria-label={t.assistant.send}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-jm-green text-white transition-colors hover:bg-jm-green-strong disabled:bg-[#cfe3cf]",
          big ? "size-11" : "size-10",
        )}
      >
        <ArrowUp className="size-5" strokeWidth={2.4} />
      </button>
    </form>
  );
}

function Starters({ onPick, compact }: { onPick: (q: string) => void; compact?: boolean }) {
  const { t } = useI18n();
  if (!compact) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {t.assistant.starters.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-[18px] border border-transparent bg-white px-4 py-3.5 text-left text-[15px] font-medium transition-colors hover:border-jm-light/60 hover:text-jm-green-strong"
          >
            {s}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      {t.assistant.starters.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className="flex items-center justify-between gap-3 rounded-2xl border border-jm-line bg-white px-4 py-3 text-left text-[14.5px] font-medium transition-colors hover:border-jm-light hover:text-jm-green-strong"
        >
          {s}
          <ArrowUp className="size-4 shrink-0 rotate-45 text-[#b6bdb9]" />
        </button>
      ))}
    </div>
  );
}

function Welcome({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3.5">
      <LogoMark size={compact ? 40 : 48} />
      <div className="min-w-0">
        <p className={cn("font-bold tracking-tight", compact ? "text-[17px]" : "text-[20px]")}>{t.assistant.welcome}</p>
        <p className="text-[14px] text-jm-muted">{t.assistant.subtitle}</p>
      </div>
    </div>
  );
}

function Messages({ onSource, onNavigate, className, tone }: { onSource: (s: AskSource) => void; onNavigate?: () => void; className?: string; tone: Tone }) {
  const { messages } = useAssistant();
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const last = messages[messages.length - 1];

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (stick.current || last?.role === "user") el.scrollTop = el.scrollHeight;
  }, [messages, last]);

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
      }}
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", className)}
    >
      <div className="mx-auto max-w-[760px] space-y-5">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex animate-fade-up justify-end">
              <p className="max-w-[82%] rounded-[20px] rounded-br-md bg-jm-green px-4 py-2.5 text-[15px] leading-snug whitespace-pre-wrap text-white">{m.text}</p>
            </div>
          ) : (
            <div key={m.id} className="flex animate-fade-up items-start gap-3">
              <LogoMark size={30} className="mt-0.5" />
              <div className="@container min-w-0 max-w-[640px] flex-1">
                <AssistantBubble m={m} onSource={onSource} onNavigate={onNavigate} tone={tone} />
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function Chat({ variant = "page", onNavigate }: { variant?: "page" | "dock"; onNavigate?: () => void }) {
  const { t } = useI18n();
  const { messages, pending, send, reset } = useAssistant();
  const [source, setSource] = useState<AskSource | null>(null);
  const empty = messages.length === 0;

  const sheet = <ArticleDialog slug={source?.slug ?? null} title={source?.title} onClose={() => setSource(null)} />;
  const disclaimer = (
    <p className="flex items-center gap-2 text-[12.5px] text-jm-muted">
      <Lock className="size-3.5 shrink-0" /> {t.assistant.disclaimer}
    </p>
  );

  if (variant === "dock") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {empty ? (
          <div className="flex-1 space-y-5 overflow-y-auto px-5 pt-6 pb-4">
            <Welcome compact />
            <Starters onPick={(q) => void send(q)} compact />
            {disclaimer}
          </div>
        ) : (
          <Messages tone="dock" onSource={setSource} onNavigate={onNavigate} className="px-4 py-5" />
        )}
        <div className="shrink-0 border-t border-jm-line bg-white p-3">
          <Composer onSend={(v) => void send(v)} disabled={pending} />
          <Link
            href="/assistant/kb"
            onClick={onNavigate}
            className="mx-auto mt-2 flex w-fit items-center gap-1.5 text-[12.5px] font-medium text-jm-muted transition-colors hover:text-jm-green"
          >
            <Library className="size-3.5" /> {t.assistant.kbTitle}
          </Link>
        </div>
        {sheet}
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-var(--header-h)-var(--page-y)-96px-env(safe-area-inset-bottom))] min-h-[420px] w-full max-w-[820px] flex-col lg:h-[calc(100dvh-var(--header-h)-var(--page-y)*2)]">
      {empty ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col pt-4 sm:justify-center sm:pt-0 sm:pb-16">
            <Welcome />
            <div className="mt-6">
              <Starters onPick={(q) => void send(q)} />
            </div>
            <div className="mt-5">{disclaimer}</div>
          </div>
        </div>
      ) : (
        <Messages tone="page" onSource={setSource} onNavigate={onNavigate} className="pt-2 pb-4" />
      )}
      <div className="shrink-0 pt-2 pb-1">
        <Composer surface="white" onSend={(v) => void send(v)} disabled={pending} />
        {!empty && (
          <button
            type="button"
            onClick={reset}
            className="mx-auto mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-jm-muted transition-colors hover:text-jm-green"
          >
            <RotateCcw className="size-3.5" /> {t.assistant.newChat}
          </button>
        )}
      </div>
      {sheet}
    </div>
  );
}
