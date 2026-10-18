import { chunkArticle } from "./kb.js";
import { normalizeForMatch, trimQuote } from "./text.js";
import { PROFILE_SOURCE, type Citation, type KbArticle, type Source } from "./types.js";

export const MIN_QUOTE_LEN = 12;

export interface VerifyInput {
  answer: string;
  citations: Citation[];
  kb: KbArticle[];
  profileText: string;
  extraFacts?: string[];
}

export type VerifiedCitation = Citation & { heading?: string; section?: string };

export interface VerifyResult {
  ok: boolean;
  sources: Source[];
  verified: VerifiedCitation[];
  rejected: Array<Citation & { why: string }>;
  unsupportedNumbers: string[];
}

function numbersIn(s: string): string[] {
  const n = normalizeForMatch(s);
  return n.match(/\d+/g) ?? [];
}

const NUMBER_WORDS: Array<[RegExp, string]> = (
  [
    ["один|одна|одно|одного|одной|одному|одним|одну", "1"],
    ["два|две|двух|двум|двумя", "2"],
    ["три|трех|трем|тремя", "3"],
    ["четыре|четырех|четырем", "4"],
    ["пять|пяти|пятью", "5"],
    ["шесть|шести|шестью", "6"],
    ["семь|семи", "7"],
    ["восемь|восьми", "8"],
    ["девять|девяти", "9"],
    ["десять|десяти", "10"],
  ] as const
).map(([words, digit]) => [new RegExp(`(?<!\\p{L})(?:${words})(?!\\p{L})`, "u"), digit]);

function wordNumbersIn(s: string): string[] {
  const n = normalizeForMatch(s);
  return NUMBER_WORDS.filter(([re]) => re.test(n)).map(([, digit]) => digit);
}

export function verifyCitations(input: VerifyInput): VerifyResult {
  const bySlug = new Map(input.kb.map((a) => [a.slug, a]));
  const verified: VerifiedCitation[] = [];
  const rejected: Array<Citation & { why: string }> = [];
  const sources: Source[] = [];
  const supportText: string[] = [...(input.extraFacts ?? [])];

  for (const c of input.citations) {
    const quote = normalizeForMatch(trimQuote(c.quote ?? ""));
    if (c.slug === PROFILE_SOURCE.slug) {
      const lines = input.profileText.split("\n").map(normalizeForMatch);
      const values = lines.map((l) => l.slice(l.indexOf(":") + 1).trim());
      if (quote && (values.includes(quote) || (quote.length >= 4 && lines.some((l) => l.includes(quote))))) {
        verified.push(c);
        if (!sources.some((s) => s.slug === "profile")) sources.push(PROFILE_SOURCE);
        supportText.push(c.quote);
      } else rejected.push({ ...c, why: "quote not in profile" });
      continue;
    }
    const art = bySlug.get(c.slug);
    if (!art) {
      rejected.push({ ...c, why: "unknown slug" });
      continue;
    }
    if (quote.length < MIN_QUOTE_LEN) {
      rejected.push({ ...c, why: "quote too short" });
      continue;
    }
    const hay = normalizeForMatch(`${art.title}\n${art.body_md}`);
    if (!hay.includes(quote)) {
      rejected.push({ ...c, why: "quote not found verbatim" });
      continue;
    }
    const chunk = chunkArticle(art).find((ch) => normalizeForMatch(ch.text).includes(quote));
    verified.push(chunk ? { ...c, heading: chunk.heading, section: chunk.text } : c);
    if (!sources.some((s) => s.slug === art.slug)) sources.push({ slug: art.slug, title: art.title });
    supportText.push(c.quote);
  }

  const supportNums = new Set([...supportText.flatMap(numbersIn), ...verified.flatMap((c) => wordNumbersIn(c.quote))]);
  const unsupportedNumbers = verified.length ? numbersIn(input.answer).filter((n) => !supportNums.has(n)) : [];

  return {
    ok: verified.length > 0 && unsupportedNumbers.length === 0,
    sources,
    verified,
    rejected,
    unsupportedNumbers,
  };
}
