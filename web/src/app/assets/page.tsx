"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { StateChip } from "@/components/protocol/state-chip";
import { AddressDisplay } from "@/components/protocol/chain-value";
import { DataTable, type Column } from "@/components/data/data-table";
import { EmptyState, ErrorState } from "@/components/data/states";
import { NetworkGuard } from "@/components/web3/network-guard";
import { useContractRead } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import { readAssetIndex, type AssetSummary } from "@/lib/api/passport";
import { assetKindLabel, assetStatusLabel, AssetStatus } from "@/lib/contracts/generated/enums";
import { bytes32Label } from "@/lib/utils/bytes32";
import { formatDate } from "@/lib/utils/time";

/**
 * The asset register.
 *
 * A register is a table. There is no on-chain enumeration by owner or by kind, so this
 * walks ids descending from `assetCount()` and says so when it stops — a list that
 * quietly truncates is the same class of lie as a stale status.
 */
export default function AssetsPage() {
  const router = useRouter();
  const account = useAccountState();
  const [query, setQuery] = React.useState("");
  const [kindFilter, setKindFilter] = React.useState("all");

  const register = useContractRead(["assets", "index"], ({ client, book, blockNumber }) =>
    readAssetIndex(client, book, blockNumber, 100),
  );

  const rows = React.useMemo(() => {
    const items = register.data?.items ?? [];
    const q = query.trim().toLowerCase();
    return items.filter((a) => {
      if (kindFilter !== "all" && String(a.kind) !== kindFilter) return false;
      if (!q) return true;
      const label = bytes32Label(a.label, "").toLowerCase();
      return (
        label.includes(q) ||
        a.assetId.toString() === q.replace("#", "") ||
        a.owner.toLowerCase().includes(q)
      );
    });
  }, [register.data, query, kindFilter]);

  const columns: Column<AssetSummary>[] = [
    {
      key: "id",
      header: "ID",
      sticky: true,
      mono: true,
      cell: (a) => `#${a.assetId}`,
    },
    {
      key: "designation",
      header: "Designation",
      cell: (a) => (
        <span className="font-medium text-ink">{bytes32Label(a.label, `Asset #${a.assetId}`)}</span>
      ),
    },
    {
      key: "kind",
      header: "Type",
      hideBelow: "tablet",
      cell: (a) => <Badge>{assetKindLabel[a.kind] ?? "Unknown"}</Badge>,
    },
    {
      key: "verified",
      header: "Verification",
      cell: (a) =>
        a.verified ? (
          <StateChip tone="confirmed" hint="An asset verifier attested to this record.">
            Attested
          </StateChip>
        ) : (
          <StateChip tone="blocked" hint="Cannot be listed until an asset verifier attests.">
            Not attested
          </StateChip>
        ),
    },
    {
      key: "status",
      header: "Status",
      hideBelow: "laptop",
      cell: (a) => (
        <StateChip
          tone={a.status === AssetStatus.RETIRED || a.status === AssetStatus.DESTROYED ? "adverse" : "neutral"}
        >
          {assetStatusLabel[a.status] ?? "Unknown"}
        </StateChip>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      hideBelow: "laptop",
      cell: (a) => <AddressDisplay address={a.owner} />,
    },
    {
      key: "registered",
      header: "Registered",
      hideBelow: "desktop",
      mono: true,
      cell: (a) => formatDate(a.registeredAt),
    },
  ];

  return (
    <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
      <NetworkGuard />

      <header className="mb-5 mt-2">
        <p className="label-key">Registry</p>
        <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight text-ink">
          Asset register
        </h1>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-2">
          Every aircraft, engine and component registered on this deployment. Select a row
          to open its passport.
        </p>
      </header>

      <div className="mb-3 flex flex-col gap-2 tablet:flex-row tablet:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search designation, id or owner"
          className="tablet:max-w-[320px]"
          aria-label="Search assets"
        />
        <Select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          aria-label="Filter by type"
          className="tablet:max-w-[180px]"
        >
          <option value="all">All types</option>
          {Object.entries(assetKindLabel)
            .filter(([k]) => k !== "0")
            .map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
        </Select>
        {register.data && (
          <p className="ml-auto font-mono text-2xs text-ink-3">
            {rows.length} of {register.data.total} assets
            {register.data.truncated && " · list truncated"}
          </p>
        )}
      </div>

      {register.isError ? (
        <ErrorState
          kind={register.error?.tone === "infrastructure" ? "infrastructure" : "protocol"}
          title={register.error?.title ?? "Could not load the register"}
          cause={register.error?.cause}
          remedy={register.error?.remedy}
          detail={register.error?.detail}
          onRetry={register.refetch}
        />
      ) : (
        <DataTable
          caption="Registered assets"
          columns={columns}
          rows={rows}
          rowKey={(a) => a.assetId.toString()}
          loading={register.isLoading}
          onRowClick={(a) => router.push(`/assets/${a.assetId}`)}
          empty={
            query || kindFilter !== "all" ? (
              <EmptyState
                variant="filtered"
                title="No assets match these filters"
                description={`${register.data?.total ?? 0} assets are registered, but none match the current search.`}
              />
            ) : (
              <EmptyState
                title="No assets registered"
                description="A verified organization can register an aircraft, engine or component."
              />
            )
          }
        />
      )}

      {register.data?.truncated && (
        <p className="mt-3 text-2xs leading-relaxed text-blocked">
          Showing the most recent 100 of {register.data.total}. The protocol exposes no
          enumeration by owner or kind, so this walks ids descending — the point at which
          an indexer stops being optional.
        </p>
      )}
    </AppShell>
  );
}
