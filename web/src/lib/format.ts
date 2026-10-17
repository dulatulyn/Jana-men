import type { Locale } from "./api/types";

const tag = (l: Locale) => (l === "kk" ? "kk-KZ" : "ru-RU");

const parse = (iso: string) => (iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso));

const KK_MONTHS = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
const KK_MONTHS_SHORT = ["қаң.", "ақп.", "нау.", "сәу.", "мам.", "мау.", "шіл.", "там.", "қыр.", "қаз.", "қар.", "жел."];
const KK_WEEKDAYS = ["жексенбі", "дүйсенбі", "сейсенбі", "сәрсенбі", "бейсенбі", "жұма", "сенбі"];

function kkFormat(d: Date, o: Intl.DateTimeFormatOptions) {
  const parts: string[] = [];
  if (o.weekday) parts.push(KK_WEEKDAYS[d.getDay()] + ",");
  if (o.year) parts.push(`${d.getFullYear()} ж.`);
  if (o.day) parts.push(String(d.getDate()));
  if (o.month) parts.push(o.month === "short" ? KK_MONTHS_SHORT[d.getMonth()] : KK_MONTHS[d.getMonth()]);
  if (o.hour) parts.push(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
  return parts.join(" ");
}

export function monthName(d: Date, l: Locale) {
  return l === "kk" ? KK_MONTHS[d.getMonth()] : new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(d);
}

export function fmtDate(iso: string | null | undefined, l: Locale, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) {
  if (!iso) return "";
  if (l === "kk") return kkFormat(parse(iso), opts);
  return new Intl.DateTimeFormat(tag(l), opts).format(parse(iso));
}

export const fmtShort = (iso: string, l: Locale) => fmtDate(iso, l, { day: "numeric", month: "short" });

export function fmtRange(a: string, b: string, l: Locale) {
  const da = parse(a);
  const db = parse(b);
  const sameYear = da.getFullYear() === db.getFullYear();
  const sameMonth = sameYear && da.getMonth() === db.getMonth();
  if (sameMonth) return `${da.getDate()}–${fmtDate(b, l, { day: "numeric", month: "long" })}`;
  if (l === "kk") return `${fmtDate(a, l, { day: "numeric", month: "short" })} – ${fmtDate(b, l, { day: "numeric", month: "short" })}`;
  return `${fmtDate(a, l, { day: "numeric", month: "short" })} – ${fmtDate(b, l, { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" })}`;
}

export function fmtDateTime(iso: string, l: Locale) {
  if (l === "kk") return kkFormat(parse(iso), { day: "numeric", month: "short", hour: "2-digit" });
  return new Intl.DateTimeFormat(tag(l), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(parse(iso));
}

export function fmtTime(iso: string, l: Locale) {
  return new Intl.DateTimeFormat(tag(l === "kk" ? "ru" : l), { hour: "2-digit", minute: "2-digit" }).format(parse(iso));
}

export function fmtRelative(iso: string, l: Locale, today: string, yesterday: string) {
  const d = parse(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startToday) return `${today}, ${fmtTime(iso, l)}`;
  if (t >= startToday - 86_400_000) return `${yesterday}, ${fmtTime(iso, l)}`;
  return fmtDateTime(iso, l);
}

export function fmtMoney(n: number) {
  return `${Math.round(n).toLocaleString("ru-RU").replace(/ |,/g, " ")} ₸`;
}

export const trackNo = (id: number) => `JM-${String(id).padStart(5, "0")}`;

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export const firstName = (full: string) => full.split(/\s+/)[0] ?? full;

export function daysInclusive(a: string, b: string) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000) + 1;
}

export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function experience(hireIso: string) {
  const h = parse(hireIso);
  const n = new Date();
  let months = (n.getFullYear() - h.getFullYear()) * 12 + (n.getMonth() - h.getMonth());
  if (n.getDate() < h.getDate()) months -= 1;
  return { years: Math.floor(months / 12), months: months % 12 };
}
