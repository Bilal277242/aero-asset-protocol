"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, FileWarning } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DataRow } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableWrap, THead, TBody, TR, TH, TD, TableCaption } from "@/components/ui/table";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Banner } from "@/components/data/states";
import { StateChip, UnrecordedNote } from "@/components/protocol/state-chip";
import { NonClaim } from "@/components/protocol/non-claim";
import { VerificationNotice } from "@/components/protocol/verification-notice";
import { AddressDisplay, BlockStamp, HashDisplay } from "@/components/protocol/chain-value";
import { NetworkGuard } from "@/components/web3/network-guard";
import { useContractRead } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import {
  readPassport,
  readInstalledComponents,
  readDocuments,
  readMaintenance,
  readOrgCredentials,
  type PassportView,
} from "@/lib/api/passport";
import { readAssetTimeline } from "@/lib/api/asset-timeline";
import { DEPLOYED_AT_BLOCK, explorerTx } from "@/config/env";
import {
  aircraftCategoryLabel,
  assetKindLabel,
  assetStatusLabel,
  componentKindLabel,
  componentStatusLabel,
  credentialStatusLabel,
  credentialTypeLabel,
  documentStatusLabel,
  documentTypeLabel,
  maintenanceTypeLabel,
  organizationTypeLabel,
  AssetStatus,
} from "@/lib/contracts/generated/enums";
import { bytes32Label } from "@/lib/utils/bytes32";
import { duration, formatDate, formatDateTime, relative } from "@/lib/utils/time";

/**
 * The asset passport — the protocol's flagship record.
 *
 * Structured the way a technical record is read rather than the way the contracts are
 * organised: what it is, whether anyone has attested to it, what it is made of, what has
 * been done to it, what documents exist, and the complete on-chain history underneath.
 *
 * The verification notice sits directly under the header, before anything else, because
 * the single most consequential mistake a reader of this registry can make is inferring
 * airworthiness or legal title from a green badge.
 */
