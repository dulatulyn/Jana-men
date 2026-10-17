"use client";

import { useRouter } from "next/navigation";
import { Bell, BellOff, CheckCheck, CircleCheck, CircleX, ClipboardCheck, Forward, GraduationCap, Send, Trophy, Ban } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/api/types";
import { useApi } from "@/hooks/use-api";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, LoadingBlock, PageTitle, RowList, SectionTitle } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";

const ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  request_submitted: { icon: Send, tone: "text-jm-green" },
  request_manager_approved: { icon: ClipboardCheck, tone: "text-jm-green" },
  request_approved: { icon: CircleCheck, tone: "text-jm-green" },
  request_rejected: { icon: CircleX, tone: "text-jm-red" },
  request_cancelled: { icon: Ban, tone: "text-jm-muted" },
  course_assigned: { icon: GraduationCap, tone: "text-jm-green" },
  course_completed: { icon: Trophy, tone: "text-jm-green" },
  assistant_escalated: { icon: Forward, tone: "text-jm-green" },
};

function Item({ n, onOpen }: { n: Notification; onOpen: (n: Notification) => void }) {
  const { t, locale } = useI18n();
  const meta = ICONS[n.type] ?? { icon: Bell, tone: "text-jm-green" };
  const unread = !n.read_at;
  return (
    <button onClick={() => onOpen(n)} className={cn("flex w-full items-start gap-3.5 px-4 py-4 text-left transition-colors hover:bg-[#f8faf9] sm:px-5", unread && "bg-jm-mint/35")}>
      <meta.icon className={cn("mt-0.5 size-[22px] shrink-0", meta.tone)} strokeWidth={1.75} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn("text-[15px]", unread ? "font-semibold" : "font-medium")}>{n.title}</span>
          <time className="shrink-0 text-[12.5px] text-jm-muted tabular">{fmtRelative(n.created_at, locale, t.common.today, t.common.yesterday)}</time>
        </span>
        {n.body && <span className="mt-0.5 block text-[14px] leading-snug text-jm-ink/70">{n.body}</span>}
      </span>
      {unread && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-jm-green" aria-label="new" />}
    </button>
  );
}

export default function NotificationsPage() {
  const { t } = useI18n();
  const { invalidate } = useSession();
  const router = useRouter();
  const { data, error } = useApi(() => api.notifications());

  const open = async (n: Notification) => {
    if (!n.read_at) {
      await api.readNotification(n.id).catch(() => {});
      invalidate();
    }
    if (n.link) router.push(n.link);
  };

  const readAll = async () => {
    await api.readAllNotifications();
    invalidate();
  };

  const fresh = (data ?? []).filter((n) => !n.read_at);
  const old = (data ?? []).filter((n) => n.read_at);

  return (
    <div className="mx-auto max-w-[760px]">
      <PageTitle
        title={t.notifications.title}
        action={
          fresh.length > 0 && (
            <Btn variant="mint" size="sm" onClick={readAll}>
              <CheckCheck /> {t.notifications.readAll}
            </Btn>
          )
        }
      />
      {error ? (
        <ErrorState error={error} />
      ) : !data ? (
        <LoadingBlock rows={4} />
      ) : data.length === 0 ? (
        <EmptyState icon={BellOff} title={t.notifications.empty} />
      ) : (
        <div className="space-y-6">
          {fresh.length > 0 && (
            <section>
              <SectionTitle>{t.notifications.new}</SectionTitle>
              <RowList>
                {fresh.map((n) => (
                  <Item key={n.id} n={n} onOpen={open} />
                ))}
              </RowList>
            </section>
          )}
          {old.length > 0 && (
            <section>
              <SectionTitle>{t.notifications.earlier}</SectionTitle>
              <RowList>
                {old.map((n) => (
                  <Item key={n.id} n={n} onOpen={open} />
                ))}
              </RowList>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
