"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { NonClaim } from "@/components/protocol/non-claim";
import { DataTable, type Column } from "@/components/data/data-table";
import { EmptyState, ErrorState } from "@/components/data/states";
import { NetworkGuard } from "@/components/web3/network-guard";
import { useContractRead } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import { readMaintenanceIndex, type MaintenanceRecord } from "@/lib/api/records";
import { maintenanceTypeLabel } from "@/lib/contracts/generated/enums";
import { formatDate, duration } from "@/lib/utils/time";

/** A gap this wide means the record describes history, not work done that week. */
const BACKFILL_THRESHOLD = 30 * 86_400;

export default function MaintenancePage() {
  const router = useRouter();
  const account = useAccountState();
  const [query, setQuery] = React.useState("");
  const [mType, setMType] = React.useState("all");

  const index = useContractRead(["maintenance", "index"], ({ client, book, blockNumber }) =>
    readMaintenanceIndex(client, book, blockNumber, 100),
  );

  const rows = React.useMemo(() => {
    const items = index.data?.items ?? [];
    const q = query.trim().toLowerCase().replace("#", "");
    return items.filter((r) => {
      if (mType !== "all" && r.mType !== Number(mType)) return false;
      if (!q) return true;
      return (
        r.recordId.toString() === q ||
        r.assetId.toString() === q ||
        r.performedByOrgId.toString() === q
      );
    });
  }, [index.data, query, mType]);

  const columns: Column<MaintenanceRecord>[] = [
    { key: "id", header: "Record", sticky: true, mono: true, cell: (r) => `#${r.recordId}` },
    {
      key: "type",
      header: "Maintenance type",
      cell: (r) => <Badge>{maintenanceTypeLabel[r.mType] ?? "—"}</Badge>,
    },
    { key: "asset", header: "Asset", mono: true, cell: (r) => `#${r.assetId}` },
    {
      key: "org",
      header: "Organization",
      mono: true,
      hideBelow: "tablet",
      cell: (r) => `Org #${r.performedByOrgId}`,
    },
    {
      key: "performed",
      header: "Performed (claimed)",
      mono: true,
      cell: (r) => formatDate(r.performedAt),
    },
    {
      key: "recorded",
      header: "Recorded (witnessed)",
      mono: true,
      hideBelow: "laptop",
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          {formatDate(r.recordedAt)}
          {r.gapSeconds > BACKFILL_THRESHOLD && (
            <span
              className="text-2xs text-ink-3"
              title={`Recorded ${duration(r.gapSeconds)} after the claimed work date.`}
            >
              +{duration(r.gapSeconds)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "document",
      header: "Document",
      mono: true,
      hideBelow: "desktop",
      cell: (r) => (r.documentId > 0n ? `#${r.documentId}` : "—"),
    },
  ];

  return (
    <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
      <NetworkGuard />

      <header className="mb-5 mt-2">
        <p className="label-key">Records</p>
        <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight text-ink">Maintenance</h1>
        <p className="mt-1 max-w-[75ch] text-sm text-ink-2">
          Append-only maintenance events. Records are immutable — there is no edit and no
          delete, and a correction is a new record. Writing one requires a verified MRO
          organization holding a valid maintenance credential.
        </p>
      </header>

      <div className="mb-3 flex flex-col gap-2 tablet:flex-row tablet:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search record id, asset id or org id"
          className="tablet:max-w-[300px]"
          aria-label="Search maintenance records"
        />
        <Select
          value={mType}
          onChange={(e) => setMType(e.target.value)}
          aria-label="Filter by maintenance type"
          className="tablet:max-w-[210px]"
        >
          <option value="all">All maintenance types</option>
          {Object.entries(maintenanceTypeLabel)
            .filter(([k]) => k !== "0")
            .map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
        </Select>
        {index.data && (
          <p className="ml-auto font-mono text-2xs text-ink-3">
            {rows.length} of {index.data.total}
          </p>
        )}
      </div>

      {index.isError ? (
        <ErrorState
          kind={index.error?.tone === "infrastructure" ? "infrastructure" : "protocol"}
          title={index.error?.title ?? "Could not load maintenance records"}
          cause={index.error?.cause}
          detail={index.error?.detail}
          onRetry={index.refetch}
        />
      ) : (
        <DataTable
          caption="Maintenance records"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.recordId.toString()}
          loading={index.isLoading}
          onRowClick={(r) => router.push(`/maintenance/${r.recordId}`)}
          empty={
            query || mType !== "all" ? (
              <EmptyState variant="filtered" title="No records match these filters" />
            ) : (
              <EmptyState
                title="No maintenance recorded"
                description="Recording requires a verified MRO organization holding a valid MAINTENANCE_AUTHORITY credential. All three conditions are checked on-chain."
              />
            )
          }
        />
      )}

      <div className="mt-4 grid gap-2">
        <NonClaim variant="maintenance" display="block" />
        <p className="max-w-[80ch] text-2xs leading-relaxed text-ink-3">
          Two dates, and they mean different things. The performed date is asserted by the
          MRO and bounded only by not being in the future — backdating is visible, not
          prevented, because backfilling an airframe&rsquo;s existing service history at
          onboarding is a legitimate and necessary use. The recorded date is the block the
          write landed in. Twelve records spanning four years that all appeared in one block
          are plainly visible as such, which is the point of keeping both.
        </p>
      </div>
    </AppShell>
  );
}
