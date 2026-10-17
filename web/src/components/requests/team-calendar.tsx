"use client";

import { useMemo } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { fmtRange, monthName, toISODate } from "@/lib/format";
import { Avatar, Card, Skeleton } from "@/components/shared/ui";

const CELL = 30;
const DAYS = 63;

export function TeamCalendar() {
  const { t, locale } = useI18n();
  const start = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 3);
    return d;
  }, []);
  const from = toISODate(start);
  const to = toISODate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + DAYS - 1));
  const { data: entries } = useApi(() => api.teamCalendar(from, to), from);
  const { data: team } = useApi(() => api.team());

  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)), [start]);

  if (!entries || !team) return <Skeleton className="h-[220px]" />;

  const people = new Map<number, string>();
  for (const e of entries) people.set(e.employee.id, e.employee.full_name);
  for (const m of team) if (!people.has(m.id)) people.set(m.id, m.full_name);
  const rows = [...people.entries()];
  const todayIdx = 3;
  const base = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const idx = (iso: string) => Math.round((Date.parse(iso + "T00:00:00Z") - base) / 86_400_000);


  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
        <h2 className="text-[17px] font-semibold">{t.approvals.calendar}</h2>
        <div className="flex items-center gap-4 text-[12.5px] text-jm-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-full bg-jm-green" /> {t.approvals.legendApproved}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-full border border-dashed border-jm-accent bg-jm-mint" /> {t.approvals.legendPending}
          </span>
        </div>
      </div>
      <div className="mt-4 flex">
        <div className="w-[122px] shrink-0 border-r border-jm-line sm:w-[210px]">
          <div className="h-[52px] border-b border-jm-line" />
          {rows.map(([id, name]) => (
            <div key={id} className="flex h-[48px] items-center gap-2.5 px-3 sm:px-5">
              <Avatar name={name} size={28} className="hidden sm:inline-flex" />
              <span className="truncate text-[13px] font-medium sm:text-[14px]">{name}</span>
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div style={{ width: DAYS * CELL }} className="relative">
            <div className="flex h-[52px] border-b border-jm-line">
              {days.map((d, i) => {
                const first = i === 0 || d.getDate() === 1;
                const we = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div key={i} style={{ width: CELL }} className="relative flex shrink-0 flex-col items-center justify-end pb-1.5">
                    {first && <span className="absolute top-1.5 left-1 text-[11px] font-semibold whitespace-nowrap text-jm-ink capitalize">{monthName(d, locale)}</span>}
                    <span className={cn("text-[11.5px] tabular", i === todayIdx ? "flex size-6 items-center justify-center rounded-full bg-jm-green font-bold text-white" : we ? "text-[#b0b8b4]" : "text-jm-muted")}>
                      {d.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-[52px] bottom-0 flex">
              {days.map((d, i) => (
                <div key={i} style={{ width: CELL }} className={cn("shrink-0", (d.getDay() === 0 || d.getDay() === 6) && "bg-[#f6f8f7]")} />
              ))}
            </div>
            <div className="pointer-events-none absolute top-[52px] bottom-0 w-[2px] bg-jm-light/60" style={{ left: todayIdx * CELL + CELL / 2 - 1 }} />
            {rows.map(([id]) => (
              <div key={id} className="relative h-[48px]">
                {entries
                  .filter((e) => e.employee.id === id)
                  .map((e, k) => {
                    const a = Math.max(0, idx(e.start_date));
                    const b = Math.min(DAYS - 1, idx(e.end_date));
                    if (b < 0 || a > DAYS - 1) return null;
                    const ok = e.status === "approved";
                    return (
                      <div
                        key={k}
                        title={`${e.employee.full_name}: ${fmtRange(e.start_date, e.end_date, locale)}`}
                        className={cn(
                          "absolute top-1/2 flex h-7 -translate-y-1/2 items-center overflow-hidden rounded-full px-2.5 text-[11.5px] font-semibold whitespace-nowrap",
                          ok ? "bg-jm-green text-white" : "border border-dashed border-jm-accent bg-jm-mint text-jm-green-strong",
                        )}
                        style={{ left: a * CELL + 2, width: (b - a + 1) * CELL - 4 }}
                      >
                        {fmtRange(e.start_date, e.end_date, locale)}
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {entries.length === 0 && <p className="px-5 pb-5 text-[14px] text-jm-muted">{t.approvals.calendarEmpty}</p>}
      <div className="h-3" />
    </Card>
  );
}
