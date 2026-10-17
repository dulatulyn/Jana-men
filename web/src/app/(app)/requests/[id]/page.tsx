"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Ban, Check, ChevronRight, Database, FileSignature, History, Loader2, X } from "lucide-react";
import { api, isApiError } from "@/lib/api";
import type { AdvancePayload, RequestDetail, VacationPayload } from "@/lib/api/types";
import { useApi } from "@/hooks/use-api";
import { useApprovalIds, useProfile } from "@/hooks/queries";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { fmtDate, fmtMoney, fmtRange, trackNo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar, Card, ErrorState, Panel, Skeleton } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { PageHeader } from "@/components/shell/page-header";
import { StatusBadge, Timeline, TrackBar } from "@/components/requests/track";
import { TypeIcon } from "@/components/requests/request-row";

function Detail({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <dt className="text-[13px] font-medium text-jm-muted">{label}</dt>
      <dd className="mt-1 text-[16px] leading-snug font-semibold break-words">{children}</dd>
    </div>
  );
}

function ApprovalPanel({ request }: { request: RequestDetail }) {
  const { t } = useI18n();
  const { invalidate } = useSession();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [needReason, setNeedReason] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const hrStage = request.status === "manager_approved";
  const isVac = request.type === "vacation";
  const { data: emp } = useApi(() => api.employee(request.employee_id), request.employee_id);

  const act = async (kind: "approve" | "reject") => {
    if (kind === "reject" && !comment.trim()) {
      setNeedReason(true);
      ref.current?.focus();
      return;
    }
    setBusy(kind);
    try {
      if (kind === "approve") await api.approveRequest(request.id, comment.trim() || undefined);
      else await api.rejectRequest(request.id, comment.trim());
      invalidate();
      toast.success(kind === "reject" ? t.approvals.rejected : hrStage ? t.approvals.approvedHr : t.approvals.approved);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : t.common.error);
    } finally {
      setBusy(null);
    }
  };

  const days = isVac ? (request.payload as VacationPayload).days : 0;

  return (
    <Card className="p-5 ring-2 ring-jm-light/45 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-[17px] font-semibold tracking-tight">{hrStage ? t.approvals.stageHr : t.approvals.stageManager}</p>
        {isVac && emp && (
          <span className="text-[13.5px] text-jm-muted">
            {t.dashboard.vacationLeft}: <b className="text-jm-ink tabular">{emp.vacation_balance_days}</b> → {t.approvals.balanceAfter(Math.max(0, emp.vacation_balance_days - days))}
          </span>
        )}
      </div>
      <textarea
        ref={ref}
        value={comment}
        onChange={(e) => {
          setComment(e.target.value);
          setNeedReason(false);
        }}
        rows={2}
        aria-label={t.approvals.commentPh}
        placeholder={needReason ? t.approvals.rejectReasonPh : t.approvals.commentPh}
        className={cn(
          "mt-4 w-full resize-none rounded-2xl bg-[#f3f5f4] px-4 py-3 text-[15px] outline-none placeholder:text-[#a3aca7] focus:bg-white focus:ring-2 focus:ring-jm-light",
          needReason && "ring-2 ring-jm-red/60 placeholder:text-jm-red/70",
        )}
      />
      {needReason && <p className="mt-1.5 text-[13px] font-medium text-jm-red">{t.approvals.rejectReason}</p>}
      <div className="mt-3 flex gap-2">
        <Btn className="flex-1" size="lg" onClick={() => act("approve")} disabled={!!busy}>
          {busy === "approve" ? <Loader2 className="animate-spin" /> : <Check />}
          {hrStage ? t.approvals.approveHr : t.approvals.approve}
        </Btn>
        <Btn variant="danger" size="lg" onClick={() => act("reject")} disabled={!!busy} aria-label={t.approvals.reject}>
          {busy === "reject" ? <Loader2 className="animate-spin" /> : <X />}
          <span className="hidden sm:inline">{t.approvals.reject}</span>
        </Btn>
      </div>
      {hrStage && (
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-jm-muted">
          <span className="flex items-center gap-1.5">
            <Database className="size-3.5" /> 1С:ЗУП · {isVac ? "postVacation" : "postAdvance"}
          </span>
          <span className="flex items-center gap-1.5">
            <FileSignature className="size-3.5" /> Documentolog · createDocument
          </span>
        </p>
      )}
    </Card>
  );
}

