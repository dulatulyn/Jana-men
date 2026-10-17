import * as fs from "fs";
import * as path from "path";
import { HRIS_ADAPTER, type HrisAdapter } from "../src/integrations/adapters";
import { createTestApi, type TestApi } from "./helpers";

let api: TestApi;
beforeAll(async () => {
  api = await createTestApi();
});
afterAll(() => api.close());
beforeEach(() => api.reset());

describe("knowledge base", () => {
  it("serves ai/kb articles with body_md byte-identical to the files (the AI verifies quotes)", async () => {
    const kb = (await api.get("aigerim", "/kb")).body as { slug: string; body_md: string }[];
    const dir = path.resolve(__dirname, "../../ai/kb");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    expect(kb).toHaveLength(files.length);
    for (const f of files) {
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      const [, front, body] = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)!;
      const slug = front.match(/^slug:\s*(.+)$/m)![1].trim();
      expect(kb.find((a) => a.slug === slug)?.body_md).toBe(body.trim());
    }
  });

  it("only HR edits; new articles need a title and body; slugs are validated", async () => {
    expect((await api.put("aigerim", "/kb/vacation-annual", { title: "x" })).status).toBe(403);
    const upd = await api.put("dinara", "/kb/vacation-annual", { title: "Ежегодный отпуск (обновлено)" });
    expect(upd.body.title).toBe("Ежегодный отпуск (обновлено)");
    expect((await api.put("dinara", "/kb/new-one", { title: "Новая" })).status).toBe(422);
    expect((await api.put("dinara", "/kb/Bad Slug", { title: "x", body_md: "y" })).status).toBe(422);
    const created = await api.post("dinara", "/kb/fuel-compensation", { title: "Компенсация топлива", body_md: "# Топливо", category: "pay" });
    expect(created.status).toBe(200);
    expect((await api.get("aigerim", "/kb")).body).toHaveLength(11);
  });
});

describe("assistant logs & escalation", () => {
  it("user_id comes from the JWT, not the body", async () => {
    const r = await api.post("aigerim", "/assistant/logs", {
      question: "Сколько дней отпуска?", answer: "28", status: "answered",
      sources: [{ slug: "vacation-annual", title: "Отпуск" }], user_id: 5,
    });
    expect(r.status).toBe(201);
    const row = await api.prisma.assistantLog.findUniqueOrThrow({ where: { id: r.body.log_id } });
    expect(row.user_id).toBe(1);
  });

  it("validates the log body", async () => {
    expect((await api.post("aigerim", "/assistant/logs", { question: "", status: "answered" })).status).toBe(422);
    expect((await api.post("aigerim", "/assistant/logs", { question: "q", status: "maybe" })).status).toBe(422);
  });

  it("escalation notifies HR once and can't be done on someone else's log", async () => {
    const { log_id } = (await api.post("aigerim", "/assistant/logs", { question: "Компенсация за спортзал?", status: "no_answer" })).body;
    expect((await api.post("daulet", "/assistant/escalate", { log_id })).status).toBe(404);

    expect((await api.post("aigerim", "/assistant/escalate", { log_id })).body).toEqual({ ok: true });
    expect((await api.post("aigerim", "/assistant/escalate", { log_id })).body).toEqual({ ok: true, already_escalated: true });

    const hr = (await api.get("dinara", "/notifications")).body.filter((n: { type: string }) => n.type === "assistant_escalated");
    expect(hr).toHaveLength(1);
    expect(hr[0].body).toBe("Айгерим Садыкова: «Компенсация за спортзал?»");
    expect((await api.post("aigerim", "/assistant/escalate", {})).status).toBe(422);
  });

  it("HR can't escalate to HR: 422, nothing flagged or sent", async () => {
    const { log_id } = (await api.post("dinara", "/assistant/logs", { question: "Есть ли парковка?", status: "no_answer" })).body;
    const r = await api.post("dinara", "/assistant/escalate", { log_id });
    expect(r.status).toBe(422);
    expect(r.body.error).toEqual({
      code: "escalation_not_allowed",
      message: "HR-специалисту не нужно передавать вопрос в HR. Добавьте статью в базу знаний, чтобы ассистент начал отвечать.",
    });
    expect((await api.prisma.assistantLog.findUniqueOrThrow({ where: { id: log_id } })).escalated).toBe(false);
    const sent = (await api.get("dinara", "/notifications")).body.filter((n: { type: string }) => n.type === "assistant_escalated");
    expect(sent).toHaveLength(0);
  });

  it("HR sees unanswered questions grouped by frequency, and stats", async () => {
    await api.post("asel", "/assistant/logs", { question: "положена ли курьерам компенсация за бензин", status: "no_answer" });
    const un = (await api.get("dinara", "/assistant/unanswered")).body;
    expect(un[0]).toMatchObject({ question: "Положена ли курьерам компенсация за бензин?", count: 7 }); // 6 seeded + this one
    for (let i = 1; i < un.length; i++) expect(un[i - 1].count).toBeGreaterThanOrEqual(un[i].count);

    const stats = (await api.get("dinara", "/assistant/stats")).body;
    expect(stats).toEqual({ total: 129, answered: 97, no_answer: 20, refused: 12, escalated: 7 });
    expect((await api.get("erlan", "/assistant/stats")).status).toBe(403);
    expect((await api.get("aigerim", "/assistant/unanswered")).status).toBe(403);
  });
});

describe("1С sync", () => {
  it("HR-only; reports changes; journal uses the contract's system names", async () => {
    expect((await api.post("erlan", "/integrations/1c/sync")).status).toBe(403);
    const r = await api.post("dinara", "/integrations/1c/sync");
    expect(r.body).toMatchObject({ synced: 7, changed: 0 });
    const log = (await api.get("dinara", "/integrations/log")).body;
    expect(log[0]).toMatchObject({ system: "1c_zup", operation: "syncEmployees", status: "ok", details: "Синхронизировано 7 сотрудников, изменений нет" });
    expect(new Set(log.map((l: { system: string }) => l.system))).toEqual(new Set(["1c_zup", "documentolog"]));
  });
});

describe("when 1С is down", () => {
  let down: TestApi;
  beforeAll(async () => {
    const broken: HrisAdapter = {
      name: "broken",
      fetchEmployees: () => Promise.reject(new Error("ECONNREFUSED 1c.local:443")),
      postVacation: () => Promise.reject(new Error("ECONNREFUSED 1c.local:443")),
      postAdvance: () => Promise.reject(new Error("ECONNREFUSED 1c.local:443")),
    };
    down = await createTestApi((b) => b.overrideProvider(HRIS_ADAPTER).useValue(broken));
  });
  afterAll(() => down.close());

  it("the approval still stands; the failure is journaled and HR is told", async () => {
    await down.post("erlan", "/requests/4/approve", {});
    const r = await down.post("dinara", "/requests/4/approve", {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "approved", external_1c_id: null });
    expect(r.body.docflow_id).toMatch(/^DL-/); // Documentolog still worked
    expect((await down.get("daulet", "/profile")).body.vacation_balance_days).toBe(24); // nothing deducted

    const log = (await down.get("dinara", "/integrations/log")).body;
    expect(log).toContainEqual(expect.objectContaining({ system: "1c_zup", operation: "postVacation", status: "error" }));
    const notes = (await down.get("dinara", "/notifications")).body;
    expect(notes).toContainEqual(expect.objectContaining({ type: "integration_error", title: "Заявка №4: ошибка проведения" }));
  });

  it("sync reports 502 instead of crashing", async () => {
    const r = await down.post("dinara", "/integrations/1c/sync");
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe("integration_error");
  });
});
