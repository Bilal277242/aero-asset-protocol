import type { ProtocolRole } from "./role-catalog";

/**
 * Every privileged function in the protocol, as data.
 *
 * Compiled from the contracts themselves — every `onlyRole` modifier and every explicit
 * `hasRole` check in `src/` — not from `docs/permissions.md`, which has already been
 * wrong once (D1 in the contract map).
 *
 * Three properties here are the ones an admin interface gets wrong by default:
 *
 * - **`role` is what the contract requires, never what the interface hopes.** A wallet
 *   holding the role is offered the action; every other wallet sees it listed as
 *   unavailable rather than as a disabled button it might keep clicking.
 *
 * - **`contractOnly` marks roles no wallet can ever hold.** `ASSET_MINTER`,
 *   `ESCROW_FACTORY` and `SETTLEMENT` are granted to contracts — the specialization
 *   registries, the factory, and each live escrow clone. They are documented here so the
 *   inventory is complete, and are never rendered as actions.
 *
 * - **`irreversible` and `danger` are separate.** Revoking an organization is both.
 *   Pausing a module is dangerous and fully reversible. Unverifying an asset is
 *   reversible in principle but destroys an attestation that has to be re-earned. Only
 *   `irreversible` earns the type-to-confirm gate.
 *
 * Whether an action is *timelocked* is deliberately **not** a field. It is derived at
 * runtime from who holds the role, because that is the only answer that stays true: on
 * this deployment `PROTOCOL_ADMIN` and `FEE_MANAGER` are both held solely by
 * `ProtocolTimelock`, and a hardcoded flag would silently lie the moment a role moved.
 */

export type AdminSection =
  | "organizations"
  | "credentials"
  | "assets"
  | "marketplace"
  | "fees"
  | "roles"
  | "activity"
  | "configuration";

export type PrivilegedAction = {
  id: string;
  /** The exact Solidity function, for anyone checking this against the source. */
  signature: string;
  contract: string;
  label: string;
  description: string;
  role: ProtocolRole | "DEFAULT_ADMIN";
  section: AdminSection;
  /** True when no EOA can hold the role — it belongs to a protocol contract. */
  contractOnly?: boolean;
  /** True when the effect cannot be undone by any function on the protocol. */
  irreversible?: boolean;
  /** True when a mistake is costly even though it can be undone. */
  danger?: boolean;
  /** Refused while the module is paused. */
  pauseGated?: boolean;
  /** Present when this interface can build the call. Absent means listed-only. */
  buildable?: boolean;
  /** Why an action is listed but not offered. */
  note?: string;
};

