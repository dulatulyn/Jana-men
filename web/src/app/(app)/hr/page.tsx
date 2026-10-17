"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, ChevronRight, Database, FileSignature, GraduationCap, Loader2, MessageCircleQuestion, Plus, RefreshCw } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { RequestStatus } from "@/lib/api/types";
import { useApi } from "@/hooks/use-api";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar, Card, ErrorState, PageTitle, Pill, RowList, SectionTitle, Skeleton } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { Chips } from "@/components/shared/chips";
import { RequestRow } from "@/components/requests/request-row";
import { AssignDialog } from "@/components/academy/assign-dialog";

const STATUS_COLORS: Record<RequestStatus, string> = {
  submitted: "bg-[#e39a2d]",
  manager_approved: "bg-jm-light",
  approved: "bg-jm-green",
  rejected: "bg-jm-red",
  cancelled: "bg-[#c6ccc9]",
};

function Stat({ label, value, hint, children }: { label: string; value: React.ReactNode; hint?: string; children?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <p className="text-[13.5px] font-medium text-jm-muted">{label}</p>
      <p className="mt-1 text-[32px] leading-none font-extrabold tracking-[-0.03em] tabular">{value}</p>
      {hint && <p className="mt-2 text-[12.5px] text-jm-muted">{hint}</p>}
      {children}
    </Card>
  );
}

