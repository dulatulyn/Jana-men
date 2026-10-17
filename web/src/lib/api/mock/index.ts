import type { ApiClient } from "../client";
import { ApiError } from "../errors";
import { getToken } from "../token";
import kbArticles from "./kb.json";
import type {
  AdvancePayload,
  CourseDetail,
  Enrollment,
  HRRequest,
  KbArticle,
  Notification,
  Profile,
  RequestDetail,
  RequestListItem,
  RequestStatus,
  Task,
  TeamMember,
  VacationPayload,
} from "../types";
import { createSeed, dayOffset, DB_VERSION, type MockDB, type MockUser, type StoredEnrollment, type StoredRequest } from "./seed";

const STORE_KEY = "janamen.mockdb";
const PASS_SCORE = 70;

let memory: MockDB | null = null;

function load(): MockDB {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const db = JSON.parse(raw) as MockDB;
      if (db.version === DB_VERSION) return db;
    }
  } catch {
  }
  if (memory && memory.version === DB_VERSION) return memory;
  const db = createSeed();
  save(db);
  return db;
}

function save(db: MockDB) {
  memory = db;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch {
  }
}

export function resetMockData() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
  }
  memory = null;
  save(createSeed());
}

const delay = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 160));
const now = () => new Date().toISOString();
const next = (db: MockDB, k: string) => (db.seq[k] = (db.seq[k] || 0) + 1);

const forbidden = (message = "Нет доступа") => new ApiError(403, "forbidden", message);
const notFound = (message = "Не найдено") => new ApiError(404, "not_found", message);
const invalid = (message: string, code = "validation_error") => new ApiError(422, code, message);


function auth(db: MockDB): MockUser {
  const token = getToken();
  if (!token || !token.startsWith("mock.")) throw new ApiError(401, "unauthorized", "Требуется вход");
  const login = token.slice(5);
  const user = db.users.find((u) => u.login === login);
  if (!user) throw new ApiError(401, "unauthorized", "Сессия недействительна");
  return user;
}

const emp = (db: MockDB, id: number) => {
  const e = db.employees.find((x) => x.id === id);
  if (!e) throw notFound("Сотрудник не найден");
  return e;
};
const ref = (db: MockDB, id: number) => ({ id, full_name: emp(db, id).full_name });
const userOfEmployee = (db: MockDB, employeeId: number) => db.users.find((u) => u.employee_id === employeeId);
const hrUsers = (db: MockDB) => db.users.filter((u) => u.role === "hr");

const isManagerOf = (db: MockDB, me: MockUser, employeeId: number) =>
  me.role === "manager" && emp(db, employeeId).manager_id === me.employee_id;

function canSeeEmployee(db: MockDB, me: MockUser, employeeId: number) {
  return me.employee_id === employeeId || me.role === "hr" || isManagerOf(db, me, employeeId);
}

function approverIds(db: MockDB, r: StoredRequest): number[] {
  if (r.status === "submitted") {
    const managerId = emp(db, r.employee_id).manager_id;
    const managerUser = managerId ? userOfEmployee(db, managerId) : undefined;
    if (managerUser && managerUser.role !== "employee") return [managerUser.id];
    return hrUsers(db).map((u) => u.id);
  }
  if (r.status === "manager_approved") return hrUsers(db).map((u) => u.id);
  return [];
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}
const fmtMoney = (n: number) => `${n.toLocaleString("ru-RU").replace(/,/g, " ")} ₸`;

function summary(r: StoredRequest) {
  if (r.type === "vacation") {
    const p = r.payload as VacationPayload;
    return `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)} · ${p.days} дн.`;
  }
  return fmtMoney((r.payload as AdvancePayload).amount);
}

const humanType = (r: StoredRequest) => (r.type === "vacation" ? "отпуск" : "аванс");

function listItem(db: MockDB, r: StoredRequest): RequestListItem {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    created_at: r.created_at,
    employee: ref(db, r.employee_id),
    summary: summary(r),
  };
}

const full = (db: MockDB, r: StoredRequest): HRRequest => ({ ...r, employee: ref(db, r.employee_id) });

function notify(db: MockDB, userId: number, type: string, title: string, body: string, link: string | null) {
  db.notifications.push({
    id: next(db, "notification"),
    user_id: userId,
    type,
    title,
    body,
    link,
    read_at: null,
    created_at: now(),
  });
}

