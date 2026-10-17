/* Entity → API JSON mappers. Every response goes through one of these, so nothing
 * leaks by accident (password_hash, correct_index) and @db.Date columns become "YYYY-MM-DD". */
import type {
  Course, Department, Employee, Enrollment, IntegrationLog, KbArticle, Lesson,
  LessonProgress, Notification, QuizQuestion, Request, RequestEvent,
} from "@prisma/client";
import { fmtDate, fmtMoney, toDateOnly } from "./format";

export type EmployeeWithDept = Employee & { department: Department; manager: Employee | null };
export type VacationPayload = { start_date: string; end_date: string; days: number; comment: string };
export type AdvancePayload = { amount: number; reason: string };

export const personRef = (e: Pick<Employee, "id" | "full_name">) => ({ id: e.id, full_name: e.full_name });

export function employeeView(e: Employee) {
  return {
    id: e.id,
    external_id_1c: e.external_id_1c,
    full_name: e.full_name,
    company: e.company,
    position: e.position,
    department_id: e.department_id,
    manager_id: e.manager_id,
    hire_date: toDateOnly(e.hire_date),
    vacation_balance_days: e.vacation_balance_days,
    phone: e.phone,
    work_type: e.work_type,
  };
}

export function profileView(e: EmployeeWithDept) {
  return {
    full_name: e.full_name,
    company: e.company,
    position: e.position,
    department: e.department.name,
    manager: e.manager ? personRef(e.manager) : null,
    hire_date: toDateOnly(e.hire_date),
    vacation_balance_days: e.vacation_balance_days,
    work_type: e.work_type,
  };
}

export function requestSummary(r: Pick<Request, "type" | "payload">): string {
  if (r.type === "vacation") {
    const p = r.payload as VacationPayload;
    return `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)} · ${p.days} дн.`;
  }
  return fmtMoney((r.payload as AdvancePayload).amount);
}

export const requestTypeHuman = (r: Pick<Request, "type">) => (r.type === "vacation" ? "отпуск" : "аванс");

type RequestWithEmployee = Request & { employee: Pick<Employee, "id" | "full_name"> };

export function requestListItemView(r: RequestWithEmployee) {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    created_at: r.created_at,
    employee: personRef(r.employee),
    summary: requestSummary(r),
  };
}

export function requestView(r: RequestWithEmployee) {
  return {
    id: r.id,
    employee_id: r.employee_id,
    employee: personRef(r.employee),
    type: r.type,
    status: r.status,
    payload: r.payload,
    created_at: r.created_at,
    updated_at: r.updated_at,
    docflow_id: r.docflow_id,
    external_1c_id: r.external_1c_id,
  };
}

export function eventView(e: RequestEvent & { actor: Pick<Employee, "id" | "full_name"> | null }) {
  return {
    id: e.id,
    request_id: e.request_id,
    actor_id: e.actor_id,
    actor: e.actor ? personRef(e.actor) : null,
    from_status: e.from_status,
    to_status: e.to_status,
    comment: e.comment,
    created_at: e.created_at,
  };
}

export const courseView = (c: Course) => ({
  id: c.id, title: c.title, description: c.description, duration_min: c.duration_min, cover: c.cover,
});

export const lessonView = (l: Lesson) => ({
  id: l.id, course_id: l.course_id, order: l.order, title: l.title, content_md: l.content_md,
});

/** Quiz questions without the answer key. */
export const quizQuestionView = (q: QuizQuestion) => ({
  id: q.id, course_id: q.course_id, text: q.text, options: q.options as string[],
});

export type EnrollmentFull = Enrollment & { course: Course; progress: Pick<LessonProgress, "lesson_id">[] };
export const ENROLLMENT_INCLUDE = { course: true, progress: { select: { lesson_id: true } } } as const;

export function enrollmentView(e: EnrollmentFull) {
  return {
    id: e.id,
    employee_id: e.employee_id,
    course_id: e.course_id,
    course: courseView(e.course),
    assigned_by: e.assigned_by,
    due_date: toDateOnly(e.due_date),
    status: e.status,
    progress_pct: e.progress_pct,
    score: e.score,
    completed_at: e.completed_at,
    completed_lesson_ids: e.progress.map((p) => p.lesson_id).sort((a, b) => a - b),
  };
}

export const notificationView = (n: Notification) => ({
  id: n.id, user_id: n.user_id, type: n.type, title: n.title, body: n.body, link: n.link, read_at: n.read_at, created_at: n.created_at,
});

export const kbArticleView = (a: KbArticle) => ({
  slug: a.slug, title: a.title, category: a.category, body_md: a.body_md, updated_at: a.updated_at,
});

export const integrationLogView = (l: IntegrationLog, retryable = false) => ({
  id: l.id,
  system: l.system === "c1_zup" ? ("1c_zup" as const) : l.system,
  operation: l.operation,
  status: l.status,
  details: l.details,
  request_id: l.request_id,
  idempotency_key: l.idempotency_key,
  retry_of: l.retry_of,
  duration_ms: l.duration_ms,
  retryable,
  created_at: l.created_at,
});
