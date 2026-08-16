import type { Address } from "viem";
import { CredentialStatus, OrganizationStatus } from "@/lib/contracts/generated/enums";
import type { CredentialView, OrgView } from "./identity";
// From the catalog, not from `./roles`: deciding whether an action is offered is pure
// logic and must not drag an RPC endpoint and an address registry into scope with it.
import { ROLE_INFO, type ProtocolRole, type RoleSet } from "./role-catalog";

/**
 * Which identity actions the protocol will accept, from whom, and why not otherwise.
 *
 * Pure functions over already-read state, mirroring the contracts exactly. Three things
 * here would be wrong if assumed rather than read:
 *
 * - **`verifyOrganization` only works from `PENDING`.** Reactivating a suspended
 *   organization is a *different call*, `reactivateOrganization`, even though both land
 *   on `VERIFIED` and both need the same role. The contract keeps them apart so the
 *   audit trail distinguishes a first verification from a restoration.
 * - **`revokeOrganization` cannot reach a `PENDING` record.** Turning away a candidate
 *   is `rejectOrganization`; revocation applies only to `VERIFIED` or `SUSPENDED`.
 * - **Several of these work while the module is paused.** Suspension, rejection and
 *   revocation all strictly reduce privilege, so blocking them during an incident would
 *   be exactly backwards.
 */

export type IdentityAction = {
  id: string;
  label: string;
  /** The on-chain role this requires, or null when it needs none. */
  role: ProtocolRole | null;
  /** Shown wherever the action appears, so the requirement is never a surprise. */
  roleLabel: string | null;
  enabled: boolean;
  reason?: string;
  /** Whether to render it at all. Admin controls stay hidden from unauthorized viewers. */
  visible: boolean;
  destructive?: boolean;
  primary?: boolean;
  /** True when the action is queued behind the timelock rather than executed directly. */
  timelocked?: boolean;
};

export type IdentityViewer = {
  address: Address | undefined;
  isConnected: boolean;
  roles: RoleSet;
};

const roleLabel = (role: ProtocolRole | null) => (role ? ROLE_INFO[role].label : null);

// ─────────────────────────────────────────────── organizations ────

export function deriveOrgActions(
  org: OrgView,
  viewer: IdentityViewer,
  paused: boolean,
): IdentityAction[] {
  const isAdmin = !!viewer.address && org.admin.toLowerCase() === viewer.address.toLowerCase();
  const isPendingAdmin =
    !!viewer.address && org.pendingAdmin?.toLowerCase() === viewer.address.toLowerCase();

  const verifier = viewer.roles.ORG_VERIFIER;
  const protocolAdmin = viewer.roles.PROTOCOL_ADMIN;

  const pending = org.status === OrganizationStatus.PENDING;
  const verified = org.status === OrganizationStatus.VERIFIED;
  const suspended = org.status === OrganizationStatus.SUSPENDED;
  const revoked = org.status === OrganizationStatus.REVOKED;

  return [
    // ── Organization admin ────────────────────────────────────────────
    {
      id: "updateOrganization",
      label: "Update profile",
      role: null,
      roleLabel: null,
      visible: isAdmin,
      enabled: isAdmin && !revoked && !paused,
      reason: revoked
        ? "A revoked record is terminal; every administrative write is refused."
        : paused
          ? "The organization registry is paused."
          : undefined,
      primary: true,
    },
    {
      id: "setOperator",
      label: "Manage operators",
      role: null,
      roleLabel: null,
      visible: isAdmin,
      enabled: isAdmin && !revoked && !paused,
      reason: revoked
        ? "A revoked record is terminal."
        : paused
          ? "The organization registry is paused."
          : undefined,
    },
    {
      id: "transferOrganizationAdmin",
      label: "Transfer admin",
      role: null,
      roleLabel: null,
      visible: isAdmin,
      enabled: isAdmin && !revoked && !paused,
      reason: revoked ? "A revoked record is terminal." : paused ? "Registry paused." : undefined,
      destructive: true,
    },
    {
      id: "acceptOrganizationAdmin",
      label: "Accept admin transfer",
      role: null,
      roleLabel: null,
      visible: isPendingAdmin,
      enabled: isPendingAdmin && !revoked && !paused,
      reason: revoked ? "A revoked record is terminal." : paused ? "Registry paused." : undefined,
      primary: true,
    },
    {
      id: "cancelOrganizationAdminTransfer",
      label: "Cancel admin transfer",
      role: null,
      roleLabel: null,
      // Either side of the proposed transfer may abandon it.
      visible: (isAdmin || isPendingAdmin) && org.pendingAdmin !== null,
      enabled: (isAdmin || isPendingAdmin) && org.pendingAdmin !== null && !paused,
      reason: !org.pendingAdmin ? "No transfer is pending." : paused ? "Registry paused." : undefined,
      destructive: true,
    },

    // ── ORG_VERIFIER ──────────────────────────────────────────────────
    {
      id: "verifyOrganization",
      label: "Verify",
      role: "ORG_VERIFIER",
      roleLabel: roleLabel("ORG_VERIFIER"),
      visible: verifier,
      enabled: verifier && pending && !paused,
      reason: !pending
        ? verified
          ? "Already verified."
          : suspended
            ? "Use Reactivate — the contract keeps first verification and restoration apart."
            : "Only a pending organization can be verified."
        : paused
          ? "The organization registry is paused."
          : undefined,
      primary: true,
    },
    {
      id: "rejectOrganization",
      label: "Reject",
      role: "ORG_VERIFIER",
      roleLabel: roleLabel("ORG_VERIFIER"),
      visible: verifier,
      // No pause gate: turning away a candidate must work during an incident.
      enabled: verifier && pending,
      reason: !pending ? "Only a pending organization can be rejected." : undefined,
      destructive: true,
    },
    {
      id: "suspendOrganization",
      label: "Suspend",
      role: "ORG_VERIFIER",
      roleLabel: roleLabel("ORG_VERIFIER"),
      visible: verifier,
      // No pause gate: suspension strictly reduces privilege.
      enabled: verifier && verified,
      reason: !verified ? "Only a verified organization can be suspended." : undefined,
      destructive: true,
    },
    {
      id: "reactivateOrganization",
      label: "Reactivate",
      role: "ORG_VERIFIER",
      roleLabel: roleLabel("ORG_VERIFIER"),
      visible: verifier,
      enabled: verifier && suspended && !paused,
      reason: !suspended
        ? "Only a suspended organization can be reactivated."
        : paused
          ? "The organization registry is paused."
          : undefined,
      primary: true,
    },

    // ── PROTOCOL_ADMIN, behind the timelock ───────────────────────────
    {
      id: "revokeOrganization",
      label: "Revoke permanently",
      role: "PROTOCOL_ADMIN",
      roleLabel: roleLabel("PROTOCOL_ADMIN"),
      visible: protocolAdmin,
      enabled: protocolAdmin && (verified || suspended),
      reason:
        pending
          ? "A pending organization is rejected, not revoked."
          : revoked
            ? "Already revoked. This is terminal."
            : undefined,
      destructive: true,
      timelocked: true,
    },
  ];
}

