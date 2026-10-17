import { createTestApi, day, type TestApi } from "./helpers";

let api: TestApi;
beforeAll(async () => {
  api = await createTestApi();
});
afterAll(() => api.close());
beforeEach(() => api.reset());

const vacation = (start: number, end: number, extra: object = {}) => ({
  type: "vacation",
  payload: { start_date: day(start), end_date: day(end), comment: "e2e", ...extra },
});

describe("demo path: employee → manager → HR → 1С + Documentolog", () => {
  it("runs end to end with timeline, balance, integrations and notifications", async () => {
    const created = await api.post("aigerim", "/requests", vacation(20, 24));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: "submitted", employee: { id: 1, full_name: "Айгерим Садыкова" } });
    expect(created.body.payload.days).toBe(5);
    const id = created.body.id;

    // Erlan sees it in his team inbox and has a dashboard task for it.
    const team = await api.get("erlan", "/requests?scope=team&status=submitted");
    expect(team.body.map((r: { id: number }) => r.id)).toContain(id);
    expect(team.body.find((r: { id: number }) => r.id === id).summary).toBe(
      `${day(20).split("-").reverse().join(".")} – ${day(24).split("-").reverse().join(".")} · 5 дн.`,
    );
    const dash = await api.get("erlan", "/dashboard");
    expect(dash.body.tasks).toContainEqual(expect.objectContaining({ type: "approve_request", link: `/requests/${id}` }));

    const mgr = await api.post("erlan", `/requests/${id}/approve`, { comment: "Ок" });
    expect(mgr.status).toBe(200);
    expect(mgr.body.status).toBe("manager_approved");

    // A manager cannot perform the HR stage.
    expect((await api.post("erlan", `/requests/${id}/approve`, {})).status).toBe(403);

    const hr = await api.post("dinara", `/requests/${id}/approve`, {});
    expect(hr.status).toBe(200);
    expect(hr.body.status).toBe("approved");
    expect(hr.body.external_1c_id).toMatch(/^ЗУП-ОТ-\d{6}$/);
    expect(hr.body.docflow_id).toMatch(/^DL-\d{4}-\d{5}$/);

    // 1С deducted the days: 18 − 5.
    expect((await api.get("aigerim", "/profile")).body.vacation_balance_days).toBe(13);

    const detail = await api.get("aigerim", `/requests/${id}`);
    expect(detail.body.events.map((e: { to_status: string }) => e.to_status)).toEqual(["submitted", "manager_approved", "approved"]);
    expect(detail.body.events[1]).toMatchObject({ actor: { id: 3, full_name: "Ерлан Жумабаев" }, comment: "Ок" });

    const log = await api.get("dinara", "/integrations/log");
    const mine = log.body.filter((l: { details: string }) => l.details.includes(`№${id} `));
    expect(mine.map((l: { system: string; operation: string }) => `${l.system}:${l.operation}`).sort()).toEqual(
      ["1c_zup:postVacation", "documentolog:createDocument"],
    );

    const notes = await api.get("aigerim", "/notifications");
    expect(notes.body.map((n: { type: string }) => n.type)).toEqual(
      expect.arrayContaining(["request_submitted", "request_manager_approved", "request_approved"]),
    );
    const hrNotes = await api.get("dinara", "/notifications");
    expect(hrNotes.body).toContainEqual(expect.objectContaining({ type: "request_manager_approved", link: `/requests/${id}` }));
  });

  it("advance goes through postAdvance and leaves the vacation balance alone", async () => {
    const id = (await api.post("daulet", "/requests", { type: "advance", payload: { amount: 30000.4, reason: "Ремонт" } })).body.id;
    await api.post("erlan", `/requests/${id}/approve`, {});
    const r = await api.post("dinara", `/requests/${id}/approve`, {});
    expect(r.body.external_1c_id).toMatch(/^ЗУП-АВ-/);
    expect(r.body.payload.amount).toBe(30000);
    expect((await api.get("daulet", "/profile")).body.vacation_balance_days).toBe(24);
  });
});

