import type { KbArticle } from "@/lib/api/types";

export const kbBody = (a: KbArticle) => a.body_md.replace(/^#\s.*\n/, "").trim();

export const readMinutes = (body: string) => Math.max(1, Math.round(body.split(/\s+/).length / 180));

export function groupByCategory(list: KbArticle[]) {
  const map = new Map<string, KbArticle[]>();
  for (const a of list) map.set(a.category, [...(map.get(a.category) ?? []), a]);
  return [...map.entries()];
}
