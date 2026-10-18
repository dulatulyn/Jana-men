import fs from "node:fs";
import path from "node:path";
import type { KbArticle } from "./types.js";

export function parseFrontmatter(src: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src);
  if (!m) return { meta: {}, body: src };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_]+)\s*:\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: m[2].trim() };
}

export function loadKbDir(dir: string): KbArticle[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const full = path.join(dir, f);
      const { meta, body } = parseFrontmatter(fs.readFileSync(full, "utf8"));
      return {
        slug: meta.slug ?? f.replace(/\.md$/, ""),
        title: meta.title ?? f,
        ...(meta.title_kk ? { title_kk: meta.title_kk } : {}),
        category: meta.category ?? "general",
        body_md: body,
        updated_at: fs.statSync(full).mtime.toISOString(),
      };
    });
}

const kkTitleCache = new Map<string, Map<string, string>>();

export function kkTitles(dir: string): Map<string, string> {
  let titles = kkTitleCache.get(dir);
  if (!titles) {
    titles = new Map();
    try {
      for (const a of loadKbDir(dir)) if (a.title_kk) titles.set(a.slug, a.title_kk);
    } catch {
      titles.clear();
    }
    kkTitleCache.set(dir, titles);
  }
  return titles;
}

export interface KbChunk {
  slug: string;
  title: string;
  heading: string;
  text: string;
}

export function chunkArticle(a: KbArticle): KbChunk[] {
  const chunks: KbChunk[] = [];
  let heading = a.title;
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) chunks.push({ slug: a.slug, title: a.title, heading, text });
    buf = [];
  };
  for (const line of a.body_md.split(/\r?\n/)) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      heading = h[1].length === 1 ? a.title : h[2].trim();
    } else buf.push(line);
  }
  flush();
  return chunks;
}
