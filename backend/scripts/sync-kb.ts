/* Regenerates prisma/kb-data.json from ai/kb/*.md (Nurasyl's knowledge base).
 * The JSON is committed so the backend's Docker build doesn't need the ai/ folder.
 * Run after editing any ai/kb article: `npm run kb:sync`, then `npm run db:seed -- --force`. */
import * as fs from "fs";
import * as path from "path";

const KB_DIR = path.resolve(__dirname, "../../ai/kb");
const OUT = path.resolve(__dirname, "../prisma/kb-data.json");

const articles = fs
  .readdirSync(KB_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((f) => {
    const raw = fs.readFileSync(path.join(KB_DIR, f), "utf8");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) throw new Error(`${f}: нет frontmatter`);
    const meta: Record<string, string> = {};
    for (const line of m[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    for (const key of ["slug", "title", "category"]) {
      if (!meta[key]) throw new Error(`${f}: нет поля ${key}`);
    }
    // body_md must stay byte-identical: the AI verifies quotes against it.
    return { slug: meta.slug, title: meta.title, category: meta.category, body_md: m[2].trim() };
  });

fs.writeFileSync(OUT, JSON.stringify(articles, null, 2) + "\n");
console.log(`[kb:sync] ${articles.length} статей → ${path.relative(process.cwd(), OUT)}`);
