"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Database, GraduationCap, Languages, Lock, LogOut, Palmtree, UserRound, Clock3 } from "lucide-react";
import { useMyEnrollments, useNotifications, useProfile } from "@/hooks/queries";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { experience, fmtDate, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar, Card, ErrorState, LoadingRows, Panel, PanelEmpty, PanelLink, Pill, RowList, Skeleton } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { LangSwitch } from "@/components/shell/lang-switch";
import { PageHeader } from "@/components/shell/page-header";
import { EnrollmentLine } from "@/components/academy/enrollment-line";

function Field({ label, value, mono, wide }: { label: string; value: React.ReactNode; mono?: boolean; wide?: boolean }) {
  return (
    <div className={cn("min-w-0 px-5 py-4", wide && "sm:col-span-2")}>
      <dt className="text-[12.5px] font-medium text-jm-muted">{label}</dt>
      <dd className={cn("mt-1 break-words", mono ? "font-mono text-[14px]" : "text-[15px] font-semibold")}>{value}</dd>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-jm-mint text-jm-green">
        <Icon className="size-[18px]" strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] text-jm-muted">{label}</span>
        <span className="block truncate text-[15px] font-semibold">{value}</span>
      </span>
    </div>
  );
}

export default function ProfilePage() {
  const { t, locale } = useI18n();
  const { me, logout } = useSession();
  const router = useRouter();
  const { data: p, error } = useProfile();
  const { data: enr } = useMyEnrollments();
  const { data: notes } = useNotifications();

  if (error) return <ErrorState error={error} />;

  return (
    <div className="stack">
      <PageHeader title={t.profile.title} subtitle={p ? `${p.position} · ${p.department}` : undefined} />
      {!p || !me ? (
        <div className="grid-12">
          <Skeleton className="col-span-12 h-[180px] rounded-[20px]" />
          <Skeleton className="col-span-12 h-[420px] rounded-[20px] lg:col-span-8" />
          <Skeleton className="col-span-12 h-[420px] rounded-[20px] lg:col-span-4" />
        </div>
      ) : (
        <div className="grid-12">
          <Card className="col-span-12 p-5 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <Avatar name={p.full_name} size={68} />
                <div className="min-w-0">
                  <h2 className="truncate text-[22px] leading-tight font-bold tracking-tight sm:text-[24px]">{p.full_name}</h2>
                  <p className="mt-0.5 truncate text-[14.5px] text-jm-muted">{p.position}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Pill tone={me.role === "hr" ? "green" : me.role === "manager" ? "outline" : "mint"}>{t.roles[me.role]}</Pill>
                    <Pill tone="gray">
                      <Lock className="size-3" /> {t.common.readOnly1c}
                    </Pill>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 border-t border-jm-line pt-5 lg:w-[620px] lg:shrink-0 lg:grid-cols-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
                <Fact icon={Palmtree} label={t.profile.vacation} value={<span className="text-jm-green">{t.common.days(p.vacation_balance_days)}</span>} />
                <Fact icon={Clock3} label={t.team.tenure} value={t.team.tenureValue(experience(p.hire_date).years, experience(p.hire_date).months)} />
                <Fact icon={UserRound} label={t.profile.manager} value={p.manager?.full_name ?? "—"} />
              </div>
            </div>
          </Card>

          <Panel
            className="col-span-12 lg:col-span-8"
            title={t.profile.dataTitle}
            icon={Database}
            action={<span className="font-mono text-[12.5px] text-jm-muted">{me.employee.external_id_1c}</span>}
            footer={<p className="border-t border-jm-line bg-[#fafbfa] px-5 py-3.5 text-[13px] text-jm-muted">{t.profile.howToFix}</p>}
          >
            <dl className="grid divide-jm-line sm:grid-cols-2 [&>*]:border-b [&>*]:border-jm-line">
              <Field label={t.profile.fullName} value={p.full_name} />
              <Field label={t.profile.company} value={p.company} />
              <Field label={t.profile.position} value={p.position} />
              <Field label={t.profile.department} value={p.department} />
              <Field label={t.profile.manager} value={p.manager?.full_name ?? "—"} />
              <Field
                label={t.profile.hireDate}
                value={
                  <>
                    {fmtDate(p.hire_date, locale)}{" "}
                    <span className="font-normal text-jm-muted">· {t.profile.experience(experience(p.hire_date).years, experience(p.hire_date).months)}</span>
                  </>
                }
              />
              <Field label={t.profile.workType} value={t.workType[p.work_type]} />
              <Field label={t.profile.vacation} value={<span className="text-jm-green">{t.common.days(p.vacation_balance_days)}</span>} />
              <Field label={t.profile.phone} value={me.employee.phone} />
              <Field label={t.profile.email} value={me.email} />
            </dl>
          </Panel>

          <div className="col-span-12 flex flex-col gap-(--gutter) lg:col-span-4">
            <Panel title={t.profile.learning} icon={GraduationCap} action={<PanelLink href="/academy">{t.common.seeAll}</PanelLink>}>
              {!enr ? (
                <LoadingRows rows={2} />
              ) : enr.length === 0 ? (
                <PanelEmpty icon={GraduationCap} title={t.profile.learningEmpty} />
              ) : (
                <RowList>
                  {enr.map((e) => (
                    <EnrollmentLine key={e.id} e={e} />
                  ))}
                </RowList>
              )}
            </Panel>

            <Panel title={t.profile.notifications} icon={Bell} className="flex-1" action={<PanelLink href="/notifications">{t.common.seeAll}</PanelLink>}>
              {!notes ? (
                <LoadingRows rows={3} />
              ) : notes.length === 0 ? (
                <PanelEmpty icon={Bell} title={t.notifications.empty} />
              ) : (
                <RowList>
                  {notes.slice(0, 3).map((n) => (
                    <Link key={n.id} href={n.link ?? "/notifications"} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#f8faf9]">
                      <span className={cn("size-2 shrink-0 rounded-full", n.read_at ? "bg-[#d5dbd8]" : "bg-jm-green")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{n.title}</span>
                        <span className="block text-[12.5px] text-jm-muted">{fmtRelative(n.created_at, locale, t.common.today, t.common.yesterday)}</span>
                      </span>
                    </Link>
                  ))}
                </RowList>
              )}
            </Panel>

            <Card className="flex items-center justify-between gap-3 p-4 pl-5">
              <span className="flex items-center gap-2 text-[14px] font-medium">
                <Languages className="size-4 text-jm-green" /> {t.profile.language}
              </span>
              <LangSwitch />
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
      )}
    </div>
  );
}
