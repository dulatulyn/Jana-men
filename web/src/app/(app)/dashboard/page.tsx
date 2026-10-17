"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  CalendarPlus,
  CircleAlert,
  ClipboardCheck,
  Database,
  FileText,
  GraduationCap,
  MessageCircleQuestion,
  MessagesSquare,
  Palmtree,
  PartyPopper,
  Plus,
  Users,
  Wallet,
  ChevronRight,
  CircleCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Enrollment, Notification, RequestListItem, Task } from "@/lib/api/types";
import { useApi } from "@/hooks/use-api";
import {
  useApprovalIds,
  useDashboard,
  useIsLead,
  useMyRequests,
  useNotifications,
  useTeam,
  useTeamAcademy,
  useTeamOutlook,
  useTeamRequests,
} from "@/hooks/queries";
import { useI18n } from "@/i18n";
import { useSession } from "@/lib/session";
import { capitalize, experience, firstName, fmtDate, fmtRelative, fmtShort } from "@/lib/format";
import { addDays, isDueSoon, isOverdue, isPending, todayISO } from "@/lib/team";
import { vacationFromSummary } from "@/lib/requests";
import { cn } from "@/lib/utils";
import { Avatar, ErrorState, LoadingRows, Panel, PanelEmpty, PanelLink, Pill, RowList, Skeleton } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { PageHeader } from "@/components/shell/page-header";
import { InboxRow, RequestRow } from "@/components/requests/request-row";
import { StatusBadge } from "@/components/requests/track";
import { useDecisions } from "@/components/requests/decision";
import { Segments } from "@/components/academy/segments";
import { AssignDialog } from "@/components/academy/assign-dialog";

function greeting(t: ReturnType<typeof useI18n>["t"]) {
  const h = new Date().getHours();
  return h < 12 ? t.dashboard.greet.morning : h < 18 ? t.dashboard.greet.day : t.dashboard.greet.evening;
}

function useNextVacation(mine: RequestListItem[] | undefined) {
  const today = todayISO();
  return (mine ?? [])
    .filter((r) => r.type === "vacation" && (r.status === "approved" || isPending(r)))
    .map((r) => ({ r, d: vacationFromSummary(r.summary) }))
    .filter((x): x is { r: RequestListItem; d: { start_date: string; end_date: string } } => !!x.d && x.d.end_date >= today)
    .sort((a, b) => a.d.start_date.localeCompare(b.d.start_date))[0];
}

function Hero() {
  const { t } = useI18n();
  const { data } = useDashboard();
  const p = data?.profile;
  if (!p) return <Skeleton className="col-span-12 h-[188px] rounded-[20px] md:col-span-8" />;
  const exp = experience(p.hire_date);
  return (
    <Link
      href="/profile"
      className="group relative col-span-12 flex min-h-[188px] flex-col overflow-hidden rounded-[20px] bg-[linear-gradient(135deg,#2aa126_0%,#1b8918_55%,#157a13_100%)] p-5 text-white sm:p-6 md:col-span-8"
    >
      <svg className="pointer-events-none absolute -right-16 -bottom-24 h-[300px] w-[300px] text-white/[0.07]" viewBox="0 0 200 200" fill="none" aria-hidden>
        <circle cx="100" cy="100" r="98" stroke="currentColor" strokeWidth="2" strokeDasharray="6 8" />
        <circle cx="100" cy="100" r="62" stroke="currentColor" strokeWidth="2" strokeDasharray="6 8" />
      </svg>
      <div className="relative flex items-start gap-4">
        <Avatar name={p.full_name} size={56} className="bg-white/95" />
        <div className="min-w-0 flex-1">
          <p className="text-[19px] leading-tight font-bold tracking-tight sm:text-[21px]">{p.full_name}</p>
          <p className="mt-1 text-[14px] text-white/85">{p.position}</p>
          <p className="hidden truncate text-[13.5px] text-white/70 sm:block">
            {p.department} · {p.company}
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="relative mt-auto pt-5">
        <div className="flex items-end justify-between gap-3 rounded-2xl bg-white/12 px-4 py-3 md:hidden">
          <span className="text-[13px] text-white/80">{t.dashboard.vacationLeft}</span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[28px] leading-none font-extrabold tracking-[-0.04em] tabular">{p.vacation_balance_days}</span>
            <span className="text-[14px] font-semibold text-white/85">{t.common.daysWord(p.vacation_balance_days)}</span>
          </span>
        </div>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {p.manager && (
            <Pill tone="white" className="h-7 px-3 text-[12.5px] font-medium">
              {t.profile.manager}: {p.manager.full_name}
            </Pill>
          )}
          <Pill tone="white" className="h-7 px-3 text-[12.5px] font-medium">
            {t.profile.experience(exp.years, exp.months)}
          </Pill>
          <Pill tone="white" className="h-7 px-3 text-[12.5px] font-medium">
            <Database className="size-3.5" /> {t.common.readOnly1c}
          </Pill>
        </div>
      </div>
    </Link>
  );
}

