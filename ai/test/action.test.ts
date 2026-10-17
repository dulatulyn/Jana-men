import { describe, expect, it } from "vitest";
import { buildAction, daysInclusive, detectIntent, extractAmount, extractDateRange } from "../src/action.js";

const now = new Date("2026-10-16T09:00:00Z");

describe("dates", () => {
  it("counts calendar days inclusive", () => {
    expect(daysInclusive("2026-11-10", "2026-11-20")).toBe(11);
    expect(daysInclusive("2026-12-31", "2027-01-01")).toBe(2);
    expect(daysInclusive("2026-11-20", "2026-11-10")).toBeNull();
    expect(daysInclusive("2026-02-30", "2026-03-01")).toBeNull();
  });

  it.each([
    ["Хочу в отпуск с 10 по 20 ноября", "2026-11-10", "2026-11-20"],
    ["отпуск с 28 декабря по 5 января", "2026-12-28", "2027-01-05"],
    ["в отпуск 10.11 - 20.11", "2026-11-10", "2026-11-20"],
    ["отпуск 2026-11-10 2026-11-24", "2026-11-10", "2026-11-24"],
    ["хочу в отпуск с 1 марта по 14 марта", "2027-03-01", "2027-03-14"],
    ["10-нан 20 қарашаға дейін демалыс алғым келеді", "2026-11-10", "2026-11-20"],
  ])("parses %s", (q, s, e) => expect(extractDateRange(q, now)).toEqual({ start: s, end: e }));
});

describe("intent + action", () => {
  it("vacation within balance", () => {
    const i = detectIntent("Хочу в отпуск с 10 по 20 ноября", now)!;
    const b = buildAction(i, 18, "ru", now)!;
    expect(b.action).toEqual({
      type: "prefill_request",
      request: { type: "vacation", payload: { start_date: "2026-11-10", end_date: "2026-11-20", days: 11, comment: "" } },
    });
    expect(b.exceedsBalance).toBe(false);
  });

  it("vacation exceeding balance still returns the action but warns", () => {
    const b = buildAction({ type: "vacation", start_date: "2026-12-01", end_date: "2026-12-20" }, 12, "ru", now)!;
    expect(b.exceedsBalance).toBe(true);
    expect(b.action.request.type).toBe("vacation");
    expect(b.summary).toMatch(/больше вашего остатка \(12 дн\.\)/);
  });

  it("vacation without dates gives no action", () => {
    expect(buildAction({ type: "vacation" }, 18, "ru", now)).toBeNull();
  });

  it("advance", () => {
    const i = detectIntent("Хочу аванс 50 000 тенге на ремонт", now)!;
    expect(i.type).toBe("advance");
    const b = buildAction(i, 18, "ru", now)!;
    expect(b.action).toEqual({ type: "prefill_request", request: { type: "advance", payload: { amount: 50000, reason: "ремонт" } } });
  });

  it("amounts", () => {
    expect(extractAmount("аванс 100к")).toBe(100000);
    expect(extractAmount("аванс 70 000 тг")).toBe(70000);
    expect(extractAmount("аванс")).toBeNull();
  });

  it("does not treat policy questions as intents", () => {
    expect(detectIntent("Сколько дней отпуска положено?", now)).toBeNull();
    expect(detectIntent("Когда выплачивают аванс?", now)).toBeNull();
  });
});
