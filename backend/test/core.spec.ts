import request from "supertest";
import { createTestApi, day, type TestApi } from "./helpers";

let api: TestApi;
beforeAll(async () => {
  api = await createTestApi();
  await api.reset();
});
afterAll(() => api.close());

describe("auth", () => {
  it("requires a valid bearer token", async () => {
    expect((await api.get(null, "/profile")).body).toEqual({ error: { code: "unauthorized", message: "Требуется вход" } });
    const forged = await request(api.app.getHttpServer()).get("/api/v1/profile").set("Authorization", "Bearer not.a.jwt");
    expect(forged.status).toBe(401);
    expect(forged.body.error.code).toBe("unauthorized");
  });

  it("rejects wrong passwords and unknown emails identically", async () => {
    const a = await api.post(null, "/auth/login", { email: "aigerim@jana.demo", password: "nope" });
    const b = await api.post(null, "/auth/login", { email: "ghost@jana.demo", password: "nope" });
    expect(a.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it("login is case-insensitive on email and returns the contract shape", async () => {
    const r = await api.post(null, "/auth/login", { email: "  ERLAN@jana.demo ", password: "demo1234" });
    expect(r.status).toBe(200);
    expect(r.body.user).toEqual({ id: 3, role: "manager", employee_id: 3, full_name: "Ерлан Жумабаев", locale: "ru" });
  });

  it("/me never exposes the password hash", async () => {
    const r = await api.get("aigerim", "/me");
    expect(r.body).toMatchObject({ id: 1, email: "aigerim@jana.demo", employee: { id: 1, hire_date: "2022-03-14", external_id_1c: "ЗУП-00412" } });
    expect(JSON.stringify(r.body)).not.toMatch(/password/);
  });
});

describe("profile & dashboard", () => {
  it("profile matches what the AI service expects", async () => {
    const r = await api.get("aigerim", "/profile");
    expect(r.body).toEqual({
      full_name: "Айгерим Садыкова",
      company: "ТОО «Jana Post»",
      position: "Специалист сортировочного центра",
      department: "Сортировочный центр, Алматы",
      manager: { id: 3, full_name: "Ерлан Жумабаев" },
      hire_date: "2022-03-14",
      vacation_balance_days: 18,
      work_type: "warehouse",
    });
  });

  it("dashboard lists courses to take", async () => {
    const r = await api.get("aigerim", "/dashboard");
    expect(r.body.tasks).toContainEqual(expect.objectContaining({ type: "course", link: "/academy/2", due: day(10) }));
    // Request 3 was rejected 15 days ago — outside the 14-day "look at the reason" window.
    expect(r.body.tasks).not.toContainEqual(expect.objectContaining({ type: "request_rejected" }));
    expect(r.body.unread_notifications).toBe(1);
    expect(r.body.enrollments[0].course.title).toBe("Онбординг в Jana Post");
  });

  it("a fresh rejection shows up as a task for the author", async () => {
    await api.post("erlan", "/requests/4/reject", { comment: "Пиковый сезон" });
    const r = await api.get("daulet", "/dashboard");
    expect(r.body.tasks).toContainEqual(expect.objectContaining({ type: "request_rejected", link: "/requests/4" }));
    expect(r.body.active_requests.map((x: { id: number }) => x.id)).not.toContain(4);
    await api.reset();
  });
});

describe("team (SPEC §3: manager sees own team only)", () => {
  it("manager → someone else's employee is 403 (the demo check)", async () => {
    const r = await api.get("erlan", "/employees/4");
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("forbidden");
  });

  it("team members get a short profile without phone or 1С id", async () => {
    const r = await api.get("erlan", "/employees/1");
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("phone");
    expect(r.body).not.toHaveProperty("external_id_1c");
    expect(r.body.enrollments.length).toBeGreaterThan(0);
  });

  it("team lists direct reports for a manager, everyone for HR, nothing for employees", async () => {
    expect((await api.get("erlan", "/team")).body.map((m: { id: number }) => m.id).sort()).toEqual([1, 2]);
    expect((await api.get("dinara", "/team")).body).toHaveLength(6);
    expect((await api.get("aigerim", "/team")).status).toBe(403);
    expect((await api.get("aigerim", "/employees/2")).status).toBe(403);
    expect((await api.get("aigerim", "/employees/999")).status).toBe(404);
  });

  it("vacation calendar is scoped and range-filtered", async () => {
    const erlan = (await api.get("erlan", "/team/calendar")).body.map((e: { employee: { id: number } }) => e.employee.id);
    expect(new Set(erlan)).toEqual(new Set([2, 3])); // Daulet's pending + his own approved
    // Range is inclusive: Daulet's +24..+30 touches day 30, Asel's is +35..+48.
    const at30 = (await api.get("dinara", `/team/calendar?from=${day(30)}&to=${day(60)}`)).body;
    expect(at30.map((e: { employee: { id: number } }) => e.employee.id)).toEqual([2, 4]);
    const from31 = (await api.get("dinara", `/team/calendar?from=${day(31)}&to=${day(60)}`)).body;
    expect(from31.map((e: { employee: { id: number } }) => e.employee.id)).toEqual([4]);
    expect((await api.get("dinara", "/team/calendar?from=yesterday")).status).toBe(422);
    expect((await api.get("aigerim", "/team/calendar")).status).toBe(403);
  });
});

describe("notifications", () => {
  it("read one, read all, and can't touch someone else's", async () => {
    const list = (await api.get("daulet", "/notifications")).body;
    expect(list[0].created_at >= list[list.length - 1].created_at).toBe(true);
    expect((await api.post("aigerim", `/notifications/${list[0].id}/read`)).status).toBe(403);
    expect((await api.post("daulet", `/notifications/${list[0].id}/read`)).status).toBe(204);
    expect((await api.post("daulet", "/notifications/read-all")).status).toBe(204);
    expect((await api.get("daulet", "/dashboard")).body.unread_notifications).toBe(0);
    expect((await api.post("daulet", "/notifications/99999/read")).status).toBe(404);
  });
});
