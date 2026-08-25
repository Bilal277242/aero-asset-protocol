"use client";

import * as React from "react";
import { isAddress, type Address } from "viem";
import { ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DataRow } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { Banner, ErrorState } from "@/components/data/states";
import { StateChip } from "@/components/protocol/state-chip";
import { AddressDisplay, BlockStamp } from "@/components/protocol/chain-value";
import { NetworkGuard } from "@/components/web3/network-guard";
import { AdminAction } from "@/components/admin/admin-action";
import { useContractRead } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import { useRoles } from "@/hooks/useRoles";
import {
  markContractHolders,
  readAdminState,
  readPrivilegedActivity,
  type RoleHolders,
} from "@/lib/api/admin";
import { formatDateTime } from "@/lib/utils/time";
import { adminWrites } from "@/lib/api/admin-writes";
import {
  PRIVILEGED_ACTIONS,
  SECTION_LABEL,
  actionsInSection,
  IMMUTABLE_CONTRACTS,
  type AdminSection,
  type PrivilegedAction,
} from "@/lib/api/admin-catalog";
import type { ProtocolRole } from "@/lib/api/role-catalog";
import type { WriteRequest } from "@/lib/api/writes";
import type { AddressBook } from "@/lib/contracts/addressBook";
import { explorerAddress } from "@/config/env";
import { cn } from "@/lib/utils/cn";

type AdminStateData = Awaited<ReturnType<typeof readAdminState>>;

const SECTIONS: AdminSection[] = [
  "organizations",
  "credentials",
  "assets",
  "marketplace",
  "fees",
  "roles",
  "activity",
  "configuration",
];

export default function AdminPage() {
  const account = useAccountState();
  const { roles, isLoading: rolesLoading } = useRoles();
  const [section, setSection] = React.useState<AdminSection>("organizations");

  const state = useContractRead(["admin", "state"], async ({ client, book, blockNumber }) => {
    const base = await readAdminState(client, book, blockNumber);
    return { ...base, roles: await markContractHolders(client, base.roles, blockNumber) };
  });

  const holds = (action: PrivilegedAction) =>
    action.role === "DEFAULT_ADMIN" ? roles.DEFAULT_ADMIN : roles[action.role as ProtocolRole];

  const heldRoles = state.data
    ? state.data.roles.filter((r) => holds({ role: r.role } as PrivilegedAction))
    : [];

  return (
    <AppShell
      standing={{ connected: account.isConnected, hasOperations: heldRoles.length > 0 }}
    >
      <NetworkGuard />

      <header className="mb-5 mt-2">
        <p className="label-key">Operations</p>
        <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight text-ink">
          Administration
        </h1>
        <p className="mt-1 max-w-[80ch] text-sm text-ink-2">
          Every privileged function in the protocol, compiled from the contracts themselves.
          What you can execute is read from <code className="font-mono text-xs">RoleManager</code>{" "}
          for your connected address — never inferred from having reached this page.
        </p>
      </header>

      <Standing
        connected={account.isConnected}
        address={account.address}
        loading={rolesLoading}
        held={heldRoles}
      />

      {state.isLoading ? (
        <RecordSkeleton rows={6} />
      ) : state.isError || !state.data ? (
        <ErrorState
          kind={state.error?.tone === "infrastructure" ? "infrastructure" : "protocol"}
          title={state.error?.title ?? "Could not read protocol state"}
          cause={state.error?.cause}
          detail={state.error?.detail}
          onRetry={state.refetch}
        />
      ) : (
        <>
          <Overview state={state.data} blockNumber={state.blockNumber} />

          {/*
            A horizontally scrollable strip rather than a wrapping block: nine sections
            wrap to three ragged rows on a phone and the page header ends up below the
            fold. `-mx-4 px-4` lets it bleed to the screen edge so the last tab is not
            visually trapped against the padding.
          */}
          <nav
            className="mb-4 mt-6 -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 tablet:mx-0 tablet:flex-wrap tablet:px-0"
            aria-label="Administration sections"
          >
            {SECTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSection(s)}
                aria-current={section === s ? "page" : undefined}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-sm px-3 text-xs",
                  "min-h-10 tablet:min-h-0 tablet:py-1.5",
                  "transition-[box-shadow,color] duration-150",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                  section === s
                    ? "bg-sunken font-medium text-accent shadow-inset-sm"
                    : "bg-panel text-ink-2 shadow-raised-sm hover:text-ink",
                )}
              >
                {SECTION_LABEL[s]}
              </button>
            ))}
          </nav>

          <Section
            section={section}
            state={state.data}
            holds={holds}
            rolesLoading={rolesLoading}
            onDone={() => state.refetch()}
          />
        </>
      )}
    </AppShell>
  );
}

