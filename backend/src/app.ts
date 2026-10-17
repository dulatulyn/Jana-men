import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { db, nextId } from "./db";
import { authRequired, requireRole, sign, isManagerOf, HttpError } from "./auth";
import type {
  RequestRow, RequestStatus, Enrollment, Employee, Notification,
  VacationPayload, AdvancePayload, AssistantLog,
} from "./types";

// ---------- helpers ----------
const now = () => new Date().toISOString();
const money = (n: number) => n.toLocaleString("ru-RU").replace(/,/g, " ");
const ddmm = (iso: string) => iso.split("-").reverse().slice(0, 2).join(".");

function employeeById(id: number): Employee | undefined {
  return db.employees.find((e) => e.id === id);
}
function personRef(employeeId: number) {
  const e = employeeById(employeeId);
  return e ? { id: e.id, full_name: e.full_name } : { id: employeeId, full_name: "—" };
}
function departmentName(id: number): string {
  return db.departments.find((d) => d.id === id)?.name ?? "—";
}
function profileOf(e: Employee) {
  return {
    full_name: e.full_name,
    company: e.company,
    position: e.position,
    department: departmentName(e.department_id),
    manager: e.manager_id != null ? personRef(e.manager_id) : null,
    hire_date: e.hire_date,
    vacation_balance_days: e.vacation_balance_days,
    work_type: e.work_type,
  };
}
function summaryOf(r: RequestRow): string {
  if (r.type === "vacation") {
    const p = r.payload as VacationPayload;
    return `Отпуск: ${ddmm(p.start_date)}–${ddmm(p.end_date)} (${p.days} дн.)`;
  }
  const p = r.payload as AdvancePayload;
  return `Аванс: ${money(p.amount)} ₸`;
}
function shapeRequest(r: RequestRow) {
  return { ...r, employee: personRef(r.employee_id) };
}
function listItem(r: RequestRow) {
  return { id: r.id, type: r.type, status: r.status, created_at: r.created_at, employee: personRef(r.employee_id), summary: summaryOf(r) };
}
function eventsOf(requestId: number) {
  return db.events
    .filter((e) => e.request_id === requestId)
    .sort((a, b) => a.id - b.id)
    .map((e) => ({ ...e, actor: e.actor_id != null ? personRef(e.actor_id) : null }));
}
function pushEvent(requestId: number, actorId: number | null, from: RequestStatus | null, to: RequestStatus, comment: string | null = null) {
  db.events.push({ id: nextId("event"), request_id: requestId, actor_id: actorId, from_status: from, to_status: to, comment, created_at: now() });
}
function notify(userId: number, type: string, title: string, body: string, link: string | null) {
  const n: Notification = { id: nextId("notification"), user_id: userId, type, title, body, link, read_at: null, created_at: now() };
  db.notifications.push(n);
  return n;
}
function userIdForEmployee(employeeId: number): number | null {
  return db.users.find((u) => u.employee_id === employeeId)?.id ?? null;
}
function hrUsers() {
  return db.users.filter((u) => u.role === "hr");
}
function integrationLog(system: "1c_zup" | "documentolog", operation: string, details: string) {
  db.integrationLog.push({ id: nextId("integration"), system, operation, status: "ok", details, created_at: now() });
}

const lessonsOfCourse = (courseId: number) => db.lessons.filter((l) => l.course_id === courseId).sort((a, b) => a.order - b.order);
function completedLessonIds(enrollmentId: number): number[] {
  return db.lessonProgress.filter((p) => p.enrollment_id === enrollmentId).map((p) => p.lesson_id);
}
function computeProgress(e: Enrollment): number {
  const total = lessonsOfCourse(e.course_id).length || 1;
  const done = completedLessonIds(e.id).length;
  return Math.round((done / total) * 100);
}
function enrichEnrollment(e: Enrollment) {
  return { ...e, course: db.courses.find((c) => c.id === e.course_id), completed_lesson_ids: completedLessonIds(e.id) };
}

