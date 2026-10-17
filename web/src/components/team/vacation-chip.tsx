"use client";

import { Palmtree } from "lucide-react";
import type { CalendarEntry, TeamMember } from "@/lib/api/types";
import { useI18n } from "@/i18n";
import { fmtShort } from "@/lib/format";
import { vacationNext, vacationNow } from "@/lib/team";
import { Pill } from "@/components/shared/ui";

export function VacationChip({ member, entries, quiet = false }: { member: TeamMember; entries: CalendarEntry[] | undefined; quiet?: boolean }) {
  const { t, locale } = useI18n();
  const now = vacationNow(member, entries);
  const next = vacationNext(member, entries);
  if (now)
    return (
      <Pill tone="green">
        <Palmtree className="size-3.5" /> {t.team.onVacationUntil(fmtShort(now.end_date, locale))}
      </Pill>
    );
  if (next)
    return (
      <Pill tone={next.status === "approved" ? "mint" : "outline"}>
        <Palmtree className="size-3.5" /> {t.team.vacationFrom(fmtShort(next.start_date, locale))}
        {next.status !== "approved" && ` · ${t.team.pendingShort}`}
      </Pill>
    );
  return quiet ? null : <Pill tone="gray">{t.team.noVacation}</Pill>;
}
