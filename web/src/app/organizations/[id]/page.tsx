"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileWarning } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DataRow } from "@/components/ui/card";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { Banner, EmptyState, ErrorState } from "@/components/data/states";
import { StateChip } from "@/components/protocol/state-chip";
import { NonClaim } from "@/components/protocol/non-claim";
import { AddressDisplay, BlockStamp, HashDisplay } from "@/components/protocol/chain-value";
import { NetworkGuard } from "@/components/web3/network-guard";
import { IdentityActionButton } from "@/components/identity/identity-action-button";
import { UpdateOrganizationDialog } from "@/components/identity/update-organization-dialog";
import { OperatorsDialog } from "@/components/identity/operators-dialog";
import { TransferAdminDialog } from "@/components/identity/transfer-admin-dialog";
import { ActingForCheck } from "@/components/identity/acting-for-check";
import { useContractRead } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import { useRoles } from "@/hooks/useRoles";
import { readOrganization, readCredentialIndex } from "@/lib/api/identity";
import { readAssetsPaused } from "@/lib/api/market";
import { deriveOrgActions } from "@/lib/api/identity-actions";
import { orgWrites } from "@/lib/api/identity-writes";
import type { WriteRequest } from "@/lib/api/writes";
import type { AddressBook } from "@/lib/contracts/addressBook";
import {
  credentialTypeLabel,
  organizationStatusLabel,
  organizationTypeLabel,
  OrganizationStatus,
} from "@/lib/contracts/generated/enums";
import { formatDate } from "@/lib/utils/time";
import { explorerAddress } from "@/config/env";

const TONE: Record<number, "confirmed" | "blocked" | "adverse" | "neutral"> = {
  [OrganizationStatus.PENDING]: "blocked",
  [OrganizationStatus.VERIFIED]: "confirmed",
  [OrganizationStatus.SUSPENDED]: "blocked",
  [OrganizationStatus.REVOKED]: "adverse",
};

/**
 * The write behind each action id, or `undefined` for the three that collect input first
 * and are handled by their own dialog.
 */
function buildOrgWrite(
  id: string,
  orgId: bigint,
): ((book: AddressBook) => WriteRequest) | undefined {
  switch (id) {
    case "verifyOrganization":
      return (b) => orgWrites.verify(b, orgId);
    case "rejectOrganization":
      return (b) => orgWrites.reject(b, orgId);
    case "suspendOrganization":
      return (b) => orgWrites.suspend(b, orgId);
    case "reactivateOrganization":
      return (b) => orgWrites.reactivate(b, orgId);
    case "revokeOrganization":
      return (b) => orgWrites.revoke(b, orgId);
    case "acceptOrganizationAdmin":
      return (b) => orgWrites.acceptAdmin(b, orgId);
    case "cancelOrganizationAdminTransfer":
      return (b) => orgWrites.cancelAdminTransfer(b, orgId);
    default:
      return undefined;
  }
}

