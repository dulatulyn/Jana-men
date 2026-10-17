import { describe, expect, it } from "vitest";
import { Assistant } from "../src/assistant.js";
import { backend, NOW } from "./helpers.js";

const a = new Assistant({ backend: backend(), now: NOW });
const ask = (q: string, user = "aigerim", locale: "ru" | "kk" = "ru") => a.ask(`Bearer mock.${user}`, { question: q, locale });

describe("fallback mode (no API key)", () => {
  it("answers from KB verbatim with source", async () => {
    const r = await ask("Сколько дней отпуска положено?");
    expect(r).toMatchObject({ status: "answered", mode: "fallback", can_escalate: false });
    expect(r.sources[0].slug).toBe("vacation-annual");
    expect(r.answer).toContain("24 календарных дня");
    expect(typeof r.log_id).toBe("number");
  });

  it("no_answer for out-of-KB question", async () => {
    const r = await ask("Как получить льготную ипотеку через компанию?");
    expect(r).toMatchObject({ status: "no_answer", sources: [], action: null, can_escalate: true });
  });

  it("refuses other people's data", async () => {
    const r = await ask("Какая зарплата у Ерлана?");
    expect(r).toMatchObject({ status: "refused", sources: [], can_escalate: true });
  });

  it("answers own balance from profile", async () => {
    const r = await ask("Сколько у меня осталось дней отпуска?", "erlan");
    expect(r.sources).toEqual([{ slug: "profile", title: "Мой профиль (1С:ЗУП)" }]);
    expect(r.answer).toContain("12");
  });

  it("prefills a vacation request", async () => {
    const r = await ask("Хочу в отпуск с 10 по 20 ноября");
    expect(r.action?.request).toEqual({ type: "vacation", payload: { start_date: "2026-11-10", end_date: "2026-11-20", days: 11, comment: "" } });
    expect(r.sources.map((s) => s.slug)).toEqual(["vacation-annual", "profile"]);
  });

  it("kk locale", async () => {
    const r = await ask("Жыл сайынғы демалыс неше күн?", "aigerim", "kk");
    expect(r.status).toBe("answered");
    expect(r.answer).toMatch(/^Білім базасынан/);
  });

  it("logs every question in the mock backend", async () => {
    const b = backend();
    const as = new Assistant({ backend: b, now: NOW });
    await as.ask("Bearer mock.daulet", { question: "Какая погода?", locale: "ru" });
    expect(b.logs).toHaveLength(1);
    expect(b.logs[0]).toMatchObject({ status: "no_answer", login: "daulet" });
  });
});
