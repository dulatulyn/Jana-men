"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api, isApiError } from "@/lib/api";
import type { Course, TeamMember } from "@/lib/api/types";
import { useApi } from "@/hooks/use-api";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { toISODate } from "@/lib/format";
import { Btn } from "@/components/shared/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CourseCover } from "./cover";

const selectCls = "h-12 w-full rounded-2xl bg-[#f3f5f4] px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-jm-light";

export function AssignDialog({ open, onOpenChange, employee }: { open: boolean; onOpenChange: (o: boolean) => void; employee?: TeamMember }) {
  const { t } = useI18n();
  const { invalidate } = useSession();
  const { data: courses } = useApi(() => api.courses());
  const { data: team } = useApi(() => (employee ? Promise.resolve([employee]) : api.team()), employee?.id ?? "all");
  const [empId, setEmpId] = useState<number | null>(employee?.id ?? null);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [due, setDue] = useState(() => toISODate(new Date(Date.now() + 14 * 86_400_000)));
  const [busy, setBusy] = useState(false);

  const target = employee?.id ?? empId;
  const taken = new Set((team?.find((m) => m.id === target)?.enrollments ?? []).map((e) => e.course_id));

  const submit = async () => {
    if (!target || !courseId) return;
    setBusy(true);
    try {
      await api.assignCourse({ employee_id: target, course_id: courseId, due_date: due || null });
      invalidate();
      toast.success(t.hr.assigned);
      onOpenChange(false);
      setCourseId(null);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : t.common.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[24px] p-6 sm:max-w-[480px]">
        <DialogTitle className="text-[19px] font-bold tracking-tight">{t.hr.assignTitle}</DialogTitle>
        <DialogDescription className="sr-only">{t.hr.assignTitle}</DialogDescription>
        <div className="space-y-4">
          {employee ? (
            <p className="text-[15px] font-medium">{employee.full_name}</p>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-jm-muted">{t.hr.employee}</span>
              <select className={selectCls} value={empId ?? ""} onChange={(e) => setEmpId(Number(e.target.value) || null)}>
                <option value="">—</option>
                {(team ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} · {m.position}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-jm-muted">{t.hr.course}</span>
            <div className="grid gap-2">
              {(courses ?? []).map((c: Course) => {
                const dis = taken.has(c.id);
                return (
                  <button
                    key={c.id}
                    disabled={dis}
                    onClick={() => setCourseId(c.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border p-2.5 pr-4 text-left text-[15px] transition-colors disabled:opacity-45",
                      courseId === c.id ? "border-jm-green bg-jm-mint/50 font-semibold" : "border-jm-line hover:border-jm-light",
                    )}
                  >
                    <CourseCover cover={c.cover} size="sm" />
                    <span className="flex-1">{c.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-jm-muted">{t.hr.dueDate}</span>
            <input type="date" className={selectCls} value={due} min={toISODate(new Date())} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        <div className="mt-2 flex gap-2">
          <Btn variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Btn>
          <Btn className="flex-1" disabled={!target || !courseId || busy} onClick={submit}>
            {busy && <Loader2 className="animate-spin" />}
            {t.hr.assign}
          </Btn>
        </div>
      </DialogContent>
    </Dialog>
  );
}
