"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, Bell, BellOff, CheckCheck, CircleCheck, CircleX, ClipboardCheck, Database, FileText, Forward, GraduationCap, MessagesSquare, Send, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/api/types";
import { useNotifications } from "@/hooks/queries";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ErrorState, LoadingRows, Panel, PanelEmpty } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { Chips } from "@/components/shared/chips";
import { PageHeader } from "@/components/shell/page-header";

type Cat = "requests" | "learning" | "assistant" | "other";
type Filter = "all" | "unread" | Cat;

const ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  request_submitted: { icon: Send, tone: "bg-jm-mint text-jm-green" },
  request_manager_approved: { icon: ClipboardCheck, tone: "bg-jm-mint text-jm-green" },
  request_approved: { icon: CircleCheck, tone: "bg-jm-mint text-jm-green" },
  request_rejected: { icon: CircleX, tone: "bg-jm-red-bg text-jm-red" },
  request_cancelled: { icon: Ban, tone: "bg-[#eef0ef] text-jm-muted" },
  course_assigned: { icon: GraduationCap, tone: "bg-jm-mint text-jm-green" },
  course_completed: { icon: Trophy, tone: "bg-jm-mint text-jm-green" },
  assistant_escalated: { icon: Forward, tone: "bg-jm-mint text-jm-green" },
  integration_error: { icon: Database, tone: "bg-jm-amber-bg text-jm-amber" },
};

const catOf = (n: Notification): Cat =>
  n.type.startsWith("request") ? "requests" : n.type.startsWith("course") ? "learning" : n.type.startsWith("assistant") ? "assistant" : "other";

function dayKey(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= start) return "today";
  if (d.getTime() >= start - 86_400_000) return "yesterday";
  return "earlier";
}

function Item({ n, onOpen }: { n: Notification; onOpen: (n: Notification) => void }) {
  const { t, locale } = useI18n();
  const meta = ICONS[n.type] ?? { icon: Bell, tone: "bg-jm-mint text-jm-green" };
  const unread = !n.read_at;
  return (
    <button type="button" onClick={() => onOpen(n)} className={cn("flex w-full items-start gap-3.5 px-5 py-4 text-left transition-colors hover:bg-[#f8faf9]", unread && "bg-jm-mint/30")}>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", meta.tone)}>
        <meta.icon className="size-[19px]" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn("text-[14.5px]", unread ? "font-semibold" : "font-medium")}>{n.title}</span>
          <time className="shrink-0 text-[12.5px] text-jm-muted tabular">{fmtRelative(n.created_at, locale, t.common.today, t.common.yesterday)}</time>
        </span>
        {n.body && <span className="mt-0.5 block text-[13.5px] leading-snug text-jm-ink/70">{n.body}</span>}
      </span>
      {unread && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-jm-green" aria-label={t.notifications.unreadMark} />}
    </button>
  );
}

export default function NotificationsPage() {
  const { t } = useI18n();
  const { invalidate } = useSession();
  const router = useRouter();
  const { data, error } = useNotifications();
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);

  const open = async (n: Notification) => {
    if (!n.read_at) {
      await api.readNotification(n.id).catch(() => {});
      invalidate();
    }
    if (n.link) router.push(n.link);
  };

  const readAll = async () => {
    setBusy(true);
    await api.readAllNotifications().catch(() => {});
    setBusy(false);
    invalidate();
  };

  const all = data ?? [];
  const unread = all.filter((n) => !n.read_at).length;
  const rows = all.filter((n) => (filter === "all" ? true : filter === "unread" ? !n.read_at : catOf(n) === filter));
  const groups = (["today", "yesterday", "earlier"] as const)
    .map((k) => ({ k, items: rows.filter((n) => dayKey(n.created_at) === k) }))
    .filter((g) => g.items.length);
  const cats: { v: Cat; label: string; icon: LucideIcon }[] = [
    { v: "requests", label: t.notifications.catRequests, icon: FileText },
    { v: "learning", label: t.notifications.catLearning, icon: GraduationCap },
    { v: "assistant", label: t.notifications.catAssistant, icon: MessagesSquare },
    { v: "other", label: t.notifications.catOther, icon: Bell },
  ];
  const counts = (c: Cat) => ({ total: all.filter((n) => catOf(n) === c).length, unread: all.filter((n) => catOf(n) === c && !n.read_at).length });

  const readAllBtn =
    unread > 0 ? (
      <Btn variant="mint" size="sm" onClick={readAll} disabled={busy}>
        <CheckCheck /> {t.notifications.readAll}
      </Btn>
    ) : undefined;

  return (
    <div className="stack">
      <PageHeader title={t.notifications.title} subtitle={data ? t.notifications.subtitle(unread) : undefined} actions={readAllBtn} />
      {error ? (
        <ErrorState error={error} />
      ) : (
        <div className="grid-12 items-start">
          <Panel
            className="col-span-12 lg:col-span-8"
            header={
              <Chips<Filter>
                value={filter}
                onChange={setFilter}
                surface="card"
                options={[
                  { v: "all", label: t.common.all, n: data ? all.length : undefined },
                  { v: "unread", label: t.notifications.filterUnread, n: data ? unread : undefined },
                  ...cats.filter((c) => counts(c.v).total).map((c) => ({ v: c.v as Filter, label: c.label })),
                ]}
              />
            }
          >
            {!data ? (
              <LoadingRows rows={5} />
            ) : rows.length === 0 ? (
              <PanelEmpty icon={BellOff} title={all.length ? t.notifications.emptyFiltered : t.notifications.empty} className="min-h-[220px]" />
            ) : (
              groups.map((g) => (
                <div key={g.k}>
                  <p className="border-b border-jm-line bg-[#fafbfa] px-5 py-2 text-[11.5px] font-semibold tracking-[0.06em] text-jm-muted uppercase">{t.notifications.groups[g.k]}</p>
                  <div className="divide-y divide-jm-line">
                    {g.items.map((n) => (
                      <Item key={n.id} n={n} onOpen={open} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </Panel>
          <Panel title={t.notifications.summaryTitle} className="col-span-12 hidden lg:col-span-4 lg:flex">
            <div className="divide-y divide-jm-line">
              {cats.map((c) => {
                const n = counts(c.v);
                const active = filter === c.v;
                return (
                  <button
                    key={c.v}
                    type="button"
                    onClick={() => setFilter(active ? "all" : c.v)}
                    aria-pressed={active}
                    disabled={!n.total}
                    className={cn("flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[#f8faf9] disabled:opacity-50 disabled:hover:bg-transparent", active && "bg-jm-mint/40")}
                  >
                    <span className="flex size-9 items-center justify-center rounded-full bg-jm-mint text-jm-green">
                      <c.icon className="size-[17px]" strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0 flex-1 text-[14px] font-medium">{c.label}</span>
                    {n.unread > 0 && <span className="rounded-full bg-jm-green px-2 py-0.5 text-[11px] font-bold text-white tabular">{n.unread}</span>}
                    <span className="w-6 text-right text-[13px] font-semibold text-jm-muted tabular">{n.total}</span>
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