export const PRIVILEGED_ACTIONS: PrivilegedAction[] = [
  // ── Organizations ─────────────────────────────────────────────────
  {
    id: "verifyOrganization",
    signature: "verifyOrganization(uint256)",
    contract: "OrganizationRegistry",
    label: "Verify organization",
    description:
      "Moves a PENDING organization to VERIFIED. Only from PENDING — restoring a suspended organization is reactivateOrganization.",
    role: "ORG_VERIFIER",
    section: "organizations",
    pauseGated: true,
    buildable: true,
  },
  {
    id: "rejectOrganization",
    signature: "rejectOrganization(uint256)",
    contract: "OrganizationRegistry",
    label: "Reject organization",
    description: "Turns away a PENDING applicant. Not pause-gated — it reduces privilege.",
    role: "ORG_VERIFIER",
    section: "organizations",
    danger: true,
    buildable: true,
  },
  {
    id: "suspendOrganization",
    signature: "suspendOrganization(uint256)",
    contract: "OrganizationRegistry",
    label: "Suspend organization",
    description:
      "Blocks all future protocol action by a VERIFIED organization. Records it already created stay valid.",
    role: "ORG_VERIFIER",
    section: "organizations",
    danger: true,
    buildable: true,
  },
  {
    id: "reactivateOrganization",
    signature: "reactivateOrganization(uint256)",
    contract: "OrganizationRegistry",
    label: "Reactivate organization",
    description: "Restores a SUSPENDED organization to VERIFIED.",
    role: "ORG_VERIFIER",
    section: "organizations",
    pauseGated: true,
    buildable: true,
  },
  {
    id: "revokeOrganization",
    signature: "revokeOrganization(uint256)",
    contract: "OrganizationRegistry",
    label: "Revoke organization permanently",
    description:
      "Terminal. Every administrative write is refused afterwards, and the name commitment is released for re-registration by anyone.",
    role: "PROTOCOL_ADMIN",
    section: "organizations",
    irreversible: true,
    danger: true,
    buildable: true,
  },

  // ── Credentials ───────────────────────────────────────────────────
  {
    id: "issueCredential",
    signature: "issueCredential(uint256,address,uint256,uint8,uint40,bytes32)",
    contract: "CredentialRegistry",
    label: "Issue credential",
    description:
      "Subject organization must be VERIFIED and hold no valid credential of this type.",
    role: "CREDENTIAL_ISSUER",
    section: "credentials",
    pauseGated: true,
    note: "Offered on /credentials, where the subject organization's standing and existing credentials are in front of you — the two things this call is refused for.",
  },
  {
    id: "suspendCredential",
    signature: "suspendCredential(uint256)",
    contract: "CredentialRegistry",
    label: "Suspend credential",
    description: "From ACTIVE only. Reinstatement is refused once the expiry passes.",
    role: "CREDENTIAL_ISSUER",
    section: "credentials",
    danger: true,
    note: "Offered on the credential's own page, where its status and expiry are visible.",
  },
  {
    id: "reinstateCredential",
    signature: "reinstateCredential(uint256)",
    contract: "CredentialRegistry",
    label: "Reinstate credential",
    description: "From SUSPENDED only, and only while its deadline has not passed.",
    role: "CREDENTIAL_ISSUER",
    section: "credentials",
    pauseGated: true,
    note: "Offered on the credential's own page, which is also where the refusal reason is shown when the deadline has already passed.",
  },
  {
    id: "revokeCredential",
    signature: "revokeCredential(uint256)",
    contract: "CredentialRegistry",
    label: "Revoke credential",
    description: "Terminal. A revoked credential never becomes valid again.",
    role: "CREDENTIAL_ISSUER",
    section: "credentials",
    irreversible: true,
    danger: true,
    note: "Offered on the credential's own page. A terminal action belongs next to the record it ends, not behind an id typed into a console.",
  },

  // ── Assets ────────────────────────────────────────────────────────
  {
    id: "verifyAsset",
    signature: "verifyAsset(uint256,uint256)",
    contract: "AssetRegistry",
    label: "Verify asset",
    description:
      "Attests to an asset. Refused if already verified — withdraw first with unverifyAsset to re-attest.",
    role: "ASSET_VERIFIER",
    section: "assets",
    pauseGated: true,
    buildable: true,
  },
  {
    id: "unverifyAsset",
    signature: "unverifyAsset(uint256)",
    contract: "AssetRegistry",
    label: "Withdraw asset verification",
    description:
      "Clears the attestation and its verifier. Reversible, but the asset must be verified again from scratch.",
    role: "ASSET_VERIFIER",
    section: "assets",
    danger: true,
    buildable: true,
  },
  {
    id: "recoverTerminalAsset",
    signature: "recoverTerminalAsset(uint256,uint8)",
    contract: "AssetRegistry",
    label: "Recover terminal asset",
    description:
      "The correction path for an erroneous RETIRED or DESTROYED status. Cannot move between terminal states — that would be a status change dressed up as a correction.",
    role: "PROTOCOL_ADMIN",
    section: "assets",
    danger: true,
    buildable: true,
  },
  {
    id: "releaseSerialNumberHash",
    signature: "releaseSerialNumberHash(uint256)",
    contract: "AssetRegistry",
    label: "Release serial number commitment",
    description:
      "Adjudicates a squatted or mistaken serial claim. Aviation serials are public and short, so anyone could pre-register a real aircraft's MSN and block its owner forever (audit AAP-08).",
    role: "PROTOCOL_ADMIN",
    section: "assets",
    irreversible: true,
    danger: true,
    buildable: true,
  },
  {
    id: "registerAssetFor",
    signature: "registerAssetFor(uint256,address,uint8,bytes32,bytes32,string)",
    contract: "AssetRegistry",
    label: "Register an asset on behalf of an organization",
    description:
      "Held by AircraftRegistry and ComponentRegistry so a specialization registry can create the base record. Never granted to an account. Distinct from the permissionless `registerAsset`, which requires only that the caller acts for the organization.",
    role: "ASSET_MINTER",
    section: "assets",
    contractOnly: true,
    pauseGated: true,
    note: "Granted to the specialization registries. Reached by registering an aircraft or component, never called directly.",
  },

  // ── Marketplace ───────────────────────────────────────────────────
  {
    id: "markSold",
    signature: "markSold(uint256)",
    contract: "Marketplace",
    label: "Mark listing sold",
    description: "Called by a live escrow when it settles.",
    role: "SETTLEMENT",
    section: "marketplace",
    contractOnly: true,
    note: "Granted per-trade to one escrow clone. No wallet holds it.",
  },
  {
    id: "clearEscrow",
    signature: "clearEscrow(uint256)",
    contract: "Marketplace",
    label: "Clear listing escrow",
    description: "Called by an escrow when it terminates without settling.",
    role: "SETTLEMENT",
    section: "marketplace",
    contractOnly: true,
    note: "Granted per-trade to one escrow clone. No wallet holds it.",
  },
  {
    id: "setTransferLock",
    signature: "setTransferLock(uint256,bool)",
    contract: "AssetOwnership",
    label: "Lock asset for settlement",
    description: "Holds an asset still while a trade is in flight.",
    role: "SETTLEMENT",
    section: "marketplace",
    contractOnly: true,
    note: "Granted per-trade to one escrow clone. No wallet holds it.",
  },
  {
    id: "resolveDispute",
    signature: "resolveDispute(bool)",
    contract: "Escrow (clone)",
    label: "Resolve a dispute",
    description:
      "Chooses a winner for a DISPUTED escrow and nothing else — it cannot alter amounts, pay a third party, or reach a non-disputed escrow.",
    role: "ARBITRATOR",
    section: "marketplace",
    irreversible: true,
    danger: true,
    note: "Lives on each escrow clone, not on a registry. Open the trade to act on it.",
  },

  // ── Fees ──────────────────────────────────────────────────────────
  {
    id: "setFeeBps",
    signature: "setFeeBps(bytes32,uint16)",
    contract: "FeeManager",
    label: "Set fee rate",
    description: "Capped in the contract at MAX_FEE_BPS. A value above the cap reverts.",
    role: "FEE_MANAGER",
    section: "fees",
    danger: true,
    buildable: true,
  },
  {
    id: "setTreasury",
    signature: "setTreasury(address)",
    contract: "FeeManager",
    label: "Set treasury",
    description:
      "Redirects every future protocol fee. A wrong address sends fees somewhere unrecoverable.",
    role: "FEE_MANAGER",
    section: "fees",
    danger: true,
    buildable: true,
  },
  {
    id: "setTokenAllowed",
    signature: "setTokenAllowed(address,bool)",
    contract: "FeeManager",
    label: "Set token allowance",
    description:
      "Adds or removes a settlement token. Removing one does not affect escrows already funded with it.",
    role: "PROTOCOL_ADMIN",
    section: "fees",
    danger: true,
    buildable: true,
  },

  // ── Roles ─────────────────────────────────────────────────────────
  {
    id: "grantRole",
    signature: "grantRole(bytes32,address)",
    contract: "RoleManager",
    label: "Grant role",
    description: "Adds a role holder. Requires the role's admin, which for every role is the timelock.",
    role: "DEFAULT_ADMIN",
    section: "roles",
    danger: true,
    note: "Not offered here. Every role's admin is the timelock, so this executes only as a governance proposal — and a console that let one be assembled from a text field would be inviting a mistyped role identifier into the protocol's authorization.",
  },
  {
    id: "revokeRole",
    signature: "revokeRole(bytes32,address)",
    contract: "RoleManager",
    label: "Revoke role",
    description:
      "Removes a role holder. Removing the last DEFAULT_ADMIN is refused — it would freeze every upgrade, role change and unpause with no recovery.",
    role: "DEFAULT_ADMIN",
    section: "roles",
    danger: true,
    note: "Not offered here, for the same reason as granting: it is a timelocked governance action, and the role identifier must not come from a form field.",
  },
  {
    id: "setRoleAdmin",
    signature: "setRoleAdmin(bytes32,bytes32)",
    contract: "RoleManager",
    label: "Set role admin",
    description:
      "Narrows which role administers another. DEFAULT_ADMIN cannot be re-administered, or the timelock could be routed around.",
    role: "DEFAULT_ADMIN",
    section: "roles",
    danger: true,
    note: "Not offered here. This rewires the protocol's authorization graph and is wired once, by deployment script, on purpose.",
  },

  // ── Configuration ─────────────────────────────────────────────────
  {
    id: "pause",
    signature: "pause()",
    contract: "9 modules",
    label: "Pause module",
    description:
      "Halts state-changing operations. Deliberately cannot unpause — stopping must be fast and low-trust, restarting slow and high-trust.",
    role: "PAUSER",
    section: "configuration",
    danger: true,
    buildable: true,
    note: "Offered per module in the table above — pausing is a decision about one module, and there is no protocol-wide pause to offer.",
  },
  {
    id: "unpause",
    signature: "unpause()",
    contract: "9 modules",
    label: "Unpause module",
    description: "Resumes operations. A different role from pause, on purpose.",
    role: "PROTOCOL_ADMIN",
    section: "configuration",
    buildable: true,
    note: "Offered per module in the table above, and only on a module that is actually paused.",
  },
  {
    id: "setAddress",
    signature: "setAddress(bytes32,address)",
    contract: "ProtocolAddressRegistry",
    label: "Set module address",
    description:
      "Repoints a module key. Every module resolves its peers through this registry on every call, so a wrong address takes effect immediately and everywhere.",
    role: "PROTOCOL_ADMIN",
    section: "configuration",
    danger: true,
    note: "Not offered here. This is the protocol's root of trust: a wrong address silently redirects every module that resolves through it, and there is no form field worth that risk.",
  },
  {
    id: "upgradeToAndCall",
    signature: "upgradeToAndCall(address,bytes)",
    contract: "9 UUPS modules",
    label: "Upgrade implementation",
    description:
      "Replaces a module's logic. Storage is ERC-7201 namespaced, but a bad implementation is still the most destructive action available to the protocol.",
    role: "PROTOCOL_ADMIN",
    section: "configuration",
    irreversible: true,
    danger: true,
    note: "Not offered here. An upgrade needs a reviewed implementation address and a deliberate governance proposal, not a form field.",
  },
];

