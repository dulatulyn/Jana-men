"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Database, Lock, LogOut, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { experience, fmtDate, fmtRelative } from "@/lib/format";
import { Avatar, Card, ErrorState, Pill, RowList, SectionTitle, Skeleton } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { LangSwitch } from "@/components/shell/lang-switch";
import { EnrollmentLine } from "@/components/academy/enrollment-line";

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="text-[13px] text-jm-muted sm:w-[190px] sm:shrink-0 sm:text-[14px]">{label}</dt>
      <dd className={mono ? "font-mono text-[14px]" : "text-[15px] font-medium"}>{value}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const { t, locale } = useI18n();
  const { me, logout } = useSession();
  const router = useRouter();
  const { data: p, error } = useApi(() => api.profile());
  const { data: enr } = useApi(() => api.myEnrollments());
  const { data: notes } = useApi(() => api.notifications());

  if (error) return <ErrorState error={error} />;
  if (!p || !me) return <Skeleton className="h-[480px]" />;
  const exp = experience(p.hire_date);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <Avatar name={p.full_name} size={64} />
            <div className="min-w-0">
              <h1 className="text-[22px] leading-tight font-bold tracking-tight sm:text-[26px]">{p.full_name}</h1>
              <p className="mt-0.5 text-[15px] text-jm-muted">{p.position}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Pill tone={me.role === "hr" ? "green" : me.role === "manager" ? "outline" : "mint"}>{t.roles[me.role]}</Pill>
                <Pill tone="gray">
                  <Lock className="size-3" /> {t.common.readOnly1c}
                </Pill>
              </div>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-jm-line px-5 py-3.5 text-[13px] font-medium text-jm-muted">
            <Database className="size-4 text-jm-green" /> 1С:ЗУП · {me.employee.external_id_1c}
          </div>
          <dl className="divide-y divide-jm-line">
            <Field label={t.profile.fullName} value={p.full_name} />
            <Field label={t.profile.company} value={p.company} />
            <Field label={t.profile.position} value={p.position} />
            <Field label={t.profile.department} value={p.department} />
            <Field label={t.profile.manager} value={p.manager?.full_name ?? "—"} />
            <Field
              label={t.profile.hireDate}
              value={
                <>
                  {fmtDate(p.hire_date, locale)} <span className="font-normal text-jm-muted">· {t.profile.experience(exp.years, exp.months)}</span>
                </>
              }
            />
            <Field label={t.profile.vacation} value={<span className="font-bold text-jm-green">{t.common.days(p.vacation_balance_days)}</span>} />
            <Field label={t.profile.workType} value={t.workType[p.work_type]} />
            <Field label={t.profile.phone} value={me.employee.phone} />
            <Field label={t.profile.email} value={me.email} />
          </dl>
          <p className="border-t border-jm-line bg-[#fafbfa] px-5 py-3.5 text-[13px] text-jm-muted">{t.profile.howToFix}</p>
        </Card>
      </div>

      <div className="space-y-5">
        <section>
          <SectionTitle
            action={
              <Link href="/academy" className="text-[13px] font-semibold text-jm-green">
                {t.common.seeAll}
              </Link>
            }
          >
            {t.profile.learning}
          </SectionTitle>
          {!enr ? (
            <Skeleton className="h-[120px]" />
          ) : enr.length === 0 ? (
            <Card className="px-5 py-5 text-[14px] text-jm-muted">{t.profile.learningEmpty}</Card>
          ) : (
            <RowList>
              {enr.map((e) => (
                <EnrollmentLine key={e.id} e={e} />
              ))}
            </RowList>
          )}
        </section>

        <section>
          <SectionTitle
            action={
              <Link href="/notifications" className="text-[13px] font-semibold text-jm-green">
                {t.common.seeAll}
              </Link>
            }
          >
            {t.profile.notifications}
          </SectionTitle>
          <RowList>
            {(notes ?? []).slice(0, 3).map((n) => (
              <Link key={n.id} href={n.link ?? "/notifications"} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#f8faf9]">
                <span className={!n.read_at ? "size-2 shrink-0 rounded-full bg-jm-green" : "size-2 shrink-0 rounded-full bg-[#d5dbd8]"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{n.title}</span>
                  <span className="block text-[12.5px] text-jm-muted">{fmtRelative(n.created_at, locale, t.common.today, t.common.yesterday)}</span>
                </span>
                <ChevronRight className="size-4 text-[#b6bdb9]" />
              </Link>
            ))}
          </RowList>
        </section>

        <Card className="flex items-center justify-between gap-3 p-4 pl-5">
          <span className="text-[14px] font-medium">{t.profile.language}</span>
          <LangSwitch className="bg-[#f3f5f4]" />
        </Card>

        <Btn
          variant="outline"
          className="w-full lg:hidden"
          onClick={() => {
            logout();
            router.replace("/login");
          }}
        >
          <LogOut /> {t.common.logout}
        </Btn>
      </div>
    </div>
  );
}