// ───────────────────────────────────────────────────── standing ────

/**
 * What the connected wallet actually is, stated plainly.
 *
 * The default is "not an administrator". Reaching this URL grants nothing, and the page
 * says so rather than implying otherwise by rendering an admin-looking shell.
 */
function Standing({
  connected,
  address,
  loading,
  held,
}: {
  connected: boolean;
  address: Address | undefined;
  loading: boolean;
  held: RoleHolders[];
}) {
  if (!connected) {
    return (
      <Banner tone="info" title="No wallet connected" className="mb-4">
        This page is readable by anyone — the protocol&rsquo;s privileged surface is public
        information. Nothing can be executed without a wallet that holds the relevant role
        on-chain.
      </Banner>
    );
  }

  if (loading) {
    return (
      <Banner tone="info" title="Checking your roles on-chain" className="mb-4">
        Nothing is offered until <code className="font-mono text-2xs">RoleManager</code> has
        answered. A connected wallet is not assumed to be an administrator.
      </Banner>
    );
  }

  if (held.length === 0) {
    return (
      <Banner tone="info" title="You hold no protocol roles" className="mb-4">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <AddressDisplay address={address ?? "0x"} /> holds none of the eleven roles. Every
          action below is listed for reference and none is offered. This is the chain&rsquo;s
          answer, not a UI preference.
        </span>
      </Banner>
    );
  }

  return (
    <div className="mb-4 rounded border border-confirmed/40 bg-confirmed-bg p-3">
      <p className="text-sm font-medium text-ink">
        You hold {held.length} role{held.length === 1 ? "" : "s"}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {held.map((r) => (
          <Badge key={r.role} variant="outline">
            {r.label}
          </Badge>
        ))}
      </div>
      <p className="mt-2 max-w-[80ch] text-2xs leading-relaxed text-ink-2">
        Read from <code className="font-mono">RoleManager.hasRole</code> for your address.
        The contracts re-check on every call — this determines what is offered, never what
        is permitted.
      </p>
    </div>
  );
}

// ───────────────────────────────────────────────────── overview ────

