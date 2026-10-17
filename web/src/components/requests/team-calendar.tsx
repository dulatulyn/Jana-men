"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, MoveHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import type { CalendarEntry } from "@/lib/api/types";
import { useApi } from "@/hooks/use-api";
import { useMyRequests, useTeam, useTeamRequests } from "@/hooks/queries";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { capitalize, daysInclusive, fmtRange, monthName, monthShort, toISODate, weekdayShort } from "@/lib/format";
import { requestIdForEntry } from "@/lib/team";
import { Avatar, Skeleton } from "@/components/shared/ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type CalendarView = "week" | "month" | "quarter" | "year";

const VIEWS: CalendarView[] = ["week", "month", "quarter", "year"];
const SPAN: Record<CalendarView, number> = { week: 7, month: 31, quarter: 92, year: 366 };
const MIN_DAY: Record<CalendarView, number> = { week: 44, month: 28, quarter: 8, year: 2.4 };
const HEAD_H = 56;
const ROW_H = 52;
const DAY_MS = 86_400_000;

const atMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const plusDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diffDays = (a: Date, b: Date) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);
const fromISO = (iso: string) => new Date(iso + "T00:00:00");

function periodStart(d: Date, v: CalendarView) {
  if (v === "week") return plusDays(atMidnight(d), -((d.getDay() + 6) % 7));
  if (v === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  if (v === "quarter") return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  return new Date(d.getFullYear(), 0, 1);
}

function shift(d: Date, v: CalendarView, n: number) {
  if (v === "week") return plusDays(d, 7 * n);
  if (v === "month") return new Date(d.getFullYear(), d.getMonth() + n, 1);
  if (v === "quarter") return new Date(d.getFullYear(), d.getMonth() + 3 * n, 1);
  return new Date(d.getFullYear() + n, 0, 1);
}

function rangeOf(anchor: Date, v: CalendarView) {
  if (v === "year") return { start: plusDays(anchor, -14), end: plusDays(shift(anchor, v, 1), 13) };
  return { start: shift(anchor, v, -1), end: plusDays(shift(anchor, v, 2), -1) };
}

const ROMAN = ["I", "II", "III", "IV"];

interface Row {
  id: number;
  name: string;
  sub?: string;
  self?: boolean;
}

function useWidth(el: HTMLElement | null) {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return w;
}

function Bar({ entry, left, width, clipL, clipR, onOpen }: { entry: CalendarEntry; left: number; width: number; clipL: boolean; clipR: boolean; onOpen: (() => void) | null }) {
  const { t, locale } = useI18n();
  const ok = entry.status === "approved";
  const n = daysInclusive(entry.start_date, entry.end_date);
  const range = fmtRange(entry.start_date, entry.end_date, locale);
  const label = width >= 104 ? range : width >= 30 ? String(n) : "";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-bar
          onClick={onOpen ?? undefined}
          aria-label={`${entry.employee.full_name}: ${range}, ${t.common.days(n)}, ${t.calendar.status[entry.status]}`}
          className={cn(
            "absolute top-1/2 flex h-7 -translate-y-1/2 items-center overflow-hidden px-2.5 text-[12px] font-semibold whitespace-nowrap transition-[filter,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-jm-light focus-visible:ring-offset-1",
            ok ? "bg-jm-green text-white hover:brightness-110" : "border border-dashed border-jm-accent bg-jm-mint text-jm-green-strong hover:bg-[#cdf3de]",
            clipL ? "rounded-l-[4px]" : "rounded-l-full",
            clipR ? "rounded-r-[4px]" : "rounded-r-full",
            onOpen ? "cursor-pointer" : "cursor-default",
            width < 18 && "px-0",
          )}
          style={{ left, width }}
        >
          <span className="truncate">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="block rounded-xl bg-jm-ink px-3.5 py-2.5 text-left text-white shadow-lg">
        <span className="block text-[13px] font-semibold">{entry.employee.full_name}</span>
        <span className="mt-0.5 block text-[12.5px] text-white/80">
          {range} · {t.common.days(n)}
        </span>
        <span className={cn("mt-1.5 inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold", ok ? "bg-jm-light/25 text-[#bff0d4]" : "bg-white/15 text-white")}>
          {t.calendar.status[entry.status]}
        </span>
        {onOpen && <span className="mt-1.5 block text-[11.5px] text-white/60">{t.calendar.clickToOpen}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

export function TeamCalendar({ className, defaultView = "month", departments = false, title }: { className?: string; defaultView?: CalendarView; departments?: boolean; title?: string }) {
  const { t, locale } = useI18n();
  const { me } = useSession();
  const router = useRouter();
  const today = useMemo(() => atMidnight(new Date()), []);
  const [view, setView] = useState<CalendarView>(defaultView);
  const [anchor, setAnchor] = useState(() => periodStart(today, defaultView));
  const [dept, setDept] = useState<string>("");
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bindScroller = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
    setScroller(el);
  }, []);
  const [dragging, setDragging] = useState(false);
  const width = useWidth(scroller);
  const nameW = width && width < 520 ? 116 : 232;
  const viewport = Math.max(0, width - nameW);
  const dayW = Math.max(MIN_DAY[view], viewport ? viewport / SPAN[view] : MIN_DAY[view]);

  const { start, end } = useMemo(() => rangeOf(anchor, view), [anchor, view]);
  const days = diffDays(start, end) + 1;
  const from = toISODate(start);
  const to = toISODate(end);

  const rangeKey = `${from}:${to}`;
  const { data: loaded } = useApi(() => api.teamCalendar({ from, to }).then((list) => ({ key: rangeKey, list })), rangeKey);
  const { data: team } = useTeam();
  const { data: mine } = useMyRequests();
  const { data: teamReqs } = useTeamRequests();
  const shown = loaded?.list;
  const fetching = !loaded || loaded.key !== rangeKey;

  const pending = useRef<{ left: number } | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean; id: number } | null>(null);
  const suppressClick = useRef(false);

  const deptOptions = useMemo(() => {
    if (!departments) return [];
    return [...new Set((team ?? []).map((m) => m.department).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [team, departments]);

  const rows: Row[] = useMemo(() => {
    const list: Row[] = [];
    const seen = new Set<number>();
    const members = (team ?? []).filter((m) => !dept || m.department === dept);
    const selfEntries = (shown ?? []).filter((e) => e.employee.id === me?.employee_id);
    if (me && !dept && selfEntries.length) {
      list.push({ id: me.employee_id, name: me.full_name, self: true });
      seen.add(me.employee_id);
    }
    for (const m of members) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      list.push({ id: m.id, name: m.full_name, sub: m.position });
    }
    if (!dept) {
      for (const e of shown ?? []) {
        if (seen.has(e.employee.id)) continue;
        seen.add(e.employee.id);
        list.push({ id: e.employee.id, name: e.employee.full_name });
      }
    }
    return list;
  }, [team, shown, me, dept]);

  const visibleIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const inRange = useMemo(() => (shown ?? []).filter((e) => visibleIds.has(e.employee.id) && e.start_date <= to && e.end_date >= from), [shown, visibleIds, from, to]);

  const xOf = useCallback((d: Date) => diffDays(start, d) * dayW, [start, dayW]);

  const placeAt = useCallback((left: number, smooth = false) => {
    scrollRef.current?.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !scroller || !viewport) return;
    let left = pending.current ? pending.current.left : xOf(anchor);
    if (!pending.current && SPAN[view] * dayW > viewport + 1 && today >= anchor && today < shift(anchor, view, 1)) left = Math.max(left, xOf(today) - viewport * 0.3);
    pending.current = null;
    el.scrollTo({ left, behavior: "auto" });
  }, [scroller, viewport, dayW, start, anchor, xOf, view, today]);

  const reanchor = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !viewport) return;
    const left = el.scrollLeft;
    const center = plusDays(start, Math.floor((left + viewport / 2) / dayW));
    const next = periodStart(center, view);
    if (next.getTime() === anchor.getTime()) return;
    const leftDays = left / dayW;
    const nextRange = rangeOf(next, view);
    pending.current = { left: (diffDays(nextRange.start, start) + leftDays) * dayW };
    setAnchor(next);
  }, [viewport, start, dayW, view, anchor]);

  const onScroll = () => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(reanchor, 140);
  };

  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current);
  }, []);

  const go = (n: number) => {
    const target = shift(anchor, view, n);
    const x = xOf(target);
    if (view !== "year" && x >= 0 && x <= (days - SPAN[view]) * dayW + dayW) placeAt(x, true);
    else setAnchor(target);
  };

  const goToday = () => {
    const target = periodStart(today, view);
    const fits = SPAN[view] * dayW <= viewport + 1;
    if (target.getTime() === anchor.getTime()) placeAt(fits ? xOf(target) : Math.max(xOf(target), xOf(today) - viewport * 0.3), true);
    else setAnchor(target);
  };

  const changeView = (v: CalendarView) => {
    if (v === view) return;
    const ref = today >= anchor && today < shift(anchor, view, 1) ? today : anchor;
    pending.current = null;
    setView(v);
    setAnchor(periodStart(ref, v));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (e.pointerType !== "mouse" || e.button !== 0 || !el) return;
    drag.current = { x: e.clientX, left: el.scrollLeft, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = scrollRef.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 4) {
      d.moved = true;
      el.setPointerCapture(d.id);
      setDragging(true);
    }
    if (d.moved) el.scrollTo({ left: d.left - dx, behavior: "auto" });
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      setDragging(false);
    }
  };

  const label = useMemo(() => {
    if (view === "week") return `${fmtRange(toISODate(anchor), toISODate(plusDays(anchor, 6)), locale)} ${anchor.getFullYear()}`;
    if (view === "month") return `${capitalize(monthName(anchor, locale))} ${anchor.getFullYear()}`;
    if (view === "quarter") return t.calendar.quarter(ROMAN[Math.floor(anchor.getMonth() / 3)], anchor.getFullYear());
    return String(anchor.getFullYear());
  }, [view, anchor, locale, t]);

  const totalW = days * dayW;
  const todayIdx = diffDays(start, today);
  const todayVisible = todayIdx >= 0 && todayIdx < days;
  const satIdx = (((6 - start.getDay()) % 7) + 7) % 7;

  const months = useMemo(() => {
    const out: { x: number; d: Date }[] = [];
    let m = new Date(start.getFullYear(), start.getMonth(), 1);
    while (m <= end) {
      out.push({ x: Math.max(0, diffDays(start, m)) * dayW, d: m });
      m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    }
    return out;
  }, [start, end, dayW]);

  const dayList = useMemo(() => (dayW >= 20 ? Array.from({ length: days }, (_, i) => plusDays(start, i)) : []), [dayW, days, start]);
  const mondays = useMemo(() => {
    if (view !== "quarter") return [];
    const out: Date[] = [];
    let d = plusDays(start, (8 - start.getDay()) % 7);
    while (d <= end) {
      out.push(d);
      d = plusDays(d, 7);
    }
    return out;
  }, [view, start, end]);

  const background = useMemo(() => {
    const layers: string[] = [];
    const sizes: string[] = [];
    const positions: string[] = [];
    if (dayW >= 3) {
      layers.push(`linear-gradient(90deg, rgba(22,33,27,0.035) 0 ${2 * dayW}px, transparent ${2 * dayW}px)`);
      sizes.push(`${7 * dayW}px 100%`);
      positions.push(`${satIdx * dayW}px 0`);
    }
    if (dayW >= 20) {
      layers.push(`linear-gradient(90deg, rgba(22,33,27,0.06) 0 1px, transparent 1px)`);
      sizes.push(`${dayW}px 100%`);
      positions.push("0 0");
    } else if (view === "quarter") {
      layers.push(`linear-gradient(90deg, rgba(22,33,27,0.07) 0 1px, transparent 1px)`);
      sizes.push(`${7 * dayW}px 100%`);
      positions.push(`${((satIdx + 2) % 7) * dayW}px 0`);
    }
    return { backgroundImage: layers.join(","), backgroundSize: sizes.join(","), backgroundPosition: positions.join(","), backgroundRepeat: "repeat-x" };
  }, [dayW, satIdx, view]);

  const openFor = (e: CalendarEntry) => {
    const id = requestIdForEntry(e, [...(mine ?? []), ...(teamReqs ?? [])]);
    if (!id) return null;
    return () => {
      if (suppressClick.current) return;
      router.push(`/requests/${id}`);
    };
  };

  const ready = !!team && !!shown;
  const bodyH = HEAD_H + Math.max(1, rows.length) * ROW_H;

  return (
    <section className={cn("min-w-0 overflow-hidden rounded-[20px] bg-white", className)} aria-label={title ?? t.calendar.title}>
      <div className="flex flex-col gap-3 border-b border-jm-line px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden size-9 shrink-0 items-center justify-center rounded-full bg-jm-mint text-jm-green sm:flex">
            <CalendarDays className="size-[18px]" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{title ?? t.calendar.title}</h2>
            <p className="flex items-center gap-1.5 text-[13px] text-jm-muted" aria-live="polite">
              <span className="truncate font-medium text-jm-ink/80">{label}</span>
              {fetching && <Loader2 className="size-3.5 shrink-0 animate-spin text-jm-green" />}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {deptOptions.length > 1 && (
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              aria-label={t.calendar.department}
              className="h-9 max-w-[220px] rounded-full border border-jm-line bg-white px-3.5 text-[13px] font-medium text-jm-ink outline-none hover:border-jm-light focus-visible:ring-2 focus-visible:ring-jm-light"
            >
              <option value="">{t.calendar.allDepartments}</option>
              {deptOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
          <div role="radiogroup" aria-label={t.calendar.viewLabel} className="flex h-9 items-center rounded-full bg-jm-page p-[3px]">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => changeView(v)}
                className={cn(
                  "h-full rounded-full px-3 text-[12.5px] font-semibold transition-colors sm:px-3.5",
                  view === v ? "bg-white text-jm-ink shadow-[0_1px_2px_rgba(22,33,27,0.12)]" : "text-jm-muted hover:text-jm-ink",
                )}
              >
                {t.calendar.views[v]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={t.calendar.prev}
              className="flex size-9 items-center justify-center rounded-full border border-jm-line text-jm-ink transition-colors hover:border-jm-light hover:text-jm-green"
            >
              <ChevronLeft className="size-[18px]" />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="h-9 rounded-full border border-jm-line px-3.5 text-[13px] font-semibold text-jm-ink transition-colors hover:border-jm-light hover:text-jm-green"
            >
              {t.calendar.today}
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={t.calendar.next}
              className="flex size-9 items-center justify-center rounded-full border border-jm-line text-jm-ink transition-colors hover:border-jm-light hover:text-jm-green"
            >
              <ChevronRight className="size-[18px]" />
            </button>
          </div>
        </div>
      </div>

      {!ready ? (
        <div className="p-5">
          <Skeleton className="h-[188px]" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-[14px] text-jm-muted">{t.calendar.noPeople}</p>
      ) : (
        <div
          ref={bindScroller}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={cn("relative max-h-[560px] overflow-auto overscroll-x-contain", dragging ? "cursor-grabbing select-none" : "cursor-grab")}
          style={{ scrollbarWidth: "thin" }}
        >
          <div className="relative" style={{ width: nameW + totalW, height: bodyH }}>
            <div className="sticky top-0 z-20 flex border-b border-jm-line bg-white" style={{ height: HEAD_H }}>
              <div className="sticky left-0 z-30 flex shrink-0 items-end border-r border-jm-line bg-white px-4 pb-2 sm:px-5" style={{ width: nameW }}>
                <span className="text-[11.5px] font-semibold tracking-[0.06em] text-jm-muted uppercase">{t.calendar.employee}</span>
              </div>
              <div className="relative shrink-0" style={{ width: totalW }}>
                {months.map((m, i) => (
                  <span
                    key={i}
                    className="absolute top-2 flex h-5 items-center border-l border-jm-line pl-2 text-[12px] font-semibold whitespace-nowrap text-jm-ink first:border-l-0"
                    style={{ left: m.x }}
                  >
                    {view === "year" ? capitalize(monthShort(m.d, locale)) : `${capitalize(monthName(m.d, locale))}${m.d.getMonth() === 0 || i === 0 ? ` ${m.d.getFullYear()}` : ""}`}
                  </span>
                ))}
                {dayList.map((d, i) => {
                  const isToday = i === todayIdx;
                  const we = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <span key={i} className="absolute bottom-1.5 flex items-center justify-center" style={{ left: i * dayW, width: dayW }}>
                      <span
                        className={cn(
                          "flex h-6 items-center justify-center rounded-full text-[11.5px] tabular",
                          view === "week" ? "gap-1 px-2" : "min-w-6 px-1",
                          isToday ? "bg-jm-green font-bold text-white" : we ? "text-[#a8b1ac]" : "font-medium text-jm-muted",
                        )}
                      >
                        {view === "week" && <span className={cn(!isToday && "text-[#9aa49f]")}>{weekdayShort(d, locale)}</span>}
                        {d.getDate()}
                      </span>
                    </span>
                  );
                })}
                {mondays.map((d, i) => {
                  const x = diffDays(start, d) * dayW + 4;
                  if (todayVisible && Math.abs(x - (todayIdx * dayW + dayW / 2)) < 44) return null;
                  return (
                    <span key={i} className="absolute bottom-2 text-[11px] font-medium text-jm-muted tabular" style={{ left: x }}>
                      {d.getDate()}
                    </span>
                  );
                })}
                {todayVisible && dayW < 20 && (
                  <span className="absolute bottom-1.5 z-10 flex h-5 -translate-x-1/2 items-center rounded-full bg-jm-green px-2 text-[10.5px] font-bold text-white" style={{ left: todayIdx * dayW + dayW / 2 }}>
                    {today.getDate()} {monthShort(today, locale)}
                  </span>
                )}
              </div>
            </div>

            <div className="pointer-events-none absolute" style={{ left: nameW, top: HEAD_H, width: totalW, height: rows.length * ROW_H, ...background }}>
              {view === "year" &&
                months.map((m, i) => (i > 0 || m.x > 0 ? <span key={i} className="absolute inset-y-0 w-px bg-jm-line" style={{ left: m.x }} /> : null))}
              {todayVisible && <span className="absolute inset-y-0 w-[2px] -translate-x-1/2 rounded-full bg-jm-green/70" style={{ left: todayIdx * dayW + dayW / 2 }} />}
            </div>

            {rows.map((r) => (
              <div key={r.id} className="relative flex border-b border-jm-line/70 last:border-b-0" style={{ height: ROW_H }}>
                <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2.5 border-r border-jm-line bg-white px-4 sm:px-5" style={{ width: nameW }}>
                  <Avatar name={r.name} size={30} className="hidden sm:inline-flex" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium">
                      {r.name}
                      {r.self && <span className="ml-1 font-normal text-jm-muted">({t.calendar.you})</span>}
                    </span>
                    {r.sub && <span className="hidden truncate text-[12px] text-jm-muted sm:block">{r.sub}</span>}
                  </span>
                </div>
                <div className="relative shrink-0" style={{ width: totalW }}>
                  {inRange
                    .filter((e) => e.employee.id === r.id)
                    .map((e, k) => {
                      const a = diffDays(start, fromISO(e.start_date));
                      const b = diffDays(start, fromISO(e.end_date));
                      const ca = Math.max(0, a);
                      const cb = Math.min(days - 1, b);
                      const w = Math.max(6, (cb - ca + 1) * dayW - 3);
                      return <Bar key={k} entry={e} left={ca * dayW + 1.5} width={w} clipL={a < 0} clipR={b > days - 1} onOpen={openFor(e)} />;
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-jm-line px-4 py-3 text-[12.5px] text-jm-muted sm:px-5">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-full bg-jm-green" /> {t.calendar.legendApproved}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-full border border-dashed border-jm-accent bg-jm-mint" /> {t.calendar.legendPending}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3.5 w-[2px] rounded-full bg-jm-green/70" /> {t.calendar.today}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-[rgba(22,33,27,0.06)]" /> {t.calendar.weekend}
        </span>
        {ready && inRange.length === 0 && <span className="text-jm-ink/70">{t.calendar.empty}</span>}
        <span className="ml-auto hidden items-center gap-1.5 md:flex">
          <MoveHorizontal className="size-3.5" /> {t.calendar.dragHint}
        </span>
      </div>
    </section>
  );
}
