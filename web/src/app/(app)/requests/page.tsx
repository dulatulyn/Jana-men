"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, CalendarPlus, Database, FileSignature, FileText, Plus, Send, UserCheck, Wallet } from "lucide-react";
import type { RequestListItem } from "@/lib/api/types";
import { useMyRequests, useProfile } from "@/hooks/queries";
import { useI18n } from "@/i18n";
import { isPending } from "@/lib/team";
import { ErrorState, LoadingRows, Panel, PanelEmpty, RowList, Skeleton } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { Chips } from "@/components/shared/chips";
import { PageHeader } from "@/components/shell/page-header";
import { RequestRow } from "@/components/requests/request-row";

type Filter = "all" | "active" | "done";
type Kind = "all" | "vacation" | "advance";

function Group({ label, rows }: { label: string; rows: RequestListItem[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="border-b border-jm-line bg-[#fafbfa] px-5 py-2 text-[11.5px] font-semibold tracking-[0.06em] text-jm-muted uppercase">
        {label} · {rows.length}
      </p>
      <RowList>
        {rows.map((r) => (
          <RequestRow key={r.id} item={r} track={isPending(r)} />
        ))}
      </RowList>
    </div>
  );
}

function RouteCard() {
  const { t } = useI18n();
  const { data: p } = useProfile();
  const steps = [
    { icon: Send, title: t.requests.routeYou, sub: t.requests.routeYouHint },
    { icon: UserCheck, title: t.track.manager, sub: p?.manager?.full_name ?? t.requests.routeManagerHint },
    { icon: Building2, title: t.track.hr, sub: t.requests.routeHrHint },
    { icon: Database, title: "1С:ЗУП", sub: t.requests.route1cHint },
    { icon: FileSignature, title: "Documentolog", sub: t.track.docSent },
  ];
  return (
    <Panel title={t.requests.routeTitle} className="h-full">
      <ol className="relative px-5 py-4">
        {steps.map((s, i) => (
          <li key={i} className="relative flex gap-3.5 pb-4 last:pb-0">
            {i < steps.length - 1 && <span className="absolute top-9 bottom-0 left-[17px] w-[2px] rounded-full bg-jm-mint" aria-hidden />}
            <span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full bg-jm-mint text-jm-green">
              <s.icon className="size-[17px]" strokeWidth={1.9} />
            </span>
            <span className="min-w-0 pt-0.5">
              <span className="block text-[14px] font-semibold">{s.title}</span>
              <span className="block truncate text-[12.5px] text-jm-muted">{s.sub}</span>
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export default function RequestsPage() {
  const { t } = useI18n();
  const { data, error } = useMyRequests();
  const { data: profile } = useProfile();
  const [filter, setFilter] = useState<Filter>("all");
  const [kind, setKind] = useState<Kind>("all");

  const all = data ?? [];
  const rows = all.filter((r) => (kind === "all" || r.type === kind) && (filter === "all" || (filter === "active" ? isPending(r) : !isPending(r))));
  const active = rows.filter(isPending);
  const done = rows.filter((r) => !isPending(r));
  const activeTotal = all.filter(isPending).length;

  const newBtn = (
    <Btn asChild size="sm">
      <Link href="/requests/new">
        <Plus /> {t.requests.new}
      </Link>
    </Btn>
  );

  return (
    <div className="stack">
      <PageHeader title={t.requests.title} subtitle={data ? t.requests.subtitle(activeTotal, all.length) : undefined} actions={newBtn} />
      <div className="grid-12">
        <div className="col-span-12 lg:col-span-8">
          {error ? (
            <ErrorState error={error} />
          ) : (
            <Panel
              header={
                <Chips<Filter>
                  value={filter}
                  onChange={setFilter}
                  surface="card"
                  label={t.requests.filterLabel}
                  options={[
                    { v: "all", label: t.requests.filterAll, n: data ? all.length : undefined },
                    { v: "active", label: t.requests.filterActive, n: data ? activeTotal : undefined },
                    { v: "done", label: t.requests.filterDone, n: data ? all.length - activeTotal : undefined },
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
              className="h-full"
            >
              {!data ? (
                <LoadingRows rows={4} />
              ) : rows.length === 0 ? (
                <PanelEmpty
                  icon={FileText}
                  title={all.length ? t.requests.emptyFiltered : t.requests.empty}
                  hint={all.length ? undefined : t.requests.emptyHint}
                  action={
                    !all.length && (
                      <Btn asChild size="sm">
                        <Link href="/requests/new">{t.requests.new}</Link>
                      </Btn>
                    )
                  }
                />
              ) : (
                <>
                  <Group label={t.requests.filterActive} rows={active} />
                  <Group label={t.requests.filterDone} rows={done} />
                </>
              )}
            </Panel>
          )}
        </div>
        <div className="col-span-12 flex flex-col gap-(--gutter) lg:col-span-4">
          {!profile ? (
            <Skeleton className="h-[164px] rounded-[20px]" />
          ) : (
            <div className="rounded-[20px] bg-white p-5">
              <p className="text-[13px] font-medium text-jm-muted">{t.dashboard.vacationLeft}</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-[40px] leading-none font-extrabold tracking-[-0.04em] text-jm-green tabular">{profile.vacation_balance_days}</span>
                <span className="text-[15px] font-semibold text-jm-ink/70">{t.common.daysWord(profile.vacation_balance_days)}</span>
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Btn asChild variant="mint" size="sm">
                  <Link href="/requests/new?type=vacation">
                    <CalendarPlus /> {t.form.vacation}
                  </Link>
                </Btn>
                <Btn asChild variant="mint" size="sm">
                  <Link href="/requests/new?type=advance">
                    <Wallet /> {t.form.advance}
                  </Link>
                </Btn>
              </div>
            </div>
          )}
          <div className="flex-1">
            <RouteCard />
          </div>
        </div>
      </div>
    </div>
  );
}
