"use client";

import Link from "next/link";
import { Trophy, GraduationCap } from "lucide-react";
import type { Enrollment } from "@/lib/api/types";
import { useI18n } from "@/i18n";
import { fmtDate } from "@/lib/format";
import { Pill } from "@/components/shared/ui";
import { Segments } from "./segments";
import { cn } from "@/lib/utils";
import { isOverdue } from "@/lib/team";

export function EnrollmentLine({ e, link = true }: { e: Enrollment; link?: boolean }) {
  const { t, locale } = useI18n();
  const done = e.status === "completed";
  return (
    <Wrap href={link ? `/academy/${e.course_id}` : undefined} className={link ? "group flex items-center gap-3.5 px-5 py-4 hover:bg-[#f8faf9]" : "flex items-center gap-3.5 px-5 py-4"}>
      {done ? <Trophy className="size-[22px] shrink-0 text-jm-green" strokeWidth={1.75} /> : <GraduationCap className="size-[22px] shrink-0 text-jm-green" strokeWidth={1.75} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[15px] font-medium group-hover:text-jm-green">{e.course?.title}</p>
          {done ? (
            <Pill tone="mint">
              {t.academy.completed} · {e.score}%
            </Pill>
          ) : (
            <span className="text-[13px] font-semibold text-jm-green tabular">{e.progress_pct}%</span>
          )}
        </div>
        {done ? (
          <p className="mt-0.5 text-[13px] text-jm-muted">{fmtDate(e.completed_at, locale)}</p>
        ) : (
          <div className="mt-2 flex items-center gap-3">
            <Segments value={e.progress_pct} className="flex-1" />
            {e.due_date && (
              <span className={cn("shrink-0 text-[12.5px] font-medium", isOverdue(e) ? "text-jm-red" : "text-jm-amber")}>
                {isOverdue(e) ? t.academy.overdue : t.academy.due(fmtDate(e.due_date, locale, { day: "numeric", month: "short" }))}
              </span>
            )}
          </div>
        )}
      </div>
    </Wrap>
  );
}

function Wrap({ href, className, children }: { href?: string; className: string; children: React.ReactNode }) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}