function addEvent(db: MockDB, r: StoredRequest, actorId: number | null, to: RequestStatus, comment: string | null) {
  db.events.push({
    id: next(db, "event"),
    request_id: r.id,
    actor_id: actorId,
    from_status: r.status,
    to_status: to,
    comment,
    created_at: now(),
  });
  r.status = to;
  r.updated_at = now();
}

function logIntegration(db: MockDB, system: "1c_zup" | "documentolog", operation: string, details: string) {
  db.integrationLog.unshift({
    id: next(db, "integration"),
    system,
    operation,
    status: "ok",
    details,
    created_at: now(),
  });
}

function enrollmentView(db: MockDB, e: StoredEnrollment): Enrollment {
  return {
    ...e,
    course: db.courses.find((c) => c.id === e.course_id),
    completed_lesson_ids: db.lessonProgress.filter((p) => p.enrollment_id === e.id).map((p) => p.lesson_id),
  };
}

function profileOf(db: MockDB, employeeId: number): Profile {
  const e = emp(db, employeeId);
  const dept = db.departments.find((d) => d.id === e.department_id);
  return {
    full_name: e.full_name,
    company: e.company,
    position: e.position,
    department: dept?.name ?? "",
    manager: e.manager_id ? ref(db, e.manager_id) : null,
    hire_date: e.hire_date,
    vacation_balance_days: e.vacation_balance_days,
    work_type: e.work_type,
  };
}

function teamMember(db: MockDB, employeeId: number): TeamMember {
  const p = profileOf(db, employeeId);
  return {
    id: employeeId,
    full_name: p.full_name,
    position: p.position,
    department: p.department,
    work_type: p.work_type,
    hire_date: p.hire_date,
    vacation_balance_days: p.vacation_balance_days,
    enrollments: db.enrollments.filter((x) => x.employee_id === employeeId).map((x) => enrollmentView(db, x)),
  };
}

function visibleRequests(db: MockDB, me: MockUser, scope: "mine" | "team" | "all") {
  if (scope === "mine") return db.requests.filter((r) => r.employee_id === me.employee_id);
  if (scope === "team") {
    if (me.role === "employee") throw forbidden("Раздел доступен руководителю и HR");
    if (me.role === "hr") return db.requests.filter((r) => r.employee_id !== me.employee_id);
    return db.requests.filter((r) => isManagerOf(db, me, r.employee_id));
  }
  if (me.role !== "hr") throw forbidden("Все заявки доступны только HR");
  return db.requests;
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000) + 1;

const ACTIVE: RequestStatus[] = ["submitted", "manager_approved", "approved"];

function getOwnedRequest(db: MockDB, me: MockUser, id: number) {
  const r = db.requests.find((x) => x.id === id);
  if (!r) throw notFound("Заявка не найдена");
  if (!canSeeEmployee(db, me, r.employee_id)) throw forbidden("Заявка сотрудника не из вашей команды");
  return r;
}

function enrollmentForMe(db: MockDB, me: MockUser, id: number) {
  const e = db.enrollments.find((x) => x.id === id);
  if (!e) throw notFound("Назначение не найдено");
  if (e.employee_id !== me.employee_id) throw forbidden("Это обучение назначено другому сотруднику");
  return e;
}

function recalcProgress(db: MockDB, e: StoredEnrollment) {
  const total = db.lessons.filter((l) => l.course_id === e.course_id).length + 1;
  const done = db.lessonProgress.filter((p) => p.enrollment_id === e.id).length + (e.status === "completed" ? 1 : 0);
  e.progress_pct = Math.min(100, Math.round((done / total) * 100));
}

function op<A extends unknown[], R>(fn: (db: MockDB, ...args: A) => R, mutate = false) {
  return async (...args: A): Promise<R> => {
    await delay();
    const db = load();
    const result = fn(db, ...args);
    if (mutate) save(db);
    return structuredClone(result);
  };
}