// ---------- app ----------
export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const api = express.Router();
  const h = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

  api.get("/health", (_req, res) => res.json({ ok: true, ts: now() }));

  // ---- Auth ----
  api.post("/auth/login", h((req, res) => {
    const { email, password } = req.body ?? {};
    const user = db.users.find((u) => u.email === email && u.password === password);
    if (!user) throw new HttpError(401, "invalid_credentials", "Неверный email или пароль");
    const e = employeeById(user.employee_id)!;
    res.json({ token: sign(user), user: { id: user.id, role: user.role, employee_id: user.employee_id, full_name: e.full_name, locale: user.locale } });
  }));

  api.get("/me", authRequired, h((req, res) => {
    const { user, employee } = req.auth!;
    res.json({ id: user.id, role: user.role, employee_id: user.employee_id, full_name: employee.full_name, locale: user.locale, email: user.email, employee });
  }));

  // ---- Profile / dashboard ----
  api.get("/profile", authRequired, h((req, res) => res.json(profileOf(req.auth!.employee))));

  api.get("/dashboard", authRequired, h((req, res) => {
    const { user, employee } = req.auth!;
    const mine = db.requests.filter((r) => r.employee_id === employee.id);
    const active = mine.filter((r) => r.status === "submitted" || r.status === "manager_approved").sort((a, b) => b.id - a.id);
    const myEnrollments = db.enrollments.filter((e) => e.employee_id === employee.id).map(enrichEnrollment);

    const tasks: { type: string; title: string; link: string; due: string | null }[] = [];
    for (const e of myEnrollments) {
      if (e.status !== "completed") tasks.push({ type: "course", title: `Пройти курс «${e.course?.title ?? ""}»`, link: `/academy/${e.course_id}`, due: e.due_date });
    }
    for (const r of active) tasks.push({ type: "request", title: summaryOf(r) + ` — ${statusLabel(r.status)}`, link: `/requests/${r.id}`, due: null });
    if (user.role === "manager" || user.role === "hr") {
      const pending = inboxFor(user.role, employee.id).filter((r) => canActOn(user.role, employee.id, r)).length;
      if (pending > 0) tasks.push({ type: "approval", title: `Заявки на согласование: ${pending}`, link: "/approvals", due: null });
    }

    const unread = db.notifications.filter((n) => n.user_id === user.id && !n.read_at).length;
    res.json({ profile: profileOf(employee), tasks, active_requests: active.map(listItem), enrollments: myEnrollments, unread_notifications: unread });
  }));

  // ---- Requests ----
  api.get("/requests", authRequired, h((req, res) => {
    const { user, employee } = req.auth!;
    const scope = (req.query.scope as string) || "mine";
    const status = (req.query.status as string) || "";
    let rows: RequestRow[];
    if (scope === "mine") {
      rows = db.requests.filter((r) => r.employee_id === employee.id);
    } else if (scope === "team") {
      if (user.role === "employee") throw new HttpError(403, "forbidden", "Недостаточно прав");
      rows = inboxFor(user.role, employee.id);
    } else if (scope === "all") {
      if (user.role !== "hr") throw new HttpError(403, "forbidden", "Недостаточно прав");
      rows = db.requests.slice();
    } else {
      throw new HttpError(422, "bad_scope", "Неизвестный scope");
    }
    if (status) rows = rows.filter((r) => r.status === status);
    rows.sort((a, b) => b.id - a.id);
    res.json(rows.map(listItem));
  }));

  api.post("/requests", authRequired, h((req, res) => {
    const { employee } = req.auth!;
    const { type, payload } = req.body ?? {};
    if (type !== "vacation" && type !== "advance") throw new HttpError(422, "bad_type", "Неизвестный тип заявки");

    if (type === "vacation") {
      const p = payload as VacationPayload;
      if (!p?.start_date || !p?.end_date) throw new HttpError(422, "invalid", "Укажите даты отпуска");
      const start = new Date(p.start_date), end = new Date(p.end_date);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (start < today) throw new HttpError(422, "date_in_past", "Дата начала в прошлом");
      if (end < start) throw new HttpError(422, "bad_range", "Дата окончания раньше начала");
      const days = p.days ?? Math.round((+end - +start) / 86400000) + 1;
      if (days > employee.vacation_balance_days) throw new HttpError(422, "insufficient_balance", `Недостаточно дней отпуска: доступно ${employee.vacation_balance_days}`);
      const overlap = db.requests.some((r) => r.employee_id === employee.id && r.type === "vacation"
        && (r.status === "submitted" || r.status === "manager_approved" || r.status === "approved")
        && datesOverlap(p.start_date, p.end_date, (r.payload as VacationPayload).start_date, (r.payload as VacationPayload).end_date));
      if (overlap) throw new HttpError(422, "overlap", "Пересечение с другой активной заявкой на отпуск");
      payload.days = days;
    } else {
      const p = payload as AdvancePayload;
      if (!(p?.amount > 0)) throw new HttpError(422, "invalid", "Сумма должна быть больше нуля");
    }

    const r: RequestRow = {
      id: nextId("request"), employee_id: employee.id, type, status: "submitted",
      payload, created_at: now(), updated_at: now(), docflow_id: null, external_1c_id: null,
    };
    db.requests.push(r);
    pushEvent(r.id, employee.id, null, "submitted");
    const mgrUser = employee.manager_id != null ? userIdForEmployee(employee.manager_id) : null;
    if (mgrUser) notify(mgrUser, "request_submitted", "Новая заявка на согласование", `${employee.full_name}: ${summaryOf(r)}`, `/requests/${r.id}`);
    res.status(201).json(shapeRequest(r));
  }));

  api.get("/requests/:id", authRequired, h((req, res) => {
    const r = findRequest(req);
    const { user, employee } = req.auth!;
    if (!canView(user.role, employee.id, r)) throw new HttpError(403, "forbidden", "Нет доступа к этой заявке");
    res.json({ ...shapeRequest(r), events: eventsOf(r.id) });
  }));

  api.post("/requests/:id/approve", authRequired, requireRole("manager", "hr"), h((req, res) => {
    const r = findRequest(req);
    const { user, employee } = req.auth!;
    const comment = (req.body?.comment as string) || null;
    if (!canActOn(user.role, employee.id, r)) throw new HttpError(403, "forbidden", "Вы не можете согласовать эту заявку");

    const from = r.status;
    if (from === "submitted") {
      transition(r, employee.id, "submitted", "manager_approved", comment ?? "Согласовано руководителем");
      // notify author + HR
      const authorUser = userIdForEmployee(r.employee_id);
      if (authorUser) notify(authorUser, "request_manager_approved", "Руководитель согласовал заявку", `${summaryOf(r)} передана в HR.`, `/requests/${r.id}`);
      for (const hr of hrUsers()) notify(hr.id, "request_manager_approved", "Заявка ждёт HR", `${personRef(r.employee_id).full_name}: ${summaryOf(r)}`, `/requests/${r.id}`);
    } else if (from === "manager_approved") {
      transition(r, employee.id, "manager_approved", "approved", comment ?? "Проведено HR");
      provisionApproved(r);
      const authorUser = userIdForEmployee(r.employee_id);
      if (authorUser) notify(authorUser, "request_approved", r.type === "vacation" ? "Отпуск одобрен" : "Аванс одобрен", `${summaryOf(r)} — отправлено в 1С:ЗУП.`, `/requests/${r.id}`);
    } else {
      throw new HttpError(422, "bad_transition", `Нельзя согласовать заявку в статусе ${from}`);
    }
    res.json(shapeRequest(r));
  }));

  api.post("/requests/:id/reject", authRequired, requireRole("manager", "hr"), h((req, res) => {
    const r = findRequest(req);
    const { user, employee } = req.auth!;
    const comment = (req.body?.comment as string) || "";
    if (!comment.trim()) throw new HttpError(422, "comment_required", "Укажите причину отклонения");
    if (!canActOn(user.role, employee.id, r)) throw new HttpError(403, "forbidden", "Вы не можете отклонить эту заявку");
    if (r.status !== "submitted" && r.status !== "manager_approved") throw new HttpError(422, "bad_transition", `Нельзя отклонить заявку в статусе ${r.status}`);
    transition(r, employee.id, r.status, "rejected", comment);
    const authorUser = userIdForEmployee(r.employee_id);
    if (authorUser) notify(authorUser, "request_rejected", "Заявка отклонена", `${personRef(employee.id).full_name}: ${comment}`, `/requests/${r.id}`);
    res.json(shapeRequest(r));
  }));

  api.post("/requests/:id/cancel", authRequired, h((req, res) => {
    const r = findRequest(req);
    const { employee } = req.auth!;
    if (r.employee_id !== employee.id) throw new HttpError(403, "forbidden", "Можно отменить только свою заявку");
    if (r.status !== "submitted" && r.status !== "manager_approved") throw new HttpError(422, "bad_transition", `Нельзя отменить заявку в статусе ${r.status}`);
    transition(r, employee.id, r.status, "cancelled", (req.body?.comment as string) || null);
    res.json(shapeRequest(r));
  }));

  api.get("/team/calendar", authRequired, requireRole("manager", "hr"), h((req, res) => {
    const { user, employee } = req.auth!;
    const scopeIds = teamEmployeeIds(user.role, employee.id);
    const from = (req.query.from as string) || "";
    const to = (req.query.to as string) || "";
    const entries = db.requests
      .filter((r) => r.type === "vacation" && (r.status === "approved" || r.status === "manager_approved" || r.status === "submitted") && scopeIds.includes(r.employee_id))
      .filter((r) => {
        const p = r.payload as VacationPayload;
        if (from && p.end_date < from) return false;
        if (to && p.start_date > to) return false;
        return true;
      })
      .map((r) => {
        const p = r.payload as VacationPayload;
        return { employee: personRef(r.employee_id), start_date: p.start_date, end_date: p.end_date, status: r.status };
      });
    res.json(entries);
  }));

  // ---- Team ----
  api.get("/team", authRequired, requireRole("manager", "hr"), h((req, res) => {
    const { user, employee } = req.auth!;
    const ids = teamEmployeeIds(user.role, employee.id);
    res.json(ids.map((id) => teamMember(id)));
  }));

  api.get("/employees/:id", authRequired, h((req, res) => {
    const { user, employee } = req.auth!;
    const id = Number(req.params.id);
    const target = employeeById(id);
    if (!target) throw new HttpError(404, "not_found", "Сотрудник не найден");
    const allowed = user.role === "hr" || (user.role === "manager" && isManagerOf(employee.id, id)) || id === employee.id;
    if (!allowed) throw new HttpError(403, "forbidden", "Нет доступа к этому сотруднику");
    res.json(teamMember(id));
  }));

  // ---- Academy ----
  api.get("/courses", authRequired, h((_req, res) => res.json(db.courses)));

  api.get("/enrollments/mine", authRequired, h((req, res) => {
    const { employee } = req.auth!;
    res.json(db.enrollments.filter((e) => e.employee_id === employee.id).map(enrichEnrollment));
  }));

  api.get("/courses/:id", authRequired, h((req, res) => {
    const { employee } = req.auth!;
    const id = Number(req.params.id);
    const course = db.courses.find((c) => c.id === id);
    if (!course) throw new HttpError(404, "not_found", "Курс не найден");
    const quiz = db.questions.filter((q) => q.course_id === id).map(({ correct_index, ...q }) => q);
    const enr = db.enrollments.find((e) => e.employee_id === employee.id && e.course_id === id);
    res.json({ ...course, lessons: lessonsOfCourse(id), quiz, enrollment: enr ? enrichEnrollment(enr) : null });
  }));

  api.post("/enrollments/:id/lessons/:lessonId/complete", authRequired, h((req, res) => {
    const { employee } = req.auth!;
    const enr = ownEnrollment(req, employee.id);
    const lessonId = Number(req.params.lessonId);
    const lesson = db.lessons.find((l) => l.id === lessonId && l.course_id === enr.course_id);
    if (!lesson) throw new HttpError(404, "not_found", "Урок не найден");
    if (!db.lessonProgress.some((p) => p.enrollment_id === enr.id && p.lesson_id === lessonId)) {
      db.lessonProgress.push({ enrollment_id: enr.id, lesson_id: lessonId, completed_at: now() });
    }
    enr.progress_pct = computeProgress(enr);
    if (enr.status === "assigned") enr.status = "in_progress";
    res.json(enrichEnrollment(enr));
  }));

  api.post("/enrollments/:id/quiz", authRequired, h((req, res) => {
    const { employee } = req.auth!;
    const enr = ownEnrollment(req, employee.id);
    const answers: number[] = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const questions = db.questions.filter((q) => q.course_id === enr.course_id);
    const correct = questions.map((q) => q.correct_index);
    let right = 0;
    questions.forEach((q, i) => { if (answers[i] === q.correct_index) right++; });
    const score = Math.round((right / (questions.length || 1)) * 100);
    const passed = score >= 70;
    enr.score = score;
    if (passed) {
      // ensure all lessons marked complete on pass
      for (const l of lessonsOfCourse(enr.course_id)) {
        if (!db.lessonProgress.some((p) => p.enrollment_id === enr.id && p.lesson_id === l.id)) {
          db.lessonProgress.push({ enrollment_id: enr.id, lesson_id: l.id, completed_at: now() });
        }
      }
      enr.status = "completed";
      enr.progress_pct = 100;
      enr.completed_at = now();
      const u = userIdForEmployee(employee.id);
      const course = db.courses.find((c) => c.id === enr.course_id);
      if (u) notify(u, "course_completed", "Курс пройден", `«${course?.title ?? ""}» — результат теста ${score}%.`, `/academy/${enr.course_id}`);
    } else {
      enr.progress_pct = computeProgress(enr);
    }
    res.json({ score, passed, correct });
  }));

  api.post("/enrollments", authRequired, requireRole("manager", "hr"), h((req, res) => {
    const { user, employee } = req.auth!;
    const { employee_id, course_id, due_date } = req.body ?? {};
    const target = employeeById(Number(employee_id));
    if (!target) throw new HttpError(404, "not_found", "Сотрудник не найден");
    if (!db.courses.find((c) => c.id === Number(course_id))) throw new HttpError(404, "not_found", "Курс не найден");
    if (user.role === "manager" && !isManagerOf(employee.id, target.id)) throw new HttpError(403, "forbidden", "Можно назначать курсы только своей команде");
    const existing = db.enrollments.find((e) => e.employee_id === target.id && e.course_id === Number(course_id));
    if (existing && existing.status !== "completed") return res.status(200).json(enrichEnrollment(existing));
    const enr: Enrollment = {
      id: nextId("enrollment"), employee_id: target.id, course_id: Number(course_id), assigned_by: employee.id,
      due_date: due_date || null, status: "assigned", progress_pct: 0, score: null, completed_at: null,
    };
    db.enrollments.push(enr);
    const u = userIdForEmployee(target.id);
    const course = db.courses.find((c) => c.id === Number(course_id));
    if (u) notify(u, "course_assigned", "Назначен курс", `«${course?.title ?? ""}»${due_date ? ` — до ${ddmm(due_date)}` : ""}.`, `/academy/${course_id}`);
    res.status(201).json(enrichEnrollment(enr));
  }));

  // ---- Notifications ----
  api.get("/notifications", authRequired, h((req, res) => {
    const { user } = req.auth!;
    res.json(db.notifications.filter((n) => n.user_id === user.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
  }));
  api.post("/notifications/:id/read", authRequired, h((req, res) => {
    const { user } = req.auth!;
    const n = db.notifications.find((x) => x.id === Number(req.params.id) && x.user_id === user.id);
    if (n && !n.read_at) n.read_at = now();
    res.status(204).end();
  }));
  api.post("/notifications/read-all", authRequired, h((req, res) => {
    const { user } = req.auth!;
    for (const n of db.notifications) if (n.user_id === user.id && !n.read_at) n.read_at = now();
    res.status(204).end();
  }));

  // ---- Knowledge base (assistant support) ----
  api.get("/kb", authRequired, h((_req, res) => res.json(db.kb)));
  const upsertKb = h((req, res) => {
    const slug = req.params.slug;
    const { title, body_md, category } = req.body ?? {};
    const existing = db.kb.find((a) => a.slug === slug);
    if (existing) {
      if (title != null) existing.title = title;
      if (body_md != null) existing.body_md = body_md;
      if (category != null) existing.category = category;
      existing.updated_at = now();
      return res.json(existing);
    }
    const article = { slug, title: title ?? slug, category: category ?? "other", body_md: body_md ?? "", updated_at: now() };
    db.kb.push(article);
    res.status(201).json(article);
  });
  api.put("/kb/:slug", authRequired, requireRole("hr"), upsertKb);
  api.post("/kb/:slug", authRequired, requireRole("hr"), upsertKb);

  // ---- Assistant logs / escalation / analytics ----
  api.post("/assistant/logs", authRequired, h((req, res) => {
    const { user } = req.auth!;
    const { question, answer, status, sources } = req.body ?? {};
    if (!question || !["answered", "no_answer", "refused"].includes(status)) throw new HttpError(422, "invalid", "Некорректный лог ассистента");
    const log: AssistantLog = {
      id: nextId("log"), user_id: user.id, question, answer: answer ?? "",
      sources: Array.isArray(sources) ? sources : [], status, escalated: false, created_at: now(),
    };
    db.assistantLogs.push(log);
    res.status(201).json({ log_id: log.id });
  }));

  api.post("/assistant/escalate", authRequired, h((req, res) => {
    const { user, employee } = req.auth!;
    const { log_id } = req.body ?? {};
    const log = db.assistantLogs.find((l) => l.id === Number(log_id) && l.user_id === user.id);
    if (!log) throw new HttpError(404, "not_found", "Запись вопроса не найдена");
    log.escalated = true;
    for (const hr of hrUsers()) notify(hr.id, "assistant_escalation", "Вопрос передан в HR", `${employee.full_name}: «${log.question}»`, "/hr");
    res.json({ ok: true });
  }));

  api.get("/assistant/unanswered", authRequired, requireRole("hr"), h((_req, res) => {
    const groups = new Map<string, { question: string; count: number; last_asked_at: string }>();
    for (const l of db.assistantLogs) {
      if (l.status !== "no_answer") continue;
      const key = l.question.trim().toLowerCase();
      const g = groups.get(key);
      if (g) { g.count++; if (l.created_at > g.last_asked_at) g.last_asked_at = l.created_at; }
      else groups.set(key, { question: l.question, count: 1, last_asked_at: l.created_at });
    }
    res.json([...groups.values()].sort((a, b) => b.count - a.count || (a.last_asked_at < b.last_asked_at ? 1 : -1)));
  }));

  api.get("/assistant/stats", authRequired, requireRole("hr"), h((_req, res) => {
    const logs = db.assistantLogs;
    res.json({
      total: logs.length,
      answered: logs.filter((l) => l.status === "answered").length,
      no_answer: logs.filter((l) => l.status === "no_answer").length,
      refused: logs.filter((l) => l.status === "refused").length,
      escalated: logs.filter((l) => l.escalated).length,
    });
  }));

  // ---- Integrations (mock 1С:ЗУП / Documentolog) ----
  api.post("/integrations/1c/sync", authRequired, requireRole("hr"), h((_req, res) => {
    integrationLog("1c_zup", "syncEmployees", `Синхронизировано ${db.employees.length} сотрудников`);
    res.json({ synced: db.employees.length, at: now() });
  }));
  api.get("/integrations/log", authRequired, requireRole("hr"), h((_req, res) => {
    res.json(db.integrationLog.slice().sort((a, b) => b.id - a.id));
  }));

  app.use("/api/v1", api);

  // 404 + error handler (contract shape: { error: { code, message } })
  app.use((_req, res) => res.status(404).json({ error: { code: "not_found", message: "Маршрут не найден" } }));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    console.error(err);
    res.status(500).json({ error: { code: "internal", message: "Внутренняя ошибка сервера" } });
  });

  return app;
}