function VacationCard() {
  const { t, locale } = useI18n();
  const { data } = useDashboard();
  const { data: mine } = useMyRequests();
  const next = useNextVacation(mine);
  const p = data?.profile;
  if (!p) return <Skeleton className="col-span-4 hidden h-[188px] rounded-[20px] md:block" />;
  return (
    <div className="col-span-4 hidden flex-col rounded-[20px] bg-white p-5 sm:p-6 md:flex">
      <p className="text-[13px] font-medium text-jm-muted">{t.dashboard.vacationLeft}</p>
      <p className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[44px] leading-none font-extrabold tracking-[-0.04em] text-jm-green tabular">{p.vacation_balance_days}</span>
        <span className="text-[16px] font-semibold text-jm-ink/70">{t.common.daysWord(p.vacation_balance_days)}</span>
      </p>
      {next ? (
        <Link href={`/requests/${next.r.id}`} className="mt-3 flex items-center gap-2 text-[13px] text-jm-muted hover:text-jm-ink">
          <Palmtree className="size-4 shrink-0 text-jm-green" />
          <span className="truncate">
            {t.dashboard.nextVacation}: <b className="font-semibold text-jm-ink">{fmtShort(next.d.start_date, locale)}</b>
          </span>
          <StatusBadge status={next.r.status} className="h-5 px-2 text-[11px]" />
        </Link>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-jm-muted">
          <Palmtree className="size-4 shrink-0 text-jm-green" /> {t.dashboard.noVacationPlanned}
        </p>
      )}
      <div className="mt-auto pt-4">
        <Btn asChild variant="mint" className="w-full">
          <Link href="/requests/new?type=vacation">
            <CalendarPlus /> {t.dashboard.vacationCta}
          </Link>
        </Btn>
      </div>
    </div>
  );
}

function QuickActions() {
  const { t } = useI18n();
  const { me } = useSession();
  const items = [
    { href: "/requests/new?type=vacation", icon: CalendarPlus, label: t.dashboard.quickVacation, hint: t.dashboard.quickVacationHint },
    { href: "/requests/new?type=advance", icon: Wallet, label: t.dashboard.quickAdvance, hint: t.dashboard.quickAdvanceHint },
    { href: "/assistant", icon: MessagesSquare, label: me?.role === "hr" ? t.nav.assistant : t.dashboard.quickAsk, hint: t.dashboard.quickAskHint },
  ];
  return (
    <>
      {items.map((q) => (
        <Link
          key={q.href}
          href={q.href}
          className="group col-span-4 flex flex-col items-center gap-2.5 rounded-[20px] bg-white px-2 py-4 text-center transition-colors hover:bg-jm-mint/45 sm:flex-row sm:gap-3.5 sm:px-5 sm:text-left"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-jm-mint transition-colors group-hover:bg-white">
            <q.icon className="size-[21px] text-jm-green" strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] leading-tight font-semibold sm:text-[15.5px]">{q.label}</span>
            <span className="mt-0.5 hidden truncate text-[12.5px] text-jm-muted sm:block">{q.hint}</span>
          </span>
          <ChevronRight className="hidden size-5 shrink-0 text-[#b6bdb9] transition-transform group-hover:translate-x-0.5 sm:block" />
        </Link>
      ))}
    </>
  );
}

