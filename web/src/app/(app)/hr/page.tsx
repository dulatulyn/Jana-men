"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  Database,
  FileSignature,
  GraduationCap,
  Loader2,
  MessageCircleQuestion,
  MessagesSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Users,
  FileText,
  Plug,
} from "lucide-react";
import { api, ApiError, isApiError } from "@/lib/api";
import type { IntegrationLogEntry, RequestStatus } from "@/lib/api/types";
import { useApi } from "@/hooks/use-api";
import { useApprovalIds, useKb, useTeam, useTeamOutlook } from "@/hooks/queries";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar, ErrorState, LoadingRows, Panel, PanelEmpty, Pill, RowList, StatTile } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { Chips } from "@/components/shared/chips";
import { PageHeader } from "@/components/shell/page-header";
import { RequestRow } from "@/components/requests/request-row";
import { TeamCalendar } from "@/components/requests/team-calendar";
import { AssignDialog } from "@/components/academy/assign-dialog";
import { VacationChip } from "@/components/team/vacation-chip";

const STATUS_COLORS: Record<RequestStatus, string> = {
  submitted: "bg-[#e39a2d]",
  manager_approved: "bg-jm-light",
  approved: "bg-jm-green",
  rejected: "bg-jm-red",
  cancelled: "bg-[#c6ccc9]",
};

const STATUSES: RequestStatus[] = ["submitted", "manager_approved", "approved", "rejected", "cancelled"];

function LogItem({ l }: { l: IntegrationLogEntry }) {
  const { t, locale } = useI18n();
  const { invalidate } = useSession();
  const [busy, setBusy] = useState(false);
  const failed = l.status !== "ok";
  const retry = async () => {
    setBusy(true);
    try {
      await api.retryIntegration(l.id);
      toast.success(t.hr.retryDone);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : t.common.error);
    } finally {
      setBusy(false);
      invalidate();
    }
  };
  const Icon = l.system === "1c_zup" ? Database : FileSignature;
  return (
    <li className={cn("flex items-start gap-3 px-5 py-3", failed && "bg-jm-red-bg/40")}>
      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", failed ? "bg-jm-red-bg text-jm-red" : "bg-jm-mint text-jm-green")}>
        <Icon className="size-4" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-mono text-[12.5px] font-semibold">
            {l.system === "1c_zup" ? "1С:ЗУП" : "Documentolog"}.{l.operation}
          </span>
          <span className={cn("shrink-0 text-[11px] font-bold uppercase", failed ? "text-jm-red" : "text-jm-green")}>{l.status}</span>
        </span>
        <span className="block text-[13px] leading-snug text-jm-ink/75">{l.details}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-jm-muted">
          {fmtRelative(l.created_at, locale, t.common.today, t.common.yesterday)}
          {l.duration_ms != null && <span className="tabular">· {l.duration_ms} ms</span>}
          {l.request_id && (
            <Link href={`/requests/${l.request_id}`} className="font-semibold text-jm-green hover:text-jm-green-strong">
              · {t.hr.openRequest(l.request_id)}
            </Link>
          )}
        </span>
        {failed && l.retryable && (
          <Btn size="sm" variant="outline" className="mt-2 h-8 px-3 text-[13px]" onClick={retry} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <RotateCcw className="!size-4" />} {t.hr.retry}
          </Btn>
        )}
      </span>
    </li>
  );
}

