import { normalizeForMatch, trimQuote } from "./text.js";
import { PROFILE_SOURCE, type Citation, type KbArticle, type Source } from "./types.js";

export const MIN_QUOTE_LEN = 12;

export interface VerifyInput {
  answer: string;
  citations: Citation[];
  kb: KbArticle[];
  profileText: string;
  question: string;
  extraFacts?: string[];
}

export interface VerifyResult {
  ok: boolean;
  sources: Source[];
  verified: Citation[];
  rejected: Array<Citation & { why: string }>;
  unsupportedNumbers: string[];
}

function numbersIn(s: string): string[] {
  const n = normalizeForMatch(s);
  return n.match(/\d+/g) ?? [];
}

export function verifyCitations(input: VerifyInput): VerifyResult {
  const bySlug = new Map(input.kb.map((a) => [a.slug, a]));
  const verified: Citation[] = [];
  const rejected: Array<Citation & { why: string }> = [];
  const sources: Source[] = [];
  const supportText: string[] = [input.question, ...(input.extraFacts ?? [])];

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
    verified.push(c);
    if (!sources.some((s) => s.slug === art.slug)) sources.push({ slug: art.slug, title: art.title });
    supportText.push(c.quote);
  }

  const supportNums = new Set(supportText.flatMap(numbersIn));
  const unsupportedNumbers = verified.length ? numbersIn(input.answer).filter((n) => !supportNums.has(n)) : [];

  return {
    ok: verified.length > 0 && unsupportedNumbers.length === 0,
    sources,
    verified,
    rejected,
    unsupportedNumbers,
  };
}
