"use client";

import Link from "next/link";
import { useState } from "react";
import { AlarmClock, ArrowRight, ClipboardCheck, GraduationCap, Palmtree, Plus, ShieldCheck, Users } from "lucide-react";
import type { CalendarEntry, RequestListItem, TeamMember } from "@/lib/api/types";
import { useApprovalIds, useTeam, useTeamOutlook, useTeamRequests } from "@/hooks/queries";
import { useI18n } from "@/i18n";
import { fmtShort } from "@/lib/format";
import { isOverdue, pendingOf, todayISO, vacationNow } from "@/lib/team";
import { cn } from "@/lib/utils";
import { Avatar, EmptyState, ErrorState, Pill, Skeleton, StatTile } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { PageHeader } from "@/components/shell/page-header";
import { Segments } from "@/components/academy/segments";
import { AssignDialog } from "@/components/academy/assign-dialog";
import { TeamCalendar } from "@/components/requests/team-calendar";
import { VacationChip } from "@/components/team/vacation-chip";

function MemberCard({
  m,
  entries,
  requests,
  actionable,
  onAssign,
  className,
}: {
  m: TeamMember;
  entries: CalendarEntry[] | undefined;
  requests: RequestListItem[] | undefined;
  actionable: Set<number>;
  onAssign: (m: TeamMember) => void;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const pending = pendingOf(m, requests);
  const toReview = pending.list.filter((r) => actionable.has(r.id));
  const total = m.enrollments.length;
  const done = m.enrollments.filter((e) => e.status === "completed").length;
  const open = m.enrollments.filter((e) => e.status !== "completed");
  const work = t.workType[m.work_type];
  return (
    <article className={cn("flex flex-col rounded-[20px] bg-white", className)}>
      <div className="flex items-start gap-3.5 p-5 pb-4">
        <Avatar name={m.full_name} size={48} />
        <div className="min-w-0 flex-1">
          <Link href={`/team/${m.id}`} className="block truncate text-[16px] font-semibold hover:text-jm-green-strong">
            {m.full_name}
          </Link>
          <p className="truncate text-[13px] text-jm-muted">
            {m.position}
            {work.toLowerCase() !== m.position.toLowerCase() && ` · ${work}`}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <VacationChip member={m} entries={entries} />
            {pending.count > 0 && (
              <Pill tone="amber">
                <ClipboardCheck className="size-3.5" /> {t.team.pendingCount(pending.count)}
              </Pill>
            )}
          </div>
        </div>
      </div>

      <dl className="mx-5 grid grid-cols-3 gap-3 rounded-2xl bg-[#f6f8f7] px-4 py-3">
        <div>
          <dt className="text-[12px] text-jm-muted">{t.team.balance}</dt>
          <dd className="text-[16px] font-bold tabular">{t.common.daysShort(m.vacation_balance_days)}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-jm-muted">{t.team.requestsInWork}</dt>
          <dd className="text-[16px] font-bold tabular">{pending.count}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-jm-muted">{t.team.learning}</dt>
          <dd className="text-[16px] font-bold tabular">
            {done}/{total}
          </dd>
        </div>
      </dl>

      <div className="flex-1 px-5 pt-4">
        {open.length === 0 ? (
          <p className="flex items-center gap-2 text-[13px] text-jm-muted">
            <GraduationCap className="size-4 text-jm-green" /> {total ? t.team.allCoursesDone : t.team.noCourses}
          </p>
        ) : (
          <ul className="space-y-3">
            {open.map((e) => {
              const late = isOverdue(e, todayISO());
              return (
                <li key={e.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate font-medium">{e.course?.title}</span>
                    {e.due_date && (
                      <span className={cn("shrink-0 font-semibold", late ? "text-jm-red" : "text-jm-amber")}>
                        {late ? t.academy.overdue : t.academy.due(fmtShort(e.due_date, locale))}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Segments value={e.progress_pct} className="flex-1" />
                    <span className="w-9 text-right text-[12.5px] font-semibold text-jm-green tabular">{e.progress_pct}%</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-jm-line px-5 py-3.5">
        {toReview.length > 0 && (
          <Btn asChild size="sm">
            <Link href={toReview.length === 1 ? `/requests/${toReview[0].id}` : "/approvals"}>
              <ClipboardCheck /> {t.team.review}
              {toReview.length > 1 && <span className="tabular opacity-80">{toReview.length}</span>}
            </Link>
          </Btn>
        )}
        <Btn size="sm" variant="mint" onClick={() => onAssign(m)}>
          <Plus /> {t.team.assign}
        </Btn>
        <Link href={`/team/${m.id}`} className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold text-jm-green hover:text-jm-green-strong">
          {t.team.openProfile} <ArrowRight className="size-4" />
        </Link>
      </div>
    </article>
  );
}

export default function TeamPage() {
  const { t } = useI18n();
  const { data: team, error } = useTeam();
  const { data: reqs } = useTeamRequests();
  const { data: entries } = useTeamOutlook();
  const { ids } = useApprovalIds();
  const [assignFor, setAssignFor] = useState<TeamMember | null>(null);
  const [assignAll, setAssignAll] = useState(false);

  if (error) return <ErrorState error={error} />;

  const members = team ?? [];
  const today = todayISO();
  const away = members.filter((m) => vacationNow(m, entries, today));
  const pendingTotal = members.reduce((s, m) => s + pendingOf(m, reqs).list.filter((r) => ids.has(r.id)).length, 0);
  const enr = members.flatMap((m) => m.enrollments);
  const doneN = enr.filter((e) => e.status === "completed").length;
  const overdue = enr.filter((e) => isOverdue(e, today)).length;
  const dept = [...new Set(members.map((m) => m.department))];
  const wide = members.length >= 3;

  return (
    <div className="stack">
      <PageHeader
        title={t.team.title}
        subtitle={team ? [t.team.members(members.length), dept.length === 1 ? dept[0] : null].filter(Boolean).join(" · ") : undefined}
        actions={
          <Btn size="sm" onClick={() => setAssignAll(true)} disabled={!members.length}>
            <Plus /> {t.team.assign}
          </Btn>
        }
      />
      {!team ? (
        <div className="grid-12">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="col-span-6 h-[118px] rounded-[20px] lg:col-span-3" />
          ))}
          <Skeleton className="col-span-12 h-[360px] rounded-[20px] md:col-span-6" />
          <Skeleton className="col-span-12 h-[360px] rounded-[20px] md:col-span-6" />
        </div>
      ) : members.length === 0 ? (
        <EmptyState icon={Users} title={t.team.empty} />
      ) : (
        <div className="grid-12">
          <StatTile
            className="col-span-6 lg:col-span-3"
            label={t.team.statAway}
            value={away.length}
            icon={Palmtree}
            hint={away.length ? away.map((m) => m.full_name.split(" ")[0]).join(", ") : t.team.statAwayNone}
          />
          <StatTile
            className="col-span-6 lg:col-span-3"
            label={t.team.statPending}
            value={pendingTotal}
            icon={ClipboardCheck}
            tone={pendingTotal ? "amber" : "green"}
            href="/approvals"
            hint={pendingTotal ? t.team.statPendingHint : t.team.statPendingNone}
          />
          <StatTile
            className="col-span-6 lg:col-span-3"
            label={t.team.statLearning}
            value={`${enr.length ? Math.round((doneN / enr.length) * 100) : 0}%`}
            icon={GraduationCap}
            hint={t.team.statLearningHint(doneN, enr.length)}
          />
          <StatTile
            className="col-span-6 lg:col-span-3"
            label={t.team.statOverdue}
            value={overdue}
            icon={AlarmClock}
            tone={overdue ? "red" : "gray"}
            href="/academy?tab=team"
            hint={overdue ? t.team.statOverdueHint : t.team.statOverdueNone}
          />

          {members.map((m) => (
            <MemberCard
              key={m.id}
              m={m}
              entries={entries}
              requests={reqs}
              actionable={ids}
              onAssign={setAssignFor}
              className={cn("col-span-12 md:col-span-6", wide && "2xl:col-span-4")}
            />
          ))}

          <div id="calendar" className="col-span-12 scroll-mt-24">
            <TeamCalendar />
          </div>
          <p className="col-span-12 flex items-center gap-2 text-[12.5px] text-jm-muted">
            <ShieldCheck className="size-4 text-jm-green" /> {t.team.brief}
          </p>
        </div>
      )}
      <AssignDialog open={!!assignFor} onOpenChange={(o) => !o && setAssignFor(null)} employee={assignFor ?? undefined} />
      <AssignDialog open={assignAll} onOpenChange={setAssignAll} />
    </div>
  );
}