export default function HrPage() {
  const { t, locale } = useI18n();
  const { me, invalidate } = useSession();
  const { data: all, error } = useApi(() => api.listRequests({ scope: "all" }), "", "requests:all");
  const { data: team } = useTeam();
  const { data: entries } = useTeamOutlook();
  const { data: stats } = useApi(() => api.assistantStats(), "", "assistant-stats");
  const { data: unanswered } = useApi(() => api.unanswered(), "", "unanswered");
  const { data: log } = useApi(() => api.integrationsLog(), "", "integrations-log");
  const { data: kb } = useKb();
  const { ids, ready } = useApprovalIds();
  const [filter, setFilter] = useState<"all" | RequestStatus>("all");
  const [expanded, setExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [assign, setAssign] = useState(false);

  if (me && me.role !== "hr") return <ErrorState error={new ApiError(403, "forbidden", t.common.noAccessTitle)} />;
  if (error) return <ErrorState error={error} />;

  const counts = STATUSES.map((s) => ({ s, n: (all ?? []).filter((r) => r.status === s).length }));
  const total = all?.length ?? 0;
  const enr = (team ?? []).flatMap((m) => m.enrollments);
  const doneN = enr.filter((e) => e.status === "completed").length;
  const courseRate = enr.length ? Math.round((doneN / enr.length) * 100) : 0;
  const aiRate = stats && stats.total ? Math.round((stats.answered / stats.total) * 100) : 0;
  const rows = (all ?? []).filter((r) => filter === "all" || r.status === filter);
  const shown = expanded ? rows : rows.slice(0, 7);
  const failedLog = (log ?? []).filter((l) => l.status !== "ok" && l.retryable).length;

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.sync1c();
      invalidate();
      toast.success(t.hr.syncDone(r.synced));
    } catch (e) {
      toast.error(isApiError(e) ? e.message : t.common.error);
    } finally {
      setSyncing(false);
    }
  };

  const actions = (
    <>
      <Btn variant="mint" size="sm" onClick={() => setAssign(true)}>
        <Plus /> {t.hr.assign}
      </Btn>
      <Btn size="sm" onClick={sync} disabled={syncing}>
        {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {t.hr.sync}
      </Btn>
    </>
  );

  return (
    <div className="stack">
      <PageHeader title={t.hr.title} subtitle={team ? t.hr.subtitle(team.length) : undefined} actions={actions} />
      <div className="grid-12">
        <StatTile
          className="col-span-6 lg:col-span-3"
          label={t.hr.pending}
          value={ready ? ids.size : "—"}
          icon={ClipboardCheck}
          tone={ids.size ? "amber" : "green"}
          href="/approvals"
          hint={
            <span className="inline-flex items-center gap-1 font-semibold text-jm-green">
              {t.nav.approvals} <ChevronRight className="size-3.5" />
            </span>
          }
        />
        <StatTile className="col-span-6 lg:col-span-3" label={t.hr.requestsByStatus} value={total} icon={FileText}>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[#eef1ef]">
            {counts.map((c) => (c.n ? <div key={c.s} className={STATUS_COLORS[c.s]} style={{ width: `${(c.n / total) * 100}%` }} /> : null))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[11.5px] text-jm-muted">
            {counts
              .filter((c) => c.n)
              .map((c) => (
                <span key={c.s} className="flex items-center gap-1">
                  <span className={cn("size-2 rounded-full", STATUS_COLORS[c.s])} />
                  {t.status[c.s]} {c.n}
                </span>
              ))}
          </div>
        </StatTile>
        <StatTile
          className="col-span-6 lg:col-span-3"
          label={t.hr.coursesRate}
          value={team ? `${courseRate}%` : "—"}
          icon={GraduationCap}
          href="/academy?tab=team"
          hint={t.team.statLearningHint(doneN, enr.length)}
        />
        <StatTile
          className="col-span-6 lg:col-span-3"
          label={t.hr.assistantRate}
          value={stats ? `${aiRate}%` : "—"}
          icon={MessagesSquare}
          hint={stats ? t.hr.assistantRateHint(stats.answered, stats.total) : undefined}
        />

        <Panel
          className="col-span-12 lg:col-span-8"
          header={
            <Chips
              value={filter}
              onChange={setFilter}
              surface="card"
              options={[{ v: "all" as const, label: t.common.all, n: total }, ...counts.filter((c) => c.n).map((c) => ({ v: c.s, label: t.status[c.s], n: c.n }))]}
            />
          }
          footer={
            rows.length > 7 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="border-t border-jm-line px-5 py-3 text-left text-[13px] font-semibold text-jm-green hover:bg-[#f8faf9]"
              >
                {expanded ? t.hr.showLess : t.hr.showAll(rows.length)}
              </button>
            )
          }
        >
          {!all ? (
            <LoadingRows rows={5} />
          ) : rows.length === 0 ? (
            <PanelEmpty icon={FileText} title={t.requests.emptyFiltered} />
          ) : (
            <RowList>
              {shown.map((r) => (
                <RequestRow key={r.id} item={r} showEmployee />
              ))}
            </RowList>
          )}
        </Panel>

        <Panel
          id="unanswered"
          className="col-span-12 scroll-mt-24 lg:col-span-4"
          title={t.hr.unanswered}
          icon={MessageCircleQuestion}
          count={unanswered?.length}
          footer={
            <Link href="/assistant" className="flex items-center gap-2 border-t border-jm-line bg-[#fafbfa] px-5 py-3 text-[13px] text-jm-muted transition-colors hover:text-jm-green-strong">
              <BookOpen className="size-4 text-jm-green" /> {t.hr.kb}: {kb ? t.hr.kbArticles(kb.length) : "…"}
              <ChevronRight className="ml-auto size-4" />
            </Link>
          }
        >
          <p className="border-b border-jm-line px-5 py-2.5 text-[12.5px] text-jm-muted">{t.hr.unansweredHint}</p>
          {!unanswered ? (
            <LoadingRows rows={3} />
          ) : unanswered.length === 0 ? (
            <PanelEmpty icon={MessageCircleQuestion} title={t.dashboard.unansweredEmpty} />
          ) : (
            <ul className="divide-y divide-jm-line">
              {unanswered.map((q, i) => (
                <li key={i} className="flex items-start gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] leading-snug font-medium">{q.question}</span>
                    <span className="text-[12px] text-jm-muted">{fmtRelative(q.last_asked_at, locale, t.common.today, t.common.yesterday)}</span>
                  </span>
                  <Pill tone="gray">{t.hr.asked(q.count)}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="col-span-12 lg:col-span-8" title={t.hr.employees} icon={Users} count={team?.length}>
          {!team ? (
            <LoadingRows rows={4} />
          ) : (
            <RowList>
              {team.map((m) => {
                const done = m.enrollments.filter((e) => e.status === "completed").length;
                return (
                  <Link key={m.id} href={`/team/${m.id}`} className="group flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-[#f8faf9]">
                    <Avatar name={m.full_name} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold group-hover:text-jm-green-strong">{m.full_name}</span>
                      <span className="block truncate text-[12.5px] text-jm-muted">
                        {m.position} · {m.department}
                      </span>
                    </span>
                    <span className="hidden md:block">
                      <VacationChip member={m} entries={entries} quiet />
                    </span>
                    {(m.pending_requests ?? 0) > 0 && (
                      <Pill tone="amber" className="hidden sm:inline-flex">
                        <ClipboardCheck className="size-3.5" /> {m.pending_requests}
                      </Pill>
                    )}
                    <span className="flex w-14 items-center justify-end gap-1 text-[13px] text-jm-muted tabular">
                      <GraduationCap className="size-4 text-jm-green" />
                      {done}/{m.enrollments.length}
                    </span>
                    <ChevronRight className="size-[18px] shrink-0 text-[#b6bdb9]" />
                  </Link>
                );
              })}
            </RowList>
          )}
        </Panel>

        <Panel className="col-span-12 lg:col-span-4" title={t.hr.integrations} icon={Plug} count={failedLog || undefined}>
          <p className="border-b border-jm-line px-5 py-2.5 text-[12.5px] text-jm-muted">{t.hr.integrationsHint}</p>
          {!log ? (
            <LoadingRows rows={3} />
          ) : (
            <ul className="max-h-[480px] divide-y divide-jm-line overflow-y-auto">
              {log.map((l) => (
                <LogItem key={l.id} l={l} />
              ))}
            </ul>
          )}
        </Panel>

        <div id="calendar" className="col-span-12 scroll-mt-24">
          <TeamCalendar departments />
        </div>
      </div>
      <AssignDialog open={assign} onOpenChange={setAssign} />
    </div>
  );
}
