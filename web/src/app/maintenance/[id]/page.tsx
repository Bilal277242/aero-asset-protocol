"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DataRow } from "@/components/ui/card";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { Banner, ErrorState } from "@/components/data/states";
import { StateChip } from "@/components/protocol/state-chip";
import { NonClaim } from "@/components/protocol/non-claim";
import { BlockStamp, HashDisplay } from "@/components/protocol/chain-value";
import { NetworkGuard } from "@/components/web3/network-guard";
import { ProvenancePanel } from "@/components/records/provenance-panel";
import { useContractRead } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import {
  readDocument,
  readMaintenanceProvenance,
  readMaintenanceRecord,
  readOrgRefs,
} from "@/lib/api/records";
import {
  documentStatusLabel,
  documentTypeLabel,
  maintenanceTypeLabel,
  organizationStatusLabel,
  organizationTypeLabel,
  DocumentStatus,
} from "@/lib/contracts/generated/enums";
import { duration, formatDate, formatDateTime } from "@/lib/utils/time";

const BACKFILL_THRESHOLD = 30 * 86_400;

export default function MaintenanceDetailPage() {
  const params = useParams<{ id: string }>();
  const raw = params?.id ?? "";
  const valid = /^[1-9]\d{0,18}$/.test(raw);
  const recordId = valid ? BigInt(raw) : 0n;

  const account = useAccountState();

  const record = useContractRead(
    ["maintenance", raw],
    async ({ client, book, blockNumber }) => {
      const entry = await readMaintenanceRecord(client, book, recordId, blockNumber);
      if (!entry) return null;

      const [orgs, provenance, document] = await Promise.all([
        readOrgRefs(client, book, [entry.performedByOrgId], blockNumber),
        readMaintenanceProvenance(client, book, recordId, blockNumber),
        entry.documentId > 0n
          ? readDocument(client, book, entry.documentId, blockNumber)
          : Promise.resolve(null),
      ]);

      return {
        entry,
        org: orgs.get(entry.performedByOrgId.toString()) ?? null,
        provenance,
        document,
      };
    },
    { enabled: valid },
  );

  if (!valid) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <ErrorState kind="not-found" title="Not a valid maintenance record id" />
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
          title={record.error?.title ?? "No such maintenance record"}
          cause={record.error?.cause ?? `Nothing is recorded under id ${raw}.`}
          detail={record.error?.detail}
          onRetry={record.refetch}
        />
      </AppShell>
    );
  }

  const { entry: m, org, provenance, document } = record.data;
  const backfilled = m.gapSeconds > BACKFILL_THRESHOLD;

  return (
    <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
      <NetworkGuard />

      <Link
        href="/maintenance"
        className="mb-3 mt-2 inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-accent"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Maintenance
      </Link>

      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-ink">
            {maintenanceTypeLabel[m.mType] ?? "Maintenance"}
          </h1>
          <span className="font-mono text-sm text-ink-3">#{m.recordId.toString()}</span>
          <StateChip tone="neutral" hint="Maintenance records are immutable — there is no lifecycle to be in.">
            <Lock className="size-2.5" aria-hidden="true" />
            Immutable
          </StateChip>
          <Link href={`/assets/${m.assetId}`}>
            <Badge variant="outline">Asset #{m.assetId.toString()}</Badge>
          </Link>
        </div>
        {record.blockNumber !== undefined && (
          <p className="mt-1.5 text-xs text-ink-2">
            <BlockStamp blockNumber={record.blockNumber.toString()} />
          </p>
        )}
      </header>

      {backfilled && (
        <Banner tone="info" title="Backfilled history" className="mb-4">
          This record was written {duration(m.gapSeconds)} after the work it describes was
          claimed to be performed. That is normal and expected — an airframe&rsquo;s existing
          service history is entered when it is onboarded — and it is shown because the gap
          is the reader&rsquo;s to judge, not the protocol&rsquo;s to hide.
        </Banner>
      )}

      <div className="grid gap-4 laptop:grid-cols-[1.15fr_1fr]">
        <div className="grid gap-4">
          <Card>
            <CardHeader title="Maintenance record" description="Held by MaintenanceRegistry." />
            <CardBody>
              <dl>
                <DataRow label="Record id">#{m.recordId.toString()}</DataRow>
                <DataRow label="Maintenance type">{maintenanceTypeLabel[m.mType] ?? "—"}</DataRow>
                <DataRow label="Asset">
                  <Link href={`/assets/${m.assetId}`} className="text-accent hover:underline">
                    #{m.assetId.toString()}
                  </Link>
                </DataRow>
                <DataRow label="Organization">
                  <Link
                    href={`/organizations/${m.performedByOrgId}`}
                    className="text-accent hover:underline"
                  >
                    Organization #{m.performedByOrgId.toString()}
                  </Link>
                </DataRow>
                {org && (
                  <>
                    <DataRow label="Organization type">
                      {organizationTypeLabel[org.orgType] ?? "—"}
                    </DataRow>
                    <DataRow label="Organization standing now">
                      <span className={org.isVerified ? "" : "text-blocked"}>
                        {organizationStatusLabel[org.status] ?? "—"}
                      </span>
                    </DataRow>
                  </>
                )}
                <DataRow label="Issuer (account)">
                  {provenance?.submittedBy ? (
                    <span className="font-mono text-xs" title={provenance.submittedBy}>
                      {provenance.submittedBy.slice(0, 10)}…{provenance.submittedBy.slice(-6)}
                    </span>
                  ) : (
                    <span className="text-ink-3">see transaction panel</span>
                  )}
                </DataRow>
                <DataRow label="Performed (claimed)">{formatDate(m.performedAt)}</DataRow>
                <DataRow label="Recorded (witnessed)">{formatDateTime(m.recordedAt)}</DataRow>
                <DataRow label="Document reference">
                  {m.documentId > 0n ? (
                    <Link
                      href={`/documents/${m.documentId}`}
                      className="text-accent hover:underline"
                    >
                      Document #{m.documentId.toString()}
                    </Link>
                  ) : (
                    "None registered"
                  )}
                </DataRow>
                <DataRow label="Work package commitment">
                  <HashDisplay hash={m.recordHash} />
                </DataRow>
              </dl>

              <p className="mt-3 text-2xs leading-relaxed text-ink-3">
                Organization standing is shown as it is <em>now</em>. Later revocation of the
                organization or its credential does not retroactively invalidate a record
                already written — protocol history is append-only, and rewriting it is the
                one thing a maintenance log must not permit.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Status"
              description="What the contract stores, and what it does not."
            />
            <CardBody className="grid gap-2">
              <div className="flex items-start gap-2 rounded border border-rule bg-sunken p-3">
                <Lock className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-ink">
                    A maintenance record has no status field
                  </p>
                  <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-ink-2">
                    The struct holds the asset, the organization, the two dates, the type,
                    the document reference and the commitment — and nothing else. There is
                    no edit, no delete and no lifecycle, so there is no state for a record
                    to move through. A correction is a <em>new</em> record referencing this
                    one off-chain. Any status shown here would have been invented by this
                    interface rather than read from the chain.
                  </p>
                </div>
              </div>
              <p className="max-w-[70ch] text-xs leading-relaxed text-ink-2">
                What can change is the standing of things this record <em>points at</em> — the
                organization above, and the supporting document below. Those are shown
                separately, and neither retroactively invalidates the record.
              </p>
              <NonClaim variant="maintenance" display="block" />
            </CardBody>
          </Card>
        </div>

        <div className="grid gap-4">
          <ProvenancePanel
            provenance={provenance}
            what="recording"
            credentialNote="The credential is emitted, never stored. It pins this record to the exact MAINTENANCE_AUTHORITY credential that authorised it, so an auditor can still identify it after that credential is suspended or revoked."
          />

          <Card>
            <CardHeader title="Supporting document" />
            <CardBody>
              {m.documentId === 0n ? (
                <p className="text-xs leading-relaxed text-ink-2">
                  No supporting document was registered with this record. The document
                  reference is optional — when supplied, the contract requires it to be
                  active and to describe this same asset, which stops evidence being
                  laundered between aircraft.
                </p>
              ) : !document ? (
                <p className="text-xs leading-relaxed text-ink-2">
                  Document #{m.documentId.toString()} could not be read.
                </p>
              ) : (
                <>
                  <dl>
                    <DataRow label="Document">
                      <Link
                        href={`/documents/${document.documentId}`}
                        className="text-accent hover:underline"
                      >
                        {documentTypeLabel[document.docType] ?? "Document"} #
                        {document.documentId.toString()}
                      </Link>
                    </DataRow>
                    <DataRow label="Status now">
                      <StateChip
                        tone={
                          document.status === DocumentStatus.ACTIVE
                            ? "confirmed"
                            : document.status === DocumentStatus.REVOKED
                              ? "adverse"
                              : "neutral"
                        }
                      >
                        {documentStatusLabel[document.status] ?? "—"}
                      </StateChip>
                    </DataRow>
                    <DataRow label="Hash">
                      <HashDisplay hash={document.documentHash} />
                    </DataRow>
                  </dl>

                  {document.status !== DocumentStatus.ACTIVE && (
                    <p className="mt-3 text-2xs leading-relaxed text-ink-3">
                      The document was active when this record cited it — the contract
                      requires that. Its status has changed since. The maintenance record
                      stands regardless.
                    </p>
                  )}

                  <p className="mt-3 text-2xs leading-relaxed text-ink-3">
                    Open the document to check a file you hold against its committed hash.
                  </p>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