describe("who may act", () => {
  it("falls back to HR when the author's manager has no account", async () => {
    // Asel's manager (Гульнара) has no platform account → request 6 is HR's.
    expect((await api.post("erlan", "/requests/6/approve", {})).status).toBe(403);
    const dash = await api.get("dinara", "/dashboard");
    expect(dash.body.tasks).toContainEqual(expect.objectContaining({ link: "/requests/6" }));
    const r = await api.post("dinara", "/requests/6/approve", {});
    expect(r.body.status).toBe("manager_approved");
  });

  it("nobody approves their own request", async () => {
    const id = (await api.post("erlan", "/requests", vacation(40, 41))).body.id;
    const res = await api.post("erlan", `/requests/${id}/approve`, {});
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("Нельзя согласовать собственную заявку");
    // Erlan's manager has no account, so it lands with HR.
    expect((await api.post("dinara", `/requests/${id}/approve`, {})).body.status).toBe("manager_approved");
  });

  it("finished requests are 409, not silently re-processed", async () => {
    const res = await api.post("dinara", "/requests/1/approve", {});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("invalid_transition");
  });

  it("reject needs a reason and notifies the author", async () => {
    expect((await api.post("erlan", "/requests/4/reject", { comment: "  " })).status).toBe(422);
    const r = await api.post("erlan", "/requests/4/reject", { comment: "Пиковый сезон" });
    expect(r.body.status).toBe("rejected");
    const notes = (await api.get("daulet", "/notifications")).body;
    expect(notes[0]).toMatchObject({ type: "request_rejected", body: "Ерлан Жумабаев: Пиковый сезон" });
  });

  it("cancel: only the author, only before any approval", async () => {
    expect((await api.post("erlan", "/requests/4/cancel")).status).toBe(403);
    expect((await api.post("daulet", "/requests/5/cancel")).status).toBe(409); // already manager_approved
    const r = await api.post("daulet", "/requests/4/cancel");
    expect(r.body.status).toBe("cancelled");
    expect((await api.get("erlan", "/notifications")).body[0]).toMatchObject({ type: "request_cancelled" });
  });
});

describe("data scope (SPEC §3)", () => {
  it("employees can't read other people's requests or the team inbox", async () => {
    expect((await api.get("aigerim", "/requests/4")).status).toBe(403);
    expect((await api.get("aigerim", "/requests?scope=team")).status).toBe(403);
    expect((await api.get("erlan", "/requests?scope=all")).status).toBe(403);
    expect((await api.get("erlan", "/requests/6")).status).toBe(403); // Asel is not in his team
    expect((await api.get("dinara", "/requests?scope=all")).body).toHaveLength(9);
  });

  it("manager's team scope is exactly his direct reports", async () => {
    const ids = new Set((await api.get("erlan", "/requests?scope=team")).body.map((r: { employee: { id: number } }) => r.employee.id));
    expect([...ids].sort()).toEqual([1, 2]);
  });

  it("unknown request is 404", async () => {
    expect((await api.get("dinara", "/requests/9999")).status).toBe(404);
  });
});

describe("validation", () => {
  const err = async (body: object) => {
    const r = await api.post("aigerim", "/requests", body);
    expect(r.status).toBe(422);
    return r.body.error as { code: string; message: string };
  };

  it("rejects bad dates", async () => {
    expect((await err(vacation(-3, -1))).code).toBe("past_date");
    expect((await err(vacation(10, 5))).message).toBe("Дата окончания раньше даты начала");
    expect((await err({ type: "vacation", payload: { start_date: "2026-02-30", end_date: "2026-03-02" } })).message).toMatch(/формате/);
    expect((await err({ type: "vacation", payload: {} })).message).toBe("Укажите даты отпуска");
  });

  it("checks the balance, counting days already pending", async () => {
    const e = await err(vacation(30, 60));
    expect(e).toMatchObject({ code: "insufficient_balance", message: "Недостаточно дней отпуска: доступно 18, запрошено 31" });

    expect((await api.post("aigerim", "/requests", vacation(30, 39))).status).toBe(201); // 10 days pending
    const e2 = await err(vacation(50, 58)); // 9 more > 8 left
    expect(e2.message).toBe("Недостаточно дней отпуска: доступно 8, запрошено 9 (ещё 10 дн. в заявках на согласовании)");
  });

  it("rejects overlaps with own active requests", async () => {
    await api.post("aigerim", "/requests", vacation(30, 32));
    expect((await err(vacation(32, 33))).code).toBe("overlap");
  });

  it("ignores a client-supplied day count", async () => {
    const r = await api.post("aigerim", "/requests", vacation(30, 31, { days: 1 }));
    expect(r.body.payload.days).toBe(2);
  });

  it("validates advances", async () => {
    expect((await err({ type: "advance", payload: { amount: 0, reason: "x" } })).message).toBe("Укажите сумму аванса");
    expect((await err({ type: "advance", payload: { amount: 2_000_000, reason: "x" } })).message).toMatch(/не может превышать/);
    expect((await err({ type: "advance", payload: { amount: 1000, reason: " " } })).message).toBe("Укажите причину");
    expect((await err({ type: "bonus", payload: {} })).message).toBe("Неизвестный тип заявки");
    expect((await err({ type: "advance", payload: "nope" })).message).toBe("payload должен быть объектом");
  });
});

describe("concurrency", () => {
  it("two approvers clicking at once: exactly one wins", async () => {
    const results = await Promise.all([
      api.post("erlan", "/requests/4/approve", {}),
      api.post("erlan", "/requests/4/approve", {}),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const events = (await api.get("daulet", "/requests/4")).body.events;
    expect(events.filter((e: { to_status: string }) => e.to_status === "manager_approved")).toHaveLength(1);
  });

  it("parallel submissions can't overspend vacation days", async () => {
    // 10 + 10 > 18: whichever commits second must be refused.
    const results = await Promise.all([
      api.post("aigerim", "/requests", vacation(30, 39)),
      api.post("aigerim", "/requests", vacation(50, 59)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
  });
});
