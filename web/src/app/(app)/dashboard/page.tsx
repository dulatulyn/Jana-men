"use client";

import Link from "next/link";
import { Bell, CalendarPlus, ClipboardCheck, GraduationCap, MessagesSquare, Wallet, CircleAlert, ChevronRight, Database, PartyPopper } from "lucide-react";
import { api } from "@/lib/api";
import type { Enrollment, Task } from "@/lib/api/types";
import { useApi } from "@/hooks/use-api";
import { useI18n } from "@/i18n";
import { useSession } from "@/lib/session";
import { firstName, fmtDate, fmtShort } from "@/lib/format";
import { Avatar, Card, ErrorState, Pill, Row, RowList, SectionTitle, Skeleton } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { RequestRow, RequestTrackCard } from "@/components/requests/request-row";
import { Segments } from "@/components/academy/segments";

function greeting(t: ReturnType<typeof useI18n>["t"]) {
  const h = new Date().getHours();
  return h < 12 ? t.dashboard.greet.morning : h < 18 ? t.dashboard.greet.day : t.dashboard.greet.evening;
}

function TaskIcon({ type }: { type: string }) {
  const cls = "size-[22px]";
  if (type === "approve_request") return <ClipboardCheck className={cls} strokeWidth={1.75} />;
  if (type === "course") return <GraduationCap className={cls} strokeWidth={1.75} />;
  return <CircleAlert className={cls} strokeWidth={1.75} />;
}

function TaskRow({ task }: { task: Task }) {
  const { t, locale } = useI18n();
  return (
    <Row
      href={task.link}
      iconNode={
        <span className={task.type === "request_rejected" ? "text-jm-red" : "text-jm-green"}>
          <TaskIcon type={task.type} />
        </span>
      }
      title={task.title}
      wrap
      meta={task.due ? <Pill tone="amber">{t.dashboard.due(fmtShort(task.due, locale))}</Pill> : undefined}
    />
  );
}