// ---------- domain helpers ----------
function statusLabel(s: RequestStatus): string {
  return { submitted: "на согласовании у руководителя", manager_approved: "на согласовании у HR", approved: "одобрено", rejected: "отклонено", cancelled: "отменено" }[s];
}
function datesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
function findRequest(req: Request): RequestRow {
  const r = db.requests.find((x) => x.id === Number(req.params.id));
  if (!r) throw new HttpError(404, "not_found", "Заявка не найдена");
  return r;
}
function teamEmployeeIds(role: string, meEmployeeId: number): number[] {
  if (role === "hr") return db.employees.filter((e) => e.id !== meEmployeeId).map((e) => e.id);
  return db.employees.filter((e) => e.manager_id === meEmployeeId).map((e) => e.id);
}
function inboxFor(role: string, meEmployeeId: number): RequestRow[] {
  if (role === "hr") return db.requests.slice();
  const ids = teamEmployeeIds(role, meEmployeeId);
  return db.requests.filter((r) => ids.includes(r.employee_id));
}
function canView(role: string, meEmployeeId: number, r: RequestRow): boolean {
  if (r.employee_id === meEmployeeId) return true;
  if (role === "hr") return true;
  if (role === "manager") return isManagerOf(meEmployeeId, r.employee_id);
  return false;
}
/** Can this actor approve/reject the request at its current status? */
function canActOn(role: string, meEmployeeId: number, r: RequestRow): boolean {
  if (role === "hr") return r.status === "submitted" || r.status === "manager_approved";
  if (role === "manager") return r.status === "submitted" && isManagerOf(meEmployeeId, r.employee_id);
  return false;
}
function transition(r: RequestRow, actorEmployeeId: number, from: RequestStatus, to: RequestStatus, comment: string | null) {
  r.status = to;
  r.updated_at = now();
  pushEvent(r.id, actorEmployeeId, from, to, comment);
}
/** Mock посещение 1С:ЗУП + Documentolog after final HR approval. */
function provisionApproved(r: RequestRow) {
  const seq = String(nextId("integration_doc")).padStart(6, "0");
  if (r.type === "vacation") {
    r.external_1c_id = `ЗУП-ОТ-${seq}`;
    integrationLog("1c_zup", "postVacation", `Заявка №${r.id} → ${r.external_1c_id}`);
  } else {
    r.external_1c_id = `ЗУП-АВ-${seq}`;
    integrationLog("1c_zup", "postAdvance", `Заявка №${r.id} → ${r.external_1c_id}`);
  }
  r.docflow_id = `DL-2026-${String(10000 + r.id).padStart(5, "0")}`;
  integrationLog("documentolog", "createDocument", `Заявление №${r.id} → ${r.docflow_id}, отправлено на подпись`);
  r.updated_at = now();
}
function teamMember(id: number) {
  const e = employeeById(id)!;
  return {
    id: e.id, full_name: e.full_name, position: e.position, department: departmentName(e.department_id),
    work_type: e.work_type, hire_date: e.hire_date, vacation_balance_days: e.vacation_balance_days,
    enrollments: db.enrollments.filter((en) => en.employee_id === e.id).map(enrichEnrollment),
  };
}
function ownEnrollment(req: Request, meEmployeeId: number): Enrollment {
  const enr = db.enrollments.find((e) => e.id === Number(req.params.id));
  if (!enr) throw new HttpError(404, "not_found", "Запись на курс не найдена");
  if (enr.employee_id !== meEmployeeId) throw new HttpError(403, "forbidden", "Это не ваша запись на курс");
  return enr;
}
