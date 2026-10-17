/* End-to-end smoke test over real HTTP. Walks the 6 demo scenarios from SPEC §0. */
import { createApp } from "./app";
import { dayOffset } from "./db";
import type { Server } from "http";

let pass = 0, fail = 0;
function ok(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("  ✓ " + msg); }
  else { fail++; console.log("  ✗ FAIL: " + msg); }
}

async function main() {
  const app = createApp();
  const server: Server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}/api/v1`;

  const req = async (method: string, path: string, token?: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const login = async (email: string) => (await req("POST", "/auth/login", undefined, { email, password: "demo1234" })).body;

  try {
    console.log("\n[Auth]");
    const noAuth = await req("GET", "/profile");
    ok(noAuth.status === 401, "GET /profile без токена → 401");
    const badLogin = await req("POST", "/auth/login", undefined, { email: "aigerim@jana.demo", password: "wrong" });
    ok(badLogin.status === 401, "неверный пароль → 401");

    const aigerim = await login("aigerim@jana.demo");
    const erlan = await login("erlan@jana.demo");
    const dinara = await login("dinara@jana.demo");
    ok(!!aigerim.token && aigerim.user.role === "employee", "вход Айгерим (employee)");
    ok(erlan.user.role === "manager", "вход Ерлан (manager)");
    ok(dinara.user.role === "hr", "вход Динара (hr)");

    console.log("\n[Сценарий 1: профиль/дашборд работника]");
    const prof = await req("GET", "/profile", aigerim.token);
    ok(prof.body.full_name === "Айгерим Садыкова" && prof.body.manager.full_name === "Ерлан Жумабаев", "профиль с руководителем");
    ok(typeof prof.body.department === "string", "department — строка");
    const dash = await req("GET", "/dashboard", aigerim.token);
    ok(Array.isArray(dash.body.tasks) && Array.isArray(dash.body.enrollments), "дашборд: tasks + enrollments");

    console.log("\n[Сценарий 2: подача заявки на отпуск]");
    const create = await req("POST", "/requests", aigerim.token, { type: "vacation", payload: { start_date: dayOffset(10), end_date: dayOffset(14), days: 5, comment: "Демо" } });
    ok(create.status === 201 && create.body.status === "submitted", "создана заявка (submitted)");
    const reqId = create.body.id;

    console.log("\n[Валидация 422]");
    const tooMany = await req("POST", "/requests", aigerim.token, { type: "vacation", payload: { start_date: dayOffset(60), end_date: dayOffset(160), days: 101 } });
    ok(tooMany.status === 422 && tooMany.body.error.code === "insufficient_balance", "перебор по остатку отпуска → 422");
    const past = await req("POST", "/requests", aigerim.token, { type: "vacation", payload: { start_date: dayOffset(-5), end_date: dayOffset(-1), days: 5 } });
    ok(past.status === 422, "дата в прошлом → 422");

    console.log("\n[Сценарий 3: руководитель видит и одобряет]");
    const team = await req("GET", "/requests?scope=team", erlan.token);
    ok(team.body.some((r: any) => r.id === reqId), "Ерлан видит заявку в scope=team");
    const employeeScopeTeam = await req("GET", "/requests?scope=team", aigerim.token);
    ok(employeeScopeTeam.status === 403, "работник не может scope=team → 403");
    const forbidden = await req("GET", "/employees/4", erlan.token);
    ok(forbidden.status === 403, "Ерлан → чужой сотрудник (Асель) → 403");
    const ownReport = await req("GET", "/employees/1", erlan.token);
    ok(ownReport.status === 200, "Ерлан → свой сотрудник (Айгерим) → 200");
    const mgrApprove = await req("POST", `/requests/${reqId}/approve`, erlan.token, { comment: "Ок" });
    ok(mgrApprove.body.status === "manager_approved", "после согласования руководителем → manager_approved");
    const erlanCantFinalize = await req("POST", `/requests/${reqId}/approve`, erlan.token, {});
    ok(erlanCantFinalize.status === 403, "руководитель не может провести этап HR → 403");

    console.log("\n[Сценарий 4: HR проводит → 1С:ЗУП + Documentolog + уведомление]");
    const hrApprove = await req("POST", `/requests/${reqId}/approve`, dinara.token, {});
    ok(hrApprove.body.status === "approved", "после HR → approved");
    ok(!!hrApprove.body.external_1c_id && !!hrApprove.body.docflow_id, "проставлены external_1c_id и docflow_id");
    const ilog = await req("GET", "/integrations/log", dinara.token);
    ok(ilog.body.some((e: any) => e.operation === "postVacation" && e.details.includes(`№${reqId}`)), "в журнале интеграций есть postVacation");
    ok(ilog.body.some((e: any) => e.system === "documentolog"), "в журнале интеграций есть Documentolog");
    const notif = await req("GET", "/notifications", aigerim.token);
    ok(notif.body.some((n: any) => n.type === "request_approved" && n.link === `/requests/${reqId}`), "Айгерим получила уведомление об одобрении");
    const detail = await req("GET", `/requests/${reqId}`, aigerim.token);
    ok(detail.body.events.length >= 3, "таймлайн заявки: ≥3 события");

    console.log("\n[Сценарий 5: курс + тест]");
    const course = await req("GET", "/courses/2", aigerim.token);
    ok(course.body.quiz.every((q: any) => q.correct_index === undefined), "quiz не раскрывает правильные ответы");
    const enrId = course.body.enrollment.id;
    for (const l of course.body.lessons) await req("POST", `/enrollments/${enrId}/lessons/${l.id}/complete`, aigerim.token);
    const answers = course.body.quiz.map(() => 1);
    const quiz = await req("POST", `/enrollments/${enrId}/quiz`, aigerim.token, { answers });
    ok(typeof quiz.body.score === "number" && Array.isArray(quiz.body.correct), "тест возвращает score + correct[]");
    const mine = await req("GET", "/enrollments/mine", aigerim.token);
    ok(mine.body.find((e: any) => e.id === enrId).progress_pct >= 0, "прогресс обновился");

    console.log("\n[Сценарий 6: ассистент — логи/эскалация/аналитика (данные для AI Нурасыла)]");
    const kb = await req("GET", "/kb", aigerim.token);
    ok(Array.isArray(kb.body) && kb.body.length === 10, `GET /kb → 10 статей`);
    ok(kb.body.find((a: any) => a.slug === "vacation-annual")?.body_md.length > 0, "у статьи есть body_md");
    const log = await req("POST", "/assistant/logs", aigerim.token, { question: "Сколько дней отпуска?", answer: "28", status: "answered", sources: [{ slug: "vacation-annual", title: "Отпуск" }] });
    ok(log.status === 201 && typeof log.body.log_id === "number", "POST /assistant/logs → log_id");
    const esc = await req("POST", "/assistant/escalate", aigerim.token, { log_id: log.body.log_id });
    ok(esc.body.ok === true, "эскалация в HR");
    const hrNotif = await req("GET", "/notifications", dinara.token);
    ok(hrNotif.body.some((n: any) => n.type === "assistant_escalation"), "HR получил уведомление об эскалации");
    const stats = await req("GET", "/assistant/stats", dinara.token);
    ok(stats.body.total > 0 && "answered" in stats.body, "GET /assistant/stats (hr)");
    const statsForbidden = await req("GET", "/assistant/stats", aigerim.token);
    ok(statsForbidden.status === 403, "работник не видит stats → 403");
    const unans = await req("GET", "/assistant/unanswered", dinara.token);
    ok(Array.isArray(unans.body) && unans.body[0].count >= unans.body[unans.body.length - 1].count, "unanswered отсортирован по частоте");

    console.log("\n[1С sync]");
    const sync = await req("POST", "/integrations/1c/sync", dinara.token);
    ok(sync.body.synced === 7, "sync вернул 7 сотрудников");
    const syncForbidden = await req("POST", "/integrations/1c/sync", erlan.token);
    ok(syncForbidden.status === 403, "manager не может запускать sync → 403");
  } finally {
    server.close();
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}
main();
