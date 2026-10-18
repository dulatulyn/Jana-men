import { describe, expect, it } from "vitest";
import { buildAction, daysInclusive, detectIntent, extractAmount, extractDateRange, impossibleDate, localToday, notOwnRequest } from "../src/action.js";

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
    ["10-нан 20 қарашаға дейін демалысқа шыққым келеді", "2026-11-10", "2026-11-20"],
    ["28-31 декабря", "2026-12-28", "2026-12-31"],
    ["28 желтоқсаннан 5 қаңтарға дейін демалыс алғым келеді", "2026-12-28", "2027-01-05"],
    ["Хочу в отпуск с 28 по 5 января", "2026-12-28", "2027-01-05"],
    ["Хочу в отпуск с 10 по 20 ноября 2027", "2027-11-10", "2027-11-20"],
    ["Хочу в отпуск с 28 декабря по 5 января 2027", "2026-12-28", "2027-01-05"],
    ["Хочу в отпуск с 12 по 16 октября 2026", "2026-10-12", "2026-10-16"],
    ["Хочу в отпуск с 25 по 30 октября", "2026-10-25", "2026-10-30"],
    ["с 10-го по 20-е ноября", "2026-11-10", "2026-11-20"],
    ["отпуск 28.12.2026 - 05.01.2027", "2026-12-28", "2027-01-05"],
  ])("parses %s", (q, s, e) => expect(extractDateRange(q, now)).toEqual({ start: s, end: e }));

  it.each([
    "Хочу в отпуск с 28 декабря на 9 дней",
    "Хочу оформить отпуск с 12 декабря на 14 дней",
    "Хочу в отпуск с 21 декабря на две недели",
    "Хочу в отпуск 25 декабря",
    "Хочу в отпуск с 15 ноября",
    "Хочу в отпуск на 3 дня с 12 ноября",
    "Хочу в отпуск на 1 день 31 декабря",
    "25 желтоқсаннан бастап 10 күн демалыс алғым келеді",
    "Если я хочу в отпуск с 25 декабря, когда нужно подать заявку?",
    "Хочу в отпуск с 28.12 по 5 января",
    "Желтоқсанның 28-інен бастап 9 күнге демалыс алғым келеді",
    "с 20 ноября по 10 ноября",
    "Хочу в отпуск с 31 ноября по 10 декабря",
  ])("gives no range for a start-only or invalid phrasing: %s", (q) => expect(extractDateRange(q, now)).toBeNull());

  it("finds dates that do not exist", () => {
    expect(impossibleDate("Хочу в отпуск с 31 ноября по 10 декабря")).toBe("31 ноября");
    expect(impossibleDate("с 30 февраля")).toBe("30 февраля");
    expect(impossibleDate("отпуск 31.04 - 05.05")).toBe("31.04");
    expect(impossibleDate("с 30 по 31 декабря")).toBeNull();
    expect(impossibleDate("29 февраля")).toBeNull();
    expect(impossibleDate("в 31 маршруте")).toBeNull();
  });

  it("uses the local date (Asia/Almaty by default) for today", () => {
    const lateUtc = new Date("2026-10-17T22:30:00Z");
    expect(localToday(lateUtc)).toBe("2026-10-18");
    expect(localToday(lateUtc, "UTC")).toBe("2026-10-17");
    expect(localToday(lateUtc, "Not/AZone")).toBe("2026-10-18");
    expect(localToday(new Date("2026-10-17T18:59:00Z"))).toBe("2026-10-17");
    const past = buildAction({ type: "vacation", start_date: "2026-10-17", end_date: "2026-10-19" }, 18, "ru", lateUtc)!;
    expect(past.summary).toMatch(/дата начала уже прошла/);
    expect(extractDateRange("с 18 по 20 октября", lateUtc)).toEqual({ start: "2026-10-18", end: "2026-10-20" });
  });
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

  it.each([
    "Как подать авансовый отчёт после командировки?",
    "Іссапардан кейін авансалық есепті қашан тапсыру керек?",
    "плановый аванс приходит до 25 числа, да?",
    "Можно ли отменить уже отправленную заявку на дополнительный аванс?",
    "Сколько раз в месяц можно подавать заявку на доп аванс?",
    "Как оформить аванс?",
    "Аванс алу үшін не керек?",
    "как напарнику оформить отпуск с 1 по 10 ноября?",
    "как отклонить заявку сотрудника на отпуск с 1 по 10 ноября?",
    "моему сотруднику нужен аванс 50000, как ему оформить?",
  ])("fallback: no draft for an information question or someone else's request: %s", (q) => expect(detectIntent(q, now)).toBeNull());

  it("someone else's request or a manager action is not the user's own request", () => {
    for (const q of [
      "как отклонить заявку сотрудника на отпуск с 1 по 10 ноября?",
      "в какой срок руководитель обязан согласовать заявку на аванс?",
      "как напарнику оформить отпуск с 1 по 10 ноября?",
      "моему сотруднику нужен аванс 50000, как ему оформить?",
      "мой сотрудник просит выходные с 1 по 10 ноября — как мне отклонить его заявку?",
      "Қызметкердің демалыс өтінімін қалай келісемін?",
    ])
      expect(notOwnRequest(q)).toBe(true);
    for (const q of [
      "Хочу в отпуск с 10 по 20 ноября",
      "Хочу отдохнуть с 10 по 20 ноября, оформи заявку",
      "Нужна предоплата зарплаты 40 000 на ремонт, оформи",
      "Я сотрудник склада, хочу в отпуск с 1 по 10 декабря",
      "Хочу в отпуск с 10 по 20 ноября, руководитель уже одобрил",
      "Хочу провести отпуск с 10 по 20 ноября в горах",
      "10-нан 20 қарашаға дейін демалыс алғым келеді",
    ])
      expect(notOwnRequest(q)).toBe(false);
  });

  it("advance amount skips the salary, the reason ignores the amount", () => {
    expect(extractAmount("Хочу аванс: мой оклад 300 000, нужно 100 000 на лечение")).toBe(100000);
    expect(extractAmount("оклад у меня 300 000, хочу 100 000")).toBe(100000);
    expect(extractAmount("Хочу аванс 100 000, мой оклад 150 000")).toBe(100000);
    expect(detectIntent("Хочу аванс на сумму 50000", now)).toEqual({ type: "advance", amount: 50000, reason: "" });
    expect(detectIntent("Нужен аванс 30к, на лечение, срочно", now)).toEqual({ type: "advance", amount: 30000, reason: "лечение" });
  });

  it("advance draft always states the 50% rule", () => {
    const ru = buildAction({ type: "advance", amount: 100000, reason: "" }, 18, "ru", now)!;
    expect(ru.summary).toMatch(/не более 50% оклада за месяц/);
    expect(ru.summary).toMatch(/не чаще одного раза в месяц/);
    expect(ru.facts).toEqual(["100000", "50"]);
    const kk = buildAction({ type: "advance", amount: null, reason: "" }, 18, "kk", now)!;
    expect(kk.summary).toMatch(/50%/);
    expect(kk.facts).toEqual(["50"]);
  });
});