export default function AssetPassportPage() {
  const params = useParams<{ id: string }>();
  const account = useAccountState();
  const raw = params?.id ?? "";
  const valid = /^[1-9]\d{0,20}$/.test(raw);
  const assetId = valid ? BigInt(raw) : 0n;

  const passport = useContractRead(
    ["asset", raw, "passport"],
    async ({ client, book, blockNumber }) => {
      const block = await client.getBlock({ blockNumber });
      return readPassport(client, book, assetId, blockNumber, block.timestamp);
    },
    { enabled: valid },
  );

  const components = useContractRead(
    ["asset", raw, "components"],
    ({ client, book, blockNumber }) => readInstalledComponents(client, book, assetId, blockNumber),
    { enabled: valid },
  );

  const documents = useContractRead(
    ["asset", raw, "documents"],
    ({ client, book, blockNumber }) => readDocuments(client, book, assetId, blockNumber),
    { enabled: valid },
  );

  const maintenance = useContractRead(
    ["asset", raw, "maintenance"],
    ({ client, book, blockNumber }) => readMaintenance(client, book, assetId, blockNumber),
    { enabled: valid },
  );

  const orgIds = React.useMemo(() => {
    const p = passport.data;
    return p ? [p.registrarOrgId, p.verifierOrgId] : [];
  }, [passport.data]);

  const credentials = useContractRead(
    ["asset", raw, "credentials", orgIds.map(String).join(",")],
    ({ client, book, blockNumber }) => readOrgCredentials(client, book, orgIds, blockNumber),
    { enabled: valid && orgIds.length > 0 },
  );

  const timeline = useContractRead(
    ["asset", raw, "timeline"],
    ({ client, book, blockNumber }) =>
      readAssetTimeline(client, book, assetId, DEPLOYED_AT_BLOCK, blockNumber),
    { enabled: valid, staleTime: 30_000 },
  );

  if (!valid) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <ErrorState
          kind="not-found"
          title="Not a valid asset id"
          cause="Asset ids are whole numbers starting at 1."
          remedy="Check the link, or browse the register."
        />
      </AppShell>
    );
  }

  if (passport.isLoading) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <RecordSkeleton rows={8} />
      </AppShell>
    );
  }

  if (passport.isError) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <ErrorState
          kind={passport.error?.tone === "infrastructure" ? "infrastructure" : "protocol"}
          title={passport.error?.title ?? "Could not load this passport"}
          cause={passport.error?.cause}
          remedy={passport.error?.remedy}
          detail={passport.error?.detail}
          onRetry={passport.refetch}
        />
      </AppShell>
    );
  }

  const p = passport.data;
  if (!p) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <ErrorState
          kind="not-found"
          title="No such asset"
          cause={`Nothing is registered under id ${raw}.`}
          remedy="Ids are sequential from 1. This may also be an id from a different deployment."
        />
      </AppShell>
    );
  }

  const title = p.aircraft
    ? bytes32Label(p.aircraft.model, `Asset #${p.assetId}`)
    : p.component
      ? bytes32Label(p.component.partNumber, `Asset #${p.assetId}`)
      : `Asset #${p.assetId}`;

  return (
    <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
      <NetworkGuard />

      <Link
        href="/assets"
        className="mb-3 mt-2 inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-accent"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Asset register
      </Link>

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-ink">{title}</h1>
          <span className="font-mono text-sm text-ink-3">ASSET #{p.assetId.toString()}</span>
          <Badge>{assetKindLabel[p.kind] ?? "Unknown"}</Badge>
          <StateChip tone={p.isTerminal ? "adverse" : "neutral"}>
            {assetStatusLabel[p.status] ?? "Unknown"}
          </StateChip>
          {p.verified ? (
            <StateChip tone="confirmed">Attested</StateChip>
          ) : (
            <StateChip tone="blocked">Not attested</StateChip>
          )}
          {p.activeListingId && (
            <StateChip tone="confirmed">Listed #{p.activeListingId.toString()}</StateChip>
          )}
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <span>Owned by</span>
          <AddressDisplay address={p.owner} />
          <span>since {formatDate(p.ownedSince)}</span>
          <span className="text-ink-3">·</span>
          <BlockStamp blockNumber={p.blockNumber.toString()} />
        </p>
      </header>

      {/* ── The distinction that matters most ───────────────────── */}
      <VerificationNotice
        verified={p.verified}
        verifiedAt={p.verifiedAt}
        verifierOrgId={p.verifierOrgId}
        verifierVerified={p.orgs.verifier?.verified ?? null}
        className="mb-4"
      />

      <TransferBanner passport={p} />

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <Tabs defaultValue="identity">
        <TabsList>
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="components" count={Number(p.counts.components)}>
            Components
          </TabsTrigger>
          <TabsTrigger value="maintenance" count={Number(p.counts.maintenance)}>
            Maintenance
          </TabsTrigger>
          <TabsTrigger value="documents" count={Number(p.counts.documents)}>
            Documents
          </TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="ownership">Ownership</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* ── Identity ──────────────────────────────────────────── */}
        <TabsContent value="identity">
          <div className="grid gap-4 laptop:grid-cols-2">
            <Card>
              <CardHeader title="Registry record" description="Held by AssetRegistry." />
              <CardBody>
                <dl>
                  <DataRow label="Asset id">#{p.assetId.toString()}</DataRow>
                  <DataRow label="Type">{assetKindLabel[p.kind] ?? "Unknown"}</DataRow>
                  <DataRow label="Operational status">
                    {assetStatusLabel[p.status] ?? "Unknown"}
                  </DataRow>
                  <DataRow label="Registered">{formatDate(p.registeredAt)}</DataRow>
                  <DataRow label="Registered by">
                    Organization #{p.registrarOrgId.toString()}
                    {p.orgs.registrar && (
                      <span className={p.orgs.registrar.verified ? "" : " text-blocked"}>
                        {" "}
                        ({organizationTypeLabel[p.orgs.registrar.orgType] ?? "unknown type"} ·{" "}
                        {p.orgs.registrar.verified ? "verified" : "not currently verified"})
                      </span>
                    )}
                  </DataRow>
                  <DataRow label="Serial commitment">
                    <HashDisplay hash={p.serialNumberHash} />
                  </DataRow>
                  <DataRow label="Metadata commitment">
                    <HashDisplay hash={p.metadataHash} />
                  </DataRow>
                </dl>
                <p className="mt-3 text-2xs leading-relaxed text-ink-3">
                  Serial numbers are stored as salted commitments, never in the clear.
                  Anyone holding the value and the salt can reproduce the hash and confirm
                  this record refers to the asset they mean.
                </p>
              </CardBody>
            </Card>

            {p.aircraft && (
              <Card>
                <CardHeader title="Airframe" description="Held by AircraftRegistry." />
                <CardBody>
                  <dl>
                    <DataRow label="Model">{bytes32Label(p.aircraft.model)}</DataRow>
                    <DataRow label="Manufacturer">
                      {bytes32Label(p.aircraft.manufacturerName)}
                      {p.aircraft.manufacturerOrgId > 0n &&
                        ` (organization #${p.aircraft.manufacturerOrgId.toString()})`}
                    </DataRow>
                    <DataRow label="Year of manufacture">
                      {p.aircraft.manufactureYear || "—"}
                    </DataRow>
                    <DataRow label="Category">
                      {aircraftCategoryLabel[p.aircraft.category] ?? "—"}
                    </DataRow>
                    <DataRow label="Registration mark">
                      <HashDisplay hash={p.aircraft.registrationMarkHash} />
                    </DataRow>
                  </dl>
                  <p className="mt-3 text-2xs leading-relaxed text-ink-3">
                    Manufacturer, year and serial are immutable after registration. Model,
                    category and registration mark can be corrected by the owner.
                  </p>
                </CardBody>
              </Card>
            )}

            {p.component && (
              <Card>
                <CardHeader title="Component" description="Held by ComponentRegistry." />
                <CardBody>
                  <dl>
                    <DataRow label="Part number">{bytes32Label(p.component.partNumber)}</DataRow>
                    <DataRow label="Component type">
                      {componentKindLabel[p.component.kind] ?? "—"}
                    </DataRow>
                    <DataRow label="Installation state">
                      {componentStatusLabel[p.component.status] ?? "—"}
                    </DataRow>
                    <DataRow label="Fitted to">
                      {p.component.isInstalled ? (
                        <Link
                          href={`/assets/${p.component.parentAssetId}`}
                          className="text-accent hover:underline"
                        >
                          Asset #{p.component.parentAssetId.toString()} · position{" "}
                          {p.component.position}
                        </Link>
                      ) : (
                        "Not installed"
                      )}
                    </DataRow>
                    {p.component.installedAt > 0 && (
                      <DataRow label="Installed">{formatDate(p.component.installedAt)}</DataRow>
                    )}
                    {p.component.removedAt > 0 && (
                      <DataRow label="Last removed">{formatDate(p.component.removedAt)}</DataRow>
                    )}
                  </dl>
                  {p.component.isInstalled && (
                    <p className="mt-3 text-2xs leading-relaxed text-blocked">
                      An installed component cannot be listed for sale. Selling it in place
                      would leave the airframe claiming parts its owner does not own.
                    </p>
                  )}
                </CardBody>
              </Card>
            )}

            <Card className={p.aircraft || p.component ? "laptop:col-span-2" : ""}>
              <CardHeader
                title="Off-chain metadata"
                description="A location only. The protocol stores no document contents."
              />
              <CardBody>
                {p.metadataURI ? (
                  <>
                    <p className="break-all font-mono text-xs text-ink">{p.metadataURI}</p>
                    <div className="mt-2 flex items-start gap-2 rounded-xs border border-blocked/40 bg-blocked-bg px-2.5 py-2">
                      <FileWarning className="mt-0.5 size-3.5 shrink-0 text-blocked" aria-hidden="true" />
                      <p className="text-2xs leading-relaxed text-ink-2">
                        This URI is supplied by whoever registered the asset and is not
                        verified by the protocol. It is shown as text and deliberately not
                        fetched by this application — retrieving arbitrary user-supplied
                        locations from this origin would be a security surface for no
                        benefit.
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-ink-3">No metadata location recorded.</p>
                )}
              </CardBody>
            </Card>
          </div>
        </TabsContent>

        {/* ── Components ────────────────────────────────────────── */}
        <TabsContent value="components">
          {p.kind !== 1 && !p.aircraft ? (
            <EmptyState
              title="Components attach to airframes"
              description="Only an aircraft carries installed components. This record is itself a component or a bare asset."
            />
          ) : components.isLoading ? (
            <RecordSkeleton rows={4} />
          ) : components.isError ? (
            <ErrorState
              kind="protocol"
              title={components.error?.title ?? "Could not load components"}
              cause={components.error?.cause}
              onRetry={components.refetch}
            />
          ) : (components.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="Nothing installed"
              description="No components are currently fitted to this airframe."
            />
          ) : (
            <>
              <TableWrap>
                <Table>
                  <TableCaption>Installed components</TableCaption>
                  <THead>
                    <TR>
                      <TH sticky>Asset</TH>
                      <TH>Part number</TH>
                      <TH>Type</TH>
                      <TH>Position</TH>
                      <TH>State</TH>
                      <TH>Installed</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {components.data?.map((c) => (
                      <TR key={c.assetId.toString()}>
                        <TD sticky mono>
                          <Link href={`/assets/${c.assetId}`} className="text-accent hover:underline">
                            #{c.assetId.toString()}
                          </Link>
                        </TD>
                        <TD>{bytes32Label(c.partNumber)}</TD>
                        <TD>{componentKindLabel[c.kind] ?? "—"}</TD>
                        <TD mono>{c.position}</TD>
                        <TD>
                          <StateChip tone={c.status === 2 ? "confirmed" : "neutral"}>
                            {componentStatusLabel[c.status] ?? "—"}
                          </StateChip>
                        </TD>
                        <TD mono>{formatDate(c.installedAt)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
              <p className="mt-2 text-2xs leading-relaxed text-ink-3">
                A component leaves the installed state through any status change, not only
                removal — sending one for repair, quarantining it or scrapping it all
                detach it from the airframe first.
              </p>
            </>
          )}
        </TabsContent>

        {/* ── Maintenance ───────────────────────────────────────── */}
        <TabsContent value="maintenance">
          <div className="mb-3">
            <NonClaim variant="maintenance" display="block" />
          </div>

          {maintenance.isLoading ? (
            <RecordSkeleton rows={4} />
          ) : maintenance.isError ? (
            <ErrorState
              kind="protocol"
              title={maintenance.error?.title ?? "Could not load maintenance"}
              onRetry={maintenance.refetch}
            />
          ) : (maintenance.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="No maintenance recorded"
              description="Recording requires an organization of type MRO holding a valid maintenance-authority credential. Records are append-only and cannot be amended."
            />
          ) : (
            <>
              <TableWrap>
                <Table>
                  <TableCaption>Maintenance records</TableCaption>
                  <THead>
                    <TR>
                      <TH sticky>Record</TH>
                      <TH>Type</TH>
                      <TH>Claimed performed</TH>
                      <TH>Recorded on-chain</TH>
                      <TH numeric>Gap</TH>
                      <TH>By</TH>
                      <TH>Document</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {maintenance.data?.map((m) => {
                      const backdated = m.gapSeconds > 30 * 86_400;
                      return (
                        <TR key={m.recordId.toString()}>
                          <TD sticky mono>#{m.recordId.toString()}</TD>
                          <TD>{maintenanceTypeLabel[m.mType] ?? "—"}</TD>
                          <TD mono>{formatDateTime(m.performedAt)}</TD>
                          <TD mono>{formatDateTime(m.recordedAt)}</TD>
                          <TD numeric className={backdated ? "text-blocked" : undefined}>
                            {m.gapSeconds <= 0 ? "—" : duration(m.gapSeconds)}
                          </TD>
                          <TD mono>Org #{m.performedByOrgId.toString()}</TD>
                          <TD mono>
                            {m.documentId > 0n ? `#${m.documentId.toString()}` : "—"}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </TableWrap>

              <div className="mt-3 rounded border border-rule bg-panel p-3">
                <p className="text-sm font-medium text-ink">
                  Two dates, and only one of them is witnessed
                </p>
                <p className="mt-1 max-w-[80ch] text-xs leading-relaxed text-ink-2">
                  <em>Claimed performed</em> is asserted by the recording organization and
                  the protocol cannot verify it. <em>Recorded on-chain</em> is the
                  protocol&rsquo;s own observation. A large gap is not proof of anything —
                  historical backfill is legitimate — but several records with large gaps
                  written in the same minute is what a fabricated history looks like, and
                  that pattern is only visible because both dates are kept.
                </p>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Documents ─────────────────────────────────────────── */}
        <TabsContent value="documents">
          {documents.isLoading ? (
            <RecordSkeleton rows={4} />
          ) : documents.isError ? (
            <ErrorState
              kind="protocol"
              title={documents.error?.title ?? "Could not load documents"}
              onRetry={documents.refetch}
            />
          ) : (documents.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="No documents registered"
              description="The owner, or an organization acting for itself, can register a document as a hash and a location."
            />
          ) : (
            <>
              <TableWrap>
                <Table>
                  <TableCaption>Registered documents</TableCaption>
                  <THead>
                    <TR>
                      <TH sticky>Doc</TH>
                      <TH>Type</TH>
                      <TH>Issued</TH>
                      <TH>Status</TH>
                      <TH>Issuer</TH>
                      <TH>Integrity commitment</TH>
                      <TH>Location</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {documents.data?.map((d) => (
                      <TR key={d.documentId.toString()}>
                        <TD sticky mono>#{d.documentId.toString()}</TD>
                        <TD>{documentTypeLabel[d.docType] ?? "—"}</TD>
                        <TD mono>{formatDate(d.issuedAt)}</TD>
                        <TD>
                          <StateChip
                            tone={d.status === 1 ? "confirmed" : d.status === 3 ? "adverse" : "neutral"}
                          >
                            {documentStatusLabel[d.status] ?? "—"}
                          </StateChip>
                          {d.supersededById > 0n && (
                            <span className="ml-1 font-mono text-2xs text-ink-3">
                              → #{d.supersededById.toString()}
                            </span>
                          )}
                        </TD>
                        <TD mono>
                          {d.issuerOrgId > 0n ? `Org #${d.issuerOrgId.toString()}` : "Owner"}
                        </TD>
                        <TD>
                          <HashDisplay hash={d.documentHash} />
                        </TD>
                        <TD className="max-w-[220px] break-all font-mono text-2xs text-ink-3">
                          {d.uri ?? "—"}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>

              <div className="mt-3 grid gap-2 laptop:grid-cols-2">
                <div className="rounded border border-rule bg-panel p-3">
                  <p className="text-sm font-medium text-ink">What the commitment proves</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-2">
                    Each hash is a <code className="font-mono text-2xs">keccak256</code>{" "}
                    commitment to the document bytes. Hash a file you hold and compare: a
                    match proves it is byte-identical to what was registered. It proves
                    nothing about whether the document is genuine, current, or issued by the
                    organization named on it.
                  </p>
                </div>
                <div className="rounded border border-blocked/40 bg-blocked-bg p-3">
                  <p className="text-sm font-medium text-ink">Contents are not on-chain</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-2">
                    The protocol stores a hash and a location, never the document itself.
                    Locations are user-supplied and are shown as text rather than fetched by
                    this application. Obtaining a document is a matter between you and
                    whoever holds it.
                  </p>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Credentials ───────────────────────────────────────── */}
        <TabsContent value="credentials">
          <Banner tone="info" title="Credentials belong to organizations, not assets" className="mb-3">
            An asset never holds a credential. What matters on a passport is whether the
            organizations connected to it are authorised — so these are the currently valid
            credentials held by the organizations that registered and attested to this
            record.
          </Banner>

          {credentials.isLoading ? (
            <RecordSkeleton rows={3} />
          ) : credentials.isError ? (
            <ErrorState
              kind="protocol"
              title={credentials.error?.title ?? "Could not load credentials"}
              onRetry={credentials.refetch}
            />
          ) : (credentials.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="No valid credentials"
              description="Neither the registering nor the attesting organization currently holds a valid aviation credential. Credentials are issued by an account holding the credential-issuer role."
            />
          ) : (
            <TableWrap>
              <Table>
                <TableCaption>Credentials held by connected organizations</TableCaption>
                <THead>
                  <TR>
                    <TH sticky>Credential</TH>
                    <TH>Type</TH>
                    <TH>Held by</TH>
                    <TH>Issued by</TH>
                    <TH>Issued</TH>
                    <TH>Expires</TH>
                    <TH>State</TH>
                  </TR>
                </THead>
                <TBody>
                  {credentials.data?.map((c) => (
                    <TR key={c.credentialId.toString()}>
                      <TD sticky mono>#{c.credentialId.toString()}</TD>
                      <TD>{credentialTypeLabel[c.credType] ?? "—"}</TD>
                      <TD mono>Org #{c.subjectOrgId.toString()}</TD>
                      <TD mono>Org #{c.issuerOrgId.toString()}</TD>
                      <TD mono>{formatDate(c.issuedAt)}</TD>
                      <TD mono>{c.expiresAt === 0 ? "no expiry" : formatDate(c.expiresAt)}</TD>
                      <TD>
                        <StateChip tone={c.isValid ? "confirmed" : "blocked"}>
                          {c.isValid ? "Valid" : (credentialStatusLabel[c.status] ?? "Not valid")}
                        </StateChip>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}

          <div className="mt-3">
            <NonClaim variant="attestation" display="block" />
          </div>
        </TabsContent>

        {/* ── Ownership ─────────────────────────────────────────── */}
        <TabsContent value="ownership">
          <div className="grid gap-4 laptop:grid-cols-2">
            <Card>
              <CardHeader title="Current ownership" description="Held by AssetOwnership." />
              <CardBody>
                <dl>
                  <DataRow label="Owner">
                    <AddressDisplay address={p.owner} />
                  </DataRow>
                  <DataRow label="Held since">{formatDate(p.ownedSince)}</DataRow>
                  <DataRow label="Transferable">
                    <TransferStateLabel passport={p} />
                  </DataRow>
                  <DataRow label="Active listing">
                    {p.activeListingId ? (
                      <Link href="/marketplace" className="text-accent hover:underline">
                        Listing #{p.activeListingId.toString()}
                      </Link>
                    ) : (
                      "Not listed"
                    )}
                  </DataRow>
                </dl>
                <div className="mt-3">
                  <NonClaim variant="title" display="block" />
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Ownership history"
                description="Reconstructed from transfer events."
              />
              <CardBody>
                {timeline.isLoading ? (
                  <RecordSkeleton rows={3} />
                ) : (
                  <OwnershipHistory entries={timeline.data ?? []} />
                )}
              </CardBody>
            </Card>
          </div>
        </TabsContent>

        {/* ── Activity ──────────────────────────────────────────── */}
        <TabsContent value="activity">
          {timeline.isLoading ? (
            <RecordSkeleton rows={6} />
          ) : timeline.isError ? (
            <ErrorState
              kind={timeline.error?.tone === "infrastructure" ? "infrastructure" : "protocol"}
              title={timeline.error?.title ?? "Could not load the history"}
              cause={timeline.error?.cause}
              onRetry={timeline.refetch}
            />
          ) : (timeline.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="No recorded events"
              description="No protocol events reference this asset in the scanned range."
            />
          ) : (
            <>
              <ol className="grid gap-px overflow-hidden rounded border border-rule bg-rule">
                {timeline.data?.map((e) => (
                  <li key={e.id} className="bg-panel p-3">
                    <div className="flex flex-col gap-1 tablet:flex-row tablet:items-baseline tablet:gap-4">
                      <span className="w-28 shrink-0">
                        <StateChip tone={toneFor(e.kind)}>{e.kind}</StateChip>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">{e.title}</span>
                        {e.detail && (
                          <span className="block text-xs text-ink-2">{e.detail}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-left tablet:text-right">
                        <a
                          href={explorerTx(e.txHash)}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 font-mono text-2xs text-ink-3 hover:text-accent"
                        >
                          block {e.blockNumber.toString()}
                          <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                        {e.timestamp !== null && (
                          <span className="block font-mono text-2xs text-ink-3">
                            {formatDateTime(e.timestamp)}
                          </span>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-2 font-mono text-2xs text-ink-3">
                scanned from block {DEPLOYED_AT_BLOCK.toString()} · {timeline.data?.length}{" "}
                events reference this asset
              </p>
            </>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function toneFor(kind: string) {
  if (kind === "verification") return "confirmed" as const;
  if (kind === "lock" || kind === "market") return "blocked" as const;
  if (kind === "ownership") return "unrecorded" as const;
  return "neutral" as const;
}

function TransferStateLabel({ passport }: { passport: PassportView }) {
  const t = passport.transfer;
  switch (t.kind) {
    case "free":
      return <span className="text-confirmed">Yes</span>;
    case "frozen":
      return (
        <span className="text-adverse">
          Frozen — the asset is {(assetStatusLabel[passport.status] ?? "terminal").toLowerCase()}
        </span>
      );
    case "locked":
      return (
        <span className="text-blocked">
          Locked by settlement <AddressDisplay address={t.by} />
        </span>
      );
    case "pending":
      return (
        <span className="text-blocked">
          Transfer offered to <AddressDisplay address={t.to} />, expires{" "}
          {relative(t.expiresAt, Math.floor(Date.now() / 1000))}
        </span>
      );
    case "offerExpired":
      return (
        <span className="text-unrecorded">
          Yes — an offer to <AddressDisplay address={t.to} /> expired and can no longer be
          accepted, though the record still holds it
        </span>
      );
  }
}

function TransferBanner({ passport }: { passport: PassportView }) {
  const t = passport.transfer;

  if (t.kind === "offerExpired") {
    return (
      <div className="mb-4 rounded border border-unrecorded/40 bg-unrecorded-bg p-3">
        <UnrecordedNote
          what={`A direct transfer offer to ${t.to.slice(0, 6)}…${t.to.slice(-4)} passed its deadline. Nothing clears the pending-owner field, so the record still shows an offer that acceptTransfer would now refuse.`}
        />
      </div>
    );
  }

  if (t.kind === "locked") {
    return (
      <Banner tone="warning" title="A settlement is holding this asset" className="mb-4">
        An escrow contract holds the transfer lock, so ownership cannot move by any other
        route until that trade settles, is cancelled, or times out.
      </Banner>
    );
  }

  if (passport.status === AssetStatus.DESTROYED || passport.status === AssetStatus.RETIRED) {
    return (
      <Banner tone="critical" title="This asset holds a terminal status" className="mb-4">
        Transfers are frozen. A retired asset can be returned to service by its owner; a
        destroyed one requires a timelocked governance action.
      </Banner>
    );
  }

  return null;
}

/** Ownership history, filtered out of the full event history. */
function OwnershipHistory({
  entries,
}: {
  entries: { id: string; kind: string; title: string; detail: string; blockNumber: bigint; timestamp: number | null; txHash: `0x${string}` }[];
}) {
  const owners = entries.filter((e) => e.kind === "ownership");

  if (owners.length === 0) {
    return (
      <p className="text-sm text-ink-3">
        No ownership events found in the scanned range.
      </p>
    );
  }

  return (
    <ol className="grid gap-2">
      {owners.map((e) => (
        <li key={e.id} className="border-b border-rule-2 pb-2 last:border-0">
          <p className="text-sm text-ink">{e.title}</p>
          <p className="font-mono text-2xs text-ink-2">{e.detail}</p>
          <a
            href={explorerTx(e.txHash)}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-2xs text-ink-3 hover:text-accent"
          >
            {e.timestamp !== null ? formatDateTime(e.timestamp) : `block ${e.blockNumber}`}
          </a>
        </li>
      ))}
    </ol>
  );
}
