"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { StateChip } from "@/components/protocol/state-chip";
import { NonClaim } from "@/components/protocol/non-claim";
import { AddressDisplay, HashDisplay } from "@/components/protocol/chain-value";
import { DataTable, type Column } from "@/components/data/data-table";
import { EmptyState, ErrorState, Banner } from "@/components/data/states";
import { NetworkGuard } from "@/components/web3/network-guard";
import { RegisterOrganizationDialog } from "@/components/identity/register-organization-dialog";
import { useContractRead } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import { useRoles } from "@/hooks/useRoles";
import { readOrganizationIndex, type OrgView } from "@/lib/api/identity";
import {
  organizationStatusLabel,
  organizationTypeLabel,
  OrganizationStatus,
} from "@/lib/contracts/generated/enums";
import { formatDate } from "@/lib/utils/time";

const TONE: Record<number, "confirmed" | "blocked" | "adverse" | "neutral"> = {
  [OrganizationStatus.PENDING]: "blocked",
  [OrganizationStatus.VERIFIED]: "confirmed",
  [OrganizationStatus.SUSPENDED]: "blocked",
  [OrganizationStatus.REVOKED]: "adverse",
};

export default function OrganizationsPage() {
  const router = useRouter();
  const account = useAccountState();
  const { roles } = useRoles();
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [registerOpen, setRegisterOpen] = React.useState(false);

  const index = useContractRead(
    ["organizations", "index"],
    ({ client, book, blockNumber }) => readOrganizationIndex(client, book, blockNumber, 100),
  );

  const rows = React.useMemo(() => {
    const items = index.data?.items ?? [];
    const q = query.trim().toLowerCase();
    return items.filter((o) => {
      if (statusFilter !== "all" && String(o.status) !== statusFilter) return false;
      if (!q) return true;
      return (
        o.orgId.toString() === q.replace("#", "") ||
        o.admin.toLowerCase().includes(q) ||
        o.nameHash.toLowerCase().includes(q)
      );
    });
  }, [index.data, query, statusFilter]);

  const pendingCount = (index.data?.items ?? []).filter(
    (o) => o.status === OrganizationStatus.PENDING,
  ).length;

  const columns: Column<OrgView>[] = [
    { key: "id", header: "Org", sticky: true, mono: true, cell: (o) => `#${o.orgId}` },
    {
      key: "type",
      header: "Type",
      cell: (o) => <Badge>{organizationTypeLabel[o.orgType] ?? "—"}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      cell: (o) => (
        <StateChip
          tone={TONE[o.status] ?? "neutral"}
          hint={
            o.status === OrganizationStatus.SUSPENDED
              ? "Suspended organizations cannot act, but records they created stay valid."
              : undefined
          }
        >
          {organizationStatusLabel[o.status] ?? "Unknown"}
        </StateChip>
      ),
    },
    {
      key: "admin",
      header: "Admin",
      hideBelow: "tablet",
      cell: (o) => <AddressDisplay address={o.admin} />,
    },
    {
      key: "name",
      header: "Name commitment",
      hideBelow: "laptop",
      cell: (o) => <HashDisplay hash={o.nameHash} />,
    },
    {
      key: "registered",
      header: "Registered",
      hideBelow: "desktop",
      mono: true,
      cell: (o) => formatDate(o.registeredAt),
    },
  ];

  return (
    <AppShell standing={{ connected: account.isConnected, hasOperations: roles.ORG_VERIFIER }}>
      <NetworkGuard />

      <header className="mb-5 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-key">Identity</p>
          <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight text-ink">
            Organizations
          </h1>
          <p className="mt-1 max-w-[70ch] text-sm text-ink-2">
            Registration is permissionless and lands in <em>Pending</em>. Verification by an
            authorised role is the trust boundary — a pending organization can perform no
            protocol action.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setRegisterOpen(true)}
          disabled={!account.isConnected}
        >
          Register an organization
        </Button>
      </header>

      {roles.ORG_VERIFIER && pendingCount > 0 && (
        <Banner
          tone="info"
          title={`${pendingCount} organization${pendingCount === 1 ? "" : "s"} awaiting verification`}
          className="mb-4"
        >
          You hold <code className="font-mono text-2xs">ORG_VERIFIER_ROLE</code>. Open a
          pending record to verify or reject it.
        </Banner>
      )}

      <div className="mb-3 flex flex-col gap-2 tablet:flex-row tablet:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search id, admin address or name hash"
          className="tablet:max-w-[320px]"
          aria-label="Search organizations"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="tablet:max-w-[180px]"
        >
          <option value="all">All statuses</option>
          {Object.entries(organizationStatusLabel)
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
          title={index.error?.title ?? "Could not load organizations"}
          cause={index.error?.cause}
          detail={index.error?.detail}
          onRetry={index.refetch}
        />
      ) : (
        <DataTable
          caption="Registered organizations"
          columns={columns}
          rows={rows}
          rowKey={(o) => o.orgId.toString()}
          loading={index.isLoading}
          onRowClick={(o) => router.push(`/organizations/${o.orgId}`)}
          empty={
            query || statusFilter !== "all" ? (
              <EmptyState variant="filtered" title="No organizations match these filters" />
            ) : (
              <EmptyState
                title="No organizations registered"
                description="Registration is open to anyone. A registered organization cannot act until an authorised role verifies it."
              />
            )
          }
        />
      )}

      <div className="mt-4">
        <NonClaim variant="attestation" display="block" />
      </div>

      <RegisterOrganizationDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onRegistered={() => index.refetch()}
      />
    </AppShell>
  );
}