export default function HrPage() {
  const { t, locale } = useI18n();
  const { me, invalidate } = useSession();
  const { data: all, error } = useApi(() => api.listRequests({ scope: "all" }));
  const { data: team } = useApi(() => api.team());
  const { data: stats } = useApi(() => api.assistantStats());
  const { data: unanswered } = useApi(() => api.unanswered());
  const { data: log } = useApi(() => api.integrationsLog());
  const { data: kb } = useApi(() => api.kb());
  const { data: dash } = useApi(() => api.dashboard());
  const [filter, setFilter] = useState<"all" | RequestStatus>("all");
  const [syncing, setSyncing] = useState(false);
  const [assign, setAssign] = useState(false);

  if (error) return <ErrorState error={error} />;
  if (me && me.role !== "hr") return <ErrorState error={new ApiError(403, "forbidden", t.common.noAccessTitle)} />;

  const counts = (["submitted", "manager_approved", "approved", "rejected", "cancelled"] as RequestStatus[]).map((s) => ({
    s,
    n: (all ?? []).filter((r) => r.status === s).length,
  }));
  const total = all?.length ?? 0;
  const enr = (team ?? []).flatMap((m) => m.enrollments);
  const courseRate = enr.length ? Math.round((enr.filter((e) => e.status === "completed").length / enr.length) * 100) : 0;
  const aiRate = stats && stats.total ? Math.round((stats.answered / stats.total) * 100) : 0;
  const pendingHr = (dash?.tasks ?? []).filter((x) => x.type === "approve_request").length;

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.sync1c();
      invalidate();
      toast.success(t.hr.syncDone(r.synced));
    } catch {
      toast.error(t.common.error);
    } finally {
      setSyncing(false);
    }
  };

  const rows = (all ?? []).filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="space-y-6">
      <PageTitle
        title={t.hr.title}
        action={
          <>
            <Btn variant="mint" onClick={() => setAssign(true)}>
              <Plus /> {t.hr.assign}
            </Btn>
            <Btn onClick={sync} disabled={syncing}>
              {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {t.hr.sync}
            </Btn>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Link href="/approvals" className="block">
          <Stat label={t.hr.pending} value={dash ? pendingHr : "—"}>
            <p className="mt-2 flex items-center gap-1 text-[12.5px] font-semibold text-jm-green">
              {t.nav.approvals} <ChevronRight className="size-3.5" />
            </p>
          </Stat>
        </Link>
        <Stat label={t.hr.requestsByStatus} value={total}>
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
        </Stat>
        <Stat label={t.hr.coursesRate} value={`${courseRate}%`} hint={`${enr.filter((e) => e.status === "completed").length} / ${enr.length}`} />
        <Stat label={t.hr.assistantRate} value={stats ? `${aiRate}%` : "—"} hint={stats ? t.hr.assistantRateHint(stats.answered, stats.total) : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <section className="min-w-0">
          <SectionTitle>{t.hr.allRequests}</SectionTitle>
          <div className="mb-3">
            <Chips
              value={filter}
              onChange={setFilter}
              options={[{ v: "all" as const, label: t.common.all, n: total }, ...counts.filter((c) => c.n).map((c) => ({ v: c.s, label: t.status[c.s], n: c.n }))]}
            />
          </div>
          {!all ? (
            <Skeleton className="h-[300px]" />
          ) : (
            <RowList>
              {rows.map((r) => (
                <RequestRow key={r.id} item={r} showEmployee />
              ))}
            </RowList>
          )}

          <SectionTitle className="mt-6">{t.hr.employees}</SectionTitle>
          <RowList>
            {(team ?? []).map((m) => (
              <Link key={m.id} href={`/team/${m.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-[#f8faf9]">
                <Avatar name={m.full_name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{m.full_name}</span>
                  <span className="block truncate text-[13px] text-jm-muted">
                    {m.position} · {m.department}
                  </span>
                </span>
                <span className="hidden items-center gap-1 text-[13px] text-jm-muted sm:flex">
                  <GraduationCap className="size-4 text-jm-green" />
                  {m.enrollments.filter((e) => e.status === "completed").length}/{m.enrollments.length}
                </span>
                <ChevronRight className="size-5 text-[#b6bdb9]" />
              </Link>
            ))}
          </RowList>
        </section>

        <div className="space-y-5">
          <section>
            <SectionTitle>{t.hr.unanswered}</SectionTitle>
            <Card className="overflow-hidden">
              <p className="border-b border-jm-line px-5 py-3 text-[12.5px] text-jm-muted">{t.hr.unansweredHint}</p>
              <ul className="divide-y divide-jm-line">
                {(unanswered ?? []).map((q, i) => (
                  <li key={i} className="flex items-start gap-3 px-5 py-3.5">
                    <MessageCircleQuestion className="mt-0.5 size-[20px] shrink-0 text-jm-green" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] leading-snug font-medium">{q.question}</span>
                      <span className="text-[12.5px] text-jm-muted">{fmtRelative(q.last_asked_at, locale, t.common.today, t.common.yesterday)}</span>
                    </span>
                    <Pill tone="gray">{t.hr.asked(q.count)}</Pill>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2 border-t border-jm-line bg-[#fafbfa] px-5 py-3 text-[13px] text-jm-muted">
                <BookOpen className="size-4 text-jm-green" /> {t.hr.kb}: {kb ? t.hr.kbArticles(kb.length) : "…"}
              </div>
            </Card>
          </section>

          <section>
            <SectionTitle>{t.hr.integrations}</SectionTitle>
            <Card className="overflow-hidden">
              <p className="border-b border-jm-line px-5 py-3 text-[12.5px] text-jm-muted">{t.hr.integrationsHint}</p>
              <ul className="max-h-[360px] divide-y divide-jm-line overflow-y-auto">
                {(log ?? []).map((l) => (
                  <li key={l.id} className="flex items-start gap-3 px-5 py-3">
                    {l.system === "1c_zup" ? (
                      <Database className="mt-0.5 size-[18px] shrink-0 text-jm-green" strokeWidth={1.8} />
                    ) : (
                      <FileSignature className="mt-0.5 size-[18px] shrink-0 text-jm-accent" strokeWidth={1.8} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-[12.5px] font-semibold">
                          {l.system === "1c_zup" ? "1С:ЗУП" : "Documentolog"}.{l.operation}
                        </span>
                        <span className={cn("text-[11px] font-bold uppercase", l.status === "ok" ? "text-jm-green" : "text-jm-red")}>{l.status}</span>
                      </span>
                      <span className="block text-[13px] text-jm-ink/75">{l.details}</span>
                      <span className="text-[12px] text-jm-muted">{fmtRelative(l.created_at, locale, t.common.today, t.common.yesterday)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        </div>
      </div>
      <AssignDialog open={assign} onOpenChange={setAssign} />
    </div>
  );
}
