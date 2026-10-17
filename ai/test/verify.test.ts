import { describe, expect, it } from "vitest";
import { loadKbDir } from "../src/kb.js";
import { config } from "../src/config.js";
import { verifyCitations } from "../src/verify.js";
import { normalizeForMatch } from "../src/text.js";

const kb = loadKbDir(config.kbDir);
const profileText = "ФИО: Айгерим Садыкова\nОстаток ежегодного отпуска: 18 дн.";
const base = { kb, profileText, question: "Сколько дней отпуска положено?" };

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