function Overview({
  state,
  blockNumber,
}: {
  state: AdminStateData;
  blockNumber: bigint | undefined;
}) {
  const paused = state.modules.filter((m) => m.paused === true);

  return (
    <>
      {paused.length > 0 && (
        <Banner
          tone="critical"
          title={`${paused.length} module${paused.length === 1 ? " is" : "s are"} paused`}
          className="mb-4"
        >
          {paused.map((m) => m.key).join(", ")}. Unpausing requires PROTOCOL_ADMIN, which is a
          different role from the one that paused — deliberately.
        </Banner>
      )}

      <div className="grid gap-3 tablet:grid-cols-2 laptop:grid-cols-4">
        <Stat label="Organizations" value={state.counts.organizations} />
        <Stat label="Credentials" value={state.counts.credentials} />
        <Stat label="Assets" value={state.counts.assets} />
        <Stat label="Listings" value={state.counts.listings} />
      </div>

      <p className="mt-2 text-2xs text-ink-3">
        {blockNumber !== undefined && <BlockStamp blockNumber={blockNumber.toString()} />}
      </p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-panel shadow-raised p-3">
      <p className="label-key">{label}</p>
      <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

// ────────────────────────────────────────────────────── sections ────

function Section({
  section,
  state,
  holds,
  rolesLoading,
  onDone,
}: {
  section: AdminSection;
  state: AdminStateData;
  holds: (a: PrivilegedAction) => boolean;
  rolesLoading: boolean;
  onDone: () => void;
}) {
  const actions = actionsInSection(section);

  return (
    <div className="grid gap-4">
      {section === "configuration" && <ModuleTable state={state} holds={holds} rolesLoading={rolesLoading} onDone={onDone} />}
      {section === "fees" && <FeePanel state={state} />}
      {section === "roles" && <RoleTable state={state} />}
      {section === "activity" && <ActivityPanel />}
      {section === "marketplace" && (
        <Banner tone="info" title="No wallet-executable administration">
          Every privileged marketplace function is held by <code className="font-mono text-2xs">SETTLEMENT_ROLE</code>,
          which is granted per-trade to a single escrow clone and to no account. Dispute
          resolution lives on each escrow, not here — open the trade to act on it.
        </Banner>
      )}

      <Card>
        <CardHeader
          title={`${SECTION_LABEL[section]} — privileged functions`}
          description="Compiled from the contracts. Listed whether or not you can execute them."
        />
        <CardBody className="grid gap-2.5">
          {actions.length === 0 ? (
            <p className="text-xs text-ink-2">No privileged functions in this section.</p>
          ) : (
            actions.map((action) => (
              <ActionRow
                key={action.id}
                action={action}
                state={state}
                holds={holds}
                rolesLoading={rolesLoading}
                onDone={onDone}
              />
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * One action, with the inputs it needs.
 *
 * Actions taking an id are given a field; actions whose target is chosen elsewhere in the
 * app (a specific organization, a specific credential) are listed with a pointer to where
 * they live, rather than duplicated here with a bare id box that offers no context about
 * what is being acted on.
 */
function ActionRow({
  action,
  state,
  holds,
  rolesLoading,
  onDone,
}: {
  action: PrivilegedAction;
  state: AdminStateData;
  holds: (a: PrivilegedAction) => boolean;
  rolesLoading: boolean;
  onDone: () => void;
}) {
  const [id, setId] = React.useState("");
  const [second, setSecond] = React.useState("");

  const idValid = /^[1-9]\d{0,18}$/.test(id.trim());
  const parsedId = idValid ? BigInt(id.trim()) : 0n;

  if (action.contractOnly) {
    return <AdminAction action={action} holdsRole={false} roleLoading={false} />;
  }

  const build = buildFor(action, { id: parsedId, second, state });

  const needsId = ID_ACTIONS.has(action.id);
  const disabledReason = needsId && !idValid ? "Enter a valid id." : secondInvalid(action, second);

  return (
    <AdminAction
      action={action}
      holdsRole={holds(action)}
      roleLoading={rolesLoading}
      build={build}
      onDone={onDone}
      disabledReason={disabledReason}
    >
      {needsId && (
        <Field label={ID_LABEL[action.id] ?? "Id"} htmlFor={`${action.id}-id`} required>
          <Input
            id={`${action.id}-id`}
            mono
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="1"
            invalid={id.length > 0 && !idValid}
          />
        </Field>
      )}
      {SecondField(action, second, setSecond, state)}
    </AdminAction>
  );
}

const ID_ACTIONS = new Set([
  "verifyOrganization",
  "rejectOrganization",
  "suspendOrganization",
  "reactivateOrganization",
  "revokeOrganization",
  "verifyAsset",
  "unverifyAsset",
  "recoverTerminalAsset",
  "releaseSerialNumberHash",
]);

const ID_LABEL: Record<string, string> = {
  verifyOrganization: "Organization id",
  rejectOrganization: "Organization id",
  suspendOrganization: "Organization id",
  reactivateOrganization: "Organization id",
  revokeOrganization: "Organization id",
  verifyAsset: "Asset id",
  unverifyAsset: "Asset id",
  recoverTerminalAsset: "Asset id",
  releaseSerialNumberHash: "Asset id",
};

function secondInvalid(action: PrivilegedAction, second: string): string | undefined {
  switch (action.id) {
    case "setTreasury":
      return isAddress(second.trim()) ? undefined : "Enter a valid treasury address.";
    case "setTokenAllowed":
      return isAddress(second.trim()) ? undefined : "Enter a valid token address.";
    case "grantRole":
    case "revokeRole":
      return isAddress(second.trim()) ? undefined : "Enter a valid account address.";
    case "setFeeBps":
      return /^\d{1,4}$/.test(second.trim()) ? undefined : "Enter a rate in basis points.";
    case "recoverTerminalAsset":
      return /^[1-9]\d?$/.test(second.trim()) ? undefined : "Choose a target status.";
    case "verifyAsset":
      return /^\d{1,19}$/.test(second.trim()) ? undefined : "Enter a verifier org id, or 0.";
    case "pause":
    case "unpause":
      return second ? undefined : "Choose a module.";
    default:
      return undefined;
  }
}

function SecondField(
  action: PrivilegedAction,
  value: string,
  set: (v: string) => void,
  state: AdminStateData,
): React.ReactNode {
  const id = `${action.id}-second`;

  switch (action.id) {
    case "verifyAsset":
      return (
        <Field
          label="Verifier organization id"
          htmlFor={id}
          hint="Recorded alongside the attestation. Enter 0 to attest without one; a non-zero org must be VERIFIED."
          required
        >
          <Input id={id} mono value={value} onChange={(e) => set(e.target.value)} placeholder="0" />
        </Field>
      );
    case "recoverTerminalAsset":
      return (
        <Field
          label="Restore to status"
          htmlFor={id}
          hint="Cannot be another terminal status — that would be a status change dressed up as a correction."
          required
        >
          <Select id={id} value={value} onChange={(e) => set(e.target.value)}>
            <option value="">Choose…</option>
            <option value="1">Registered</option>
            <option value="2">Active</option>
            <option value="3">In storage</option>
            <option value="4">In maintenance</option>
          </Select>
        </Field>
      );
    case "setFeeBps":
      return (
        <Field
          label="Fee rate (basis points)"
          htmlFor={id}
          hint={
            state.fees.maxFeeBps !== null
              ? `The contract caps this at ${state.fees.maxFeeBps} bps. Anything higher reverts.`
              : "Capped in the contract at MAX_FEE_BPS."
          }
          required
        >
          <Input id={id} mono value={value} onChange={(e) => set(e.target.value)} placeholder="200" />
        </Field>
      );
    case "setTreasury":
      return (
        <Field
          label="New treasury address"
          htmlFor={id}
          hint="Every future protocol fee goes here. There is no recovery from a wrong address."
          required
        >
          <Input id={id} mono value={value} onChange={(e) => set(e.target.value)} placeholder="0x…" />
        </Field>
      );
    case "setTokenAllowed":
      return (
        <Field label="Token address" htmlFor={id} required>
          <Input id={id} mono value={value} onChange={(e) => set(e.target.value)} placeholder="0x…" />
        </Field>
      );
    case "grantRole":
    case "revokeRole":
      return (
        <Field label="Account address" htmlFor={id} required>
          <Input id={id} mono value={value} onChange={(e) => set(e.target.value)} placeholder="0x…" />
        </Field>
      );
    default:
      return null;
  }
}

/**
 * Builds the write for an action, or returns undefined when this console does not offer it.
 *
 * Several privileged functions are deliberately absent. `upgradeToAndCall` needs a
 * reviewed implementation address and a governance proposal, not a form field.
 * `setAddress` and the role-management calls take a `bytes32` key chosen from a fixed set,
 * so they are offered only where that set can be presented safely.
 */
function buildFor(
  action: PrivilegedAction,
  ctx: { id: bigint; second: string; state: AdminStateData },
): ((book: AddressBook) => WriteRequest) | undefined {
  const { id, second, state } = ctx;

  switch (action.id) {
    case "verifyOrganization":
      return (b) => adminWrites.verifyOrganization(b, id);
    case "rejectOrganization":
      return (b) => adminWrites.rejectOrganization(b, id);
    case "suspendOrganization":
      return (b) => adminWrites.suspendOrganization(b, id);
    case "reactivateOrganization":
      return (b) => adminWrites.reactivateOrganization(b, id);
    case "revokeOrganization":
      return (b) => adminWrites.revokeOrganization(b, id);
    case "verifyAsset":
      return (b) => adminWrites.verifyAsset(b, id, BigInt(second.trim() || "0"));
    case "unverifyAsset":
      return (b) => adminWrites.unverifyAsset(b, id);
    case "recoverTerminalAsset":
      return (b) => adminWrites.recoverTerminalAsset(b, id, Number(second));
    case "releaseSerialNumberHash":
      return (b) => adminWrites.releaseSerialNumberHash(b, id);
    case "setTreasury":
      return (b) => adminWrites.setTreasury(b, second.trim() as Address);
    case "setTokenAllowed":
      return (b) => adminWrites.setTokenAllowed(b, second.trim() as Address, true);
    case "setFeeBps": {
      // The fee-type key is read from FeeManager, never hardcoded — writing a rate under
      // a mistyped key would set a fee nothing charges while leaving the real one intact.
      const feeType = state.fees.feeType;
      if (!feeType) return undefined;
      return (b) => adminWrites.setFeeBps(b, feeType, Number(second.trim()));
    }
    case "grantRole":
    case "revokeRole": {
      // `second` carries the account; the role comes from the fixed protocol set, so no
      // free-text bytes32 can reach the contract.
      return undefined;
    }
    default:
      return undefined;
  }
}

// ─────────────────────────────────────────────────────── panels ────

function ModuleTable({
  state,
  holds,
  rolesLoading,
  onDone,
}: {
  state: AdminStateData;
  holds: (a: PrivilegedAction) => boolean;
  rolesLoading: boolean;
  onDone: () => void;
}) {
  const pauseAction = PRIVILEGED_ACTIONS.find((a) => a.id === "pause");
  const unpauseAction = PRIVILEGED_ACTIONS.find((a) => a.id === "unpause");

  return (
    <Card>
      <CardHeader
        title="Modules"
        description="Nine upgradeable modules share pause, unpause and UUPS upgrade."
      />
      <CardBody className="grid gap-2">
        {state.modules.map((m) => (
          <div
            key={m.key}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-rule-2 pb-2 last:border-0"
          >
            <span className="min-w-0">
              <span className="block font-mono text-xs text-ink">{m.key}</span>
              {m.address ? (
                <AddressDisplay address={m.address} explorerUrl={explorerAddress(m.address)} />
              ) : (
                <span className="text-2xs text-ink-3">not set in the address registry</span>
              )}
            </span>

            <span className="flex items-center gap-2">
              <StateChip
                tone={m.paused === true ? "adverse" : m.paused === false ? "confirmed" : "neutral"}
              >
                {m.paused === true ? "Paused" : m.paused === false ? "Running" : "Unknown"}
              </StateChip>
              {m.paused === false && pauseAction && holds(pauseAction) && (
                <AdminAction
                  action={pauseAction}
                  holdsRole
                  roleLoading={rolesLoading}
                  build={(b) => adminWrites.pause(b, m.key)}
                  onDone={onDone}
                />
              )}
              {m.paused === true && unpauseAction && holds(unpauseAction) && (
                <AdminAction
                  action={unpauseAction}
                  holdsRole
                  roleLoading={rolesLoading}
                  build={(b) => adminWrites.unpause(b, m.key)}
                  onDone={onDone}
                />
              )}
            </span>
          </div>
        ))}

        <p className="mt-2 text-2xs leading-relaxed text-ink-3">
          Not upgradeable and not pausable: {IMMUTABLE_CONTRACTS.join(", ")}.{" "}
          <code className="font-mono">RoleManager</code> is immutable on purpose — it gates
          all other authorization, so removing its admin key from the threat model is itself
          a security property.
        </p>
      </CardBody>
    </Card>
  );
}

/**
 * Privileged events only — what somebody with a role did.
 *
 * Deliberately not the general activity feed. Registrations and listings are
 * permissionless, and burying six role grants under four hundred asset registrations is
 * how an admin console stops being read.
 */
function ActivityPanel() {
  const activity = useContractRead(["admin", "activity"], ({ client, book, blockNumber }) =>
    readPrivilegedActivity(client, book, blockNumber, 40),
  );

  return (
    <Card>
      <CardHeader
        title="System activity"
        description="Role grants, revocations, and status changes made by role holders."
      />
      <CardBody>
        {activity.isLoading ? (
          <RecordSkeleton rows={4} />
        ) : activity.isError ? (
          <p className="text-xs leading-relaxed text-ink-2">
            The log scan did not complete. This reads every privileged event since
            deployment, and public RPC endpoints refuse wide ranges under load. Nothing else
            on this page depends on it.
          </p>
        ) : (activity.data?.length ?? 0) === 0 ? (
          <p className="text-xs text-ink-2">No privileged actions recorded yet.</p>
        ) : (
          <ul className="grid gap-2">
            {activity.data?.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-2 pb-2 last:border-0"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-ink">{e.title}</span>
                  <span className="block break-all font-mono text-2xs text-ink-3">{e.detail}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-2xs text-ink-3">
                    block {e.blockNumber.toString()}
                  </span>
                  {e.timestamp !== null && (
                    <span className="block text-2xs text-ink-3">{formatDateTime(e.timestamp)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function FeePanel({ state }: { state: AdminStateData }) {
  const { fees } = state;
  return (
    <Card>
      <CardHeader title="Fee configuration" description="Live from FeeManager." />
      <CardBody>
        <dl>
          <DataRow label="Treasury">
            {fees.treasury ? (
              <AddressDisplay address={fees.treasury} explorerUrl={explorerAddress(fees.treasury)} />
            ) : (
              "—"
            )}
          </DataRow>
          <DataRow label="Marketplace fee">
            {fees.saleFeeBps === null ? "—" : `${fees.saleFeeBps} bps (${fees.saleFeeBps / 100}%)`}
          </DataRow>
          <DataRow label="Hard cap">
            {fees.maxFeeBps === null ? "—" : `${fees.maxFeeBps} bps`}
          </DataRow>
          <DataRow label="Settlement token">
            <AddressDisplay
              address={fees.settlementToken}
              explorerUrl={explorerAddress(fees.settlementToken)}
            />
          </DataRow>
          <DataRow label="Token allowed">
            <StateChip tone={fees.settlementTokenAllowed ? "confirmed" : "adverse"}>
              {fees.settlementTokenAllowed === null
                ? "Unknown"
                : fees.settlementTokenAllowed
                  ? "Allowed"
                  : "Not allowed"}
            </StateChip>
          </DataRow>
        </dl>
        <p className="mt-3 text-2xs leading-relaxed text-ink-3">
          The cap is enforced in the contract, not here — a rate above it reverts with{" "}
          <code className="font-mono">FeeExceedsMaximum</code>. Fees are charged only on
          marketplace settlement; nothing else in the protocol takes one.
        </p>
      </CardBody>
    </Card>
  );
}

/**
 * Who holds what, from the chain.
 *
 * The two annotations are the point. A role held only by contracts can never be exercised
 * from a wallet — that is what `ASSET_MINTER`, `ESCROW_FACTORY` and `SETTLEMENT` are for.
 * A role held by the timelock can only be exercised through a governance proposal, so a
 * button for it would be a lie however the wallet is configured.
 */
function RoleTable({ state }: { state: AdminStateData }) {
  return (
    <Card>
      <CardHeader
        title="Role holders"
        description="Read from RoleManager. This is the protocol's authorization, in full."
      />
      <CardBody className="grid gap-2.5">
        {state.roles.map((r) => (
          <div key={r.role} className="border-b border-rule-2 pb-2.5 last:border-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs font-medium text-ink">{r.label}</span>
              {r.viaTimelock && (
                <Badge variant="outline" className="gap-1 text-blocked">
                  <ShieldAlert className="size-2.5" aria-hidden="true" />
                  Timelocked
                </Badge>
              )}
              {r.contractsOnly && <Badge variant="outline">Contracts only</Badge>}
              <span className="font-mono text-2xs text-ink-3">
                {r.holders.length} holder{r.holders.length === 1 ? "" : "s"}
              </span>
            </div>

            <p className="mt-0.5 max-w-[80ch] text-2xs leading-relaxed text-ink-2">{r.permits}</p>

            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {r.holders.length === 0 ? (
                <span className="text-2xs text-ink-3">No holders.</span>
              ) : (
                r.holders.map((h) => (
                  <AddressDisplay key={h} address={h} explorerUrl={explorerAddress(h)} />
                ))
              )}
            </div>

            {r.viaTimelock && (
              <p className="mt-1 max-w-[80ch] text-2xs leading-relaxed text-blocked">
                Held by ProtocolTimelock. A direct call from any wallet reverts with{" "}
                <code className="font-mono">MissingRole</code> — these actions execute only
                through a governance proposal, after the delay, and are publicly visible
                before they land.
              </p>
            )}
          </div>
        ))}

        <p className="mt-1 text-2xs leading-relaxed text-ink-3">
          Role identifiers are <code className="font-mono">keccak256(&quot;aeroasset.role.NAME&quot;)</code>.
          Granting and revoking require the role&rsquo;s admin, which for every role is the
          timelock; revoking the last DEFAULT_ADMIN is refused outright, since it would
          freeze every upgrade, role change and unpause with no recovery path.
        </p>
      </CardBody>
    </Card>
  );
}

