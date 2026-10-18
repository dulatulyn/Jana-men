import { describe, expect, it } from "vitest";
import { loadKbDir } from "../src/kb.js";
import { config } from "../src/config.js";
import { verifyCitations } from "../src/verify.js";
import { normalizeForMatch } from "../src/text.js";

const kb = loadKbDir(config.kbDir);
const profileText = "ФИО: Айгерим Садыкова\nОстаток ежегодного отпуска: 18 дн.";
const base = { kb, profileText };

describe("verifyCitations", () => {
  it("accepts a verbatim quote (modulo case, quotes, whitespace)", () => {
    const r = verifyCitations({
      ...base,
      answer: "Положено 24 календарных дня.",
      citations: [{ slug: "vacation-annual", quote: "предоставляется ЕЖЕГОДНЫЙ оплачиваемый   трудовой отпуск продолжительностью 24 календарных дня" }],
    });
    expect(r.ok).toBe(true);
    expect(r.sources).toEqual([{ slug: "vacation-annual", title: "Ежегодный оплачиваемый отпуск" }]);
  });

  it("handles «» vs \"\" quotes and thousands separators", () => {
    const r = verifyCitations({
      ...base,
      answer: "Суточные — 6000 тенге.",
      citations: [{ slug: "business-trip", quote: 'суточные по Казахстану - 6000 тенге в день' }],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a paraphrased / invented quote", () => {
    const r = verifyCitations({
      ...base,
      answer: "Положено 28 дней.",
      citations: [{ slug: "vacation-annual", quote: "отпуск составляет 28 календарных дней" }],
    });
    expect(r.ok).toBe(false);
    expect(r.rejected[0].why).toMatch(/verbatim/);
  });

  it("rejects unknown slugs and too-short quotes", () => {
    const r = verifyCitations({
      ...base,
      answer: "x",
      citations: [
        { slug: "made-up-article", quote: "Каждому работнику ТОО «Jana Post» предоставляется" },
        { slug: "vacation-annual", quote: "отпуск" },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.rejected.map((x) => x.why)).toEqual(["unknown slug", "quote too short"]);
  });

  it("rejects an answer containing numbers not present in any verified source", () => {
    const r = verifyCitations({
      ...base,
      answer: "Положено 24 дня, а за стаж добавляют ещё 5 дней.",
      citations: [{ slug: "vacation-annual", quote: "ежегодный оплачиваемый трудовой отпуск продолжительностью 24 календарных дня" }],
    });
    expect(r.ok).toBe(false);
    expect(r.unsupportedNumbers).toEqual(["5"]);
  });

  it("number words in a verified quote support digits in the answer", () => {
    const cases: Array<[string, string, string]> = [
      ["vacation-unpaid", "отпуск без сохранения заработной платы продолжительностью до пяти календарных дней предоставляется при регистрации брака", "При регистрации брака — до 5 календарных дней."],
      ["onboarding", "Испытательный срок устанавливается трудовым договором и не может превышать трёх месяцев.", "Сынақ мерзімі 3 айдан аспайды."],
      ["advance-salary", "Подать заявку на дополнительный аванс можно не чаще одного раза в месяц.", "Қосымша авансқа айына 1 рет қана өтінім беруге болады."],
      ["vacation-annual", "Оплачиваемый отпуск за первый рабочий год можно взять по истечении шести месяцев работы в компании.", "Первый отпуск можно взять через 6 месяцев работы."],
      ["vacation-annual", "Отпускные выплачиваются не позднее чем за три календарных дня до начала отпуска.", "Отпускные платят не позднее чем за 3 календарных дня до начала."],
    ];
    for (const [slug, quote, answer] of cases) expect(verifyCitations({ ...base, answer, citations: [{ slug, quote }] })).toMatchObject({ ok: true, unsupportedNumbers: [] });
  });

  it("still rejects invented and computed numbers", () => {
    const perDiem = "Политика компании: суточные по Казахстану — 6 000 тенге в день, за рубежом — 25 000 тенге в день.";
    const unpaid = "отпуск без сохранения заработной платы продолжительностью до пяти календарных дней предоставляется при регистрации брака";
    expect(verifyCitations({ ...base, answer: "До 7 календарных дней.", citations: [{ slug: "vacation-unpaid", quote: unpaid }] }).unsupportedNumbers).toEqual(["7"]);
    expect(verifyCitations({ ...base, answer: "Суточные по Казахстану — 7 000 тенге в день.", citations: [{ slug: "business-trip", quote: perDiem }] }).ok).toBe(false);
    expect(verifyCitations({ ...base, answer: "Нет: за 3 дня — 18 000 тенге.", citations: [{ slug: "business-trip", quote: perDiem }] }).unsupportedNumbers).toEqual(["3", "18000"]);
  });

  it("a number that only the user typed is not support", () => {
    const perDiem = "Политика компании: суточные по Казахстану — 6 000 тенге в день, за рубежом — 25 000 тенге в день.";
    const r = verifyCitations({ ...base, answer: "Да, суточные по Казахстану — 15 000 тенге в день.", citations: [{ slug: "business-trip", quote: perDiem }] });
    expect(r).toMatchObject({ ok: false, unsupportedNumbers: ["15000"] });
    const facts = verifyCitations({ ...base, answer: "С 10 по 20 ноября — 11 дней.", citations: [{ slug: "profile", quote: "18 дн." }], extraFacts: ["2026-11-10", "10.11.2026", "10", "11", "20", "11"] });
    expect(facts.ok).toBe(true);
  });

  it("verifies profile citations against the user's own profile only", () => {
    const ok = verifyCitations({ ...base, answer: "У вас 18 дней.", citations: [{ slug: "profile", quote: "18 дн." }] });
    expect(ok.ok).toBe(true);
    expect(ok.sources).toEqual([{ slug: "profile", title: "Мой профиль (1С:ЗУП)" }]);
    const bad = verifyCitations({ ...base, answer: "У вас 30 дней.", citations: [{ slug: "profile", quote: "30 дн." }] });
    expect(bad.ok).toBe(false);
  });

  it("normalizes ё/е and dashes", () => {
    expect(normalizeForMatch("Отпускные — «ВЫПЛАЧИВАЮТСЯ»  ещё")).toBe(normalizeForMatch('отпускные - выплачиваются еще'));
  });
});