function TaskIcon({ type }: { type: string }) {
  if (type === "approve_request") return <ClipboardCheck className="size-[19px] text-jm-green" strokeWidth={1.9} />;
  if (type === "course") return <GraduationCap className="size-[19px] text-jm-green" strokeWidth={1.9} />;
  return <CircleAlert className="size-[19px] text-jm-red" strokeWidth={1.9} />;
}

function TaskRow({ task }: { task: Task }) {
  const { t, locale } = useI18n();
  const overdue = !!task.due && task.due < todayISO();
  return (
    <Link href={task.link} className="group flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-[#f8faf9]">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", task.type === "request_rejected" ? "bg-jm-red-bg" : "bg-jm-mint")}>
        <TaskIcon type={task.type} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] leading-snug font-medium group-hover:text-jm-green-strong">{task.title}</span>
        {task.due && (
          <Pill tone={overdue ? "red" : "amber"} className="mt-1.5 sm:hidden">
            {t.dashboard.due(fmtShort(task.due, locale))}
          </Pill>
        )}
      </span>
      {task.due && (
        <Pill tone={overdue ? "red" : "amber"} className="hidden sm:inline-flex">
          {t.dashboard.due(fmtShort(task.due, locale))}
        </Pill>
      )}
      <ChevronRight className="size-[18px] shrink-0 text-[#b6bdb9]" />
    </Link>
  );
}

function TasksPanel({ className, excludeApprovals }: { className?: string; excludeApprovals?: boolean }) {
  const { t } = useI18n();
  const { data } = useDashboard();
  const tasks = (data?.tasks ?? []).filter((x) => !excludeApprovals || x.type !== "approve_request");
  return (
    <Panel title={t.dashboard.tasksTitle} icon={CircleCheck} count={tasks.length} className={className}>
      {!data ? (
        <LoadingRows rows={2} />
      ) : tasks.length === 0 ? (
        <PanelEmpty icon={PartyPopper} title={t.dashboard.tasksEmptyTitle} hint={t.dashboard.tasksEmpty} />
      ) : (
        <RowList>
          {tasks.slice(0, 5).map((task, i) => (
            <TaskRow key={i} task={task} />
          ))}
        </RowList>
      )}
    </Panel>
  );
}

function LearningRow({ e }: { e: Enrollment }) {
  const { t, locale } = useI18n();
  const overdue = isOverdue(e);
  return (
    <Link href={`/academy/${e.course_id}`} className="group block px-5 py-3.5 transition-colors hover:bg-[#f8faf9]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-[14px] font-semibold group-hover:text-jm-green-strong">{e.course?.title}</span>
        <span className="text-[13px] font-semibold text-jm-green tabular">{e.progress_pct}%</span>
      </div>
      <Segments value={e.progress_pct} />
      {e.due_date && <p className={cn("mt-2 text-[12px] font-medium", overdue ? "text-jm-red" : "text-jm-amber")}>{t.academy.due(fmtShort(e.due_date, locale))}</p>}
    </Link>
  );
}

function LearningPanel({ className }: { className?: string }) {
  const { t } = useI18n();
  const { data } = useDashboard();
  const all = data?.enrollments ?? [];
  const done = all.filter((e) => e.status === "completed").length;
  const open = all.filter((e) => e.status !== "completed");
  return (
    <Panel title={t.dashboard.learningTitle} icon={GraduationCap} className={className} action={<PanelLink href="/academy">{t.common.seeAll}</PanelLink>}>
      {!data ? (
        <LoadingRows rows={2} />
      ) : all.length === 0 ? (
        <PanelEmpty icon={GraduationCap} title={t.profile.learningEmpty} />
      ) : (
        <div>
          <p className="px-5 pt-4 text-[22px] font-bold tracking-tight tabular">{t.dashboard.coursesDone(done, all.length)}</p>
          {open.length === 0 ? (
            <p className="flex items-center gap-2 px-5 pt-2 pb-5 text-[14px] text-jm-green-strong">
              <PartyPopper className="size-4" /> {t.academy.inProfile}
            </p>
          ) : (
            <RowList className="pt-1">
              {open.map((e) => (
                <LearningRow key={e.id} e={e} />
              ))}
            </RowList>
          )}
        </div>
      )}
    </Panel>
  );
}

