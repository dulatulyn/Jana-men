"use client";

import { Check, CircleDashed, FileSignature, Database, X, Ban, Send, UserCheck, Building2 } from "lucide-react";
import type { RequestDetail, RequestStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { fmtDateTime, trackNo } from "@/lib/format";
import { Pill } from "@/components/shared/ui";

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  const { t } = useI18n();
  const tone = (
    {
      submitted: "amber",
      manager_approved: "outline",
      approved: "mint",
      rejected: "red",
      cancelled: "gray",
    } as const
  )[status];
  return (
    <Pill tone={tone} className={className}>
      {status === "approved" && <Check className="size-3.5" strokeWidth={2.5} />}
      {t.status[status]}
    </Pill>
  );
}

export function TrackNo({ id, className }: { id: number; className?: string }) {
  return <span className={cn("font-mono text-[12px] font-medium tracking-tight text-jm-muted", className)}>{trackNo(id)}</span>;
}

function legs(status: RequestStatus) {
  switch (status) {
    case "submitted":
      return 1;
    case "manager_approved":
      return 2;
    case "approved":
      return 4;
    default:
      return 1;
  }
}

export function TrackBar({ status, labels = false, className }: { status: RequestStatus; labels?: boolean; className?: string }) {
  const { t } = useI18n();
  const done = legs(status);
  const failed = status === "rejected";
  const stopped = status === "cancelled";
  const steps = [t.track.submitted, t.status.submitted, t.status.manager_approved, "1С:ЗУП"];
  return (
    <div className={className}>
      <div className="flex items-center gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={done} aria-label={t.status[status]}>
        {steps.map((_, i) => {
          const filled = i < done;
          const current = !failed && !stopped && i === done && done < 4;
          return (
            <div key={i} className="relative h-[6px] flex-1 rounded-full bg-[#e6ebe8]">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full transition-[width] duration-700",
                  filled ? "w-full" : current ? "w-1/2" : "w-0",
                  stopped ? "bg-[#c6ccc9]" : current ? "bg-jm-light" : "bg-jm-green",
                )}
              />
              {current && (
                <span className="absolute top-1/2 left-1/2 flex size-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-jm-light bg-white">
                  <span className="size-[6px] animate-pulse rounded-full bg-jm-green" />
                </span>
              )}
              {failed && i === done && (
                <span className="absolute top-1/2 left-0 flex size-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-jm-red text-white">
                  <X className="size-3" strokeWidth={3} />
                </span>
              )}
              {status === "approved" && i === 3 && (
                <span className="absolute top-1/2 right-0 flex size-[18px] translate-x-1/3 -translate-y-1/2 items-center justify-center rounded-full bg-jm-green text-white">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      {labels && (
        <div className="mt-2 grid grid-cols-4 gap-1 text-[11px] leading-tight text-jm-muted">
          {[t.track.submitted, t.track.manager, t.track.hr, "1С:ЗУП"].map((l, i) => (
            <span key={i} className={cn(i < done && !stopped && "text-jm-green-strong", i === 3 && "text-right")}>
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type StepState = "done" | "current" | "pending" | "failed" | "stopped";

interface Step {
  key: string;
  icon: typeof Check;
  title: string;
  state: StepState;
  at?: string;
  who?: string;
  note?: string | null;
  code?: string | null;
}

export function Timeline({ request, waitingFor }: { request: RequestDetail; waitingFor?: string | null }) {
  const { t, locale } = useI18n();
  const ev = (to: RequestStatus) => request.events.find((e) => e.to_status === to);
  const created = ev("submitted");
  const mgr = ev("manager_approved");
  const fin = ev("approved");
  const rej = ev("rejected");
  const cancel = ev("cancelled");
  const s = request.status;

  const steps: Step[] = [
    { key: "sub", icon: Send, title: t.track.submitted, state: "done", at: created?.created_at ?? request.created_at, who: created?.actor?.full_name },
  ];

  if (cancel) {
    steps.push({ key: "cancel", icon: Ban, title: t.track.cancelled, state: "stopped", at: cancel.created_at, note: cancel.comment });
  } else {
    if (mgr) steps.push({ key: "mgr", icon: UserCheck, title: t.track.manager, state: "done", at: mgr.created_at, who: mgr.actor?.full_name, note: mgr.comment });
    else if (rej && rej.from_status === "submitted")
      steps.push({ key: "mgr", icon: UserCheck, title: t.track.rejected, state: "failed", at: rej.created_at, who: rej.actor?.full_name, note: rej.comment });
    else steps.push({ key: "mgr", icon: UserCheck, title: t.track.manager, state: s === "submitted" ? "current" : "pending", who: waitingFor ?? undefined });

    const rejectedEarly = rej && rej.from_status === "submitted";
    if (!rejectedEarly) {
      if (fin) steps.push({ key: "hr", icon: Building2, title: t.track.hr, state: "done", at: fin.created_at, who: fin.actor?.full_name, note: fin.comment });
      else if (rej) steps.push({ key: "hr", icon: Building2, title: t.track.rejected, state: "failed", at: rej.created_at, who: rej.actor?.full_name, note: rej.comment });
      else steps.push({ key: "hr", icon: Building2, title: t.track.hr, state: s === "manager_approved" ? "current" : "pending" });

      if (!rej) {
        steps.push({
          key: "1c",
          icon: Database,
          title: t.track.done,
          state: request.external_1c_id ? "done" : "pending",
          at: request.external_1c_id ? fin?.created_at ?? request.updated_at : undefined,
          code: request.external_1c_id,
        });
        steps.push({
          key: "doc",
          icon: FileSignature,
          title: t.track.doc,
          state: request.docflow_id ? "done" : "pending",
          at: request.docflow_id ? fin?.created_at ?? request.updated_at : undefined,
          note: request.docflow_id ? t.track.docSent : null,
          code: request.docflow_id,
        });
      }
    }
  }

  const ordered = [...steps].reverse();

  return (
    <ol className="relative">
      {ordered.map((st, i) => {
        const last = i === ordered.length - 1;
        const Icon = st.state === "failed" ? X : st.state === "stopped" ? Ban : st.state === "pending" ? CircleDashed : st.icon;
        return (
          <li key={st.key} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && (
              <span
                className={cn(
                  "absolute top-10 bottom-1 left-[19px] w-[2px] rounded-full",
                  st.state === "pending" || st.state === "current" ? "bg-[repeating-linear-gradient(to_bottom,#cfd6d2_0_4px,transparent_4px_8px)]" : "bg-jm-light",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full",
                st.state === "done" && (i === 0 ? "bg-jm-green text-white" : "bg-jm-mint text-jm-green"),
                st.state === "current" && "border-2 border-jm-light bg-white text-jm-green",
                st.state === "pending" && "bg-[#f1f3f2] text-[#aab3ae]",
                st.state === "failed" && "bg-jm-red text-white",
                st.state === "stopped" && "bg-[#e3e6e4] text-jm-muted",
              )}
            >
              <Icon className="size-[18px]" strokeWidth={st.state === "failed" ? 3 : 1.9} />
              {st.state === "current" && <span className="absolute inset-0 animate-ping rounded-full border-2 border-jm-light/40" />}
            </span>
            <div className="min-w-0 flex-1 pt-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className={cn("text-[15px] font-semibold", st.state === "pending" && "font-medium text-[#9aa49f]", st.state === "failed" && "text-jm-red")}>
                  {st.title}
                </p>
                {st.at && <time className="text-[13px] text-jm-muted tabular">{fmtDateTime(st.at, locale)}</time>}
                {st.state === "current" && <span className="text-[13px] font-medium text-jm-green">{t.track.waiting}</span>}
              </div>
              {st.who && <p className="mt-0.5 text-[13px] text-jm-muted">{st.who}</p>}
              {st.note && (
                <p className={cn("mt-2 rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug", st.state === "failed" ? "bg-jm-red-bg text-[#8f2b26]" : "bg-[#f4f6f5] text-jm-ink/80")}>
                  {st.note}
                </p>
              )}
              {st.code && <p className="mt-1.5 font-mono text-[12px] text-jm-green-strong">{st.code}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
