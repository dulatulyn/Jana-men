"use client";

import Link from "next/link";
import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { RequestListItem } from "@/lib/api/types";
import { useApi } from "@/hooks/use-api";
import { useI18n } from "@/i18n";
import { EmptyState, ErrorState, LoadingBlock, PageTitle, RowList } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { RequestRow, RequestTrackCard } from "@/components/requests/request-row";
import { Chips } from "@/components/shared/chips";

type Filter = "all" | "active" | "done";
const isActive = (r: RequestListItem) => r.status === "submitted" || r.status === "manager_approved";

export default function RequestsPage() {
  const { t } = useI18n();
  const { data, error } = useApi(() => api.listRequests({ scope: "mine" }));
  const [filter, setFilter] = useState<Filter>("all");
  const [type, setType] = useState<"all" | "vacation" | "advance">("all");

  const rows = (data ?? []).filter((r) => (type === "all" || r.type === type) && (filter === "all" || (filter === "active" ? isActive(r) : !isActive(r))));
  const active = rows.filter(isActive);
  const rest = rows.filter((r) => !isActive(r));

  return (
    <div>
      <PageTitle
        title={t.requests.title}
        action={
          <Btn asChild>
            <Link href="/requests/new">
              <Plus /> {t.requests.new}
            </Link>
          </Btn>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chips<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { v: "all", label: t.requests.filterAll, n: data?.length },
            { v: "active", label: t.requests.filterActive, n: data?.filter(isActive).length },
            { v: "done", label: t.requests.filterDone },
          ]}
        />
        <span className="mx-1 hidden h-5 w-px bg-jm-line sm:block" />
        <Chips
          value={type}
          onChange={setType}
          options={[
            { v: "all" as const, label: t.common.all },
            { v: "vacation" as const, label: t.requestType.vacation },
            { v: "advance" as const, label: t.requestType.advance },
          ]}
        />
      </div>

      {error ? (
        <ErrorState error={error} />
      ) : !data ? (
        <LoadingBlock rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t.requests.empty}
          hint={t.requests.emptyHint}
          action={
            <Btn asChild>
              <Link href="/requests/new">{t.requests.new}</Link>
            </Btn>
          }
        />
      ) : (
        <div className="space-y-5">
          {active.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {active.map((r) => (
                <RequestTrackCard key={r.id} item={r} />
              ))}
            </div>
          )}
          {rest.length > 0 && (
            <RowList>
              {rest.map((r) => (
                <RequestRow key={r.id} item={r} />
              ))}
            </RowList>
          )}
        </div>
      )}
    </div>
  );
}
