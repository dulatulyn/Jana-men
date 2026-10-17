"use client";

import Link from "next/link";
import { CalendarDays, Wallet } from "lucide-react";
import type { RequestListItem } from "@/lib/api/types";
import { useI18n } from "@/i18n";
import { fmtShort } from "@/lib/format";
import { Row } from "@/components/shared/ui";
import { StatusBadge, TrackBar, TrackNo } from "./track";

export const typeIcon = (type: RequestListItem["type"]) => (type === "vacation" ? CalendarDays : Wallet);

export function TypeIcon({ type, className, strokeWidth = 1.75 }: { type: RequestListItem["type"]; className?: string; strokeWidth?: number }) {
  return type === "vacation" ? <CalendarDays className={className} strokeWidth={strokeWidth} /> : <Wallet className={className} strokeWidth={strokeWidth} />;
}

export function RequestRow({ item, showEmployee = false }: { item: RequestListItem; showEmployee?: boolean }) {
  const { t, locale } = useI18n();
  return (
    <Row
      href={`/requests/${item.id}`}
      icon={typeIcon(item.type)}
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">{showEmployee ? item.employee.full_name : t.requestType[item.type]}</span>
        </span>
      }
      subtitle={
        <>
          {showEmployee && `${t.requestType[item.type]} · `}
          {item.summary}
          <span className="hidden sm:inline"> · {fmtShort(item.created_at, locale)}</span>
        </>
      }
      meta={<StatusBadge status={item.status} />}
    />
  );
}

export function RequestTrackCard({ item, showEmployee = false }: { item: RequestListItem; showEmployee?: boolean }) {
  const { t } = useI18n();
  return (
    <Link href={`/requests/${item.id}`} className="block rounded-[20px] bg-white p-4 transition-colors hover:bg-[#fafcfb] sm:p-5">
      <div className="flex items-start gap-3">
        <TypeIcon type={item.type} className="mt-0.5 size-[22px] shrink-0 text-jm-green" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[15px] font-semibold">{showEmployee ? item.employee.full_name : t.requestTypeLong[item.type]}</p>
            <TrackNo id={item.id} />
          </div>
          <p className="mt-0.5 truncate text-[13px] text-jm-muted">{item.summary}</p>
        </div>
      </div>
      <TrackBar status={item.status} labels className="mt-4" />
    </Link>
  );
}
