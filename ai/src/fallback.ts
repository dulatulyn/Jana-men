import { chunkArticle, type KbChunk } from "./kb.js";
import { stem, stemGroups, stems } from "./text.js";
import type { KbArticle } from "./types.js";

export interface SearchHit {
  chunk: KbChunk;
  score: number;
  matched: string[];
  coverage: number;
}

const GENERIC = new Set(
  ["день", "дней", "дня", "компании", "работа", "сотрудник", "janamen", "заявка", "jana", "политика", "отпуск", "год"].map(stem),
);

export class KbIndex {
  private docs: Array<{ chunk: KbChunk; tf: Map<string, number>; len: number }> = [];
  private df = new Map<string, number>();
  private avgLen = 1;

  constructor(kb: KbArticle[]) {
    for (const a of kb) {
      for (const chunk of chunkArticle(a)) {
        const toks = [...stems(a.title), ...stems(a.title), ...stems(chunk.heading), ...stems(chunk.heading), ...stems(chunk.text)];
        const tf = new Map<string, number>();
        for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
        for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
        this.docs.push({ chunk, tf, len: toks.length });
      }
    }
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length);
  }

  private idf(t: string): number {
    const N = this.docs.length;
    const df = this.df.get(t) ?? 0;
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  }

  search(query: string, k = 3): SearchHit[] {
    const groups = stemGroups(query);
    const weights = groups.map((g) => Math.max(...g.map((t) => this.idf(t))));
    const totalW = weights.reduce((a, b) => a + b, 0) || 1;
    const k1 = 1.2;
    const b = 0.75;
    const hits: SearchHit[] = [];
    for (const d of this.docs) {
      let score = 0;
      let covered = 0;
      const matched: string[] = [];
      groups.forEach((g, i) => {
        let hit = false;
        for (const t of new Set(g)) {
          const f = d.tf.get(t);
          if (!f) continue;
          hit = true;
          score += (this.idf(t) * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / this.avgLen));
          matched.push(t);
        }
        if (hit) covered += weights[i];
      });
      if (score > 0) hits.push({ chunk: d.chunk, score, matched, coverage: covered / totalW });
    }
    return hits.sort((a, b2) => b2.score * b2.coverage - a.score * a.coverage).slice(0, k);
  }
}

export const STRONG_SCORE = 4.0;
export const MIN_COVERAGE = 0.5;

export function isStrong(hit: SearchHit | undefined): boolean {
  if (!hit) return false;
  if (!hit.matched.some((t) => !GENERIC.has(t))) return false;
  return hit.score >= STRONG_SCORE && hit.coverage >= MIN_COVERAGE;
}
