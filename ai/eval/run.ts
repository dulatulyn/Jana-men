import fs from "node:fs";
import path from "node:path";
import { Assistant } from "../src/assistant.js";
import { MockBackend } from "../src/backend/MockBackend.js";
import { config, ROOT } from "../src/config.js";
import { createModelClient, describeModelSetup } from "../src/models.js";
import type { AskResponse, Locale } from "../src/types.js";

interface Case {
  id: string;
  user: string;
  q: string;
  locale?: Locale;
  expect: {
    status: string | string[];
    slug?: string | string[];
    action?: string;
    days?: number;
    start?: string;
    end?: string;
    amount?: number;
    no_action?: boolean;
    can_escalate?: boolean;
    contains?: string;
    contains_any?: string[];
    answered_contains_any?: string[];
    not_contains?: string[];
    when_contains?: Record<string, string[]>;
    once?: string[];
  };
}

const cases: Case[] = JSON.parse(fs.readFileSync(path.join(ROOT, "eval", "cases.json"), "utf8"));
const model = createModelClient(config.ai);
const backend = new MockBackend({ kbDir: config.kbDir, profilesFile: config.profilesFile });
const assistant = new Assistant({ backend, model, now: () => new Date("2026-10-16T09:00:00Z") });

const statuses = (c: Case) => (Array.isArray(c.expect.status) ? c.expect.status : [c.expect.status]);
const has = (text: string, part: string) => text.toLowerCase().includes(part.toLowerCase());

function check(c: Case, r: AskResponse): string[] {
  const fails: string[] = [];
  const e = c.expect;
  if (!statuses(c).includes(r.status)) fails.push(`status=${r.status}`);
  if (e.slug) {
    const want = Array.isArray(e.slug) ? e.slug : [e.slug];
    if (!r.sources.some((s) => want.includes(s.slug))) fails.push(`sources=[${r.sources.map((s) => s.slug).join(",")}]`);
  }
  if (e.action) {
    const a = r.action?.request;
    if (a?.type !== e.action) fails.push(`action=${a?.type ?? "null"}`);
    else if (a.type === "vacation") {
      if (e.days !== undefined && a.payload.days !== e.days) fails.push(`days=${a.payload.days}`);
      if (e.start && a.payload.start_date !== e.start) fails.push(`start=${a.payload.start_date}`);
      if (e.end && a.payload.end_date !== e.end) fails.push(`end=${a.payload.end_date}`);
    } else if (e.amount !== undefined && a.payload.amount !== e.amount) fails.push(`amount=${a.payload.amount}`);
  }
  if (e.no_action && r.action) fails.push(`unexpected action=${r.action.request.type}`);
  if (e.can_escalate !== undefined && r.can_escalate !== e.can_escalate) fails.push(`can_escalate=${r.can_escalate}`);
  if (e.contains && !r.answer.includes(e.contains)) fails.push(`answer lacks "${e.contains}"`);
  if (e.contains_any && !e.contains_any.some((p) => has(r.answer, p))) fails.push(`answer lacks any of ${e.contains_any.join("|")}`);
  if (e.answered_contains_any && r.status === "answered" && !e.answered_contains_any.some((p) => has(r.answer, p)))
    fails.push(`answer lacks any of ${e.answered_contains_any.join("|")}`);
  for (const p of e.not_contains ?? []) if (has(r.answer, p)) fails.push(`answer contains "${p}"`);
  for (const [trigger, need] of Object.entries(e.when_contains ?? {}))
    if (has(r.answer, trigger) && !need.some((p) => has(r.answer, p))) fails.push(`"${trigger}" without any of ${need.join("|")}`);
  for (const p of e.once ?? []) if (r.answer.split(p).length > 2) fails.push(`"${p}" repeated`);
  if (r.status === "refused" && r.sources.length) fails.push("refusal with sources");
  return fails;
}

const rows: Array<{ id: string; kind: string; ok: boolean; got: string; note: string; answer: string }> = [];
for (const c of cases) {
  const t0 = Date.now();
  const r = await assistant.ask(`Bearer mock.${c.user}`, { question: c.q, locale: c.locale ?? "ru" });
  const fails = check(c, r);
  rows.push({
    id: c.id,
    kind: c.expect.action ? "action" : statuses(c).join("|"),
    ok: fails.length === 0,
    answer: r.answer,
    got: `${r.status}${r.sources.length ? " [" + r.sources.map((s) => s.slug).join(",") + "]" : ""}${r.action ? " +" + r.action.request.type : ""} (${r.mode}, ${Date.now() - t0}ms)`,
    note: fails.join("; "),
  });
}

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
console.log(`\nJanaMen HR-assistant eval · ${describeModelSetup(config.ai, model)} · ${cases.length} cases\n`);
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
for (const r of rows.filter((x) => !x.ok)) console.log(`\n${r.id}: ${r.answer.replace(/\s+/g, " ").slice(0, 400)}`);
const pass = rows.filter((r) => r.ok).length;
console.log(`${pad("TOTAL", 12)} ${pass}/${rows.length} (${Math.round((pass / rows.length) * 100)}%)\n`);
process.exitCode = pass === rows.length ? 0 : 1;
