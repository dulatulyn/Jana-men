"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Check, ClipboardCheck, Loader2, X } from "lucide-react";
import { api, ApiError, isApiError } from "@/lib/api";
import type { RequestListItem } from "@/lib/api/types";
import { useApi } from "@/hooks/use-api";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { fmtRelative } from "@/lib/format";
import { Avatar, Card, EmptyState, ErrorState, LoadingBlock, PageTitle, RowList, SectionTitle } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { Chips } from "@/components/shared/chips";
import { RequestRow, TypeIcon } from "@/components/requests/request-row";
import { StatusBadge, TrackNo } from "@/components/requests/track";
import { TeamCalendar } from "@/components/requests/team-calendar";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

function InboxCard({ item, onReject }: { item: RequestListItem; onReject: (r: RequestListItem) => void }) {
  const { t, locale } = useI18n();
  const { invalidate } = useSession();
  const [busy, setBusy] = useState(false);
  const hrStage = item.status === "manager_approved";

  const approve = async () => {
    setBusy(true);
    try {
      await api.approveRequest(item.id);
      invalidate();
      toast.success(hrStage ? t.approvals.approvedHr : t.approvals.approved);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : t.common.error);
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <Link href={`/requests/${item.id}`} className="group flex items-start gap-3">
        <Avatar name={item.employee.full_name} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[15px] font-semibold group-hover:text-jm-green">{item.employee.full_name}</p>
            <TrackNo id={item.id} />
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-jm-ink/80">
            <TypeIcon type={item.type} className="size-4 text-jm-green" strokeWidth={1.8} />
            {t.requestType[item.type]} · {item.summary}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge status={item.status} />
            <span className="text-[12.5px] text-jm-muted">{fmtRelative(item.created_at, locale, t.common.today, t.common.yesterday)}</span>
          </div>
        </div>
      </Link>
      <div className="mt-4 flex gap-2">
        <Btn className="flex-1" onClick={approve} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />}
          {hrStage ? t.approvals.approveHr : t.approvals.approve}
        </Btn>
        <Btn variant="danger" onClick={() => onReject(item)} disabled={busy} aria-label={t.approvals.reject}>
          <X />
          <span className="hidden sm:inline">{t.approvals.reject}</span>
        </Btn>
      </div>
    </Card>
  );
}

function RejectDialog({ item, onClose }: { item: RequestListItem | null; onClose: () => void }) {
  const { t } = useI18n();
  const { invalidate } = useSession();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!item || !reason.trim()) return;
    setBusy(true);
    try {
      await api.rejectRequest(item.id, reason.trim());
      invalidate();
      toast.success(t.approvals.rejected);
      setReason("");
      onClose();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : t.common.error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-[24px] p-6 sm:max-w-[440px]">
        <DialogTitle className="text-[19px] font-bold tracking-tight">{t.approvals.rejectReason}</DialogTitle>
        <DialogDescription className="text-[14px] text-jm-muted">
          {item?.employee.full_name} · {item && t.requestType[item.type]} · {item?.summary}
        </DialogDescription>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder={t.approvals.rejectReasonPh}
          className="w-full resize-none rounded-2xl bg-[#f3f5f4] px-4 py-3 text-[15px] outline-none placeholder:text-[#a3aca7] focus:bg-white focus:ring-2 focus:ring-jm-light"
        />
        <div className="flex gap-2">
          <Btn variant="outline" className="flex-1" onClick={onClose}>
            {t.common.cancel}
          </Btn>
          <Btn variant="danger" className="flex-1" disabled={!reason.trim() || busy} onClick={submit}>
            {busy && <Loader2 className="animate-spin" />}
            {t.approvals.reject}
          </Btn>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ApprovalsPage() {
  const { t } = useI18n();
  const { me } = useSession();
  const { data: list, error } = useApi(() => api.listRequests({ scope: "team" }));
  const { data: dash } = useApi(() => api.dashboard());
  const [tab, setTab] = useState<"inbox" | "done">("inbox");
  const [rejecting, setRejecting] = useState<RequestListItem | null>(null);

  if (me?.role === "employee") return <ErrorState error={new ApiError(403, "forbidden", t.common.noAccessTitle)} />;

  const mineToAct = new Set((dash?.tasks ?? []).filter((x) => x.type === "approve_request").map((x) => x.link));
  const inbox = (list ?? []).filter((r) => mineToAct.has(`/requests/${r.id}`));
  const others = (list ?? []).filter((r) => !mineToAct.has(`/requests/${r.id}`));

  return (
    <div className="space-y-6">
      <PageTitle title={t.approvals.title} />
      {error ? (
        <ErrorState error={error} />
      ) : (
        <section>
          <div className="mb-4">
            <Chips
              value={tab}
              onChange={setTab}
              options={[
                { v: "inbox" as const, label: t.approvals.inbox, n: list && dash ? inbox.length : undefined },
                { v: "done" as const, label: t.approvals.history, n: list ? others.length : undefined },
              ]}
            />
          </div>
          {!list || !dash ? (
            <LoadingBlock rows={2} />
          ) : tab === "inbox" ? (
            inbox.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title={t.approvals.inboxEmpty} />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {inbox.map((r) => (
                  <InboxCard key={r.id} item={r} onReject={setRejecting} />
                ))}
              </div>
            )
          ) : (
            <RowList>
              {others.map((r) => (
                <RequestRow key={r.id} item={r} showEmployee />
              ))}
            </RowList>
          )}
        </section>
      )}
      <section>
        <SectionTitle className="sr-only">{t.approvals.calendar}</SectionTitle>
        <TeamCalendar />
      </section>
      <RejectDialog item={rejecting} onClose={() => setRejecting(null)} />
    </div>
  );
}
