"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { StateChip } from "@/components/protocol/state-chip";
import { NonClaim } from "@/components/protocol/non-claim";
import { AddressDisplay } from "@/components/protocol/chain-value";
import { DataTable, type Column } from "@/components/data/data-table";
import { EmptyState, ErrorState, Banner } from "@/components/data/states";
import { NetworkGuard } from "@/components/web3/network-guard";
import { IdentityActionButton } from "@/components/identity/identity-action-button";
import { IssueCredentialDialog } from "@/components/identity/issue-credential-dialog";
import { useContractRead } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import { useRoles } from "@/hooks/useRoles";
import { readCredentialIndex, type CredentialView } from "@/lib/api/identity";
import { readAssetsPaused } from "@/lib/api/market";
import { canIssueCredential } from "@/lib/api/identity-actions";
import {
  credentialStatusLabel,
  credentialTypeLabel,
} from "@/lib/contracts/generated/enums";
import { formatDate } from "@/lib/utils/time";

export default function CredentialsPage() {
  const router = useRouter();
  const account = useAccountState();
  const { viewer, roles } = useRoles();
  const [query, setQuery] = React.useState("");
  const [validity, setValidity] = React.useState("all");
  const [issueOpen, setIssueOpen] = React.useState(false);

  const index = useContractRead(
    ["credentials", "index"],
    async ({ client, book, blockNumber }) => {
      const block = await client.getBlock({ blockNumber });
      const [all, paused] = await Promise.all([
        readCredentialIndex(client, book, blockNumber, block.timestamp, 100),
        readAssetsPaused(client, book, blockNumber),
      ]);
      return { ...all, paused };
    },
  );

  const rows = React.useMemo(() => {
    const items = index.data?.items ?? [];
    const q = query.trim().toLowerCase();
    return items.filter((c) => {
      if (validity === "valid" && !c.isValid) return false;
      if (validity === "lapsed" && !c.isLapsed) return false;
      if (validity === "invalid" && c.isValid) return false;
      if (!q) return true;
      return (
        c.credentialId.toString() === q.replace("#", "") ||
        c.subjectOrgId.toString() === q.replace("#", "") ||
        c.subject.toLowerCase().includes(q)
      );
    });
  }, [index.data, query, validity]);

  const lapsed = (index.data?.items ?? []).filter((c) => c.isLapsed).length;
  const issue = canIssueCredential(viewer, index.data?.paused ?? false);

  const columns: Column<CredentialView>[] = [
    { key: "id", header: "Credential", sticky: true, mono: true, cell: (c) => `#${c.credentialId}` },
    {
      key: "type",
      header: "Type",
      cell: (c) => <Badge>{credentialTypeLabel[c.credType] ?? "—"}</Badge>,
    },
    {
      key: "subject",
      header: "Subject",
      cell: (c) => (
        <span>
          {c.subjectOrgId > 0n ? (
            <span className="font-mono text-xs">Org #{c.subjectOrgId.toString()}</span>
          ) : (
            <AddressDisplay address={c.subject} />
          )}
        </span>
      ),
    },
    {
      key: "issuer",
      header: "Issuer",
      hideBelow: "tablet",
      mono: true,
      cell: (c) => (c.issuerOrgId > 0n ? `Org #${c.issuerOrgId.toString()}` : "Protocol"),
    },
    {
      key: "validity",
      header: "Validity",
      cell: (c) => (
        <StateChip
          tone={c.isValid ? "confirmed" : c.isLapsed ? "unrecorded" : "blocked"}
          hint={
            c.isLapsed
              ? "Past its expiry, but the stored status still reads ACTIVE."
              : undefined
          }
        >
          {c.isValid ? "Valid" : c.isLapsed ? "Lapsed" : (credentialStatusLabel[c.status] ?? "—")}
        </StateChip>
      ),
    },
    {
      key: "expires",
      header: "Expires",
      hideBelow: "laptop",
      mono: true,
      cell: (c) => (c.expiresAt === 0 ? "no expiry" : formatDate(c.expiresAt)),
    },
    {
      key: "issued",
      header: "Issued",
      hideBelow: "desktop",
      mono: true,
      cell: (c) => formatDate(c.issuedAt),
    },
  ];

  return (
    <AppShell standing={{ connected: account.isConnected, hasOperations: roles.CREDENTIAL_ISSUER }}>
      <NetworkGuard />

      <header className="mb-5 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-key">Identity</p>
          <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight text-ink">
            Credentials
          </h1>
          <p className="mt-1 max-w-[70ch] text-sm text-ink-2">
            Typed aviation credentials held by organizations. Validity is computed from
            status <em>and</em> expiry — a credential sits at Active past its deadline until
            someone records the lapse.
          </p>
        </div>
        <IdentityActionButton
          action={issue}
          size="md"
          onConfirmDialog={() => setIssueOpen(true)}
        />
      </header>

      {lapsed > 0 && (
        <Banner tone="warning" title={`${lapsed} credential${lapsed === 1 ? "" : "s"} lapsed`} className="mb-4">
          Past their expiry with the lapse unrecorded. Anyone can call{" "}
          <code className="font-mono text-2xs">expireCredential</code> to bring the chain
          into agreement with time — open one to do so.
        </Banner>
      )}

      <div className="mb-3 flex flex-col gap-2 tablet:flex-row tablet:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search credential id, org id or subject"
          className="tablet:max-w-[320px]"
          aria-label="Search credentials"
        />
        <Select
          value={validity}
          onChange={(e) => setValidity(e.target.value)}
          aria-label="Filter by validity"
          className="tablet:max-w-[180px]"
        >
          <option value="all">All credentials</option>
          <option value="valid">Valid now</option>
          <option value="lapsed">Lapsed, unrecorded</option>
          <option value="invalid">Not valid</option>
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
          title={index.error?.title ?? "Could not load credentials"}
          cause={index.error?.cause}
          detail={index.error?.detail}
          onRetry={index.refetch}
        />
      ) : (
        <DataTable
          caption="Issued credentials"
          columns={columns}
          rows={rows}
          rowKey={(c) => c.credentialId.toString()}
          loading={index.isLoading}
          onRowClick={(c) => router.push(`/credentials/${c.credentialId}`)}
          empty={
            query || validity !== "all" ? (
              <EmptyState variant="filtered" title="No credentials match these filters" />
            ) : (
              <EmptyState
                title="No credentials issued"
                description="Issuance requires CREDENTIAL_ISSUER_ROLE, and the subject organization must already be verified."
              />
            )
          }
        />
      )}

      <div className="mt-4 grid gap-2">
        <NonClaim variant="attestation" display="block" />
        <p className="text-2xs leading-relaxed text-ink-3">
          At most one valid credential of each type may exist per organization. Renewal is
          explicit: revoke the incumbent first, or let it lapse — a credential past its
          expiry stops blocking issuance immediately, with no expiry transaction required.
        </p>
      </div>

      <IssueCredentialDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        onIssued={() => index.refetch()}
      />
    </AppShell>
  );
}
