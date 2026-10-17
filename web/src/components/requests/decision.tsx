"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { api, isApiError } from "@/lib/api";
import type { RequestListItem } from "@/lib/api/types";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { Btn } from "@/components/shared/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type Target = Pick<RequestListItem, "id" | "type" | "status" | "employee" | "summary">;

function RejectDialog({ item, onClose }: { item: Target | null; onClose: () => void }) {
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
      <DialogContent className="gap-4 rounded-[24px] p-6 sm:max-w-[460px]">
        <div>
          <DialogTitle className="text-[19px] font-bold tracking-tight">{t.approvals.rejectTitle}</DialogTitle>
          <DialogDescription className="mt-1 text-[14px] text-jm-muted">
            {item?.employee.full_name} · {item && t.requestType[item.type]} · {item?.summary}
          </DialogDescription>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {t.approvals.quickReasons.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={cn(
                "h-8 rounded-full px-3 text-[13px] font-medium transition-colors",
                reason === r ? "bg-jm-ink text-white" : "bg-jm-page text-jm-ink/80 hover:text-jm-ink",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          aria-label={t.approvals.rejectReason}
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

export function useDecisions() {
  const { t } = useI18n();
  const { invalidate } = useSession();
  const [busy, setBusy] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<Target | null>(null);

  const approve = async (item: Target) => {
    setBusy(item.id);
    try {
      await api.approveRequest(item.id);
      invalidate();
      toast.success(item.status === "manager_approved" ? t.approvals.approvedHr : t.approvals.approved);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : t.common.error);
    } finally {
      setBusy(null);
    }
  };

  const dialog = <RejectDialog item={rejecting} onClose={() => setRejecting(null)} />;
  return { approve, reject: setRejecting, busy, dialog };
}

export type Decisions = ReturnType<typeof useDecisions>;

export function DecisionButtons({ item, decisions, size = "sm", className }: { item: Target; decisions: Decisions; size?: "sm" | "md"; className?: string }) {
  const { t } = useI18n();
  const busy = decisions.busy === item.id;
  const hr = item.status === "manager_approved";
  return (
    <div className={cn("flex shrink-0 items-center gap-2", className)}>
      <Btn size={size} onClick={() => decisions.approve(item)} disabled={busy} className="flex-1 sm:flex-none">
        {busy ? <Loader2 className="animate-spin" /> : <Check />}
        {hr ? t.approvals.approveHr : t.approvals.approve}
      </Btn>
      <Btn size={size} variant="danger" onClick={() => decisions.reject(item)} disabled={busy} aria-label={t.approvals.reject} title={t.approvals.reject}>
        <X />
        <span className="hidden xl:inline">{t.approvals.reject}</span>
      </Btn>
    </div>
  );
}
