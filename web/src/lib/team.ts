import type {
  CalendarEntry,
  Course,
  Enrollment,
  NextVacation,
  RequestListItem,
  TeamAcademyCourse,
  TeamMember,
  VacationSpan,
} from "@/lib/api/types";
import { toISODate } from "@/lib/format";
import { vacationFromSummary } from "@/lib/requests";

export const todayISO = () => toISODate(new Date());

export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISODate(d);
};

export const isPending = (r: { status: RequestListItem["status"] }) => r.status === "submitted" || r.status === "manager_approved";

export const isOverdue = (e: Pick<Enrollment, "status" | "due_date">, today = todayISO()) => e.status !== "completed" && !!e.due_date && e.due_date < today;

export const isDueSoon = (e: Pick<Enrollment, "status" | "due_date">, days = 7, today = todayISO()) =>
  e.status !== "completed" && !!e.due_date && e.due_date >= today && e.due_date <= addDays(today, days);

export function vacationNow(m: Pick<TeamMember, "id" | "on_vacation">, entries: CalendarEntry[] | undefined, today = todayISO()): VacationSpan | null {
  if (m.on_vacation !== undefined) return m.on_vacation;
  const e = (entries ?? []).find((x) => x.employee.id === m.id && x.status === "approved" && x.start_date <= today && x.end_date >= today);
  return e ? { start_date: e.start_date, end_date: e.end_date } : null;
}

export function vacationNext(m: Pick<TeamMember, "id" | "next_vacation">, entries: CalendarEntry[] | undefined, today = todayISO()): NextVacation | null {
  if (m.next_vacation !== undefined) return m.next_vacation;
  const e = (entries ?? [])
    .filter((x) => x.employee.id === m.id && x.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  return e ? { start_date: e.start_date, end_date: e.end_date, status: e.status } : null;
}

export function pendingOf(m: Pick<TeamMember, "id" | "pending_requests">, requests: RequestListItem[] | undefined) {
  const list = (requests ?? []).filter((r) => r.employee.id === m.id && isPending(r));
  return { count: m.pending_requests ?? list.length, list };
}

export function academyFromTeam(team: TeamMember[], courses: Course[], today = todayISO()): TeamAcademyCourse[] {
  return courses.map((c) => {
    const members = team.flatMap((m) =>
      m.enrollments
        .filter((e) => e.course_id === c.id)
        .map((e) => ({
          employee: { id: m.id, full_name: m.full_name },
          enrollment_id: e.id,
          status: e.status,
          progress: e.progress_pct,
          due_date: e.due_date,
          overdue: isOverdue(e, today),
          score: e.score,
          completed_at: e.completed_at,
        })),
    );
    const has = new Set(members.map((x) => x.employee.id));
    return {
      course: { id: c.id, title: c.title, cover: c.cover, duration_min: c.duration_min },
      assigned: members.length,
      completed: members.filter((x) => x.status === "completed").length,
      in_progress: members.filter((x) => x.status === "in_progress").length,
      not_started: members.filter((x) => x.status === "assigned").length,
      overdue: members.filter((x) => x.overdue).length,
      members,
      unassigned: team.filter((m) => !has.has(m.id)).map((m) => ({ id: m.id, full_name: m.full_name })),
    };
  });
}

export function requestIdForEntry(e: CalendarEntry, requests: RequestListItem[] | undefined): number | null {
  if (e.request_id) return e.request_id;
  const hit = (requests ?? []).find((r) => {
    if (r.type !== "vacation" || r.employee.id !== e.employee.id) return false;
    const d = vacationFromSummary(r.summary);
    return !!d && d.start_date === e.start_date && d.end_date === e.end_date;
  });
  return hit?.id ?? null;
}
