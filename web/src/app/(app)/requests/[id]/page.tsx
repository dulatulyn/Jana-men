"use client";

import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, X, Database, FileSignature } from "lucide-react";
import { api, isApiError } from "@/lib/api";
import type { AdvancePayload, RequestDetail, VacationPayload } from "@/lib/api/types";
import { useApi } from "@/hooks/use-api";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { fmtDate, fmtMoney, fmtRange } from "@/lib/format";
import { BackLink, Card, ErrorState, Skeleton, Avatar } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { StatusBadge, Timeline, TrackBar, TrackNo } from "@/components/requests/track";
import { TypeIcon } from "@/components/requests/request-row";
import { cn } from "@/lib/utils";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] font-medium text-jm-muted">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold break-words">{children}</dd>
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
    <Card className="border-2 border-jm-light/50 p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[16px] font-semibold">{hrStage ? t.approvals.stageHr : t.approvals.stageManager}</p>
        {isVac && emp && (
          <span className="text-[13px] text-jm-muted">
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
        placeholder={needReason ? t.approvals.rejectReasonPh : t.approvals.commentPh}
        className={cn(
          "mt-3 w-full resize-none rounded-2xl bg-[#f3f5f4] px-4 py-3 text-[15px] outline-none placeholder:text-[#a3aca7] focus:bg-white focus:ring-2 focus:ring-jm-light",
          needReason && "ring-2 ring-jm-red/60 placeholder:text-jm-red/70",
        )}
      />
      {needReason && <p className="mt-1.5 text-[13px] font-medium text-jm-red">{t.approvals.rejectReason}</p>}
      <div className="mt-3 flex gap-2">
        <Btn className="flex-1" size="lg" onClick={() => act("approve")} disabled={!!busy}>
          {busy === "approve" ? <Loader2 className="animate-spin" /> : <Check />}
          {hrStage ? t.approvals.approveHr : t.approvals.approve}
        </Btn>
        <Btn variant="danger" size="lg" onClick={() => act("reject")} disabled={!!busy}>
          {busy === "reject" ? <Loader2 className="animate-spin" /> : <X />}
          <span className="hidden sm:inline">{t.approvals.reject}</span>
        </Btn>
      </div>
      {hrStage && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-jm-muted">
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
  const { data: dash } = useApi(() => api.dashboard());
  const { data: profile } = useApi(() => api.profile());
  const [cancelling, setCancelling] = useState(false);

  if (error) {
    return (
      <div className="mx-auto max-w-[1000px]">
        <BackLink href="/requests" label={t.nav.requests} />
        <ErrorState error={error} />
      </div>
    );
  }
  if (!r || !me) return <Skeleton className="h-[460px]" />;

  const mine = r.employee_id === me.employee_id;
  const canAct = !!dash?.tasks.some((x) => x.type === "approve_request" && x.link === `/requests/${r.id}`);
  const back = mine ? { href: "/requests", label: t.nav.requests } : { href: "/approvals", label: t.nav.approvals };

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

  return (
    <div className="mx-auto max-w-[1000px]">
      <BackLink {...back} />
      <div className="grid gap-4 lg:grid-cols-[1fr_400px] lg:gap-5">
        <div className="space-y-4">
          <Card className="p-5 sm:p-6">
            <div className="flex items-start gap-3.5">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-jm-mint">
                <TypeIcon type={r.type} className="size-6 text-jm-green" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="text-[21px] leading-tight font-bold tracking-tight sm:text-[24px]">{t.requestTypeLong[r.type]}</h1>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-1 flex items-center gap-2 text-[13px] text-jm-muted">
                  <TrackNo id={r.id} /> · {fmtDate(r.created_at, locale)}
                </p>
              </div>
            </div>

            <TrackBar status={r.status} labels className="mt-6" />

            <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-jm-line pt-5">
              {!mine && (
                <div className="col-span-2 flex items-center gap-3">
                  <Avatar name={r.employee.full_name} size={36} />
                  <Detail label={t.requests.employee}>{r.employee.full_name}</Detail>
                </div>
              )}
              {r.type === "vacation" ? (
                <>
                  <Detail label={t.requests.period}>{fmtRange((r.payload as VacationPayload).start_date, (r.payload as VacationPayload).end_date, locale)}</Detail>
                  <Detail label={t.requests.days}>{t.common.days((r.payload as VacationPayload).days)}</Detail>
                  {(r.payload as VacationPayload).comment && (
                    <div className="col-span-2">
                      <Detail label={t.requests.comment}>
                        <span className="font-normal">{(r.payload as VacationPayload).comment}</span>
                      </Detail>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Detail label={t.requests.amount}>{fmtMoney((r.payload as AdvancePayload).amount)}</Detail>
                  <div className="col-span-2">
                    <Detail label={t.requests.reason}>
                      <span className="font-normal">{(r.payload as AdvancePayload).reason}</span>
                    </Detail>
                  </div>
                </>
              )}
              {r.external_1c_id && <Detail label={t.requests.external1c}><span className="font-mono text-[13px]">{r.external_1c_id}</span></Detail>}
              {r.docflow_id && <Detail label={t.requests.docflow}><span className="font-mono text-[13px]">{r.docflow_id}</span></Detail>}
            </dl>

            {mine && r.status === "submitted" && (
              <div className="mt-5 border-t border-jm-line pt-4">
                <Btn variant="ghost" size="sm" className="-ml-2 text-jm-muted hover:bg-jm-red-bg hover:text-jm-red" onClick={cancel} disabled={cancelling}>
                  {cancelling && <Loader2 className="animate-spin" />}
                  {t.requests.cancel}
                </Btn>
              </div>
            )}
          </Card>
          {canAct && <ApprovalPanel request={r} />}
        </div>

        <Card className="p-5 sm:p-6">
          <h2 className="mb-5 text-[17px] font-semibold">{t.requests.history}</h2>
          <Timeline request={r} waitingFor={mine && r.status === "submitted" ? profile?.manager?.full_name : null} />
        </Card>
      </div>
    </div>
  );
}