export default function RequestPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { t, locale } = useI18n();
  const { me, invalidate } = useSession();
  const { data: r, error } = useApi(() => api.getRequest(id), id);
  const { ids } = useApprovalIds();
  const { data: profile } = useProfile();
  const [cancelling, setCancelling] = useState(false);

  const mine = !!r && !!me && r.employee_id === me.employee_id;
  const back = !r || mine || me?.role === "employee" ? { href: "/requests", label: t.nav.requests } : { href: "/approvals", label: t.nav.approvals };

  if (error) {
    return (
      <div className="stack">
        <PageHeader title={t.requests.detailTitle} back={back} />
        <ErrorState error={error} />
      </div>
    );
  }
  if (!r || !me) {
    return (
      <div className="stack">
        <PageHeader title={t.requests.detailTitle} back={back} />
        <div className="grid-12">
          <Skeleton className="col-span-12 h-[420px] rounded-[20px] lg:col-span-7" />
          <Skeleton className="col-span-12 h-[420px] rounded-[20px] lg:col-span-5" />
        </div>
      </div>
    );
  }

  const canAct = ids.has(r.id);
  const vac = r.type === "vacation" ? (r.payload as VacationPayload) : null;
  const adv = r.type === "advance" ? (r.payload as AdvancePayload) : null;

  const cancel = async () => {
    if (!window.confirm(t.requests.cancelConfirm)) return;
    setCancelling(true);
    try {
      await api.cancelRequest(r.id);
      invalidate();
      toast.success(t.requests.cancelled);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : t.common.error);
    } finally {
      setCancelling(false);
    }
  };

  const cancelBtn =
    mine && r.status === "submitted" ? (
      <Btn variant="outline" size="sm" onClick={cancel} disabled={cancelling} className="hover:border-jm-red/40 hover:text-jm-red">
        {cancelling ? <Loader2 className="animate-spin" /> : <Ban />}
        {t.requests.cancel}
      </Btn>
    ) : undefined;

  return (
    <div className="stack">
      <PageHeader
        title={t.requestTypeLong[r.type]}
        back={back}
        badge={<StatusBadge status={r.status} />}
        subtitle={`${trackNo(r.id)} · ${t.requests.createdAt(fmtDate(r.created_at, locale))}${mine ? "" : ` · ${r.employee.full_name}`}`}
        actions={cancelBtn}
      />
      <div className="grid-12">
        <div className="col-span-12 flex flex-col gap-(--gutter) lg:col-span-7">
          <Card className="p-5 sm:p-7">
            <div className="flex items-center gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-jm-mint">
                <TypeIcon type={r.type} className="size-7 text-jm-green" strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-jm-muted">{t.requests.summary}</p>
                <p className="mt-0.5 truncate text-[22px] leading-tight font-bold tracking-[-0.02em] sm:text-[26px]">
                  {vac ? fmtRange(vac.start_date, vac.end_date, locale) : adv ? fmtMoney(adv.amount) : ""}
                </p>
              </div>
              {vac && (
                <div className="hidden text-right sm:block">
                  <p className="text-[13px] font-medium text-jm-muted">{t.requests.days}</p>
                  <p className="mt-0.5 text-[22px] leading-tight font-bold tabular sm:text-[26px]">{vac.days}</p>
                </div>
              )}
            </div>

            <TrackBar status={r.status} labels size="lg" className="mt-7" />

            <dl className="mt-7 grid gap-x-6 gap-y-5 border-t border-jm-line pt-6 sm:grid-cols-2">
              {!mine && (
                <div className="sm:col-span-2">
                  <dt className="text-[13px] font-medium text-jm-muted">{t.requests.employee}</dt>
                  <dd className="mt-1.5">
                    <Link href={`/team/${r.employee_id}`} className="group inline-flex items-center gap-3 rounded-2xl border border-jm-line py-2 pr-4 pl-2 transition-colors hover:border-jm-light">
                      <Avatar name={r.employee.full_name} size={36} />
                      <span className="text-[15px] font-semibold group-hover:text-jm-green-strong">{r.employee.full_name}</span>
                      <ChevronRight className="size-4 text-[#b6bdb9]" />
                    </Link>
                  </dd>
                </div>
              )}
              {vac?.comment && (
                <Detail label={t.requests.comment} wide>
                  <span className="font-normal text-jm-ink/85">{vac.comment}</span>
                </Detail>
              )}
              {adv && (
                <Detail label={t.requests.reason} wide>
                  <span className="font-normal text-jm-ink/85">{adv.reason}</span>
                </Detail>
              )}
              <Detail label={t.track.submitted}>{fmtDate(r.created_at, locale)}</Detail>
              <Detail label={t.requests.updated}>{fmtDate(r.updated_at, locale)}</Detail>
              {r.external_1c_id && (
                <Detail label={t.requests.external1c}>
                  <span className="font-mono text-[14px]">{r.external_1c_id}</span>
                </Detail>
              )}
              {r.docflow_id && (
                <Detail label={t.requests.docflow}>
                  <span className="font-mono text-[14px]">{r.docflow_id}</span>
                </Detail>
              )}
            </dl>
          </Card>
          {canAct && <ApprovalPanel request={r} />}
        </div>

        <Panel title={t.requests.history} icon={History} className="col-span-12 lg:col-span-5" bodyClassName="px-5 py-5 sm:px-6">
          <Timeline request={r} waitingFor={mine && r.status === "submitted" ? profile?.manager?.full_name : null} />
        </Panel>
      </div>
    </div>
  );
}
