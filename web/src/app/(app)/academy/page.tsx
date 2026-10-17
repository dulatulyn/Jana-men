"use client";

import Link from "next/link";
import { Clock, GraduationCap } from "lucide-react";
import { api } from "@/lib/api";
import type { Course, Enrollment } from "@/lib/api/types";
import { useApi } from "@/hooks/use-api";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { EmptyState, ErrorState, LoadingBlock, PageTitle, Pill, SectionTitle } from "@/components/shared/ui";
import { Segments } from "@/components/academy/segments";
import { CourseCover } from "@/components/academy/cover";

function StatusPill({ e }: { e?: Enrollment }) {
  const { t } = useI18n();
  if (!e) return null;
  if (e.status === "completed") return <Pill tone="mint">{t.academy.completed} · {e.score}%</Pill>;
  if (e.status === "in_progress") return <Pill tone="outline">{t.academy.inProgress}</Pill>;
  return <Pill tone="amber">{t.academy.notStarted}</Pill>;
}

function CourseCard({ course, e, wide = false }: { course: Course; e?: Enrollment; wide?: boolean }) {
  const { t, locale } = useI18n();
  const cta = !e ? t.common.open : e.status === "completed" ? t.academy.review : e.status === "in_progress" ? t.academy.continue : t.academy.start;
  return (
    <Link
      href={`/academy/${course.id}`}
      className={cn("group flex flex-col rounded-[20px] bg-white p-3 transition-colors hover:bg-[#fafcfb]", wide && "sm:flex-row sm:items-stretch sm:gap-2")}
    >
      <CourseCover cover={course.cover} className={cn(wide && "sm:h-auto sm:w-[240px]")} />
      <div className={cn("flex flex-1 flex-col px-2 pt-4 pb-2", wide && "sm:px-4 sm:pt-2")}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[16px] leading-snug font-semibold group-hover:text-jm-green">{course.title}</p>
        </div>
        <p className="mt-1 line-clamp-2 text-[13.5px] text-jm-muted">{course.description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-jm-muted">
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" /> {t.common.minutes(course.duration_min)}
          </span>
          <StatusPill e={e} />
          {e?.due_date && e.status !== "completed" && <Pill tone="amber">{t.academy.due(fmtDate(e.due_date, locale, { day: "numeric", month: "short" }))}</Pill>}
        </div>
        {e && e.status !== "completed" && (
          <div className="mt-4 flex items-center gap-3">
            <Segments value={e.progress_pct} className="flex-1" />
            <span className="text-[13px] font-semibold text-jm-green tabular">{e.progress_pct}%</span>
          </div>
        )}
        <span className={cn("mt-4 inline-flex h-10 items-center justify-center rounded-full bg-jm-mint text-[14px] font-semibold text-jm-green-strong transition-colors group-hover:bg-jm-green group-hover:text-white", wide && "sm:mt-5 sm:w-48 sm:self-start")}>
          {cta}
        </span>
      </div>
    </Link>
  );
}

export default function AcademyPage() {
  const { t } = useI18n();
  const { data: courses, error } = useApi(() => api.courses());
  const { data: enr } = useApi(() => api.myEnrollments());

  if (error) return <ErrorState error={error} />;
  const byCourse = new Map((enr ?? []).map((e) => [e.course_id, e]));
  const assigned = (enr ?? []).filter((e) => e.status !== "completed");

  return (
    <div className="space-y-7">
      <PageTitle title={t.academy.title} />
      <section>
        <SectionTitle>{t.academy.assigned}</SectionTitle>
        {!enr || !courses ? (
          <LoadingBlock rows={1} />
        ) : assigned.length === 0 ? (
          <EmptyState icon={GraduationCap} title={t.profile.learningEmpty} />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {assigned.map((e) => {
              const c = courses.find((x) => x.id === e.course_id);
              return c ? <CourseCard key={e.id} course={c} e={e} wide /> : null;
            })}
          </div>
        )}
      </section>
      <section>
        <SectionTitle>{t.academy.catalog}</SectionTitle>
        {!courses ? (
          <LoadingBlock rows={2} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} e={byCourse.get(c.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
