"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock, GraduationCap, Plus, Users } from "lucide-react";
import type { Course, Enrollment, TeamAcademyCourse } from "@/lib/api/types";
import { useCourses, useIsLead, useMyEnrollments, useTeamAcademy } from "@/hooks/queries";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { fmtShort } from "@/lib/format";
import { Avatar, EmptyState, ErrorState, Pill, SectionTitle, Skeleton } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { Chips } from "@/components/shared/chips";
import { PageHeader } from "@/components/shell/page-header";
import { Segments } from "@/components/academy/segments";
import { CourseCover } from "@/components/academy/cover";
import { AssignDialog } from "@/components/academy/assign-dialog";

function StatusPill({ e }: { e?: Enrollment }) {
  const { t } = useI18n();
  if (!e) return null;
  if (e.status === "completed")
    return (
      <Pill tone="mint">
        {t.academy.completed} · {e.score}%
      </Pill>
    );
  if (e.status === "in_progress") return <Pill tone="outline">{t.academy.inProgress}</Pill>;
  return <Pill tone="amber">{t.academy.notStarted}</Pill>;
}

function CourseCard({ course, e, layout = "column", featured = false, className }: { course: Course; e?: Enrollment; layout?: "row" | "column"; featured?: boolean; className?: string }) {
  const { t, locale } = useI18n();
  const cta = !e ? t.common.open : e.status === "completed" ? t.academy.review : e.status === "in_progress" ? t.academy.continue : t.academy.start;
  const row = layout === "row";
  return (
    <Link
      href={`/academy/${course.id}`}
      className={cn("group flex flex-col rounded-[20px] bg-white p-3 transition-colors hover:bg-[#fbfcfb]", row && "sm:flex-row sm:items-stretch sm:gap-2", className)}
    >
      <CourseCover
        cover={course.cover}
        className={cn("aspect-[3/2] h-auto w-full", row && (featured ? "sm:w-[300px] lg:w-[360px]" : "sm:w-[210px] xl:w-[240px]"))}
      />
      <div className={cn("flex min-w-0 flex-1 flex-col px-2 pt-4 pb-2", row && "sm:px-4 sm:pt-2")}>
        <p className={cn("leading-snug font-semibold group-hover:text-jm-green-strong", featured ? "text-[19px] sm:text-[21px]" : "text-[16px]")}>{course.title}</p>
        <p className={cn("mt-1 text-[13.5px] text-jm-muted", featured ? "line-clamp-3" : "line-clamp-2")}>{course.description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-jm-muted">
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" /> {t.common.minutes(course.duration_min)}
          </span>
          <StatusPill e={e} />
          {e?.due_date && e.status !== "completed" && <Pill tone="amber">{t.academy.due(fmtShort(e.due_date, locale))}</Pill>}
        </div>
        {e && e.status !== "completed" && (
          <div className="mt-4 flex items-center gap-3">
            <Segments value={e.progress_pct} className="flex-1" />
            <span className="text-[13px] font-semibold text-jm-green tabular">{e.progress_pct}%</span>
          </div>
        )}
        <span className="mt-auto block pt-4">
          <span
            className={cn(
              "flex h-10 items-center justify-center rounded-full bg-jm-mint text-[14px] font-semibold text-jm-green-strong transition-colors group-hover:bg-jm-green group-hover:text-white",
              row && "sm:w-52",
            )}
          >
            {cta}
          </span>
        </span>
      </div>
    </Link>
  );
}

function catalogSpan(n: number) {
  if (n <= 2) return "col-span-12 lg:col-span-6";
  if (n === 3) return "col-span-12 md:col-span-6 xl:col-span-4";
  return "col-span-12 sm:col-span-6 lg:col-span-4 2xl:col-span-3";
}

function MineView() {
  const { t } = useI18n();
  const { data: courses, error } = useCourses();
  const { data: enr } = useMyEnrollments();
  if (error) return <ErrorState error={error} />;
  if (!courses || !enr)
    return (
      <div className="grid-12">
        <Skeleton className="col-span-12 h-[260px] rounded-[20px]" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="col-span-12 h-[340px] rounded-[20px] md:col-span-6 xl:col-span-4" />
        ))}
      </div>
    );
  const byCourse = new Map(enr.map((e) => [e.course_id, e]));
  const assigned = enr.filter((e) => e.status !== "completed");
  const n = courses.length;
  return (
    <div className="stack">
      <SectionTitle>{t.academy.assigned}</SectionTitle>
      {assigned.length === 0 ? (
        <EmptyState icon={GraduationCap} title={t.academy.assignedEmpty} className="py-10" />
      ) : (
        <div className="grid-12">
          {assigned.map((e) => {
            const c = courses.find((x) => x.id === e.course_id);
            return c ? <CourseCard key={e.id} course={c} e={e} layout="row" featured={assigned.length === 1} className={assigned.length === 1 ? "col-span-12" : "col-span-12 xl:col-span-6"} /> : null;
          })}
        </div>
      )}
      <SectionTitle className="mt-2">
        {t.academy.catalog} <span className="ml-1 font-medium text-jm-muted tabular">{n}</span>
      </SectionTitle>
      <div className="grid-12">
        {courses.map((c) => (
          <CourseCard key={c.id} course={c} e={byCourse.get(c.id)} layout={n <= 2 ? "row" : "column"} className={catalogSpan(n)} />
        ))}
      </div>
    </div>
  );
}

