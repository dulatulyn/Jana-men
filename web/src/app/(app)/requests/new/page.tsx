"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";
import { kk as kkLocale, ru as ruLocale } from "react-day-picker/locale";
import { CalendarDays, Loader2, Sparkles, Wallet, Route, Info } from "lucide-react";
import { api, isApiError } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { daysInclusive, fmtDate, fmtMoney, toISODate } from "@/lib/format";
import { Calendar } from "@/components/ui/calendar";
import { BackLink, Card, PageTitle, Skeleton } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";

const parseISO = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : undefined);

function TypeSwitch({ value, onChange }: { value: "vacation" | "advance"; onChange: (v: "vacation" | "advance") => void }) {
  const { t } = useI18n();
  const opts = [
    { v: "vacation", label: t.form.vacation, icon: CalendarDays },
    { v: "advance", label: t.form.advance, icon: Wallet },
  ] as const;
  return (
    <div className="inline-flex rounded-full bg-white p-1" role="tablist">
      {opts.map((o) => (
        <button
          key={o.v}
          role="tab"
          aria-selected={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "flex h-10 items-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors",
            value === o.v ? "bg-jm-green text-white" : "text-jm-muted hover:text-jm-ink",
          )}
        >
          <o.icon className="size-[18px]" strokeWidth={1.9} />
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-jm-muted">{label}</span>
      {children}
      {hint}
    </label>
  );
}

const inputCls =
  "w-full rounded-2xl bg-[#f3f5f4] px-4 text-[15px] outline-none placeholder:text-[#a3aca7] focus:bg-white focus:ring-2 focus:ring-jm-light";

function NewRequestForm() {
  const sp = useSearchParams();
  const router = useRouter();
  const { t, locale } = useI18n();
  const { invalidate } = useSession();
  const { data: profile } = useApi(() => api.profile());

  const fromAssistant = sp.get("from") === "assistant";
  const [type, setType] = useState<"vacation" | "advance">(sp.get("type") === "advance" ? "advance" : "vacation");
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const from = parseISO(sp.get("start"));
    const to = parseISO(sp.get("end"));
    return from ? { from, to } : undefined;
  });
  const [comment, setComment] = useState(sp.get("comment") ?? "");
  const [amount, setAmount] = useState(sp.get("amount") ?? "");
  const [reason, setReason] = useState(sp.get("reason") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const start = range?.from ? toISODate(range.from) : null;
  const end = range?.to ? toISODate(range.to) : start && range?.from ? start : null;
  const days = start && end ? daysInclusive(start, end) : 0;
  const balance = profile?.vacation_balance_days ?? 0;
  const over = days > balance;
  const amountNum = Number(amount.replace(/\s/g, "")) || 0;

  const canSubmit = type === "vacation" ? days > 0 && !over && !!profile : amountNum > 0 && reason.trim().length > 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r =
        type === "vacation"
          ? await api.createRequest({ type: "vacation", payload: { start_date: start!, end_date: end!, days, comment: comment.trim() } })
          : await api.createRequest({ type: "advance", payload: { amount: amountNum, reason: reason.trim() } });
      invalidate();
      toast.success(t.form.sent);
      router.push(`/requests/${r.id}`);
    } catch (e) {
      setError(isApiError(e) ? e.message : t.common.error);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[880px]">
      <PageTitle title={t.form.title} back={<BackLink href="/requests" label={t.nav.requests} />} />

      {fromAssistant && (
        <div className="mb-4 flex items-center gap-3 rounded-[18px] bg-jm-mint px-4 py-3 text-[14px] font-medium text-jm-green-strong">
          <Sparkles className="size-[18px] shrink-0" /> {t.form.prefilled}
        </div>
      )}

      <div className="mb-4">
        <TypeSwitch value={type} onChange={(v) => { setType(v); setError(null); }} />
      </div>

      {type === "vacation" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="p-3 sm:p-5">
            <p className="px-2 text-[16px] font-semibold">{t.form.pickDates}</p>
            <p className="px-2 text-[13px] text-jm-muted">{t.form.pickHint}</p>
            <div className="mt-2 flex justify-center">
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                numberOfMonths={1}
                defaultMonth={range?.from ?? today}
                disabled={{ before: today }}
                locale={locale === "kk" ? kkLocale : ruLocale}
                weekStartsOn={1}
                className="bg-transparent p-0 [--cell-radius:999px] [--cell-size:--spacing(10.5)] [--muted:var(--jm-mint)] sm:[--cell-size:--spacing(12)]"
                classNames={{ caption_label: "text-[15px] font-semibold capitalize", weekday: "flex-1 text-[12px] font-medium text-jm-muted uppercase" }}
              />
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="p-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[12px] font-medium text-jm-muted">{t.form.start}</p>
                  <p className="mt-0.5 text-[15px] font-semibold">{start ? fmtDate(start, locale, { day: "numeric", month: "short" }) : "—"}</p>
                </div>
                <div>
                  <p className="text-[12px] font-medium text-jm-muted">{t.form.end}</p>
                  <p className="mt-0.5 text-[15px] font-semibold">{end ? fmtDate(end, locale, { day: "numeric", month: "short" }) : "—"}</p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-[#f5f7f6] p-4">
                <p className="flex items-baseline gap-1.5">
                  <span className={cn("text-[34px] leading-none font-extrabold tracking-[-0.04em] tabular", over ? "text-jm-red" : "text-jm-green")}>{days}</span>
                  <span className="text-[14px] font-medium text-jm-ink/70">
                    {t.common.days(days).replace(/^\d+\s/, "")}
                    {days > 0 && ` · ${t.form.calendarDays}`}
                  </span>
                </p>
                {!profile ? (
                  <Skeleton className="mt-3 h-4 w-32" />
                ) : (
                  <>
                    <div className="mt-3 h-[6px] overflow-hidden rounded-full bg-[#e3e8e5]">
                      <div className={cn("h-full rounded-full transition-[width] duration-500", over ? "bg-jm-red" : "bg-jm-green")} style={{ width: `${Math.min(100, balance ? (days / balance) * 100 : 0)}%` }} />
                    </div>
                    <p className={cn("mt-2 text-[13px] font-medium", over ? "text-jm-red" : "text-jm-muted")}>
                      {over ? t.form.over(days - balance) : days ? t.form.willRemain(balance - days) : t.form.balance(balance)}
                    </p>
                  </>
                )}
              </div>
              <div className="mt-4">
                <Field label={t.form.commentOptional}>
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t.form.commentPh} rows={2} className={cn(inputCls, "resize-none py-3")} />
                </Field>
              </div>
            </Card>
            <SubmitBlock canSubmit={canSubmit} busy={busy} error={error} onSubmit={submit} />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="space-y-4 p-5 sm:p-6">
            <Field label={t.form.amount}>
              <input
                inputMode="numeric"
                value={amountNum ? amountNum.toLocaleString("ru-RU").replace(/ |,/g, " ") : amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                placeholder={t.form.amountPh}
                className={cn(inputCls, "h-14 text-[22px] font-bold tracking-tight tabular")}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              {[20000, 50000, 100000].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(String(v))}
                  className={cn(
                    "h-9 rounded-full px-4 text-[14px] font-semibold transition-colors",
                    amountNum === v ? "bg-jm-green text-white" : "bg-jm-mint text-jm-green-strong hover:bg-[#cdf3de]",
                  )}
                >
                  {fmtMoney(v)}
                </button>
              ))}
            </div>
            <Field label={t.form.reason}>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.form.reasonPh} rows={3} className={cn(inputCls, "resize-none py-3")} />
            </Field>
          </Card>
          <SubmitBlock canSubmit={canSubmit} busy={busy} error={error} onSubmit={submit} />
        </div>
      )}
    </div>
  );
}

function SubmitBlock({ canSubmit, busy, error, onSubmit }: { canSubmit: boolean; busy: boolean; error: string | null; onSubmit: () => void }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      {error && (
        <p className="flex items-start gap-2 rounded-2xl bg-jm-red-bg px-4 py-3 text-[14px] text-jm-red">
          <Info className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      )}
      <Btn size="lg" className="w-full" disabled={!canSubmit || busy} onClick={onSubmit}>
        {busy && <Loader2 className="animate-spin" />}
        {t.form.submit}
      </Btn>
      <p className="flex items-center justify-center gap-2 text-[12.5px] text-jm-muted">
        <Route className="size-3.5" /> {t.form.route}
      </p>
    </div>
  );
}

function Keyed() {
  const sp = useSearchParams();
  return <NewRequestForm key={sp.toString()} />;
}

export default function NewRequestPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[420px]" />}>
      <Keyed />
    </Suspense>
  );
}