export const mockApi: ApiClient = {
  login: op((db, email: string, password: string) => {
    const login = email.trim().toLowerCase();
    const user = db.users.find((u) => u.email === login || u.login === login);
    if (!user || user.password !== password) throw new ApiError(401, "invalid_credentials", "Неверный email или пароль");
    const e = emp(db, user.employee_id);
    return {
      token: `mock.${user.login}`,
      user: { id: user.id, role: user.role, employee_id: user.employee_id, full_name: e.full_name, locale: user.locale },
    };
  }),

  me: op((db) => {
    const me = auth(db);
    const e = emp(db, me.employee_id);
    return {
      id: me.id,
      role: me.role,
      employee_id: me.employee_id,
      full_name: e.full_name,
      locale: me.locale,
      email: me.email,
      employee: e,
    };
  }),

  profile: op((db) => profileOf(db, auth(db).employee_id)),

  dashboard: op((db) => {
    const me = auth(db);
    const mine = db.requests.filter((r) => r.employee_id === me.employee_id);
    const enrollments = db.enrollments.filter((e) => e.employee_id === me.employee_id).map((e) => enrollmentView(db, e));
    const tasks: Task[] = [];

    for (const r of db.requests) {
      if (r.employee_id === me.employee_id) continue;
      if (approverIds(db, r).includes(me.id)) {
        tasks.push({
          type: "approve_request",
          title: `Согласовать ${humanType(r)}: ${emp(db, r.employee_id).full_name}`,
          link: `/requests/${r.id}`,
          due: null,
        });
      }
    }
    for (const e of enrollments) {
      if (e.status !== "completed") {
        tasks.push({ type: "course", title: `Пройти курс «${e.course?.title}»`, link: `/academy/${e.course_id}`, due: e.due_date });
      }
    }
    for (const r of mine) {
      if (r.status === "rejected" && Date.now() - Date.parse(r.updated_at) < 14 * 86_400_000) {
        tasks.push({ type: "request_rejected", title: `Заявка на ${humanType(r)} отклонена — посмотреть причину`, link: `/requests/${r.id}`, due: null });
      }
    }

    return {
      profile: profileOf(db, me.employee_id),
      tasks,
      active_requests: mine
        .filter((r) => r.status === "submitted" || r.status === "manager_approved")
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((r) => listItem(db, r)),
      enrollments,
      unread_notifications: db.notifications.filter((n) => n.user_id === me.id && !n.read_at).length,
    };
  }),

  listRequests: op((db, params = {}) => {
    const me = auth(db);
    let rows = visibleRequests(db, me, params.scope ?? "mine");
    if (params.status) rows = rows.filter((r) => r.status === params.status);
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => listItem(db, r));
  }),

  createRequest: op((db, body) => {
    const me = auth(db);
    const e = emp(db, me.employee_id);
    let payload: VacationPayload | AdvancePayload;

    if (body.type === "vacation") {
      const p = body.payload;
      if (!p.start_date || !p.end_date) throw invalid("Укажите даты отпуска");
      if (p.start_date < dayOffset(0)) throw invalid("Дата начала не может быть в прошлом", "past_date");
      if (p.end_date < p.start_date) throw invalid("Дата окончания раньше даты начала");
      const days = daysBetween(p.start_date, p.end_date);
      if (days > e.vacation_balance_days)
        throw invalid(`Недостаточно дней отпуска: доступно ${e.vacation_balance_days}, запрошено ${days}`, "insufficient_balance");
      const overlap = db.requests.some((r) => {
        if (r.employee_id !== me.employee_id || r.type !== "vacation" || !ACTIVE.includes(r.status)) return false;
        const q = r.payload as VacationPayload;
        return q.start_date <= p.end_date && p.start_date <= q.end_date;
      });
      if (overlap) throw invalid("Даты пересекаются с другой вашей заявкой на отпуск", "overlap");
      payload = { start_date: p.start_date, end_date: p.end_date, days, comment: p.comment?.trim() || "" };
    } else if (body.type === "advance") {
      const p = body.payload;
      const amount = Math.round(Number(p.amount));
      if (!amount || amount <= 0) throw invalid("Укажите сумму аванса");
      if (amount > 1_000_000) throw invalid("Сумма аванса не может превышать 1 000 000 ₸");
      if (!p.reason?.trim()) throw invalid("Укажите причину");
      payload = { amount, reason: p.reason.trim() };
    } else {
      throw invalid("Неизвестный тип заявки");
    }

    const r: StoredRequest = {
      id: next(db, "request"),
      employee_id: me.employee_id,
      type: body.type,
      status: "submitted",
      payload,
      created_at: now(),
      updated_at: now(),
      docflow_id: null,
      external_1c_id: null,
    };
    db.requests.push(r);
    db.events.push({
      id: next(db, "event"),
      request_id: r.id,
      actor_id: me.employee_id,
      from_status: null,
      to_status: "submitted",
      comment: null,
      created_at: now(),
    });
    const approvers = approverIds(db, r);
    notify(db, me.id, "request_submitted", `Заявка №${r.id} отправлена`, approvers.length ? "Ждёт согласования руководителя." : "", `/requests/${r.id}`);
    for (const a of approvers)
      notify(
        db,
        a,
        "request_submitted",
        `Новая заявка: ${humanType(r)}`,
        `${e.full_name} · ${summary(r)}`,
        `/requests/${r.id}`,
      );
    return full(db, r);
  }, true),

  getRequest: op((db, id: number): RequestDetail => {
    const me = auth(db);
    const r = getOwnedRequest(db, me, id);
    const events = db.events
      .filter((e) => e.request_id === id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((e) => ({ ...e, actor: e.actor_id ? ref(db, e.actor_id) : null }));
    return { ...full(db, r), events };
  }),

  approveRequest: op((db, id: number, comment?: string) => {
    const me = auth(db);
    const r = getOwnedRequest(db, me, id);
    if (r.status !== "submitted" && r.status !== "manager_approved")
      throw new ApiError(409, "invalid_transition", "Заявка уже обработана");
    if (!approverIds(db, r).includes(me.id)) throw forbidden("Согласовать эту заявку может другой сотрудник");
    if (r.employee_id === me.employee_id) throw forbidden("Нельзя согласовать собственную заявку");
    const author = userOfEmployee(db, r.employee_id);
    const name = emp(db, r.employee_id).full_name;
    const c = comment?.trim() || null;

    if (r.status === "submitted") {
      addEvent(db, r, me.employee_id, "manager_approved", c);
      if (author) notify(db, author.id, "request_manager_approved", `Руководитель согласовал ${humanType(r)}`, "Заявка передана в HR на проведение.", `/requests/${r.id}`);
      for (const h of hrUsers(db))
        if (h.id !== me.id) notify(db, h.id, "request_manager_approved", "Заявка ждёт HR", `${name} · ${humanType(r)} согласован руководителем.`, `/requests/${r.id}`);
    } else {
      addEvent(db, r, me.employee_id, "approved", c);
      const e = emp(db, r.employee_id);
      const n1c = Math.floor(400 + Math.random() * 500);
      r.external_1c_id = `ЗУП-${r.type === "vacation" ? "ОТ" : "АВ"}-000${n1c}`;
      r.docflow_id = `DL-2026-0${Math.floor(5000 + Math.random() * 4000)}`;
      if (r.type === "vacation") {
        const p = r.payload as VacationPayload;
        e.vacation_balance_days = Math.max(0, e.vacation_balance_days - p.days);
        logIntegration(db, "1c_zup", "postVacation", `Заявка №${r.id} → ${r.external_1c_id}`);
      } else {
        logIntegration(db, "1c_zup", "postAdvance", `Заявка №${r.id} → ${r.external_1c_id}`);
      }
      logIntegration(db, "documentolog", "createDocument", `Заявление №${r.id} → ${r.docflow_id}, отправлено на подпись`);
      if (author)
        notify(
          db,
          author.id,
          "request_approved",
          r.type === "vacation" ? "Отпуск одобрен" : "Аванс одобрен",
          `Проведено в 1С:ЗУП, заявление ${r.docflow_id} отправлено на подпись.`,
          `/requests/${r.id}`,
        );
    }
    return full(db, r);
  }, true),

  rejectRequest: op((db, id: number, comment: string) => {
    const me = auth(db);
    const r = getOwnedRequest(db, me, id);
    if (r.status !== "submitted" && r.status !== "manager_approved")
      throw new ApiError(409, "invalid_transition", "Заявка уже обработана");
    if (!approverIds(db, r).includes(me.id)) throw forbidden("Отклонить эту заявку может другой сотрудник");
    if (!comment?.trim()) throw invalid("Укажите причину отказа");
    addEvent(db, r, me.employee_id, "rejected", comment.trim());
    const author = userOfEmployee(db, r.employee_id);
    if (author) notify(db, author.id, "request_rejected", `Заявка на ${humanType(r)} отклонена`, `${emp(db, me.employee_id).full_name}: ${comment.trim()}`, `/requests/${r.id}`);
    return full(db, r);
  }, true),

  cancelRequest: op((db, id: number) => {
    const me = auth(db);
    const r = getOwnedRequest(db, me, id);
    if (r.employee_id !== me.employee_id) throw forbidden("Отменить можно только свою заявку");
    if (r.status !== "submitted") throw new ApiError(409, "invalid_transition", "Отменить можно только заявку, которую ещё не согласовали");
    const approvers = approverIds(db, r);
    addEvent(db, r, me.employee_id, "cancelled", null);
    for (const a of approvers) notify(db, a, "request_cancelled", "Заявка отменена", `${emp(db, r.employee_id).full_name} отменил(а) заявку №${r.id}.`, `/requests/${r.id}`);
    return full(db, r);
  }, true),

  teamCalendar: op((db, from?: string, to?: string) => {
    const me = auth(db);
    if (me.role === "employee") throw forbidden("Календарь команды доступен руководителю и HR");
    const f = from || dayOffset(-30);
    const t = to || dayOffset(90);
    return db.requests
      .filter((r) => r.type === "vacation" && ACTIVE.includes(r.status))
      .filter((r) => me.role === "hr" || isManagerOf(db, me, r.employee_id) || r.employee_id === me.employee_id)
      .filter((r) => {
        const p = r.payload as VacationPayload;
        return p.start_date <= t && p.end_date >= f;
      })
      .map((r) => {
        const p = r.payload as VacationPayload;
        return { employee: ref(db, r.employee_id), start_date: p.start_date, end_date: p.end_date, status: r.status };
      });
  }),

  team: op((db) => {
    const me = auth(db);
    if (me.role === "employee") throw forbidden("Раздел доступен руководителю и HR");
    const ids =
      me.role === "hr"
        ? db.users.map((u) => u.employee_id).filter((id) => id !== me.employee_id)
        : db.employees.filter((e) => e.manager_id === me.employee_id).map((e) => e.id);
    return ids.map((id) => teamMember(db, id));
  }),

  employee: op((db, id: number) => {
    const me = auth(db);
    emp(db, id);
    if (!canSeeEmployee(db, me, id)) throw forbidden("Сотрудник не входит в вашу команду");
    return teamMember(db, id);
  }),

  courses: op((db) => {
    auth(db);
    return db.courses;
  }),

  myEnrollments: op((db) => {
    const me = auth(db);
    return db.enrollments.filter((e) => e.employee_id === me.employee_id).map((e) => enrollmentView(db, e));
  }),

  course: op((db, id: number): CourseDetail => {
    const me = auth(db);
    const c = db.courses.find((x) => x.id === id);
    if (!c) throw notFound("Курс не найден");
    const e = db.enrollments.find((x) => x.course_id === id && x.employee_id === me.employee_id);
    return {
      ...c,
      lessons: db.lessons.filter((l) => l.course_id === id).sort((a, b) => a.order - b.order),
      quiz: db.questions.filter((q) => q.course_id === id).map((q) => ({ id: q.id, course_id: q.course_id, text: q.text, options: q.options })),
      enrollment: e ? enrollmentView(db, e) : null,
    };
  }),

  completeLesson: op((db, enrollmentId: number, lessonId: number) => {
    const me = auth(db);
    const e = enrollmentForMe(db, me, enrollmentId);
    const lesson = db.lessons.find((l) => l.id === lessonId && l.course_id === e.course_id);
    if (!lesson) throw notFound("Урок не найден");
    if (!db.lessonProgress.some((p) => p.enrollment_id === e.id && p.lesson_id === lessonId)) {
      db.lessonProgress.push({ enrollment_id: e.id, lesson_id: lessonId, completed_at: now() });
    }
    if (e.status === "assigned") e.status = "in_progress";
    recalcProgress(db, e);
    return enrollmentView(db, e);
  }, true),

  submitQuiz: op((db, enrollmentId: number, answers: number[]) => {
    const me = auth(db);
    const e = enrollmentForMe(db, me, enrollmentId);
    const qs = db.questions.filter((q) => q.course_id === e.course_id);
    const lessonsTotal = db.lessons.filter((l) => l.course_id === e.course_id).length;
    const lessonsDone = db.lessonProgress.filter((p) => p.enrollment_id === e.id).length;
    if (lessonsDone < lessonsTotal) throw invalid("Сначала изучите все уроки курса");
    if (!Array.isArray(answers) || answers.length !== qs.length) throw invalid("Ответьте на все вопросы");
    const correct = qs.map((q) => q.correct_index);
    const right = qs.filter((q, i) => answers[i] === q.correct_index).length;
    const score = Math.round((right / qs.length) * 100);
    const passed = score >= PASS_SCORE;
    const wasCompleted = e.status === "completed";
    e.score = Math.max(e.score ?? 0, score);
    if (passed && !wasCompleted) {
      e.status = "completed";
      e.completed_at = now();
      const course = db.courses.find((c) => c.id === e.course_id)!;
      notify(db, me.id, "course_completed", "Курс пройден", `«${course.title}» — результат ${score}%. Отметка добавлена в профиль.`, `/academy/${course.id}`);
      if (e.assigned_by) {
        const assigner = userOfEmployee(db, e.assigned_by);
        if (assigner && assigner.id !== me.id)
          notify(db, assigner.id, "course_completed", "Сотрудник прошёл курс", `${emp(db, me.employee_id).full_name} · «${course.title}» · ${score}%`, `/team/${me.employee_id}`);
      }
    } else if (e.status === "assigned") {
      e.status = "in_progress";
    }
    recalcProgress(db, e);
    return { score, passed, correct };
  }, true),

  assignCourse: op((db, body) => {
    const me = auth(db);
    const course = db.courses.find((c) => c.id === body.course_id);
    if (!course) throw notFound("Курс не найден");
    emp(db, body.employee_id);
    const self = body.employee_id === me.employee_id;
    if (!self && me.role !== "hr" && !isManagerOf(db, me, body.employee_id))
      throw forbidden("Назначать курсы можно только своей команде");
    const existing = db.enrollments.find((e) => e.employee_id === body.employee_id && e.course_id === body.course_id);
    if (existing) {
      if (self) return enrollmentView(db, existing);
      throw invalid("Курс уже назначен этому сотруднику", "already_assigned");
    }
    const e: StoredEnrollment = {
      id: next(db, "enrollment"),
      employee_id: body.employee_id,
      course_id: body.course_id,
      assigned_by: self ? null : me.employee_id,
      due_date: body.due_date,
      status: "assigned",
      progress_pct: 0,
      score: null,
      completed_at: null,
    };
    db.enrollments.push(e);
    const target = userOfEmployee(db, body.employee_id);
    if (target && !self)
      notify(
        db,
        target.id,
        "course_assigned",
        "Назначен курс",
        `«${course.title}»${body.due_date ? " — пройти до " + fmtDate(body.due_date) : ""}. Назначил(а): ${emp(db, me.employee_id).full_name}.`,
        `/academy/${course.id}`,
      );
    return enrollmentView(db, e);
  }, true),

  notifications: op((db): Notification[] => {
    const me = auth(db);
    return db.notifications.filter((n) => n.user_id === me.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }),

  readNotification: op((db, id: number) => {
    const me = auth(db);
    const n = db.notifications.find((x) => x.id === id);
    if (!n) throw notFound();
    if (n.user_id !== me.id) throw forbidden();
    n.read_at ??= now();
  }, true),

  readAllNotifications: op((db) => {
    const me = auth(db);
    for (const n of db.notifications) if (n.user_id === me.id && !n.read_at) n.read_at = now();
  }, true),

  kb: op((db) => {
    auth(db);
    return kbArticles as KbArticle[];
  }),

  escalate: op((db, logId: number, question?: string) => {
    const me = auth(db);
    db.stats.escalated += 1;
    if (question) {
      const q = db.unanswered.find((u) => u.question.toLowerCase() === question.toLowerCase());
      if (q) {
        q.count += 1;
        q.last_asked_at = now();
      } else db.unanswered.unshift({ question, count: 1, last_asked_at: now() });
    }
    for (const h of hrUsers(db))
      notify(db, h.id, "assistant_escalated", "Вопрос передан в HR", `${emp(db, me.employee_id).full_name}: «${question ?? "#" + logId}»`, "/hr");
  }, true),

  unanswered: op((db) => {
    const me = auth(db);
    if (me.role !== "hr") throw forbidden("Доступно только HR");
    return [...db.unanswered].sort((a, b) => b.count - a.count);
  }),

  assistantStats: op((db) => {
    const me = auth(db);
    if (me.role !== "hr") throw forbidden("Доступно только HR");
    return db.stats;
  }),

  sync1c: op((db) => {
    const me = auth(db);
    if (me.role !== "hr") throw forbidden("Доступно только HR");
    const at = now();
    logIntegration(db, "1c_zup", "syncEmployees", `Синхронизировано ${db.employees.length} сотрудников, изменений нет`);
    return { synced: db.employees.length, at };
  }, true),

  integrationsLog: op((db) => {
    const me = auth(db);
    if (me.role !== "hr") throw forbidden("Доступно только HR");
    return db.integrationLog;
  }),
};