/** The nine modules that inherit pause, unpause and UUPS upgrade. */
export const PAUSABLE_MODULES = [
  "ORGANIZATION_REGISTRY",
  "CREDENTIAL_REGISTRY",
  "ASSET_REGISTRY",
  "ASSET_OWNERSHIP",
  "AIRCRAFT_REGISTRY",
  "COMPONENT_REGISTRY",
  "DOCUMENT_REGISTRY",
  "MAINTENANCE_REGISTRY",
  "MARKETPLACE",
] as const;

export type PausableModule = (typeof PAUSABLE_MODULES)[number];

/**
 * Contracts with no pause and no upgrade path.
 *
 * `RoleManager` is immutable by design: it gates all other authorization, so removing its
 * admin key from the threat model is itself a security property (architecture D4).
 */
export const IMMUTABLE_CONTRACTS = [
  "ROLE_MANAGER",
  "PROTOCOL_TIMELOCK",
  "FEE_MANAGER",
  "ESCROW_FACTORY",
  "ASSET_PASSPORT",
] as const;

export const SECTION_LABEL: Record<AdminSection, string> = {
  organizations: "Organizations",
  credentials: "Credentials",
  assets: "Assets",
  marketplace: "Marketplace",
  fees: "Fees",
  roles: "Roles",
  activity: "System activity",
  configuration: "Contract configuration",
};

export const actionsInSection = (section: AdminSection) =>
  PRIVILEGED_ACTIONS.filter((a) => a.section === section);
