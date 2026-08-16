"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DataRow } from "@/components/ui/card";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { Banner, ErrorState } from "@/components/data/states";
import { StateChip, UnrecordedNote } from "@/components/protocol/state-chip";
import { NonClaim } from "@/components/protocol/non-claim";
import { AddressDisplay, BlockStamp, HashDisplay } from "@/components/protocol/chain-value";
import { NetworkGuard } from "@/components/web3/network-guard";
import { IdentityActionButton } from "@/components/identity/identity-action-button";
import { useContractRead } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import { useRoles } from "@/hooks/useRoles";
import { readCredential, readOrganization } from "@/lib/api/identity";
import { readAssetsPaused } from "@/lib/api/market";
import { deriveCredentialActions } from "@/lib/api/identity-actions";
import { credentialWrites } from "@/lib/api/identity-writes";
import {
  credentialStatusLabel,
  credentialTypeLabel,
  organizationStatusLabel,
  CredentialStatus,
} from "@/lib/contracts/generated/enums";
import { formatDate, formatDateTime, relative } from "@/lib/utils/time";

export default function CredentialDetailPage() {
  const params = useParams<{ id: string }>();
  const raw = params?.id ?? "";
  const valid = /^[1-9]\d{0,18}$/.test(raw);
  const credentialId = valid ? BigInt(raw) : 0n;

  const account = useAccountState();
  const { viewer, roles } = useRoles();

  const credential = useContractRead(
    ["credentials", raw],
    async ({ client, book, blockNumber }) => {
      const block = await client.getBlock({ blockNumber });
      const record = await readCredential(client, book, credentialId, blockNumber, block.timestamp);
      if (!record) return null;

      const [subjectOrg, issuerOrg, paused] = await Promise.all([
        record.subjectOrgId > 0n
          ? readOrganization(client, book, record.subjectOrgId, blockNumber)
          : Promise.resolve(null),
        record.issuerOrgId > 0n
          ? readOrganization(client, book, record.issuerOrgId, blockNumber)
          : Promise.resolve(null),
        readAssetsPaused(client, book, blockNumber),
      ]);

      return { record, subjectOrg, issuerOrg, paused, now: block.timestamp };
    },
    { enabled: valid },
  );

  if (!valid) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <ErrorState kind="not-found" title="Not a valid credential id" />
      </AppShell>
    );
  }

  if (credential.isLoading) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <RecordSkeleton rows={7} />
      </AppShell>
    );
  }

  if (credential.isError || !credential.data) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <ErrorState
          kind={credential.error?.tone === "infrastructure" ? "infrastructure" : "not-found"}
          title={credential.error?.title ?? "No such credential"}
          cause={credential.error?.cause ?? `Nothing is recorded under id ${raw}.`}
          detail={credential.error?.detail}
          onRetry={credential.refetch}
        />
      </AppShell>
    );
  }

  const { record: c, subjectOrg, issuerOrg, paused, now } = credential.data;
  const actions = deriveCredentialActions(c, viewer, paused, now).filter((a) => a.visible);

  return (
    <AppShell standing={{ connected: account.isConnected, hasOperations: roles.CREDENTIAL_ISSUER }}>
      <NetworkGuard />

      <Link
        href="/credentials"
        className="mb-3 mt-2 inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-accent"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Credentials
      </Link>

      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-ink">
            {credentialTypeLabel[c.credType] ?? "Credential"}
          </h1>
          <span className="font-mono text-sm text-ink-3">#{c.credentialId.toString()}</span>
          <StateChip tone={c.isValid ? "confirmed" : c.isLapsed ? "unrecorded" : "blocked"}>
            {c.isValid ? "Valid" : c.isLapsed ? "Lapsed" : (credentialStatusLabel[c.status] ?? "—")}
          </StateChip>
          <Badge variant="outline">{credentialStatusLabel[c.status] ?? "—"} on-chain</Badge>
        </div>
        {credential.blockNumber !== undefined && (
          <p className="mt-1.5 text-xs text-ink-2">
            <BlockStamp blockNumber={credential.blockNumber.toString()} />
          </p>
        )}
      </header>

      {c.isLapsed && (
        <div className="mb-4 rounded border border-unrecorded/40 bg-unrecorded-bg p-3">
          <UnrecordedNote
            what={`This credential expired on ${formatDate(c.expiresAt)}, but the stored status still reads ACTIVE because recording the lapse costs gas.`}
          />
          <p className="mt-2 max-w-[80ch] text-xs leading-relaxed text-ink-2">
            It is already treated as invalid everywhere the protocol checks —{" "}
            <code className="font-mono text-2xs">isValid</code> computes status <em>and</em>{" "}
            expiry — so nothing is authorised by it. Recording the lapse only makes the
            stored field agree.
          </p>
        </div>
      )}

      {c.status === CredentialStatus.SUSPENDED && (
        <Banner tone="warning" title="Suspended" className="mb-4">
          Not valid while suspended. An issuer can reinstate it — unless its deadline passes
          first, after which reinstatement is refused and a new credential must be issued.
        </Banner>
      )}

      {c.status === CredentialStatus.REVOKED && (
        <Banner tone="critical" title="Revoked — terminal" className="mb-4">
          A revoked credential can never become valid again. Reissuance means a new
          credential with a new id, never a resurrection of this one.
        </Banner>
      )}

      <div className="grid gap-4 laptop:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Credential record" description="Held by CredentialRegistry." />
          <CardBody>
            <dl>
              <DataRow label="Credential id">#{c.credentialId.toString()}</DataRow>
              <DataRow label="Type">{credentialTypeLabel[c.credType] ?? "—"}</DataRow>
              <DataRow label="Stored status">
                {credentialStatusLabel[c.status] ?? "—"}
              </DataRow>
              <DataRow label="Valid now">
                <span className={c.isValid ? "text-confirmed" : "text-blocked"}>
                  {c.isValid ? "Yes" : "No"}
                </span>
              </DataRow>
              <DataRow label="Subject">
                {c.subjectOrgId > 0n ? (
                  <Link
                    href={`/organizations/${c.subjectOrgId}`}
                    className="text-accent hover:underline"
                  >
                    Organization #{c.subjectOrgId.toString()}
                  </Link>
                ) : (
                  <AddressDisplay address={c.subject} />
                )}
              </DataRow>
              {subjectOrg && (
                <DataRow label="Subject standing now">
                  <span className={subjectOrg.isVerified ? "" : "text-blocked"}>
                    {organizationStatusLabel[subjectOrg.status] ?? "—"}
                  </span>
                </DataRow>
              )}
              <DataRow label="Issuer">
                {c.issuerOrgId > 0n ? (
                  <Link
                    href={`/organizations/${c.issuerOrgId}`}
                    className="text-accent hover:underline"
                  >
                    Organization #{c.issuerOrgId.toString()}
                  </Link>
                ) : (
                  "Protocol-issued"
                )}
              </DataRow>
              {issuerOrg && (
                <DataRow label="Issuer standing now">
                  <span className={issuerOrg.isVerified ? "" : "text-blocked"}>
                    {organizationStatusLabel[issuerOrg.status] ?? "—"}
                  </span>
                </DataRow>
              )}
              <DataRow label="Issued">{formatDateTime(c.issuedAt)}</DataRow>
              <DataRow label="Expires">
                {c.expiresAt === 0 ? (
                  "Never"
                ) : (
                  <>
                    {formatDateTime(c.expiresAt)}{" "}
                    <span className="text-ink-3">({relative(c.expiresAt, Number(now))})</span>
                  </>
                )}
              </DataRow>
              <DataRow label="Reference commitment">
                <HashDisplay hash={c.credentialHash} />
              </DataRow>
            </dl>

            <p className="mt-3 text-2xs leading-relaxed text-ink-3">
              Organization standing is shown as it is <em>now</em>, not as it was at
              issuance. The contract validates the subject at issuance only — an
              organization revoked later does not retroactively invalidate credentials it
              was issued, because protocol history is append-only. Consumers re-check
              standing at use time, and so should you.
            </p>
          </CardBody>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader
              title="Actions"
              description="Only what the connected account is authorised to attempt."
            />
            <CardBody className="grid gap-3">
              {actions.length === 0 ? (
                <p className="text-xs leading-relaxed text-ink-2">
                  Nothing here is available to you. Credential lifecycle actions require{" "}
                  <code className="font-mono text-2xs">CREDENTIAL_ISSUER_ROLE</code>;
                  recording a lapse is open to anyone but only once the credential has
                  actually expired.
                </p>
              ) : (
                <div className="flex flex-wrap items-start gap-3">
                  {actions.map((a) => (
                    <IdentityActionButton
                      key={a.id}
                      action={a}
                      build={
                        a.id === "suspendCredential"
                          ? (b) => credentialWrites.suspend(b, c.credentialId)
                          : a.id === "reinstateCredential"
                            ? (b) => credentialWrites.reinstate(b, c.credentialId)
                            : a.id === "revokeCredential"
                              ? (b) => credentialWrites.revoke(b, c.credentialId)
                              : (b) => credentialWrites.expire(b, c.credentialId)
                      }
                      onDone={() => credential.refetch()}
                    />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="What this credential means" />
            <CardBody className="grid gap-2">
              <NonClaim variant="attestation" display="block" />
              <p className="text-xs leading-relaxed text-ink-2">
                A credential records that an account holding{" "}
                <code className="font-mono text-2xs">CREDENTIAL_ISSUER_ROLE</code> attested
                something at a point in time. It is not an approval, certificate or
                authorization issued by any civil aviation authority.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