// ──────────────────────────────────────────────── credentials ────

export function deriveCredentialActions(
  credential: CredentialView,
  viewer: IdentityViewer,
  paused: boolean,
  now: bigint,
): IdentityAction[] {
  const issuer = viewer.roles.CREDENTIAL_ISSUER;

  const active = credential.status === CredentialStatus.ACTIVE;
  const suspended = credential.status === CredentialStatus.SUSPENDED;
  const terminal =
    credential.status === CredentialStatus.REVOKED ||
    credential.status === CredentialStatus.EXPIRED;

  // `reinstateCredential` refuses a credential whose deadline passed while suspended.
  const expiredByTime =
    credential.expiresAt !== 0 && BigInt(credential.expiresAt) <= now;

  return [
    {
      id: "suspendCredential",
      label: "Suspend",
      role: "CREDENTIAL_ISSUER",
      roleLabel: roleLabel("CREDENTIAL_ISSUER"),
      visible: issuer,
      // No pause gate: suspension strictly reduces authority.
      enabled: issuer && active,
      reason: !active
        ? terminal
          ? "This credential is terminal."
          : "Only an active credential can be suspended."
        : undefined,
      destructive: true,
    },
    {
      id: "reinstateCredential",
      label: "Reinstate",
      role: "CREDENTIAL_ISSUER",
      roleLabel: roleLabel("CREDENTIAL_ISSUER"),
      visible: issuer,
      enabled: issuer && suspended && !expiredByTime && !paused,
      reason: !suspended
        ? "Only a suspended credential can be reinstated."
        : expiredByTime
          ? "Its deadline passed while suspended. Reinstatement must not resurrect authority that time has ended — issue a new credential instead."
          : paused
            ? "The credential registry is paused."
            : undefined,
      primary: true,
    },
    {
      id: "revokeCredential",
      label: "Revoke",
      role: "CREDENTIAL_ISSUER",
      roleLabel: roleLabel("CREDENTIAL_ISSUER"),
      visible: issuer,
      // No pause gate.
      enabled: issuer && (active || suspended),
      reason: terminal ? "This credential is already terminal." : undefined,
      destructive: true,
    },
    {
      id: "expireCredential",
      label: "Record expiry",
      role: null,
      roleLabel: null,
      // Permissionless, so it is offered to anyone once it applies.
      visible: credential.isLapsed,
      enabled: viewer.isConnected && credential.isLapsed,
      reason: !viewer.isConnected
        ? "Connect a wallet to record the expiry."
        : !credential.isLapsed
          ? "This credential has not lapsed."
          : undefined,
    },
  ];
}

/**
 * Whether an account may issue a credential at all.
 *
 * Separate from the per-credential actions because issuance has no subject yet. The
 * subject organization must be **verified** — the contract reverts
 * `SubjectOrganizationNotVerified` otherwise — and only one valid credential of each
 * type may exist per organization.
 */
export function canIssueCredential(viewer: IdentityViewer, paused: boolean): IdentityAction {
  return {
    id: "issueCredential",
    label: "Issue credential",
    role: "CREDENTIAL_ISSUER",
    roleLabel: roleLabel("CREDENTIAL_ISSUER"),
    visible: viewer.roles.CREDENTIAL_ISSUER,
    enabled: viewer.roles.CREDENTIAL_ISSUER && !paused,
    reason: paused ? "The credential registry is paused." : undefined,
    primary: true,
  };
}
