import { createTestApi, day, type TestApi } from "./helpers";

let api: TestApi;
beforeAll(async () => {
  api = await createTestApi();
});
afterAll(() => api.close());
beforeEach(() => api.reset());

type Member = { id: number; full_name: string; pending_requests: number; on_vacation: unknown; next_vacation: unknown; department_id: number };
const byId = (list: Member[], id: number) => list.find((m) => m.id === id)!;

describe("GET /team additions", () => {
  it("manager: pending decisions, current and next vacation per member", async () => {
    const team: Member[] = (await api.get("erlan", "/team")).body;
    expect(team.map((m) => m.full_name)).toEqual(["Айгерим Садыкова", "Даулет Ахметов"]);
    expect(byId(team, 2)).toMatchObject({
      department_id: 1,
      pending_requests: 1,
      on_vacation: { start_date: day(-2), end_date: day(2) },
      next_vacation: { start_date: day(24), end_date: day(30), status: "submitted" },
    });
    expect(byId(team, 1)).toMatchObject({ pending_requests: 0, on_vacation: null, next_vacation: null });
  });

  it("HR: pending counts what waits for HR, including stage 1 that fell to HR", async () => {
    const team: Member[] = (await api.get("dinara", "/team")).body;
    expect(byId(team, 2).pending_requests).toBe(1);
    expect(byId(team, 4).pending_requests).toBe(1);
    expect(byId(team, 3)).toMatchObject({ pending_requests: 0, next_vacation: { start_date: day(9), end_date: day(15), status: "approved" } });
  });

  it("a decision drops the counter", async () => {
    await api.post("erlan", "/requests/4/approve", {});
    expect(byId((await api.get("erlan", "/team")).body, 2).pending_requests).toBe(0);
    expect(byId((await api.get("dinara", "/team")).body, 2).pending_requests).toBe(2);
  });
});

describe("GET /employees/:id requests", () => {
  it("lists the employee's requests newest first in the /requests list shape", async () => {
    const r = await api.get("erlan", "/employees/2");
    expect(r.status).toBe(200);
    expect(r.body.requests.map((x: { id: number }) => x.id)).toEqual([4, 5, 10, 9]);
    expect(Object.keys(r.body.requests[0]).sort()).toEqual(["created_at", "employee", "id", "status", "summary", "type"]);
    expect(r.body).toMatchObject({ pending_requests: 1, on_vacation: { start_date: day(-2) } });
    expect((await api.get("aigerim", "/employees/1")).body.requests.map((x: { id: number }) => x.id)).toEqual([3, 1, 2]);
  });

  it("keeps the data scope: other department 403, colleague 403", async () => {
    expect((await api.get("erlan", "/employees/4")).status).toBe(403);
    expect((await api.get("daulet", "/employees/1")).status).toBe(403);
    expect((await api.get("dinara", "/employees/4")).body.requests.map((x: { id: number }) => x.id)).toEqual([6, 7]);
  });

  it("returns at most 20 requests", async () => {
    for (let i = 0; i < 22; i++) await api.post("aigerim", "/requests", { type: "advance", payload: { amount: 1000 + i, reason: "Тест" } });
    const list = (await api.get("erlan", "/employees/1")).body.requests;
    expect(list).toHaveLength(20);
    expect(list[0].summary).toBe("1 021 ₸");
  });
});

describe("GET /team/calendar ranges and departments", () => {
  const ids = (body: { employee: { id: number } }[]) => body.map((e) => e.employee.id);

  it("accepts up to 400 days, rejects more", async () => {
    expect((await api.get("erlan", `/team/calendar?from=${day(0)}&to=${day(399)}`)).status).toBe(200);
    const big = await api.get("erlan", `/team/calendar?from=${day(0)}&to=${day(400)}`);
    expect(big.status).toBe(422);
    expect(big.body.error.code).toBe("range_too_large");
    const year = await api.get("dinara", `/team/calendar?from=${day(-200)}&to=${day(160)}`);
    expect(new Set(ids(year.body))).toEqual(new Set([1, 2, 3, 4]));
  });

  it("a lone from or to gets a 121-day window", async () => {
    expect(ids((await api.get("dinara", `/team/calendar?from=${day(20)}`)).body)).toEqual([2, 4]);
    expect(ids((await api.get("dinara", `/team/calendar?to=${day(-100)}`)).body)).toEqual([1]);
  });

  it("HR filters by department; managers only their own; unknown is 404", async () => {
    expect(ids((await api.get("dinara", "/team/calendar?department_id=2")).body)).toEqual([4]);
    expect((await api.get("dinara", "/team/calendar?department_id=99")).status).toBe(404);
    expect((await api.get("dinara", "/team/calendar?department_id=abc")).status).toBe(422);
    expect(new Set(ids((await api.get("erlan", "/team/calendar?department_id=1")).body))).toEqual(new Set([2, 3]));
    const other = await api.get("erlan", "/team/calendar?department_id=2");
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe("forbidden");
  });
});

describe("GET /team/academy and assigning", () => {
  type Row = { course: { id: number }; assigned: number; completed: number; in_progress: number; not_started: number; overdue: number; members: object[]; unassigned: { id: number }[] };
  const course = (rows: Row[], id: number) => rows.find((r) => r.course.id === id)!;

  it("per-course progress of the manager's team", async () => {
    const rows: Row[] = (await api.get("erlan", "/team/academy")).body;
    expect(rows.map((r) => r.course.id)).toEqual([1, 2, 3]);
    expect(course(rows, 1)).toMatchObject({ assigned: 2, completed: 2, in_progress: 0, overdue: 0 });
    expect(course(rows, 2)).toMatchObject({ assigned: 2, completed: 0, in_progress: 1, not_started: 1, overdue: 0 });
    expect(course(rows, 3)).toMatchObject({
      course: { id: 3, title: "Клиентский сервис на последней миле", cover: "service", duration_min: 15 },
      assigned: 1,
      in_progress: 1,
      overdue: 1,
      members: [{ employee: { id: 2, full_name: "Даулет Ахметов" }, status: "in_progress", progress: 25, due_date: day(-2), overdue: true }],
      unassigned: [{ id: 1, full_name: "Айгерим Садыкова" }],
    });
  });

  it("HR sees everyone; employees get 403", async () => {
    const rows: Row[] = (await api.get("dinara", "/team/academy")).body;
    expect(course(rows, 1)).toMatchObject({ assigned: 3, completed: 3 });
    expect((await api.get("aigerim", "/team/academy")).status).toBe(403);
  });

  it("a manager assigns a course to a direct report, not to another department", async () => {
    const r = await api.post("erlan", "/enrollments", { employee_id: 1, course_id: 3, due_date: day(14) });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ employee_id: 1, course_id: 3, assigned_by: 3, status: "assigned", due_date: day(14) });
    expect((await api.get("aigerim", "/notifications")).body[0]).toMatchObject({ type: "course_assigned", link: "/academy/3" });
    expect(course((await api.get("erlan", "/team/academy")).body, 3)).toMatchObject({ assigned: 2, not_started: 1, unassigned: [] });
    expect((await api.post("erlan", "/enrollments", { employee_id: 4, course_id: 3, due_date: day(14) })).status).toBe(403);
  });
});
