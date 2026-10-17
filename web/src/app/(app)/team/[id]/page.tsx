"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { FileText, GraduationCap, Palmtree, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useApprovalIds, useTeamOutlook, useTeamRequests } from "@/hooks/queries";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { experience, fmtDate, fmtRange } from "@/lib/format";
import { vacationFromSummary } from "@/lib/requests";
import { isPending } from "@/lib/team";
import { Avatar, Card, ErrorState, Panel, PanelEmpty, RowList, Skeleton } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { PageHeader } from "@/components/shell/page-header";
import { InboxRow, RequestRow } from "@/components/requests/request-row";
import { StatusBadge } from "@/components/requests/track";
import { useDecisions } from "@/components/requests/decision";
import { EnrollmentLine } from "@/components/academy/enrollment-line";
import { AssignDialog } from "@/components/academy/assign-dialog";
import { VacationChip } from "@/components/team/vacation-chip";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[13px] text-jm-muted">{label}</dt>
      <dd className="text-right text-[14px] font-semibold">{children}</dd>
    </div>
  );
}

export default function MemberPage() {
  const { id } = useParams<{ id: string }>();
  const empId = Number(id);
  const { t, locale } = useI18n();
  const { me } = useSession();
  const { data: m, error } = useApi(() => api.employee(empId), empId);
  const { data: teamReqs } = useTeamRequests();
  const { data: entries } = useTeamOutlook();
  const { ids } = useApprovalIds();
  const decisions = useDecisions();
  const [assign, setAssign] = useState(false);

  const back = me?.role === "hr" ? { href: "/hr", label: t.nav.hr } : { href: "/team", label: t.nav.team };

  if (error)
    return (
      <div className="stack">
        <PageHeader title={t.team.memberTitle} back={back} />
        <ErrorState error={error} />
      </div>
    );
  if (!m)
    return (
      <div className="stack">
        <PageHeader title={t.team.memberTitle} back={back} />
        <div className="grid-12">
          <Skeleton className="col-span-12 h-[360px] rounded-[20px] lg:col-span-4" />
          <Skeleton className="col-span-12 h-[360px] rounded-[20px] lg:col-span-8" />
        </div>
      </div>
    );

  const requests = m.requests ?? (teamReqs ?? []).filter((r) => r.employee.id === m.id);
  const pending = requests.filter(isPending);
  const vacations = requests
    .filter((r) => r.type === "vacation" && r.status !== "cancelled" && r.status !== "rejected")
    .map((r) => ({ r, d: vacationFromSummary(r.summary) }))
    .filter((x) => x.d)
    .sort((a, b) => b.d!.start_date.localeCompare(a.d!.start_date));
  const exp = experience(m.hire_date);
  const done = m.enrollments.filter((e) => e.status === "completed").length;

  const assignBtn = (
    <Btn size="sm" onClick={() => setAssign(true)}>
      <Plus /> {t.team.assign}
    </Btn>
  );

  return (
    <div className="stack">
      <PageHeader title={m.full_name} back={back} subtitle={`${m.position} · ${m.department}`} actions={assignBtn} />
      <div className="grid-12">
        <Card className="col-span-12 flex flex-col p-5 sm:p-6 lg:col-span-4">
          <div className="flex items-center gap-4">
            <Avatar name={m.full_name} size={60} />
            <div className="min-w-0">
              <p className="truncate text-[18px] font-bold tracking-tight">{m.full_name}</p>
              <p className="truncate text-[13.5px] text-jm-muted">{m.position}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <VacationChip member={m} entries={entries} />
          </div>
          <dl className="mt-4 divide-y divide-jm-line border-t border-jm-line">
            <Fact label={t.profile.department}>{m.department}</Fact>
            <Fact label={t.profile.workType}>{t.workType[m.work_type]}</Fact>
            <Fact label={t.profile.hireDate}>{fmtDate(m.hire_date, locale)}</Fact>
            <Fact label={t.team.tenure}>{t.team.tenureValue(exp.years, exp.months)}</Fact>
            <Fact label={t.profile.vacation}>
              <span className="text-jm-green">{t.common.days(m.vacation_balance_days)}</span>
            </Fact>
            <Fact label={t.team.learning}>
              {done}/{m.enrollments.length}
            </Fact>
          </dl>
        </Card>

        <Panel title={t.team.requests} icon={FileText} count={pending.length} className="col-span-12 lg:col-span-8">
          {requests.length === 0 ? (
            <PanelEmpty icon={FileText} title={t.team.noRequests} />
          ) : (
            <RowList>
              {requests.map((r) =>
                ids.has(r.id) ? <InboxRow key={r.id} item={r} decisions={decisions} className="bg-jm-mint/25" /> : <RequestRow key={r.id} item={r} track={isPending(r)} />,
              )}
            </RowList>
          )}
        </Panel>

        <Panel
          title={t.team.learning}
          icon={GraduationCap}
          className="col-span-12 lg:col-span-8"
          action={
            <Btn size="sm" variant="mint" className="h-8 px-3 text-[13px]" onClick={() => setAssign(true)}>
              <Plus className="!size-4" /> {t.team.assign}
            </Btn>
          }
        >
          {m.enrollments.length === 0 ? (
            <PanelEmpty icon={GraduationCap} title={t.team.noCourses} hint={t.team.noCoursesHint} />
          ) : (
            <RowList>
              {m.enrollments.map((e) => (
                <EnrollmentLine key={e.id} e={e} link={false} />
              ))}
            </RowList>
          )}
        </Panel>

        <Panel title={t.team.vacationsTitle} icon={Palmtree} className="col-span-12 lg:col-span-4">
          {vacations.length === 0 ? (
            <PanelEmpty icon={Palmtree} title={t.team.noVacation} />
          ) : (
            <RowList>
              {vacations.map(({ r, d }) => (
                <Link key={r.id} href={`/requests/${r.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[#f8faf9]">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold">{fmtRange(d!.start_date, d!.end_date, locale)}</span>
                    <span className="block text-[12.5px] text-jm-muted">{d!.start_date.slice(0, 4)}</span>
                  </span>
                  <StatusBadge status={r.status} />
                </Link>
              ))}
            </RowList>
          )}
        </Panel>
      </div>
      <AssignDialog open={assign} onOpenChange={setAssign} employee={m} />
      {decisions.dialog}
    </div>
  );
}
