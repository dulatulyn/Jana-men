import type { VacationSpan } from "@/lib/api/types";

const toISO = (dmy: string) => dmy.split(".").reverse().join("-");

export function vacationFromSummary(summary: string): VacationSpan | null {
  const m = summary.match(/(\d{2}\.\d{2}\.\d{4})\s*[–-]\s*(\d{2}\.\d{2}\.\d{4})/);
  return m ? { start_date: toISO(m[1]), end_date: toISO(m[2]) } : null;
}
