"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Clock, Loader2 } from "lucide-react";
import { api, isApiError } from "@/lib/api";
import type { TeamMember } from "@/lib/api/types";
import { useCourses, useTeam } from "@/hooks/queries";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { toISODate } from "@/lib/format";
import { Btn } from "@/components/shared/button";
import { Avatar } from "@/components/shared/ui";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CourseCover } from "./cover";

const fieldCls = "h-11 w-full rounded-2xl bg-[#f3f5f4] px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-jm-light";

function AssignForm({ employee, courseId, onDone }: { employee?: TeamMember; courseId?: number; onDone: () => void }) {
  const { t } = useI18n();
  const { invalidate } = useSession();
  const { data: courses } = useCourses();
  const { data: team } = useTeam();
  const members = employee ? [employee] : (team ?? []);
  const [course, setCourse] = useState<number | null>(courseId ?? null);
  const [picked, setPicked] = useState<Set<number>>(() => new Set(employee ? [employee.id] : []));
  const [due, setDue] = useState(() => toISODate(new Date(Date.now() + 14 * 86_400_000)));
  const [busy, setBusy] = useState(false);

  const taken = (m: TeamMember) => !!course && m.enrollments.some((e) => e.course_id === course);
  const targets = members.filter((m) => picked.has(m.id) && !taken(m));
  const free = members.filter((m) => !taken(m));
  const allPicked = free.length > 0 && free.every((m) => picked.has(m.id));

  const toggle = (id: number) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const submit = async () => {
    if (!course || !targets.length) return;
    setBusy(true);
    const results = await Promise.allSettled(targets.map((m) => api.assignCourse({ employee_id: m.id, course_id: course, due_date: due || null })));
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    setBusy(false);
    invalidate();
    if (failed.length < results.length) toast.success(targets.length > 1 ? t.hr.assignedMany(results.length - failed.length) : t.hr.assigned);
    if (failed.length) toast.error(isApiError(failed[0].reason) ? failed[0].reason.message : t.common.error);
    if (!failed.length) onDone();
  };

  return (
    <>
      <div>
        <DialogTitle className="text-[19px] font-bold tracking-tight">{t.hr.assignTitle}</DialogTitle>
        <DialogDescription className="mt-1 text-[13.5px] text-jm-muted">{employee ? employee.full_name : t.hr.assignHint}</DialogDescription>
      </div>
      <div className="-mx-6 min-h-0 flex-1 space-y-5 overflow-y-auto px-6">
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-jm-muted">{t.hr.course}</legend>
          <div className="grid gap-2">
            {(courses ?? []).map((c) => {
              const on = course === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCourse(c.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border p-2 pr-4 text-left transition-colors",
                    on ? "border-jm-green bg-jm-mint/50" : "border-jm-line hover:border-jm-light",
                  )}
                >
                  <CourseCover cover={c.cover} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[14.5px]", on ? "font-semibold" : "font-medium")}>{c.title}</span>
                    <span className="flex items-center gap-1 text-[12.5px] text-jm-muted">
                      <Clock className="size-3.5" /> {t.common.minutes(c.duration_min)}
                    </span>
                  </span>
                  <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", on ? "border-jm-green bg-jm-green text-white" : "border-[#c9d1cd]")}>
                    {on && <Check className="size-3" strokeWidth={3.5} />}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {!employee && (
          <fieldset>
            <div className="mb-2 flex items-center justify-between">
              <legend className="text-[13px] font-medium text-jm-muted">{t.hr.employees}</legend>
              {free.length > 1 && (
                <button
                  type="button"
                  onClick={() => setPicked(allPicked ? new Set() : new Set(free.map((m) => m.id)))}
                  className="text-[13px] font-semibold text-jm-green hover:text-jm-green-strong"
                >
                  {allPicked ? t.hr.pickNone : t.hr.pickAll}
                </button>
              )}
            </div>
            <div className="divide-y divide-jm-line overflow-hidden rounded-2xl border border-jm-line">
              {members.map((m) => {
                const dis = taken(m);
                const on = picked.has(m.id) && !dis;
                return (
                  <label key={m.id} className={cn("flex items-center gap-3 px-3.5 py-2.5", dis ? "opacity-55" : "cursor-pointer hover:bg-[#f8faf9]")}>
                    <input type="checkbox" className="peer sr-only" checked={on} disabled={dis} onChange={() => toggle(m.id)} />
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-md border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-jm-light",
                        on ? "border-jm-green bg-jm-green text-white" : "border-[#c9d1cd] bg-white",
                      )}
                    >
                      {on && <Check className="size-3" strokeWidth={3.5} />}
                    </span>
                    <Avatar name={m.full_name} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{m.full_name}</span>
                      <span className="block truncate text-[12px] text-jm-muted">{dis ? t.hr.alreadyAssigned : m.position}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <label className="block">
          <span className="mb-2 block text-[13px] font-medium text-jm-muted">{t.hr.dueDate}</span>
          <input type="date" className={fieldCls} value={due} min={toISODate(new Date())} onChange={(e) => setDue(e.target.value)} />
        </label>
        {employee && course && taken(employee) && <p className="rounded-2xl bg-jm-amber-bg px-4 py-2.5 text-[13.5px] text-jm-amber">{t.hr.alreadyAssigned}</p>}
      </div>
      <div className="flex gap-2">
        <Btn variant="outline" className="flex-1" onClick={onDone}>
          {t.common.cancel}
        </Btn>
        <Btn className="flex-1" disabled={!course || !targets.length || busy} onClick={submit}>
          {busy && <Loader2 className="animate-spin" />}
          {targets.length > 1 ? t.hr.assignN(targets.length) : t.hr.assign}
        </Btn>
      </div>
    </>
  );
}

export function AssignDialog({ open, onOpenChange, employee, courseId }: { open: boolean; onOpenChange: (o: boolean) => void; employee?: TeamMember; courseId?: number }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-5 rounded-[24px] p-6 sm:max-w-[500px]">
        {open && <AssignForm employee={employee} courseId={courseId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
