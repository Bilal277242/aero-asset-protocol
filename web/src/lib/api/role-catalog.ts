import { keccak256, toHex } from "viem";

/**
 * The protocol's role vocabulary: names, identifiers and what each one permits.
 *
 * Deliberately free of any chain or configuration dependency. Deciding *whether an action
 * is offered* is pure logic over an already-read `RoleSet`, and it should be testable —
 * and reasoned about — without an RPC endpoint or an address registry in scope. The
 * reading half lives in `./roles`, which does need both.
 *
 * Nothing here grants permission. `RoleManager` is the authorization authority; this is
 * the frontend's copy of the names it uses.
 */

/** Every role identifier is `keccak256("aeroasset.role.<NAME>")`, per `ProtocolRoles.sol`. */
export const PROTOCOL_ROLES = [
  "PROTOCOL_ADMIN",
  "PAUSER",
  "ORG_VERIFIER",
  "ASSET_VERIFIER",
  "CREDENTIAL_ISSUER",
  "ARBITRATOR",
  "FEE_MANAGER",
  "ASSET_MINTER",
  "ESCROW_FACTORY",
  "SETTLEMENT",
] as const;

export type ProtocolRole = (typeof PROTOCOL_ROLES)[number];

export type RoleSet = Record<ProtocolRole | "DEFAULT_ADMIN", boolean>;

/** Human labels, and what holding the role actually permits. */
export const ROLE_INFO: Record<ProtocolRole | "DEFAULT_ADMIN", { label: string; permits: string }> = {
  DEFAULT_ADMIN: {
    label: "DEFAULT_ADMIN_ROLE",
    permits: "Grant and revoke every other role. Held by the timelock.",
  },
  PROTOCOL_ADMIN: {
    label: "PROTOCOL_ADMIN_ROLE",
    permits:
      "Upgrades, the address book, the token allowlist, unpausing, and terminal organization revocation. Held by the timelock, so every use waits 48 hours.",
  },
  PAUSER: { label: "PAUSER_ROLE", permits: "Halt a module. Deliberately cannot restart one." },
  ORG_VERIFIER: {
    label: "ORG_VERIFIER_ROLE",
    permits: "Verify, reject, suspend and reactivate organizations.",
  },
  ASSET_VERIFIER: {
    label: "ASSET_VERIFIER_ROLE",
    permits: "Attest to an asset, and withdraw that attestation.",
  },
  CREDENTIAL_ISSUER: {
    label: "CREDENTIAL_ISSUER_ROLE",
    permits: "Issue, suspend, reinstate and revoke aviation credentials.",
  },
  ARBITRATOR: {
    label: "ARBITRATOR_ROLE",
    permits: "Resolve a disputed escrow to exactly one party. Cannot alter amounts.",
  },
  FEE_MANAGER: {
    label: "FEE_MANAGER_ROLE",
    permits: "Fee rate and treasury, within a hard cap. Held by the timelock.",
  },
  ASSET_MINTER: {
    label: "ASSET_MINTER_ROLE",
    permits: "Mint an asset id for an organization. Held only by contracts.",
  },
  ESCROW_FACTORY: {
    label: "ESCROW_FACTORY_ROLE",
    permits: "Grant settlement authority to a newly deployed escrow. Held only by contracts.",
  },
  SETTLEMENT: {
    label: "SETTLEMENT_ROLE",
    permits: "Move title for one specific trade. Held only by live escrow clones.",
  },
};

export const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export function roleHash(role: ProtocolRole): `0x${string}` {
  return keccak256(toHex(`aeroasset.role.${role}`));
}

/** A `RoleSet` holding nothing. The honest default while a read is in flight. */
export function emptyRoleSet(): RoleSet {
  return Object.fromEntries([
    ["DEFAULT_ADMIN", false],
    ...PROTOCOL_ROLES.map((r) => [r, false]),
  ]) as RoleSet;
}
