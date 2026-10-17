"use client";

import Link from "next/link";
import { CalendarDays, ChevronRight, Wallet } from "lucide-react";
import type { RequestListItem } from "@/lib/api/types";
import { useI18n } from "@/i18n";
import { fmtRelative, fmtShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/shared/ui";
import { StatusBadge, TrackBar, TrackNo } from "./track";
import { DecisionButtons, type Decisions } from "./decision";

export const typeIcon = (type: RequestListItem["type"]) => (type === "vacation" ? CalendarDays : Wallet);

export function TypeIcon({ type, className, strokeWidth = 1.75 }: { type: RequestListItem["type"]; className?: string; strokeWidth?: number }) {
  return type === "vacation" ? <CalendarDays className={className} strokeWidth={strokeWidth} /> : <Wallet className={className} strokeWidth={strokeWidth} />;
}

function TypeBubble({ type }: { type: RequestListItem["type"] }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-jm-mint">
      <TypeIcon type={type} className="size-[19px] text-jm-green" strokeWidth={1.9} />
    </span>
  );
}

export function RequestRow({ item, showEmployee = false, track = false }: { item: RequestListItem; showEmployee?: boolean; track?: boolean }) {
  const { t, locale } = useI18n();
  return (
    <Link href={`/requests/${item.id}`} className="group flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-[#f8faf9]">
      {showEmployee ? <Avatar name={item.employee.full_name} size={40} /> : <TypeBubble type={item.type} />}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14.5px] font-semibold group-hover:text-jm-green-strong">
            {showEmployee ? (
              item.employee.full_name
            ) : (
              <>
                <span className="sm:hidden">{t.requestType[item.type]}</span>
                <span className="hidden sm:inline">{t.requestTypeLong[item.type]}</span>
              </>
            )}
          </span>
          <TrackNo id={item.id} className="hidden md:inline" />
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-jm-muted">
          {showEmployee && `${t.requestType[item.type]} · `}
          {item.summary}
          <span className="hidden sm:inline"> · {fmtShort(item.created_at, locale)}</span>
        </span>
      </span>
      {track && <TrackBar status={item.status} className="hidden w-[220px] shrink-0 lg:block xl:w-[280px]" />}
      <StatusBadge status={item.status} />
      <ChevronRight className="hidden size-[18px] shrink-0 text-[#b6bdb9] transition-transform group-hover:translate-x-0.5 sm:block" />
    </Link>
  );
}

export function InboxRow({ item, decisions, className }: { item: RequestListItem; decisions: Decisions; className?: string }) {
  const { t, locale } = useI18n();
  return (
    <div className={cn("flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center", className)}>
      <Link href={`/requests/${item.id}`} className="group flex min-w-0 flex-1 items-center gap-3.5">
        <Avatar name={item.employee.full_name} size={42} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[14.5px] font-semibold group-hover:text-jm-green-strong">{item.employee.full_name}</span>
            <TrackNo id={item.id} className="hidden md:inline" />
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-jm-ink/75">
            <TypeIcon type={item.type} className="size-[15px] shrink-0 text-jm-green" strokeWidth={1.9} />
            <span className="truncate">
              {t.requestType[item.type]} · {item.summary}
            </span>
          </span>
          <span className="mt-1 flex items-center gap-2 text-[12px] text-jm-muted">
            <StatusBadge status={item.status} className="h-5 px-2 text-[11px]" />
            {fmtRelative(item.created_at, locale, t.common.today, t.common.yesterday)}
          </span>
        </span>
      </Link>
      <DecisionButtons item={item} decisions={decisions} />
    </div>
  );
}

export function RequestTrackCard({ item, showEmployee = false, className }: { item: RequestListItem; showEmployee?: boolean; className?: string }) {
  const { t } = useI18n();
  return (
    <Link href={`/requests/${item.id}`} className={cn("group flex h-full flex-col rounded-[20px] bg-white p-5 transition-colors hover:bg-[#fbfcfb]", className)}>
      <div className="flex items-start gap-3">
        <TypeBubble type={item.type} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[15px] font-semibold group-hover:text-jm-green-strong">{showEmployee ? item.employee.full_name : t.requestTypeLong[item.type]}</p>
            <TrackNo id={item.id} />
          </div>
          <p className="mt-0.5 truncate text-[13px] text-jm-muted">{item.summary}</p>
        </div>
      </div>
      <TrackBar status={item.status} labels className="mt-auto pt-5" />
    </Link>
  );
}
