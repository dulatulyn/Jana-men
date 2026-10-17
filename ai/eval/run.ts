import fs from "node:fs";
import path from "node:path";
import { Assistant } from "../src/assistant.js";
import { MockBackend } from "../src/backend/MockBackend.js";
import { config, ROOT } from "../src/config.js";
import { AnthropicModelClient } from "../src/llm.js";
import type { AskResponse, Locale } from "../src/types.js";

interface Case {
  id: string;
  user: string;
  q: string;
  locale?: Locale;
  expect: { status: string; slug?: string | string[]; action?: string; days?: number; contains?: string };
}

const cases: Case[] = JSON.parse(fs.readFileSync(path.join(ROOT, "eval", "cases.json"), "utf8"));
const model = config.anthropicApiKey ? new AnthropicModelClient(config.anthropicApiKey, config.model) : null;
const backend = new MockBackend({ kbDir: config.kbDir, profilesFile: config.profilesFile });
const assistant = new Assistant({ backend, model, now: () => new Date("2026-10-16T09:00:00Z") });

function check(c: Case, r: AskResponse): string[] {
  const fails: string[] = [];
  if (r.status !== c.expect.status) fails.push(`status=${r.status}`);
  if (c.expect.slug) {
    const want = Array.isArray(c.expect.slug) ? c.expect.slug : [c.expect.slug];
    if (!r.sources.some((s) => want.includes(s.slug))) fails.push(`sources=[${r.sources.map((s) => s.slug).join(",")}]`);
  }
  if (c.expect.action) {
    const a = r.action?.request;
    if (a?.type !== c.expect.action) fails.push(`action=${a?.type ?? "null"}`);
    else if (c.expect.days !== undefined && a.type === "vacation" && a.payload.days !== c.expect.days) fails.push(`days=${a.payload.days}`);
  }
  if (c.expect.contains && !r.answer.includes(c.expect.contains)) fails.push(`answer lacks "${c.expect.contains}"`);
  if (r.status === "refused" && r.sources.length) fails.push("refusal with sources");
  return fails;
}

const rows: Array<{ id: string; kind: string; ok: boolean; got: string; note: string }> = [];
for (const c of cases) {
  const t0 = Date.now();
  const r = await assistant.ask(`Bearer mock.${c.user}`, { question: c.q, locale: c.locale ?? "ru" });
  const fails = check(c, r);
  rows.push({
    id: c.id,
    kind: c.expect.action ? "action" : c.expect.status,
    ok: fails.length === 0,
    got: `${r.status}${r.sources.length ? " [" + r.sources.map((s) => s.slug).join(",") + "]" : ""}${r.action ? " +" + r.action.request.type : ""} (${r.mode}, ${Date.now() - t0}ms)`,
    note: fails.join("; "),
  });
}

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
console.log(`\nJanaMen HR-assistant eval · mode: ${model ? `llm (${config.model})` : "fallback (no API key)"} · ${cases.length} cases\n`);
console.log(`${pad("", 4)} ${pad("case", 22)} ${pad("expected", 10)} ${pad("got", 52)} note`);
console.log("-".repeat(110));
for (const r of rows) console.log(`${r.ok ? "PASS" : "FAIL"} ${pad(r.id, 22)} ${pad(r.kind, 10)} ${pad(r.got, 52)} ${r.note}`);
console.log("-".repeat(110));
const groups = new Map<string, { pass: number; total: number }>();
for (const r of rows) {
  const g = groups.get(r.kind) ?? { pass: 0, total: 0 };
  g.total++;
  if (r.ok) g.pass++;
  groups.set(r.kind, g);
}
for (const [k, g] of groups) console.log(`${pad(k, 12)} ${g.pass}/${g.total}`);
const pass = rows.filter((r) => r.ok).length;
console.log(`${pad("TOTAL", 12)} ${pass}/${rows.length} (${Math.round((pass / rows.length) * 100)}%)\n`);
process.exitCode = pass === rows.length ? 0 : 1;
