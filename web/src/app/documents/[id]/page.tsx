"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileWarning } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DataRow } from "@/components/ui/card";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { Banner, ErrorState } from "@/components/data/states";
import { StateChip } from "@/components/protocol/state-chip";
import { NonClaim } from "@/components/protocol/non-claim";
import { BlockStamp, HashDisplay } from "@/components/protocol/chain-value";
import { NetworkGuard } from "@/components/web3/network-guard";
import { HashVerifier } from "@/components/records/hash-verifier";
import { ProvenancePanel } from "@/components/records/provenance-panel";
import { useContractRead } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import { readDocument, readDocumentProvenance, readOrgRefs } from "@/lib/api/records";
import {
  documentStatusLabel,
  documentTypeLabel,
  organizationStatusLabel,
  DocumentStatus,
} from "@/lib/contracts/generated/enums";
import { formatDate, formatDateTime } from "@/lib/utils/time";

const TONE: Record<number, "confirmed" | "blocked" | "adverse" | "neutral"> = {
  [DocumentStatus.ACTIVE]: "confirmed",
  [DocumentStatus.SUPERSEDED]: "neutral",
  [DocumentStatus.REVOKED]: "adverse",
};

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const raw = params?.id ?? "";
  const valid = /^[1-9]\d{0,18}$/.test(raw);
  const documentId = valid ? BigInt(raw) : 0n;

  const account = useAccountState();

  const record = useContractRead(
    ["documents", raw],
    async ({ client, book, blockNumber }) => {
      const document = await readDocument(client, book, documentId, blockNumber);
      if (!document) return null;

      const [orgs, provenance, replacement] = await Promise.all([
        readOrgRefs(client, book, [document.issuerOrgId], blockNumber),
        readDocumentProvenance(client, book, documentId, blockNumber),
        document.supersededById > 0n
          ? readDocument(client, book, document.supersededById, blockNumber)
          : Promise.resolve(null),
      ]);

      return {
        document,
        issuer: orgs.get(document.issuerOrgId.toString()) ?? null,
        provenance,
        replacement,
      };
    },
    { enabled: valid },
  );

  if (!valid) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <ErrorState kind="not-found" title="Not a valid document id" />
      </AppShell>
    );
  }

  if (record.isLoading) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <RecordSkeleton rows={7} />
      </AppShell>
    );
  }

  if (record.isError || !record.data) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <ErrorState
          kind={record.error?.tone === "infrastructure" ? "infrastructure" : "not-found"}
          title={record.error?.title ?? "No such document"}
          cause={record.error?.cause ?? `Nothing is registered under id ${raw}.`}
          detail={record.error?.detail}
          onRetry={record.refetch}
        />
      </AppShell>
    );
  }

  const { document: d, issuer, provenance, replacement } = record.data;

  return (
    <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
      <NetworkGuard />

      <Link
        href="/documents"
        className="mb-3 mt-2 inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-accent"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Documents
      </Link>

      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-ink">
            {documentTypeLabel[d.docType] ?? "Document"}
          </h1>
          <span className="font-mono text-sm text-ink-3">#{d.documentId.toString()}</span>
          <StateChip tone={TONE[d.status] ?? "neutral"}>
            {documentStatusLabel[d.status] ?? "—"}
          </StateChip>
          <Link href={`/assets/${d.assetId}`}>
            <Badge variant="outline">Asset #{d.assetId.toString()}</Badge>
          </Link>
        </div>
        {record.blockNumber !== undefined && (
          <p className="mt-1.5 text-xs text-ink-2">
            <BlockStamp blockNumber={record.blockNumber.toString()} />
          </p>
        )}
      </header>

      {d.status === DocumentStatus.SUPERSEDED && (
        <Banner tone="info" title="Superseded" className="mb-4">
          <span className="inline-flex flex-wrap items-center gap-1">
            Replaced by{" "}
            <Link
              href={`/documents/${d.supersededById}`}
              className="font-medium text-accent hover:underline"
            >
              document #{d.supersededById.toString()}
            </Link>
            {replacement && ` (${documentTypeLabel[replacement.docType] ?? "document"})`}. This
            record is kept rather than edited — that is what makes the registry an audit
            trail.
          </span>
        </Banner>
      )}

      {d.status === DocumentStatus.REVOKED && (
        <Banner tone="critical" title="Revoked — terminal" className="mb-4">
          Withdrawn by its controller or by the protocol admin, and never reinstated. The
          commitment below is still what was registered; revocation withdraws the assertion,
          it does not erase it.
        </Banner>
      )}

      <div className="grid gap-4 laptop:grid-cols-[1fr_1fr]">
        <div className="grid gap-4">
          <Card>
            <CardHeader title="Document record" description="Held by DocumentRegistry." />
            <CardBody>
              <dl>
                <DataRow label="Document id">#{d.documentId.toString()}</DataRow>
                <DataRow label="Document type">{documentTypeLabel[d.docType] ?? "—"}</DataRow>
                <DataRow label="Asset">
                  <Link href={`/assets/${d.assetId}`} className="text-accent hover:underline">
                    #{d.assetId.toString()}
                  </Link>
                </DataRow>
                <DataRow label="Hash">
                  <HashDisplay hash={d.documentHash} />
                </DataRow>
                <DataRow label="Issuer">
                  {d.issuerOrgId > 0n ? (
                    <Link
                      href={`/organizations/${d.issuerOrgId}`}
                      className="text-accent hover:underline"
                    >
                      Organization #{d.issuerOrgId.toString()}
                    </Link>
                  ) : (
                    "Asset owner, acting personally"
                  )}
                </DataRow>
                {issuer && (
                  <DataRow label="Issuer standing now">
                    <span className={issuer.isVerified ? "" : "text-blocked"}>
                      {organizationStatusLabel[issuer.status] ?? "—"}
                    </span>
                  </DataRow>
                )}
                <DataRow label="Issued (claimed)">{formatDate(d.issuedAt)}</DataRow>
                <DataRow label="Registered (witnessed)">
                  {provenance?.witnessedAt ? (
                    formatDateTime(provenance.witnessedAt)
                  ) : (
                    <span className="text-ink-3">not recovered</span>
                  )}
                </DataRow>
                <DataRow label="Status">{documentStatusLabel[d.status] ?? "—"}</DataRow>
              </dl>

              <p className="mt-3 text-2xs leading-relaxed text-ink-3">
                <strong className="text-ink">Two different dates.</strong> The issuance date
                is supplied by whoever registered the document, and the protocol checks only
                that it is not in the future — backdating is visible, not prevented. The
                registration date is the block the write landed in, and is the only one the
                chain witnessed.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Verification status"
              description="What this record does and does not assert."
            />
            <CardBody className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <StateChip tone={TONE[d.status] ?? "neutral"}>
                  {documentStatusLabel[d.status] ?? "—"} on-chain
                </StateChip>
                <Badge variant="outline">Hash check available below</Badge>
              </div>
              <p className="max-w-[70ch] text-xs leading-relaxed text-ink-2">
                A document has no &ldquo;verified&rdquo; flag, and the protocol deliberately
                does not offer one. What exists is the lifecycle status above — whether the
                assertion still stands — and the hash comparison below, which tests whether a
                file you hold is the one that was committed to.
              </p>
              <NonClaim variant="attestation" display="block" />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Off-chain location"
              description="A pointer only. The protocol stores no document contents."
            />
            <CardBody>
              {d.uri ? (
                <>
                  <p className="break-all font-mono text-xs text-ink">{d.uri}</p>
                  <div className="mt-2 flex items-start gap-2 rounded-xs border border-blocked/40 bg-blocked-bg px-2.5 py-2">
                    <FileWarning
                      className="mt-0.5 size-3.5 shrink-0 text-blocked"
                      aria-hidden="true"
                    />
                    <p className="text-2xs leading-relaxed text-ink-2">
                      Supplied by whoever registered the document and not verified by the
                      protocol. Shown as text and deliberately not fetched by this
                      application — following an unverified pointer is how a registry
                      becomes a delivery mechanism.
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink-3">No location recorded.</p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="grid gap-4">
          <HashVerifier
            assetId={d.assetId}
            documentId={d.documentId}
            expectedHash={d.documentHash}
          />

          <ProvenancePanel provenance={provenance} what="registration" />
        </div>
      </div>
    </AppShell>
  );
}
