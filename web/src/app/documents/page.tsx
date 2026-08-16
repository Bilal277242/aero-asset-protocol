"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { StateChip } from "@/components/protocol/state-chip";
import { HashDisplay } from "@/components/protocol/chain-value";
import { DataTable, type Column } from "@/components/data/data-table";
import { EmptyState, ErrorState } from "@/components/data/states";
import { NetworkGuard } from "@/components/web3/network-guard";
import { useContractRead } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import { readDocumentIndex, type DocumentRecord } from "@/lib/api/records";
import {
  documentStatusLabel,
  documentTypeLabel,
  DocumentStatus,
} from "@/lib/contracts/generated/enums";
import { formatDate } from "@/lib/utils/time";

const TONE: Record<number, "confirmed" | "blocked" | "adverse" | "neutral"> = {
  [DocumentStatus.ACTIVE]: "confirmed",
  [DocumentStatus.SUPERSEDED]: "neutral",
  [DocumentStatus.REVOKED]: "adverse",
};

export default function DocumentsPage() {
  const router = useRouter();
  const account = useAccountState();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [docType, setDocType] = React.useState("all");

  const index = useContractRead(["documents", "index"], ({ client, book, blockNumber }) =>
    readDocumentIndex(client, book, blockNumber, 100),
  );

  const rows = React.useMemo(() => {
    const items = index.data?.items ?? [];
    const q = query.trim().toLowerCase();
    return items.filter((d) => {
      if (status !== "all" && d.status !== Number(status)) return false;
      if (docType !== "all" && d.docType !== Number(docType)) return false;
      if (!q) return true;
      const bare = q.replace("#", "");
      return (
        d.documentId.toString() === bare ||
        d.assetId.toString() === bare ||
        d.documentHash.toLowerCase().includes(q)
      );
    });
  }, [index.data, query, status, docType]);

  const columns: Column<DocumentRecord>[] = [
    { key: "id", header: "Document", sticky: true, mono: true, cell: (d) => `#${d.documentId}` },
    {
      key: "type",
      header: "Type",
      cell: (d) => <Badge>{documentTypeLabel[d.docType] ?? "—"}</Badge>,
    },
    { key: "asset", header: "Asset", mono: true, cell: (d) => `#${d.assetId}` },
    {
      key: "issuer",
      header: "Issuer",
      hideBelow: "tablet",
      mono: true,
      cell: (d) => (d.issuerOrgId > 0n ? `Org #${d.issuerOrgId}` : "Asset owner"),
    },
    {
      key: "status",
      header: "Status",
      cell: (d) => (
        <StateChip
          tone={TONE[d.status] ?? "neutral"}
          hint={
            d.status === DocumentStatus.SUPERSEDED
              ? `Replaced by document #${d.supersededById}.`
              : undefined
          }
        >
          {documentStatusLabel[d.status] ?? "—"}
        </StateChip>
      ),
    },
    {
      key: "issued",
      header: "Issued",
      hideBelow: "laptop",
      mono: true,
      cell: (d) => formatDate(d.issuedAt),
    },
    {
      key: "hash",
      header: "Commitment",
      hideBelow: "desktop",
      cell: (d) => <HashDisplay hash={d.documentHash} />,
    },
  ];

  return (
    <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
      <NetworkGuard />

      <header className="mb-5 mt-2">
        <p className="label-key">Records</p>
        <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight text-ink">Documents</h1>
        <p className="mt-1 max-w-[75ch] text-sm text-ink-2">
          References to aviation paperwork. The protocol stores a{" "}
          <code className="font-mono text-xs">keccak256</code> commitment and an off-chain
          location — never the document itself. Open one to check a file you hold against
          its committed hash.
        </p>
      </header>

      <div className="mb-3 flex flex-col gap-2 tablet:flex-row tablet:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search document id, asset id or hash"
          className="tablet:max-w-[300px]"
          aria-label="Search documents"
        />
        <Select
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          aria-label="Filter by document type"
          className="tablet:max-w-[200px]"
        >
          <option value="all">All types</option>
          {Object.entries(documentTypeLabel)
            .filter(([k]) => k !== "0")
            .map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
          className="tablet:max-w-[170px]"
        >
          <option value="all">All statuses</option>
          <option value={String(DocumentStatus.ACTIVE)}>Active</option>
          <option value={String(DocumentStatus.SUPERSEDED)}>Superseded</option>
          <option value={String(DocumentStatus.REVOKED)}>Revoked</option>
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
          title={index.error?.title ?? "Could not load documents"}
          cause={index.error?.cause}
          detail={index.error?.detail}
          onRetry={index.refetch}
        />
      ) : (
        <DataTable
          caption="Registered documents"
          columns={columns}
          rows={rows}
          rowKey={(d) => d.documentId.toString()}
          loading={index.isLoading}
          onRowClick={(d) => router.push(`/documents/${d.documentId}`)}
          empty={
            query || status !== "all" || docType !== "all" ? (
              <EmptyState variant="filtered" title="No documents match these filters" />
            ) : (
              <EmptyState
                title="No documents registered"
                description="A document is registered by the asset owner, or by an account acting for an organization it belongs to."
              />
            )
          }
        />
      )}

      <p className="mt-4 text-2xs leading-relaxed text-ink-3">
        A commitment is unique <em>per asset</em>, not protocol-wide. The same document may
        legitimately be registered against several aircraft — an Airworthiness Directive
        covers a fleet — and a global index would have let anyone burn a hash permanently by
        claiming it against an asset they controlled.
      </p>
    </AppShell>
  );
}