function MyRequestsPanel({ className }: { className?: string }) {
  const { t } = useI18n();
  const { data } = useMyRequests();
  const active = (data ?? []).filter(isPending);
  const rest = (data ?? []).filter((r) => !isPending(r));
  const rows = [...active, ...rest].slice(0, Math.max(4, active.length));
  return (
    <Panel
      title={t.dashboard.myRequestsTitle}
      icon={FileText}
      count={active.length}
      className={className}
      action={
        <>
          <Btn asChild size="sm" variant="mint" className="h-8 px-3 text-[13px]">
            <Link href="/requests/new">
              <Plus className="!size-4" /> {t.requests.new}
            </Link>
          </Btn>
          <PanelLink href="/requests">{t.common.seeAll}</PanelLink>
        </>
      }
    >
      {!data ? (
        <LoadingRows rows={3} />
      ) : rows.length === 0 ? (
        <PanelEmpty icon={FileText} title={t.requests.empty} hint={t.requests.emptyHint} />
      ) : (
        <RowList>
          {rows.map((r) => (
            <RequestRow key={r.id} item={r} track={isPending(r)} />
          ))}
        </RowList>
      )}
    </Panel>
  );
}

function NotificationsPanel({ className }: { className?: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { invalidate } = useSession();
  const { data } = useNotifications();
  const list = (data ?? []).slice(0, 4);
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  const open = async (n: Notification) => {
    if (!n.read_at) {
      await api.readNotification(n.id).catch(() => {});
      invalidate();
    }
    router.push(n.link ?? "/notifications");
  };
  return (
    <Panel title={t.dashboard.notificationsTitle} icon={Bell} count={unread} className={className} action={<PanelLink href="/notifications">{t.common.seeAll}</PanelLink>}>
      {!data ? (
        <LoadingRows rows={3} />
      ) : list.length === 0 ? (
        <PanelEmpty icon={Bell} title={t.dashboard.notificationsEmpty} />
      ) : (
        <RowList>
          {list.map((n) => (
            <button key={n.id} type="button" onClick={() => open(n)} className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[#f8faf9]">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-[#d5dbd8]" : "bg-jm-green")} />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[14px]", n.read_at ? "font-medium text-jm-ink/80" : "font-semibold")}>{n.title}</span>
                <span className="block text-[12.5px] text-jm-muted">{fmtRelative(n.created_at, locale, t.common.today, t.common.yesterday)}</span>
              </span>
            </button>
          ))}
        </RowList>
      )}
    </Panel>
  );
}

function ApprovalsPanel({ className }: { className?: string }) {
  const { t } = useI18n();
  const { data: reqs } = useTeamRequests();
  const { ids, ready } = useApprovalIds();
  const decisions = useDecisions();
  const inbox = (reqs ?? []).filter((r) => ids.has(r.id));
  return (
    <Panel
      title={t.dashboard.approvalsTitle}
      icon={ClipboardCheck}
      count={inbox.length}
      className={className}
      action={<PanelLink href="/approvals">{t.common.seeAll}</PanelLink>}
    >
      {!reqs || !ready ? (
        <LoadingRows rows={2} />
      ) : inbox.length === 0 ? (
        <PanelEmpty icon={CircleCheck} title={t.dashboard.approvalsEmpty} hint={t.dashboard.approvalsEmptyHint} />
      ) : (
        <RowList>
          {inbox.slice(0, 4).map((r) => (
            <InboxRow key={r.id} item={r} decisions={decisions} />
          ))}
        </RowList>
      )}
      {decisions.dialog}
    </Panel>
  );
}

function TeamNowPanel({ className }: { className?: string }) {
  const { t, locale } = useI18n();
  const { me } = useSession();
  const { data: team } = useTeam();
  const { data: entries } = useTeamOutlook();
  const today = todayISO();
  const soonEdge = addDays(today, 14);
  const members = new Map((team ?? []).map((m) => [m.id, m]));
  const mine = (entries ?? []).filter((e) => members.has(e.employee.id));
  const now = mine.filter((e) => e.status === "approved" && e.start_date <= today && e.end_date >= today);
  const soon = mine.filter((e) => e.start_date > today && e.start_date <= soonEdge).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const title = me?.role === "hr" ? t.dashboard.companyNowTitle : t.dashboard.teamNowTitle;
  return (
    <Panel
      title={title}
      icon={Users}
      className={className}
      action={<PanelLink href={me?.role === "hr" ? "/hr#calendar" : "/team#calendar"}>{t.dashboard.calendarLink}</PanelLink>}
    >
      {!team || !entries ? (
        <LoadingRows rows={2} />
      ) : now.length + soon.length === 0 ? (
        <PanelEmpty icon={CircleCheck} title={t.dashboard.allPresent} hint={t.dashboard.allPresentHint(team.length)} />
      ) : (
        <div className="divide-y divide-jm-line">
          {[
            { key: "now", label: t.dashboard.onVacationNow, list: now },
            { key: "soon", label: t.dashboard.soonVacation, list: soon },
          ]
            .filter((g) => g.list.length)
            .map((g) => (
              <div key={g.key} className="py-2">
                <p className="px-5 pt-1.5 pb-1 text-[11.5px] font-semibold tracking-[0.06em] text-jm-muted uppercase">{g.label}</p>
                {g.list.map((e, i) => (
                  <Link key={i} href={`/team/${e.employee.id}`} className="flex items-center gap-3 px-5 py-2 transition-colors hover:bg-[#f8faf9]">
                    <Avatar name={e.employee.full_name} size={32} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{e.employee.full_name}</span>
                    <span className="shrink-0 text-[12.5px] text-jm-muted">
                      {g.key === "now" ? t.dashboard.until(fmtShort(e.end_date, locale)) : t.dashboard.from(fmtShort(e.start_date, locale))}
                    </span>
                    {e.status !== "approved" && <StatusBadge status={e.status} className="h-5 px-2 text-[11px]" />}
                  </Link>
                ))}
              </div>
            ))}
        </div>
      )}
    </Panel>
  );
}

function TeamTrainingPanel({ className }: { className?: string }) {
  const { t, locale } = useI18n();
  const { me } = useSession();
  const { data } = useTeamAcademy();
  const [assign, setAssign] = useState(false);
  const today = todayISO();
  const rows = (data ?? [])
    .flatMap((c) => c.members.map((m) => ({ ...m, course: c.course })))
    .filter((m) => m.status !== "completed")
    .map((m) => ({ ...m, overdue: isOverdue(m, today), soon: isDueSoon(m, 7, today) }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(b.soon) - Number(a.soon) || (a.due_date ?? "9").localeCompare(b.due_date ?? "9"));
  const total = (data ?? []).reduce((s, c) => s + c.assigned, 0);
  const done = (data ?? []).reduce((s, c) => s + c.completed, 0);
  const overdue = rows.filter((r) => r.overdue).length;
  return (
    <Panel
      title={me?.role === "hr" ? t.dashboard.companyTrainingTitle : t.dashboard.teamTrainingTitle}
      icon={GraduationCap}
      className={className}
      action={
        <>
          <Btn size="sm" variant="mint" className="h-8 px-3 text-[13px]" onClick={() => setAssign(true)}>
            <Plus className="!size-4" /> {t.team.assign}
          </Btn>
          <PanelLink href="/academy?tab=team">{t.common.seeAll}</PanelLink>
        </>
      }
    >
      {!data ? (
        <LoadingRows rows={3} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-jm-line px-5 py-3 text-[13px] text-jm-muted">
            <span>
              <b className="text-[15px] font-bold text-jm-ink tabular">{done}</b> / {total} {t.dashboard.completedShort}
            </span>
            <span>
              <b className="text-[15px] font-bold text-jm-ink tabular">{rows.length}</b> {t.dashboard.inWorkShort}
            </span>
            <span className={cn(overdue && "text-jm-red")}>
              <b className={cn("text-[15px] font-bold tabular", overdue ? "text-jm-red" : "text-jm-ink")}>{overdue}</b> {t.dashboard.overdueShort}
            </span>
          </div>
          {rows.length === 0 ? (
            <PanelEmpty icon={PartyPopper} title={total ? t.dashboard.trainingAllDone : t.dashboard.trainingEmpty} />
          ) : (
            <RowList>
              {rows.slice(0, 4).map((r, i) => (
                <Link key={i} href={`/team/${r.employee.id}`} className="group flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-[#f8faf9]">
                  <Avatar name={r.employee.full_name} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold group-hover:text-jm-green-strong">{r.employee.full_name}</span>
                    <span className="block truncate text-[12.5px] text-jm-muted">{r.course.title}</span>
                  </span>
                  <span className="hidden w-[140px] items-center gap-2 sm:flex">
                    <Segments value={r.progress} className="flex-1" />
                    <span className="w-9 text-right text-[12.5px] font-semibold text-jm-green tabular">{r.progress}%</span>
                  </span>
                  {r.due_date ? (
                    <Pill tone={r.overdue ? "red" : r.soon ? "amber" : "gray"} className="min-w-[84px] justify-center">
                      {r.overdue ? t.academy.overdue : t.academy.due(fmtShort(r.due_date, locale))}
                    </Pill>
                  ) : (
                    <span className="min-w-[84px]" />
                  )}
                </Link>
              ))}
            </RowList>
          )}
        </>
      )}
      <AssignDialog open={assign} onOpenChange={setAssign} />
    </Panel>
  );
}

function UnansweredPanel({ className }: { className?: string }) {
  const { t, locale } = useI18n();
  const { data } = useApi(() => api.unanswered(), "", "unanswered");
  return (
    <Panel title={t.dashboard.unansweredTitle} icon={MessageCircleQuestion} count={data?.length} className={className} action={<PanelLink href="/hr#unanswered">{t.common.seeAll}</PanelLink>}>
      {!data ? (
        <LoadingRows rows={3} />
      ) : data.length === 0 ? (
        <PanelEmpty icon={CircleCheck} title={t.dashboard.unansweredEmpty} />
      ) : (
        <RowList>
          {data.slice(0, 4).map((q, i) => (
            <Link key={i} href="/hr#unanswered" className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-[#f8faf9]">
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-[14px] leading-snug font-medium">{q.question}</span>
                <span className="text-[12px] text-jm-muted">{fmtRelative(q.last_asked_at, locale, t.common.today, t.common.yesterday)}</span>
              </span>
              <Pill tone="gray">{t.hr.asked(q.count)}</Pill>
            </Link>
          ))}
        </RowList>
      )}
    </Panel>
  );
}

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const { me } = useSession();
  const lead = useIsLead();
  const { error } = useDashboard();

  return (
    <div className="stack">
      <PageHeader
        title={`${greeting(t)}, ${firstName(me?.full_name ?? "")}`}
        mobileTitle={greeting(t)}
        subtitle={capitalize(fmtDate(new Date().toISOString(), locale, { weekday: "long", day: "numeric", month: "long" }))}
      />
      {error ? (
        <ErrorState error={error} />
      ) : (
        <div className="grid-12">
          <Hero />
          <VacationCard />
          <QuickActions />
          {lead ? (
            <>
              <ApprovalsPanel className="col-span-12 lg:col-span-8" />
              <TeamNowPanel className="col-span-12 lg:col-span-4" />
              <TeamTrainingPanel className="col-span-12 lg:col-span-8" />
              {me?.role === "hr" ? <UnansweredPanel className="col-span-12 lg:col-span-4" /> : <TasksPanel excludeApprovals className="col-span-12 lg:col-span-4" />}
              <MyRequestsPanel className="col-span-12 lg:col-span-8" />
              <NotificationsPanel className="col-span-12 lg:col-span-4" />
            </>
          ) : (
            <>
              <TasksPanel className="col-span-12 lg:col-span-8" />
              <LearningPanel className="col-span-12 lg:col-span-4" />
              <MyRequestsPanel className="col-span-12 lg:col-span-8" />
              <NotificationsPanel className="col-span-12 lg:col-span-4" />
            </>
          )}
        </div>
      )}
    </div>
  );
}