function TeamCourse({ row, onAssign, className }: { row: TeamAcademyCourse; onAssign: (courseId: number) => void; className?: string }) {
  const { t, locale } = useI18n();
  const avg = row.members.length ? Math.round(row.members.reduce((x, m) => x + (m.status === "completed" ? 100 : m.progress), 0) / row.members.length) : 0;
  const stats = [
    { label: t.academy.assignedCount, n: row.assigned, cls: "" },
    { label: t.academy.completedCount, n: row.completed, cls: "text-jm-green" },
    { label: t.academy.inProgressCount, n: row.in_progress, cls: "" },
    { label: t.academy.overdueCount, n: row.overdue, cls: row.overdue ? "text-jm-red" : "" },
  ];
  return (
    <section className={cn("flex min-w-0 flex-col overflow-hidden rounded-[20px] bg-white", className)}>
      <header className="flex items-center gap-3 border-b border-jm-line p-4 pr-5">
        <CourseCover cover={row.course.cover} size="sm" />
        <div className="min-w-0 flex-1">
          <Link href={`/academy/${row.course.id}`} className="line-clamp-2 text-[15px] leading-snug font-semibold hover:text-jm-green-strong">
            {row.course.title}
          </Link>
          <p className="flex items-center gap-1 text-[12.5px] text-jm-muted">
            <Clock className="size-3.5" /> {t.common.minutes(row.course.duration_min)}
          </p>
        </div>
      </header>
      <div className="grid grid-cols-4 gap-2 px-5 pt-4">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <p className={cn("text-[20px] leading-none font-bold tabular", s.cls)}>{s.n}</p>
            <p className="mt-1 truncate text-[11.5px] text-jm-muted">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="mx-5 mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#eef1ef]">
          <div className="h-full rounded-full bg-jm-green transition-[width] duration-700" style={{ width: `${avg}%` }} />
        </div>
        <span className="text-[12px] font-semibold text-jm-green tabular" title={t.academy.avgProgress}>
          {avg}%
        </span>
      </div>
      <div className="mt-3 flex-1 divide-y divide-jm-line border-t border-jm-line">
        {row.members.length === 0 ? (
          <p className="px-5 py-6 text-center text-[13.5px] text-jm-muted">{t.academy.nobodyAssigned}</p>
        ) : (
          row.members.map((m) => (
            <Link key={m.enrollment_id} href={`/team/${m.employee.id}`} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-[#f8faf9]">
              <Avatar name={m.employee.full_name} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{m.employee.full_name}</span>
                {m.status !== "completed" && m.due_date && (
                  <span className={cn("block text-[12px]", m.overdue ? "font-semibold text-jm-red" : "text-jm-muted")}>
                    {m.overdue ? `${t.academy.overdue} · ${fmtShort(m.due_date, locale)}` : t.academy.due(fmtShort(m.due_date, locale))}
                  </span>
                )}
              </span>
              {m.status === "completed" ? (
                <Pill tone="mint">{m.score != null ? `${m.score}%` : t.academy.completed}</Pill>
              ) : m.status === "in_progress" ? (
                <span className="flex w-[92px] items-center gap-2">
                  <Segments value={m.progress} className="flex-1" />
                  <span className="text-[12px] font-semibold text-jm-green tabular">{m.progress}%</span>
                </span>
              ) : (
                <Pill tone="amber">{t.academy.notStarted}</Pill>
              )}
            </Link>
          ))
        )}
      </div>
      <footer className="flex items-center gap-3 border-t border-jm-line bg-[#fafbfa] px-5 py-3">
        <span className="flex min-w-0 flex-1 items-center gap-2 text-[12.5px] text-jm-muted">
          <Users className="size-4 shrink-0 text-jm-green" />
          <span className="truncate">
            {row.unassigned.length ? `${t.academy.unassigned}: ${row.unassigned.map((p) => p.full_name.split(" ")[0]).join(", ")}` : t.academy.allAssigned}
          </span>
        </span>
        <Btn size="sm" variant="mint" className="h-8 shrink-0 px-3 text-[13px]" onClick={() => onAssign(row.course.id)} disabled={!row.unassigned.length}>
          <Plus className="!size-4" /> {t.academy.assign}
        </Btn>
      </footer>
    </section>
  );
}

function TeamView() {
  const { data, error } = useTeamAcademy();
  const [courseId, setCourseId] = useState<number | null>(null);
  if (error) return <ErrorState error={error} />;
  if (!data)
    return (
      <div className="grid-12">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="col-span-12 h-[360px] rounded-[20px] md:col-span-6 xl:col-span-4" />
        ))}
      </div>
    );
  const span = data.length <= 2 ? "col-span-12 lg:col-span-6" : "col-span-12 md:col-span-6 xl:col-span-4";
  return (
    <div className="grid-12">
      {data.map((row) => (
        <TeamCourse key={row.course.id} row={row} onAssign={setCourseId} className={span} />
      ))}
      <AssignDialog open={courseId !== null} onOpenChange={(o) => !o && setCourseId(null)} courseId={courseId ?? undefined} />
    </div>
  );
}

function AcademyInner() {
  const { t } = useI18n();
  const lead = useIsLead();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data: courses } = useCourses();
  const { data: enr } = useMyEnrollments();
  const tab = lead && sp.get("tab") === "team" ? "team" : "mine";
  const setTab = (v: "mine" | "team") => router.replace(v === "team" ? `${pathname}?tab=team` : pathname, { scroll: false });
  const open = (enr ?? []).filter((e) => e.status !== "completed").length;

  return (
    <div className="stack">
      <PageHeader title={t.academy.title} subtitle={courses ? t.academy.subtitle(courses.length, open) : undefined} />
      {lead && (
        <Chips
          value={tab}
          onChange={setTab}
          label={t.academy.title}
          options={[
            { v: "mine" as const, label: t.academy.tabMine },
            { v: "team" as const, label: t.academy.tabTeam },
          ]}
        />
      )}
      {tab === "team" ? <TeamView /> : <MineView />}
    </div>
  );
}

export default function AcademyPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[420px] rounded-[20px]" />}>
      <AcademyInner />
    </Suspense>
  );
}