function LearningWidget({ enrollments }: { enrollments: Enrollment[] }) {
  const { t } = useI18n();
  const done = enrollments.filter((e) => e.status === "completed").length;
  const open = enrollments.filter((e) => e.status !== "completed");
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-medium text-jm-muted">{t.dashboard.courses}</p>
        <Link href="/academy" className="text-[13px] font-semibold text-jm-green">
          {t.common.seeAll}
        </Link>
      </div>
      {enrollments.length === 0 ? (
        <p className="mt-1 text-[15px] text-jm-muted">{t.profile.learningEmpty}</p>
      ) : (
        <p className="mt-1 text-[22px] font-bold tracking-tight tabular">{t.dashboard.coursesDone(done, enrollments.length)}</p>
      )}
      <div className="mt-4 space-y-4">
        {open.length === 0 && enrollments.length > 0 && (
          <p className="flex items-center gap-2 text-[14px] text-jm-green-strong">
            <PartyPopper className="size-4" /> {t.academy.inProfile}
          </p>
        )}
        {open.map((e) => (
          <Link key={e.id} href={`/academy/${e.course_id}`} className="group block">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate text-[14px] font-semibold group-hover:text-jm-green">{e.course?.title}</span>
              <span className="text-[13px] font-semibold text-jm-green tabular">{e.progress_pct}%</span>
            </div>
            <Segments value={e.progress_pct} />
          </Link>
        ))}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const { me } = useSession();
  const { data, error, loading } = useApi(() => api.dashboard());
  const { data: mine } = useApi(() => api.listRequests({ scope: "mine" }));
  const recent = (mine ?? []).filter((r) => r.status !== "submitted" && r.status !== "manager_approved").slice(0, 3);

  if (error) return <ErrorState error={error} />;
  const p = data?.profile;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="pt-1">
        <h1 className="text-[26px] leading-tight font-bold tracking-[-0.025em] sm:text-[30px]">
          {greeting(t)}, {firstName(me?.full_name ?? "")}
        </h1>
        <p className="mt-0.5 text-[15px] text-jm-muted first-letter:uppercase">{fmtDate(new Date().toISOString(), locale, { weekday: "long", day: "numeric", month: "long" })}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        {!p || loading ? (
          <Skeleton className="h-[184px] lg:col-span-2" />
        ) : (
          <Link
            href="/profile"
            className="group relative overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#2a9f26_0%,#1b8918_55%,#167a14_100%)] p-5 text-white sm:p-6 lg:col-span-2"
          >
            <div className="flex items-start gap-4">
              <Avatar name={p.full_name} size={56} className="bg-white/95" />
              <div className="min-w-0 flex-1">
                <p className="text-[19px] leading-tight font-bold tracking-tight sm:text-[21px]">{p.full_name}</p>
                <p className="mt-1 text-[14px] text-white/85">{p.position}</p>
                <p className="hidden text-[14px] text-white/70 sm:block">
                  {p.department} · {p.company}
                </p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="mt-4 flex items-end justify-between gap-3 rounded-2xl bg-white/12 px-4 py-3 sm:hidden">
              <span className="text-[13px] text-white/80">{t.dashboard.vacationLeft}</span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-[28px] leading-none font-extrabold tracking-[-0.04em] tabular">{p.vacation_balance_days}</span>
                <span className="text-[14px] font-semibold text-white/85">{t.common.days(p.vacation_balance_days).replace(/^\d+\s/, "")}</span>
              </span>
            </div>
            <div className="mt-5 hidden flex-wrap items-center gap-2 sm:flex">
              {p.manager && (
                <Pill tone="white" className="h-7 px-3 text-[12.5px] font-medium">
                  {t.profile.manager}: {p.manager.full_name}
                </Pill>
              )}
              <Pill tone="white" className="h-7 px-3 text-[12.5px] font-medium">
                <Database className="size-3.5" /> {t.common.readOnly1c}
              </Pill>
            </div>
          </Link>
        )}

        {!p ? (
          <Skeleton className="hidden h-[184px] sm:block" />
        ) : (
          <Card className="hidden flex-col justify-between p-5 sm:flex sm:p-6">
            <div>
              <p className="text-[14px] font-medium text-jm-muted">{t.dashboard.vacationLeft}</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-[44px] leading-none font-extrabold tracking-[-0.04em] text-jm-green tabular">{p.vacation_balance_days}</span>
                <span className="text-[16px] font-semibold text-jm-ink/70">{t.common.days(p.vacation_balance_days).replace(/^\d+\s/, "")}</span>
              </p>
            </div>
            <Btn asChild variant="mint" className="mt-4 w-full">
              <Link href="/requests/new?type=vacation">
                <CalendarPlus /> {t.dashboard.vacationCta}
              </Link>
            </Btn>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        {[
          { href: "/requests/new?type=vacation", icon: CalendarPlus, label: t.dashboard.quickVacation },
          { href: "/requests/new?type=advance", icon: Wallet, label: t.dashboard.quickAdvance },
          { href: "/assistant", icon: MessagesSquare, label: t.dashboard.quickAsk },
        ].map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="group flex flex-col items-center gap-2.5 rounded-[20px] bg-white px-2 py-4 text-center transition-colors hover:bg-jm-mint/50 sm:flex-row sm:gap-3.5 sm:px-5 sm:py-4 sm:text-left"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-jm-mint transition-colors group-hover:bg-white">
              <q.icon className="size-[22px] text-jm-green" strokeWidth={1.8} />
            </span>
            <span className="text-[14px] leading-tight font-semibold sm:text-[16px]">{q.label}</span>
            <ChevronRight className="ml-auto hidden size-5 text-[#b6bdb9] sm:block" />
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section>
            <SectionTitle>{t.dashboard.tasksTitle}</SectionTitle>
            {!data ? (
              <Skeleton className="h-[140px]" />
            ) : data.tasks.length === 0 ? (
              <Card className="px-5 py-6 text-[15px] text-jm-muted">{t.dashboard.tasksEmpty}</Card>
            ) : (
              <RowList>
                {data.tasks.map((task, i) => (
                  <TaskRow key={i} task={task} />
                ))}
              </RowList>
            )}
          </section>

          {recent.length > 0 && (
            <section>
              <SectionTitle
                action={
                  <Link href="/requests" className="text-[13px] font-semibold text-jm-green">
                    {t.common.seeAll}
                  </Link>
                }
              >
                {t.dashboard.recentTitle}
              </SectionTitle>
              <RowList>
                {recent.map((r) => (
                  <RequestRow key={r.id} item={r} />
                ))}
              </RowList>
            </section>
          )}

          {data && data.active_requests.length > 0 && (
            <section>
              <SectionTitle
                action={
                  <Link href="/requests" className="text-[13px] font-semibold text-jm-green">
                    {t.common.seeAll}
                  </Link>
                }
              >
                {t.dashboard.activeTitle}
              </SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.active_requests.map((r) => (
                  <RequestTrackCard key={r.id} item={r} />
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-4">
          {data ? <LearningWidget enrollments={data.enrollments} /> : <Skeleton className="h-[160px]" />}
          {data && (
            <RowList>
              <Row
                href="/requests"
                icon={ClipboardCheck}
                title={t.dashboard.requests}
                meta={<span className="text-[15px] font-bold text-jm-green tabular">{data.active_requests.length}</span>}
              />
              <Row
                href="/notifications"
                icon={Bell}
                title={t.nav.notifications}
                subtitle={data.unread_notifications ? t.dashboard.unread(data.unread_notifications) : undefined}
                meta={data.unread_notifications ? <span className="size-2.5 rounded-full bg-jm-green" /> : undefined}
              />
            </RowList>
          )}
        </div>
      </div>
    </div>
  );
}