export default function OrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const raw = params?.id ?? "";
  const valid = /^[1-9]\d{0,18}$/.test(raw);
  const orgId = valid ? BigInt(raw) : 0n;

  const account = useAccountState();
  const { viewer, roles } = useRoles();
  const [updateOpen, setUpdateOpen] = React.useState(false);
  const [operatorsOpen, setOperatorsOpen] = React.useState(false);
  const [transferOpen, setTransferOpen] = React.useState(false);

  const dialogs: Record<string, (() => void) | undefined> = React.useMemo(
    () => ({
      updateOrganization: () => setUpdateOpen(true),
      setOperator: () => setOperatorsOpen(true),
      transferOrganizationAdmin: () => setTransferOpen(true),
    }),
    [],
  );

  const org = useContractRead(
    ["organizations", raw],
    async ({ client, book, blockNumber }) => {
      const record = await readOrganization(client, book, orgId, blockNumber);
      if (!record) return null;
      const paused = await readAssetsPaused(client, book, blockNumber);
      return { record, paused };
    },
    { enabled: valid },
  );

  // Credentials held by this organization. There is no per-organization index, so the
  // register is walked and filtered.
  const credentials = useContractRead(
    ["credentials", "byOrg", raw],
    async ({ client, book, blockNumber }) => {
      const block = await client.getBlock({ blockNumber });
      const all = await readCredentialIndex(client, book, blockNumber, block.timestamp, 100);
      return all.items.filter((c) => c.subjectOrgId === orgId);
    },
    { enabled: valid, staleTime: 30_000 },
  );

  if (!valid) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <ErrorState kind="not-found" title="Not a valid organization id" />
      </AppShell>
    );
  }

  if (org.isLoading) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <RecordSkeleton rows={7} />
      </AppShell>
    );
  }

  if (org.isError || !org.data) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <ErrorState
          kind={org.error?.tone === "infrastructure" ? "infrastructure" : "not-found"}
          title={org.error?.title ?? "No such organization"}
          cause={org.error?.cause ?? `Nothing is registered under id ${raw}.`}
          detail={org.error?.detail}
          onRetry={org.refetch}
        />
      </AppShell>
    );
  }

  const { record: o, paused } = org.data;
  const actions = deriveOrgActions(o, viewer, paused);
  const visible = actions.filter((a) => a.visible);
  const isAdmin = !!account.address && o.admin.toLowerCase() === account.address.toLowerCase();

  return (
    <AppShell standing={{ connected: account.isConnected, hasOperations: roles.ORG_VERIFIER }}>
      <NetworkGuard />

      <Link
        href="/organizations"
        className="mb-3 mt-2 inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-accent"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Organizations
      </Link>

      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-ink">
            Organization #{o.orgId.toString()}
          </h1>
          <Badge>{organizationTypeLabel[o.orgType] ?? "—"}</Badge>
          <StateChip tone={TONE[o.status] ?? "neutral"}>
            {organizationStatusLabel[o.status] ?? "Unknown"}
          </StateChip>
          {isAdmin && <Badge variant="accent">You are the admin</Badge>}
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <span>Administered by</span>
          <AddressDisplay address={o.admin} explorerUrl={explorerAddress(o.admin)} />
          {org.blockNumber !== undefined && (
            <>
              <span className="text-ink-3">·</span>
              <BlockStamp blockNumber={org.blockNumber.toString()} />
            </>
          )}
        </p>
      </header>

      {o.status === OrganizationStatus.SUSPENDED && (
        <Banner tone="warning" title="Suspended" className="mb-4">
          This organization cannot take protocol actions. Records it created previously —
          assets, documents, maintenance — remain valid: history here is append-only and
          suspension blocks future actions only.
        </Banner>
      )}

      {o.status === OrganizationStatus.REVOKED && (
        <Banner tone="critical" title="Revoked — terminal" className="mb-4">
          Every administrative write is refused on this record, and its name commitment has
          been released for re-registration. The record remains as an audit trail.
        </Banner>
      )}

      {o.pendingAdmin && (
        <Banner tone="info" title="Admin transfer pending" className="mb-4">
          <span className="inline-flex flex-wrap items-center gap-1.5">
            Proposed to <AddressDisplay address={o.pendingAdmin} /> — it takes effect only
            when that account accepts. Either side can cancel until then.
          </span>
        </Banner>
      )}

      <div className="grid gap-4 laptop:grid-cols-[1.2fr_1fr]">
        <div className="grid gap-4">
          <Card>
            <CardHeader title="Registry record" description="Held by OrganizationRegistry." />
            <CardBody>
              <dl>
                <DataRow label="Organization id">#{o.orgId.toString()}</DataRow>
                <DataRow label="Type">{organizationTypeLabel[o.orgType] ?? "—"}</DataRow>
                <DataRow label="Status">
                  {organizationStatusLabel[o.status] ?? "Unknown"}
                </DataRow>
                <DataRow label="Admin">
                  <AddressDisplay address={o.admin} />
                </DataRow>
                <DataRow label="Registered">{formatDate(o.registeredAt)}</DataRow>
                <DataRow label="First verified">
                  {o.verifiedAt === 0 ? "Never" : formatDate(o.verifiedAt)}
                </DataRow>
                <DataRow label="Name commitment">
                  <HashDisplay hash={o.nameHash} />
                </DataRow>
                <DataRow label="Profile commitment">
                  <HashDisplay hash={o.metadataHash} />
                </DataRow>
              </dl>

              <p className="mt-3 text-2xs leading-relaxed text-ink-3">
                <strong className="text-ink">First verified is not current standing.</strong>{" "}
                The contract records only the first verification, so this date survives a
                later suspension. Whether the organization can act now comes from the status
                above — and from <code className="font-mono">isActingFor</code>, which
                requires it to be verified.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={`Credentials (${credentials.data?.length ?? 0})`}
              description="Held by this organization as subject."
            />
            <CardBody>
              {credentials.isLoading ? (
                <RecordSkeleton rows={2} />
              ) : (credentials.data?.length ?? 0) === 0 ? (
                <EmptyState
                  title="No credentials"
                  description="Credentials are issued by an account holding CREDENTIAL_ISSUER_ROLE, and only to a verified organization."
                />
              ) : (
                <ul className="grid gap-2">
                  {credentials.data?.map((c) => (
                    <li
                      key={c.credentialId.toString()}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-rule-2 pb-2 last:border-0"
                    >
                      <span>
                        <Link
                          href={`/credentials/${c.credentialId}`}
                          className="text-sm font-medium text-accent hover:underline"
                        >
                          {credentialTypeLabel[c.credType] ?? "Credential"} #
                          {c.credentialId.toString()}
                        </Link>
                        <span className="block font-mono text-2xs text-ink-3">
                          issued {formatDate(c.issuedAt)} ·{" "}
                          {c.expiresAt === 0 ? "no expiry" : `expires ${formatDate(c.expiresAt)}`}
                        </span>
                      </span>
                      <StateChip tone={c.isValid ? "confirmed" : c.isLapsed ? "unrecorded" : "blocked"}>
                        {c.isValid ? "Valid" : c.isLapsed ? "Lapsed" : "Not valid"}
                      </StateChip>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Off-chain profile"
              description="A location only. The protocol stores no profile contents."
            />
            <CardBody>
              {o.metadataURI ? (
                <>
                  <p className="break-all font-mono text-xs text-ink">{o.metadataURI}</p>
                  <div className="mt-2 flex items-start gap-2 rounded-xs border border-blocked/40 bg-blocked-bg px-2.5 py-2">
                    <FileWarning className="mt-0.5 size-3.5 shrink-0 text-blocked" aria-hidden="true" />
                    <p className="text-2xs leading-relaxed text-ink-2">
                      Supplied by the organization and not verified by the protocol. Shown as
                      text and deliberately not fetched by this application.
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink-3">No profile location recorded.</p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader
              title="Actions"
              description="Only what the connected account is authorised to attempt."
            />
            <CardBody className="grid gap-3">
              {visible.length === 0 ? (
                <p className="text-xs leading-relaxed text-ink-2">
                  You hold no role that permits an action on this organization, and you are
                  not its admin. Verification is performed by an account holding{" "}
                  <code className="font-mono text-2xs">ORG_VERIFIER_ROLE</code>.
                </p>
              ) : (
                <div className="flex flex-wrap items-start gap-3">
                  {visible.map((a) => (
                    <IdentityActionButton
                      key={a.id}
                      action={a}
                      onConfirmDialog={dialogs[a.id]}
                      build={buildOrgWrite(a.id, o.orgId)}
                      onDone={() => org.refetch()}
                    />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <ActingForCheck orgId={o.orgId} />

          <Card>
            <CardHeader title="What a record here means" />
            <CardBody className="grid gap-2">
              <NonClaim variant="attestation" display="block" />
              <p className="text-xs leading-relaxed text-ink-2">
                Suspension and revocation block future actions only. Assets this
                organization registered and maintenance it recorded stay valid —
                retroactively voiding provenance would make the registry useless as an audit
                trail.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      <UpdateOrganizationDialog
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        org={o}
        onUpdated={() => org.refetch()}
      />
      <OperatorsDialog
        open={operatorsOpen}
        onOpenChange={setOperatorsOpen}
        orgId={o.orgId}
        onChanged={() => org.refetch()}
      />
      <TransferAdminDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        orgId={o.orgId}
        currentAdmin={o.admin}
        onProposed={() => org.refetch()}
      />
    </AppShell>
  );
}
