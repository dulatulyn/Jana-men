"use client";

import { useState } from "react";
import { CircleCheck, Inbox } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useApprovalIds, useTeamRequests } from "@/hooks/queries";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { ErrorState, LoadingRows, Panel, PanelEmpty, RowList } from "@/components/shared/ui";
import { Chips } from "@/components/shared/chips";
import { PageHeader } from "@/components/shell/page-header";
import { InboxRow, RequestRow } from "@/components/requests/request-row";
import { TeamCalendar } from "@/components/requests/team-calendar";
import { useDecisions } from "@/components/requests/decision";

type Tab = "inbox" | "done";
type Kind = "all" | "vacation" | "advance";

export default function ApprovalsPage() {
  const { t } = useI18n();
  const { me } = useSession();
  const { data: list, error } = useTeamRequests();
  const { ids, ready } = useApprovalIds();
  const decisions = useDecisions();
  const [tab, setTab] = useState<Tab>("inbox");
  const [kind, setKind] = useState<Kind>("all");

  if (me?.role === "employee") return <ErrorState error={new ApiError(403, "forbidden", t.common.noAccessTitle)} />;

  const all = list ?? [];
  const inbox = all.filter((r) => ids.has(r.id));
  const others = all.filter((r) => !ids.has(r.id));
  const rows = (tab === "inbox" ? inbox : others).filter((r) => kind === "all" || r.type === kind);
  const loaded = !!list && ready;

  return (
    <div className="stack">
      <PageHeader title={t.approvals.title} subtitle={loaded ? t.approvals.subtitle(inbox.length) : undefined} />
      {error ? (
        <ErrorState error={error} />
      ) : (
        <div className="grid-12">
          <Panel
            className="col-span-12"
            header={
              <Chips<Tab>
                value={tab}
                onChange={setTab}
                surface="card"
                options={[
                  { v: "inbox", label: t.approvals.inbox, n: loaded ? inbox.length : undefined },
                  { v: "done", label: t.approvals.history, n: loaded ? others.length : undefined },
                ]}
              />
            }
            action={
              <Chips<Kind>
                value={kind}
                onChange={setKind}
                surface="card"
                label={t.requests.typeLabel}
                className="hidden sm:flex"
                options={[
                  { v: "all", label: t.common.all },
                  { v: "vacation", label: t.requestType.vacation },
                  { v: "advance", label: t.requestType.advance },
                ]}
              />
            }
          >
            {!loaded ? (
              <LoadingRows rows={3} />
            ) : rows.length === 0 ? (
              <PanelEmpty icon={tab === "inbox" ? CircleCheck : Inbox} title={tab === "inbox" ? t.approvals.inboxEmpty : t.approvals.historyEmpty} hint={tab === "inbox" ? t.approvals.inboxEmptyHint : undefined} />
            ) : tab === "inbox" ? (
              <RowList>
                {rows.map((r) => (
                  <InboxRow key={r.id} item={r} decisions={decisions} />
                ))}
              </RowList>
            ) : (
              <RowList>
                {rows.map((r) => (
                  <RequestRow key={r.id} item={r} showEmployee />
                ))}
              </RowList>
            )}
          </Panel>
          <div id="calendar" className="col-span-12 scroll-mt-24">
            <TeamCalendar departments={me?.role === "hr"} />
          </div>
        </div>
      )}
      {decisions.dialog}
    </div>
  );
}
