"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { GraduationCap, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { fmtDate } from "@/lib/format";
import { Avatar, BackLink, Card, EmptyState, ErrorState, RowList, SectionTitle, Skeleton } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { RequestRow } from "@/components/requests/request-row";
import { EnrollmentLine } from "@/components/academy/enrollment-line";
import { AssignDialog } from "@/components/academy/assign-dialog";

export default function MemberPage() {
  const { id } = useParams<{ id: string }>();
  const empId = Number(id);
  const { t, locale } = useI18n();
  const { me } = useSession();
  const { data: m, error } = useApi(() => api.employee(empId), empId);
  const { data: reqs } = useApi(() => api.listRequests({ scope: "team" }));
  const [assign, setAssign] = useState(false);

  const back = <BackLink href={me?.role === "hr" ? "/hr" : "/team"} label={me?.role === "hr" ? t.nav.hr : t.nav.team} />;
  if (error)
    return (
      <div className="mx-auto max-w-[900px]">
        {back}
        <ErrorState error={error} />
      </div>
    );
  if (!m) return <Skeleton className="h-[400px]" />;
  const mine = (reqs ?? []).filter((r) => r.employee.id === m.id);

  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <div>
        {back}
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <Avatar name={m.full_name} size={60} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold tracking-tight">{m.full_name}</h1>
            <p className="text-[14.5px] text-jm-muted">
              {m.position} · {m.department}
            </p>
            <p className="mt-1 text-[13.5px] text-jm-muted">
              {t.profile.hireDate}: {fmtDate(m.hire_date, locale)} · {t.profile.vacation}: <b className="text-jm-green">{t.common.days(m.vacation_balance_days)}</b>
            </p>
          </div>
          <Btn variant="mint" onClick={() => setAssign(true)}>
            <Plus /> {t.team.assign}
          </Btn>
        </Card>
      </div>
      <section>
        <SectionTitle>{t.team.learning}</SectionTitle>
        {m.enrollments.length === 0 ? (
          <EmptyState icon={GraduationCap} title={t.profile.learningEmpty} />
        ) : (
          <RowList>
            {m.enrollments.map((e) => (
              <EnrollmentLine key={e.id} e={e} link={false} />
            ))}
          </RowList>
        )}
      </section>
      {mine.length > 0 && (
        <section>
          <SectionTitle>{t.team.requests}</SectionTitle>
          <RowList>
            {mine.map((r) => (
              <RequestRow key={r.id} item={r} />
            ))}
          </RowList>
        </section>
      )}
      <AssignDialog open={assign} onOpenChange={setAssign} employee={m} />
    </div>
  );
}
