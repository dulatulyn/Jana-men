import { createTestApi, day, type TestApi } from "./helpers";

let api: TestApi;
beforeAll(async () => {
  api = await createTestApi();
});
afterAll(() => api.close());
beforeEach(() => api.reset());

describe("academy", () => {
  it("course detail never leaks the answer key", async () => {
    const r = await api.get("aigerim", "/courses/2");
    expect(r.body.lessons.map((l: { order: number }) => l.order)).toEqual([1, 2, 3]);
    expect(r.body.quiz).toHaveLength(4);
    expect(JSON.stringify(r.body.quiz)).not.toMatch(/correct/);
    expect(r.body.enrollment).toMatchObject({ id: 2, status: "assigned", due_date: day(10) });
  });

  it("lessons → quiz → completed, with progress and notifications (demo step 5)", async () => {
    const course = (await api.get("aigerim", "/courses/2")).body;
    const enr = course.enrollment.id;

    const early = await api.post("aigerim", `/enrollments/${enr}/quiz`, { answers: [1, 1, 1, 0] });
    expect(early.status).toBe(422);
    expect(early.body.error.message).toBe("Сначала изучите все уроки курса");

    const first = await api.post("aigerim", `/enrollments/${enr}/lessons/${course.lessons[0].id}/complete`);
    expect(first.body).toMatchObject({ status: "in_progress", progress_pct: 25, completed_lesson_ids: [5] });
    // Completing the same lesson twice is a no-op.
    expect((await api.post("aigerim", `/enrollments/${enr}/lessons/${course.lessons[0].id}/complete`)).body.progress_pct).toBe(25);
    for (const l of course.lessons.slice(1)) await api.post("aigerim", `/enrollments/${enr}/lessons/${l.id}/complete`);

    expect((await api.post("aigerim", `/enrollments/${enr}/quiz`, { answers: [1] })).status).toBe(422);

    const failed = await api.post("aigerim", `/enrollments/${enr}/quiz`, { answers: [0, 0, 0, 1] });
    expect(failed.body).toEqual({ score: 0, passed: false, correct: [1, 1, 1, 0] });
    expect((await api.get("aigerim", "/enrollments/mine")).body.find((e: { id: number }) => e.id === enr)).toMatchObject({ status: "in_progress", progress_pct: 75 });

    const passed = await api.post("aigerim", `/enrollments/${enr}/quiz`, { answers: [1, 1, 1, 0] });
    expect(passed.body).toMatchObject({ score: 100, passed: true });
    const done = (await api.get("aigerim", "/enrollments/mine")).body.find((e: { id: number }) => e.id === enr);
    expect(done).toMatchObject({ status: "completed", progress_pct: 100, score: 100 });
    expect(done.completed_at).toBeTruthy();

    expect((await api.get("aigerim", "/notifications")).body[0]).toMatchObject({ type: "course_completed", title: "Курс пройден" });
    // Erlan assigned it, so he hears about it too.
    expect((await api.get("erlan", "/notifications")).body[0]).toMatchObject({ type: "course_completed", link: "/team/1" });

    // A worse retake doesn't lower the score.
    await api.post("aigerim", `/enrollments/${enr}/quiz`, { answers: [0, 0, 0, 1] });
    expect((await api.get("aigerim", "/courses/2")).body.enrollment.score).toBe(100);
  });

  it("can't work on someone else's enrollment", async () => {
    expect((await api.post("aigerim", "/enrollments/3/lessons/5/complete")).status).toBe(403);
    expect((await api.post("aigerim", "/enrollments/2/lessons/1/complete")).status).toBe(404); // lesson of another course
  });

  it("assigning: manager → own team only, HR → anyone, duplicates refused", async () => {
    expect((await api.post("erlan", "/enrollments", { employee_id: 4, course_id: 2, due_date: day(7) })).status).toBe(403);
    const ok = await api.post("erlan", "/enrollments", { employee_id: 1, course_id: 2, due_date: day(7) });
    expect(ok.status).toBe(422);
    expect(ok.body.error.code).toBe("already_assigned");

    const hr = await api.post("dinara", "/enrollments", { employee_id: 4, course_id: 2, due_date: day(7) });
    expect(hr.status).toBe(201);
    expect(hr.body).toMatchObject({ employee_id: 4, assigned_by: 5, status: "assigned", due_date: day(7) });
    const note = (await api.get("asel", "/notifications")).body[0];
    expect(note).toMatchObject({ type: "course_assigned", link: "/academy/2" });
    expect(note.body).toContain("Динара Касымова");

    expect((await api.post("dinara", "/enrollments", { employee_id: 4, course_id: 1, due_date: day(-1) })).status).toBe(422);
  });

  it("employees can enroll themselves from the catalog", async () => {
    const r = await api.post("asel", "/enrollments", { employee_id: 4, course_id: 2, due_date: null });
    expect(r.status).toBe(201);
    expect(r.body.assigned_by).toBeNull();
    // Self-enrolling again just returns the existing enrollment.
    const again = await api.post("asel", "/enrollments", { employee_id: 4, course_id: 2, due_date: null });
    expect(again.body.id).toBe(r.body.id);
  });
});