describe("14-day notice rule", () => {
  const today = new Date("2026-10-18T06:00:00Z");

  it("warns when the start is less than 14 days away", () => {
    const b = buildAction({ type: "vacation", start_date: "2026-10-25", end_date: "2026-10-30" }, 18, "ru", today)!;
    expect(b.summary).toMatch(/не позднее чем за 14 календарных дней до даты начала отпуска, а до начала осталось 7 дн\. Согласуйте даты с руководителем\./);
    expect(b.facts).toEqual(expect.arrayContaining(["14", "7"]));
    expect(b.action.request.payload).toMatchObject({ days: 6 });
    const kk = buildAction({ type: "vacation", start_date: "2026-10-25", end_date: "2026-10-30" }, 18, "kk", today)!;
    expect(kk.summary).toMatch(/кемінде 14 күнтізбелік күн бұрын/);
    const todayStart = buildAction({ type: "vacation", start_date: "2026-10-18", end_date: "2026-10-20" }, 18, "ru", today)!;
    expect(todayStart.summary).toMatch(/отпуск начинается сегодня\./);
    expect(todayStart.summary).not.toMatch(/уже прошла/);
  });

  it("does not warn when the start is 14 or more days away", () => {
    for (const start of ["2026-11-01", "2026-11-10"]) {
      const b = buildAction({ type: "vacation", start_date: start, end_date: "2026-11-20" }, 18, "ru", today)!;
      expect(b.summary).not.toMatch(/14 календарных дней/);
    }
  });
});
