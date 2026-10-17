/** Calendar-date helpers. Dates travel as "YYYY-MM-DD" strings; @db.Date columns come back as UTC midnight. */

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const toDateOnly = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
export const fromDateOnly = (s: string): Date => new Date(`${s}T00:00:00Z`);

/** Today's date, shifted by `offset` days, in the server's local calendar. */
export function dayOffset(offset = 0): string {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate() + offset)).toISOString().slice(0, 10);
}

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

/** "2026-11-10" → "10.11.2026" */
export const fmtDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

/** 50000 → "50 000 ₸" */
export const fmtMoney = (n: number) => `${new Intl.NumberFormat("ru-RU").format(n).replace(/\s/g, " ")} ₸`;
