"use client";

import Link from "next/link";
import { ChevronRight, ShieldCheck, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useI18n } from "@/i18n";
import { Avatar, Card, EmptyState, ErrorState, LoadingBlock, PageTitle, Pill } from "@/components/shared/ui";
import { Segments } from "@/components/academy/segments";

export default function TeamPage() {
  const { t } = useI18n();
  const { data: team, error } = useApi(() => api.team());
  const { data: reqs } = useApi(() => api.listRequests({ scope: "team" }));

  if (error) return <ErrorState error={error} />;

  return (
    <div>
      <PageTitle title={t.team.title} subtitle={team ? t.team.members(team.length) : undefined} />
      <p className="mb-4 flex items-center gap-2 px-1 text-[13px] text-jm-muted">
        <ShieldCheck className="size-4 text-jm-green" /> {t.team.brief}
      </p>
      {!team ? (
        <LoadingBlock rows={2} />
      ) : team.length === 0 ? (
        <EmptyState icon={Users} title={t.team.empty} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {team.map((m) => {
            const pending = (reqs ?? []).filter((r) => r.employee.id === m.id && (r.status === "submitted" || r.status === "manager_approved")).length;
            const total = m.enrollments.length;
            const done = m.enrollments.filter((e) => e.status === "completed").length;
            const avg = total ? Math.round(m.enrollments.reduce((s, e) => s + e.progress_pct, 0) / total) : 0;
            return (
              <Link key={m.id} href={`/team/${m.id}`} className="group block">
                <Card className="p-5 transition-colors group-hover:bg-[#fafcfb]">
                  <div className="flex items-center gap-3.5">
                    <Avatar name={m.full_name} size={48} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-semibold group-hover:text-jm-green">{m.full_name}</p>
                      <p className="truncate text-[13.5px] text-jm-muted">
                        {m.position}
                        {t.workType[m.work_type].toLowerCase() !== m.position.toLowerCase() && ` · ${t.workType[m.work_type]}`}
                      </p>
                    </div>
                    <ChevronRight className="size-5 text-[#b6bdb9]" />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3 border-t border-jm-line pt-4">
                    <div>
                      <p className="text-[12px] text-jm-muted">{t.team.vacation}</p>
                      <p className="text-[17px] font-bold tabular">{t.common.daysShort(m.vacation_balance_days)}</p>
                    </div>
                    <div>
                      <p className="text-[12px] text-jm-muted">{t.team.requests}</p>
                      <p className="text-[17px] font-bold tabular">{pending ? <Pill tone="amber">{pending}</Pill> : "—"}</p>
                    </div>
                    <div>
                      <p className="text-[12px] text-jm-muted">{t.team.learning}</p>
                      <p className="text-[17px] font-bold tabular">
                        {done}/{total}
                      </p>
                    </div>
                  </div>
                  {total > 0 && <Segments value={avg} className="mt-3" />}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
