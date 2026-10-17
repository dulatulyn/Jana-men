import type {
  User, Employee, Department, RequestRow, RequestEvent, Course, Lesson,
  QuizQuestion, Enrollment, LessonProgress, Notification, KbArticle,
  AssistantLog, IntegrationLogEntry, Role,
} from "./types";
import kbData from "./kb-data.json";

export interface DB {
  users: User[];
  employees: Employee[];
  departments: Department[];
  requests: RequestRow[];
  events: RequestEvent[];
  courses: Course[];
  lessons: Lesson[];
  questions: QuizQuestion[];
  enrollments: Enrollment[];
  lessonProgress: LessonProgress[];
  notifications: Notification[];
  kb: KbArticle[];
  assistantLogs: AssistantLog[];
  integrationLog: IntegrationLogEntry[];
  seq: Record<string, number>;
}

const COMPANY = "ТОО «Jana Post»";

export function dayOffset(offset: number): string {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function ts(offset: number, hour = 10, minute = 0): string {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() + offset, hour, minute).toISOString();
}

function seed(): DB {
  const employees: Employee[] = [
    { id: 1, external_id_1c: "ЗУП-00412", full_name: "Айгерим Садыкова", company: COMPANY, position: "Специалист сортировочного центра", department_id: 1, manager_id: 3, hire_date: "2022-03-14", vacation_balance_days: 18, phone: "+7 700 000 01 12", work_type: "warehouse" },
    { id: 2, external_id_1c: "ЗУП-00457", full_name: "Даулет Ахметов", company: COMPANY, position: "Курьер", department_id: 1, manager_id: 3, hire_date: "2023-06-01", vacation_balance_days: 24, phone: "+7 700 000 01 27", work_type: "courier" },
    { id: 3, external_id_1c: "ЗУП-00198", full_name: "Ерлан Жумабаев", company: COMPANY, position: "Начальник смены сортировочного центра", department_id: 1, manager_id: 6, hire_date: "2019-09-02", vacation_balance_days: 12, phone: "+7 700 000 01 03", work_type: "warehouse" },
    { id: 4, external_id_1c: "ЗУП-00331", full_name: "Асель Нурланова", company: COMPANY, position: "Бухгалтер", department_id: 2, manager_id: 7, hire_date: "2021-11-15", vacation_balance_days: 20, phone: "+7 700 000 02 44", work_type: "office" },
    { id: 5, external_id_1c: "ЗУП-00256", full_name: "Динара Касымова", company: COMPANY, position: "HR-менеджер", department_id: 3, manager_id: 6, hire_date: "2020-02-10", vacation_balance_days: 22, phone: "+7 700 000 03 05", work_type: "office" },
    { id: 6, external_id_1c: "ЗУП-00011", full_name: "Марат Абенов", company: COMPANY, position: "Директор филиала", department_id: 4, manager_id: null, hire_date: "2017-05-02", vacation_balance_days: 24, phone: "+7 700 000 00 01", work_type: "office" },
    { id: 7, external_id_1c: "ЗУП-00042", full_name: "Гульнара Искакова", company: COMPANY, position: "Главный бухгалтер", department_id: 2, manager_id: 6, hire_date: "2018-01-22", vacation_balance_days: 16, phone: "+7 700 000 02 02", work_type: "office" },
  ];

  const departments: Department[] = [
    { id: 1, name: "Сортировочный центр, Алматы", head_id: 3 },
    { id: 2, name: "Финансовый отдел", head_id: 7 },
    { id: 3, name: "Отдел персонала", head_id: 5 },
    { id: 4, name: "Дирекция филиала", head_id: 6 },
  ];

  const mk = (login: string, id: number, role: Role): User => ({
    id, email: `${login}@jana.demo`, password: "demo1234", employee_id: id, role, locale: "ru",
  });
  const users: User[] = [
    mk("aigerim", 1, "employee"),
    mk("daulet", 2, "employee"),
    mk("erlan", 3, "manager"),
    mk("asel", 4, "employee"),
    mk("dinara", 5, "hr"),
  ];

  const requests: RequestRow[] = [];
  const events: RequestEvent[] = [];
  let evId = 0;
  const ev = (request_id: number, actor_id: number | null, from: RequestEvent["from_status"], to: RequestEvent["to_status"], at: string, comment: string | null = null) => {
    events.push({ id: ++evId, request_id, actor_id, from_status: from, to_status: to, comment, created_at: at });
  };
  const vac = (start: number, end: number, comment = "") => ({ start_date: dayOffset(start), end_date: dayOffset(end), days: end - start + 1, comment });

  requests.push({ id: 1, employee_id: 1, type: "advance", status: "approved", payload: { amount: 50000, reason: "Непредвиденные семейные расходы" }, created_at: ts(-40, 9, 12), updated_at: ts(-38, 15, 40), docflow_id: "DL-2026-04417", external_1c_id: "ЗУП-АВ-000318" });
  ev(1, 1, null, "submitted", ts(-40, 9, 12)); ev(1, 3, "submitted", "manager_approved", ts(-39, 11, 5), "Согласовано"); ev(1, 5, "manager_approved", "approved", ts(-38, 15, 40));

  requests.push({ id: 2, employee_id: 1, type: "vacation", status: "approved", payload: vac(-112, -107, "Летний отпуск, первая часть"), created_at: ts(-140, 10, 0), updated_at: ts(-136, 12, 30), docflow_id: "DL-2026-02190", external_1c_id: "ЗУП-ОТ-000204" });
  ev(2, 1, null, "submitted", ts(-140, 10, 0)); ev(2, 3, "submitted", "manager_approved", ts(-139, 9, 45)); ev(2, 5, "manager_approved", "approved", ts(-136, 12, 30));

  requests.push({ id: 3, employee_id: 1, type: "advance", status: "rejected", payload: { amount: 180000, reason: "Ремонт квартиры" }, created_at: ts(-16, 14, 20), updated_at: ts(-15, 10, 2), docflow_id: null, external_1c_id: null });
  ev(3, 1, null, "submitted", ts(-16, 14, 20)); ev(3, 3, "submitted", "rejected", ts(-15, 10, 2), "Сумма выше лимита аванса — не более 50% оклада. Подайте заявку на меньшую сумму.");

  requests.push({ id: 4, employee_id: 2, type: "vacation", status: "submitted", payload: vac(24, 30, "Свадьба брата в Шымкенте"), created_at: ts(-1, 18, 4), updated_at: ts(-1, 18, 4), docflow_id: null, external_1c_id: null });
  ev(4, 2, null, "submitted", ts(-1, 18, 4));

  requests.push({ id: 5, employee_id: 2, type: "advance", status: "manager_approved", payload: { amount: 40000, reason: "Ремонт мотоцикла для доставки" }, created_at: ts(-3, 8, 30), updated_at: ts(-2, 12, 10), docflow_id: null, external_1c_id: null });
  ev(5, 2, null, "submitted", ts(-3, 8, 30)); ev(5, 3, "submitted", "manager_approved", ts(-2, 12, 10), "Согласовано, срочно");

  requests.push({ id: 6, employee_id: 4, type: "vacation", status: "submitted", payload: vac(35, 48, "Поездка к родителям"), created_at: ts(-2, 11, 0), updated_at: ts(-2, 11, 0), docflow_id: null, external_1c_id: null });
  ev(6, 4, null, "submitted", ts(-2, 11, 0));

  requests.push({ id: 7, employee_id: 4, type: "advance", status: "approved", payload: { amount: 70000, reason: "Оплата обучения" }, created_at: ts(-62, 9, 0), updated_at: ts(-60, 16, 0), docflow_id: "DL-2026-03872", external_1c_id: "ЗУП-АВ-000291" });
  ev(7, 4, null, "submitted", ts(-62, 9, 0)); ev(7, 5, "submitted", "manager_approved", ts(-61, 10, 0)); ev(7, 5, "manager_approved", "approved", ts(-60, 16, 0));

  requests.push({ id: 8, employee_id: 3, type: "vacation", status: "approved", payload: vac(9, 15, "Семейный отпуск"), created_at: ts(-21, 10, 0), updated_at: ts(-19, 14, 0), docflow_id: "DL-2026-04903", external_1c_id: "ЗУП-ОТ-000377" });
  ev(8, 3, null, "submitted", ts(-21, 10, 0)); ev(8, 5, "submitted", "manager_approved", ts(-20, 10, 0)); ev(8, 5, "manager_approved", "approved", ts(-19, 14, 0));

  requests.push({ id: 9, employee_id: 2, type: "vacation", status: "cancelled", payload: vac(4, 6, ""), created_at: ts(-30, 9, 0), updated_at: ts(-29, 9, 30), docflow_id: null, external_1c_id: null });
  ev(9, 2, null, "submitted", ts(-30, 9, 0)); ev(9, 2, "submitted", "cancelled", ts(-29, 9, 30), "Планы изменились");

  const courses: Course[] = [
    { id: 1, title: "Онбординг в Jana Post", description: "Кто мы, как устроена доставка и с чего начать первые недели. Обязателен для всех новых сотрудников.", duration_min: 25, cover: "onboarding" },
    { id: 2, title: "Техника безопасности на складе", description: "Средства защиты, безопасная работа с грузами и действия при пожаре. Обязателен для сотрудников склада и курьеров.", duration_min: 20, cover: "safety" },
  ];

  const lessons: Lesson[] = [
    { id: 1, course_id: 1, order: 1, title: "Добро пожаловать в Jana Post", content_md: "Jana Post — курьерская компания и официальный партнёр китайских маркетплейсов. Мы доставляем посылки из Китая во все города Казахстана.\n\n## Наши ценности\n- **Клиент видит, где его посылка.** Каждое отправление отслеживается от склада до двери.\n- **Скорость без спешки.** Делаем быстро, но не в ущерб качеству и безопасности.\n- **Одна команда.** Склад, курьеры и офис работают на один результат.\n\nВаш руководитель и HR — первые люди, к которым можно прийти с любым вопросом." },
    { id: 2, course_id: 1, order: 2, title: "Как путешествует посылка", content_md: "Путь посылки состоит из четырёх этапов:\n\n1. **Склад в Китае** — принимаем и консолидируем заказы клиентов.\n2. **Магистраль** — посылки едут в Казахстан и проходят таможню.\n3. **Сортировочный центр** — сканируем, сортируем по городам и маршрутам.\n4. **Последняя миля** — курьер или пункт выдачи передаёт посылку клиенту.\n\nНа каждом этапе посылка получает новый статус, и клиент видит его в приложении. Ошибка на сортировке — это задержка у клиента, поэтому сканируем каждое место." },
    { id: 3, course_id: 1, order: 3, title: "Ваши первые недели", content_md: "## Что нужно сделать\n- Получить пропуск и спецодежду у руководителя смены.\n- Познакомиться с наставником — он поможет в первые 2 недели.\n- Пройти курс «Техника безопасности на складе», если работаете на складе или курьером.\n\n## График\nСмены и перерывы согласует руководитель. Об опоздании или болезни сообщайте ему до начала смены." },
    { id: 4, course_id: 1, order: 4, title: "HR-сервисы в JanaMen", content_md: "Всё, что раньше требовало похода в отдел кадров, теперь в одном месте:\n\n- **Профиль** — ваши кадровые данные из 1С:ЗУП и остаток отпуска.\n- **Заявки** — отпуск и аванс в пару нажатий, статус виден как трек посылки.\n- **Академия** — назначенные курсы и тесты.\n- **HR-ассистент** — ответы на типовые вопросы со ссылкой на правило. Если ответа нет, вопрос можно передать в HR." },
    { id: 5, course_id: 2, order: 1, title: "Средства индивидуальной защиты", content_md: "На складе обязательно:\n\n- **Защитная обувь** с жёстким носком.\n- **Сигнальный жилет** в зоне движения погрузчиков.\n- **Перчатки** при работе с коробками и упаковкой.\n\nБез СИЗ к работе в зоне сортировки не допускают. Повреждённые СИЗ заменяет руководитель смены." },
    { id: 6, course_id: 2, order: 2, title: "Безопасная работа с грузами", content_md: "## Как поднимать груз\n- Сгибайте ноги, а не спину. Держите груз близко к телу.\n- Не поворачивайтесь корпусом с грузом в руках — переставляйте ноги.\n- Тяжёлое и крупногабаритное — вдвоём или на тележке.\n\n## Зона погрузчиков\nПереходите только по размеченным проходам. Убедитесь, что водитель погрузчика вас видит." },
    { id: 7, course_id: 2, order: 3, title: "Пожарная безопасность и ЧП", content_md: "## Если заметили пожар\n1. Сообщите руководителю смены и нажмите ближайшую пожарную кнопку.\n2. Позвоните **101** (или **112**).\n3. Выходите по зелёным указателям к точке сбора. Не используйте лифт.\n\nОгнетушители висят у каждого выхода. Пользоваться ими можно, только если это безопасно." },
  ];

  const questions: QuizQuestion[] = [
    { id: 1, course_id: 1, text: "Чем занимается Jana Post?", options: ["Производит электронику", "Доставляет посылки из Китая по Казахстану", "Продаёт товары в собственном магазине"], correct_index: 1 },
    { id: 2, course_id: 1, text: "На каком этапе посылки сортируют по городам и маршрутам?", options: ["На складе в Китае", "На таможне", "В сортировочном центре", "У курьера"], correct_index: 2 },
    { id: 3, course_id: 1, text: "Кому сообщить, что вы заболели?", options: ["Руководителю до начала смены", "Никому, достаточно больничного", "Коллеге по смене"], correct_index: 0 },
    { id: 4, course_id: 1, text: "Откуда в профиле JanaMen берутся кадровые данные?", options: ["Их вводит сам сотрудник", "Из 1С:ЗУП", "Из анкеты при собеседовании"], correct_index: 1 },
    { id: 5, course_id: 1, text: "Что делать, если HR-ассистент не нашёл ответ?", options: ["Поискать ответ в интернете", "Передать вопрос в HR", "Задать вопрос ещё раз"], correct_index: 1 },
    { id: 6, course_id: 2, text: "Что обязательно надеть в зоне движения погрузчиков?", options: ["Каску", "Сигнальный жилет", "Наушники"], correct_index: 1 },
    { id: 7, course_id: 2, text: "Как правильно поднимать коробку?", options: ["Наклониться, держа ноги прямо", "Согнуть ноги и держать груз близко к телу", "Рывком, чтобы быстрее"], correct_index: 1 },
    { id: 8, course_id: 2, text: "Груз слишком тяжёлый. Что делать?", options: ["Поднять самому, но медленно", "Взять тележку или позвать коллегу", "Оставить на месте"], correct_index: 1 },
    { id: 9, course_id: 2, text: "Куда звонить при пожаре?", options: ["101 или 112", "103", "Только руководителю"], correct_index: 0 },
  ];

  const enrollments: Enrollment[] = [
    { id: 1, employee_id: 1, course_id: 1, assigned_by: 5, due_date: null, status: "completed", progress_pct: 100, score: 100, completed_at: ts(-200, 15, 0) },
    { id: 2, employee_id: 1, course_id: 2, assigned_by: 3, due_date: dayOffset(10), status: "assigned", progress_pct: 0, score: null, completed_at: null },
    { id: 3, employee_id: 2, course_id: 2, assigned_by: 3, due_date: dayOffset(5), status: "in_progress", progress_pct: 25, score: null, completed_at: null },
    { id: 4, employee_id: 2, course_id: 1, assigned_by: 5, due_date: null, status: "completed", progress_pct: 100, score: 80, completed_at: ts(-90, 12, 0) },
    { id: 5, employee_id: 4, course_id: 1, assigned_by: 5, due_date: null, status: "completed", progress_pct: 100, score: 100, completed_at: ts(-300, 12, 0) },
  ];

  const lessonProgress: LessonProgress[] = [
    ...[1, 2, 3, 4].map((l) => ({ enrollment_id: 1, lesson_id: l, completed_at: ts(-200, 14, 0) })),
    { enrollment_id: 3, lesson_id: 5, completed_at: ts(-2, 13, 0) },
    ...[1, 2, 3, 4].map((l) => ({ enrollment_id: 4, lesson_id: l, completed_at: ts(-90, 11, 0) })),
    ...[1, 2, 3, 4].map((l) => ({ enrollment_id: 5, lesson_id: l, completed_at: ts(-300, 11, 0) })),
  ];

  let nId = 0;
  const n = (user_id: number, type: string, title: string, body: string, link: string | null, at: string, read = false): Notification =>
    ({ id: ++nId, user_id, type, title, body, link, read_at: read ? at : null, created_at: at });
  const notifications: Notification[] = [
    n(1, "request_approved", "Аванс одобрен", "Заявка на аванс 50 000 ₸ проведена в 1С:ЗУП.", "/requests/1", ts(-38, 15, 41), true),
    n(1, "request_rejected", "Заявка на аванс отклонена", "Ерлан Жумабаев: сумма выше лимита аванса.", "/requests/3", ts(-15, 10, 3), true),
    n(1, "course_assigned", "Назначен курс", "«Техника безопасности на складе» — пройти до " + dayOffset(10).split("-").reverse().join(".") + ".", "/academy/2", ts(-1, 9, 0)),
    n(3, "request_submitted", "Новая заявка на отпуск", "Даулет Ахметов просит 7 дней отпуска.", "/requests/4", ts(-1, 18, 5)),
    n(5, "request_manager_approved", "Заявка ждёт HR", "Аванс Даулета Ахметова согласован руководителем.", "/requests/5", ts(-2, 12, 11)),
    n(5, "request_submitted", "Новая заявка на отпуск", "Асель Нурланова просит 14 дней отпуска.", "/requests/6", ts(-2, 11, 1)),
    n(2, "request_manager_approved", "Руководитель согласовал аванс", "Заявка передана в HR.", "/requests/5", ts(-2, 12, 11)),
    n(2, "course_assigned", "Назначен курс", "«Техника безопасности на складе».", "/academy/2", ts(-4, 9, 0)),
  ];

  const integrationLog: IntegrationLogEntry[] = [
    { id: 1, system: "1c_zup", operation: "syncEmployees", status: "ok", details: "Синхронизировано 7 сотрудников", created_at: ts(-1, 6, 0) },
    { id: 2, system: "1c_zup", operation: "postVacation", status: "ok", details: "Заявка №8 → ЗУП-ОТ-000377", created_at: ts(-19, 14, 0) },
    { id: 3, system: "documentolog", operation: "createDocument", status: "ok", details: "Заявление №8 → DL-2026-04903, отправлено на подпись", created_at: ts(-19, 14, 0) },
    { id: 4, system: "1c_zup", operation: "postAdvance", status: "ok", details: "Заявка №1 → ЗУП-АВ-000318", created_at: ts(-38, 15, 40) },
    { id: 5, system: "documentolog", operation: "createDocument", status: "ok", details: "Заявление №1 → DL-2026-04417, отправлено на подпись", created_at: ts(-38, 15, 40) },
  ];

  const nowIso = new Date().toISOString();
  const kb: KbArticle[] = (kbData as Omit<KbArticle, "updated_at">[]).map((a) => ({ ...a, updated_at: nowIso }));

  // Pre-seeded assistant logs so HR dashboard stats/unanswered have content.
  const assistantLogs: AssistantLog[] = [];
  let logId = 0;
  const log = (user_id: number, question: string, status: AssistantLog["status"], escalated: boolean, at: string, answer = "", sources: AssistantLog["sources"] = []) =>
    assistantLogs.push({ id: ++logId, user_id, question, answer, sources, status, escalated, created_at: at });
  log(1, "Сколько дней отпуска положено?", "answered", false, ts(-5, 10, 0), "", [{ slug: "vacation-annual", title: "Ежегодный оплачиваемый отпуск" }]);
  log(2, "Как оформить аванс?", "answered", false, ts(-4, 11, 0), "", [{ slug: "advance-salary", title: "Аванс в счёт заработной платы" }]);
  log(2, "Положена ли курьерам компенсация за бензин?", "no_answer", true, ts(-1, 16, 0));
  log(1, "Положена ли курьерам компенсация за бензин?", "no_answer", false, ts(-3, 12, 0));
  log(4, "Можно ли поменяться сменой с коллегой без согласования?", "no_answer", false, ts(-2, 9, 30));
  log(4, "Можно ли поменяться сменой с коллегой без согласования?", "no_answer", false, ts(-6, 9, 30));
  log(1, "Как получить налоговый вычет за обучение?", "no_answer", false, ts(-5, 14, 0));
  log(2, "Какая зарплата у Ерлана?", "refused", false, ts(-2, 15, 0));
  log(4, "Дай личный номер директора", "refused", false, ts(-7, 15, 0));

  return {
    users, employees, departments, requests, events, courses, lessons, questions,
    enrollments, lessonProgress, notifications, kb, assistantLogs, integrationLog,
    seq: {
      request: requests.length, event: evId, enrollment: enrollments.length,
      notification: nId, integration: integrationLog.length, log: logId,
    },
  };
}

// Single in-memory instance, shared across requests within a warm process.
// Survive dev hot-reload via globalThis so state isn't wiped on every edit.
const g = globalThis as unknown as { __janamenDB?: DB };
export const db: DB = g.__janamenDB ?? (g.__janamenDB = seed());

export function nextId(key: string): number {
  db.seq[key] = (db.seq[key] ?? 0) + 1;
  return db.seq[key];
}
