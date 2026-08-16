import type { Address, Hex, PublicClient } from "viem";
import { credentialRegistryAbi, organizationRegistryAbi } from "@/lib/contracts/generated/abis";
import { CredentialStatus, OrganizationStatus } from "@/lib/contracts/generated/enums";
import { requireAddress, type AddressBook } from "@/lib/contracts/addressBook";
import { value } from "@/hooks/useContractRead";

/**
 * Organizations and credentials.
 *
 * Two properties of these registries drive the whole shape of this module, and both were
 * read out of the contracts rather than assumed:
 *
 * 1. **`verifiedAt` does not mean "currently verified".** `_writeStatus` records the
 *    *first* verification only, so reactivation never rewrites it. An organization that
 *    was verified, suspended and never reactivated still carries a non-zero `verifiedAt`.
 *    Current standing comes from `status`, always.
 *
 * 2. **Credential validity is computed, never stored.** `isValid` checks status *and*
 *    expiry, because a credential sits at `ACTIVE` past its deadline until somebody pays
 *    gas to record the expiry. Reading `status` alone authorizes expired credentials.
 */

type Entry = { status: "success"; result: unknown } | { status: "failure" };

export type OrgView = {
  orgId: bigint;
  admin: Address;
  registeredAt: number;
  /** First verification only. Never evidence of current standing. */
  verifiedAt: number;
  orgType: number;
  status: number;
  nameHash: Hex;
  metadataHash: Hex;
  metadataURI: string | null;
  pendingAdmin: Address | null;
  /** Computed from `status`, never from `verifiedAt`. */
  isVerified: boolean;
};

export type CredentialView = {
  credentialId: bigint;
  issuerOrgId: bigint;
  subjectOrgId: bigint;
  subject: Address;
  issuedAt: number;
  expiresAt: number;
  credType: number;
  status: number;
  credentialHash: Hex;
  /** From the contract's own `isValid`, not derived from `status`. */
  isValid: boolean;
  /**
   * Stored ACTIVE but past its deadline — true by time, unrecorded on-chain. Anyone can
   * call `expireCredential` to record it.
   */
  isLapsed: boolean;
};

const ZERO = "0x0000000000000000000000000000000000000000";

// ─────────────────────────────────────────────────── organizations ────

export async function readOrganization(
  client: PublicClient,
  book: AddressBook,
  orgId: bigint,
  blockNumber: bigint,
): Promise<OrgView | null> {
  const registry = requireAddress(book, "ORGANIZATION_REGISTRY");

  const [orgResult, uriResult, pendingResult] = await client.multicall({
    contracts: [
      { address: registry, abi: organizationRegistryAbi, functionName: "getOrganization", args: [orgId] },
      { address: registry, abi: organizationRegistryAbi, functionName: "metadataURI", args: [orgId] },
      { address: registry, abi: organizationRegistryAbi, functionName: "pendingAdmin", args: [orgId] },
    ],
    allowFailure: true,
    blockNumber,
  });

  const raw = value<{
    admin: Address;
    registeredAt: number;
    verifiedAt: number;
    orgType: number;
    status: number;
    nameHash: Hex;
    metadataHash: Hex;
  }>(orgResult as Entry);
  if (!raw) return null;

  const pending = value<Address>(pendingResult as Entry);

  return {
    orgId,
    ...raw,
    metadataURI: value<string>(uriResult as Entry) || null,
    pendingAdmin: pending && pending !== ZERO ? pending : null,
    isVerified: raw.status === OrganizationStatus.VERIFIED,
  };
}

export async function readOrganizationIndex(
  client: PublicClient,
  book: AddressBook,
  blockNumber: bigint,
  limit = 100,
): Promise<{ items: OrgView[]; total: number; truncated: boolean }> {
  const registry = requireAddress(book, "ORGANIZATION_REGISTRY");

  const total = Number(
    await client.readContract({
      address: registry,
      abi: organizationRegistryAbi,
      functionName: "organizationCount",
      blockNumber,
    }),
  );

  const take = Math.min(total, limit);
  const ids = Array.from({ length: take }, (_, i) => BigInt(total - i));
  if (ids.length === 0) return { items: [], total, truncated: false };

  const results = await client.multicall({
    contracts: ids.flatMap((orgId) => [
      { address: registry, abi: organizationRegistryAbi, functionName: "getOrganization" as const, args: [orgId] },
      { address: registry, abi: organizationRegistryAbi, functionName: "metadataURI" as const, args: [orgId] },
    ]),
    allowFailure: true,
    blockNumber,
  });

  const items = ids.flatMap((orgId, i) => {
    const raw = value<{
      admin: Address;
      registeredAt: number;
      verifiedAt: number;
      orgType: number;
      status: number;
      nameHash: Hex;
      metadataHash: Hex;
    }>(results[i * 2] as Entry);
    if (!raw) return [];
    return [
      {
        orgId,
        ...raw,
        metadataURI: value<string>(results[i * 2 + 1] as Entry) || null,
        pendingAdmin: null,
        isVerified: raw.status === OrganizationStatus.VERIFIED,
      },
    ];
  });

  return { items, total, truncated: total > take };
}

/** Whether an account may act for an organization. The contract's own answer. */
export async function readActingFor(
  client: PublicClient,
  book: AddressBook,
  orgId: bigint,
  account: Address,
  blockNumber: bigint,
): Promise<{ isAdmin: boolean; isOperator: boolean; canAct: boolean }> {
  const registry = requireAddress(book, "ORGANIZATION_REGISTRY");

  const [orgResult, operatorResult, actingResult] = await client.multicall({
    contracts: [
      { address: registry, abi: organizationRegistryAbi, functionName: "getOrganization", args: [orgId] },
      { address: registry, abi: organizationRegistryAbi, functionName: "isOperator", args: [orgId, account] },
      { address: registry, abi: organizationRegistryAbi, functionName: "isActingFor", args: [orgId, account] },
    ],
    allowFailure: true,
    blockNumber,
  });

  const org = value<{ admin: Address }>(orgResult as Entry);

  return {
    isAdmin: org ? org.admin.toLowerCase() === account.toLowerCase() : false,
    isOperator: value<boolean>(operatorResult as Entry) ?? false,
    // `isActingFor` additionally requires the organization to be VERIFIED, so it is not
    // simply admin-or-operator.
    canAct: value<boolean>(actingResult as Entry) ?? false,
  };
}

// ──────────────────────────────────────────────────── credentials ────

export async function readCredential(
  client: PublicClient,
  book: AddressBook,
  credentialId: bigint,
  blockNumber: bigint,
  now: bigint,
): Promise<CredentialView | null> {
  const registry = requireAddress(book, "CREDENTIAL_REGISTRY");

  const [credResult, validResult] = await client.multicall({
    contracts: [
      { address: registry, abi: credentialRegistryAbi, functionName: "getCredential", args: [credentialId] },
      { address: registry, abi: credentialRegistryAbi, functionName: "isValid", args: [credentialId] },
    ],
    allowFailure: true,
    blockNumber,
  });

  const raw = value<{
    issuerOrgId: bigint;
    subjectOrgId: bigint;
    issuedAt: number;
    expiresAt: number;
    credType: number;
    status: number;
    subject: Address;
    credentialHash: Hex;
  }>(credResult as Entry);
  if (!raw) return null;

  return toView(credentialId, raw, value<boolean>(validResult as Entry) ?? false, now);
}

export async function readCredentialIndex(
  client: PublicClient,
  book: AddressBook,
  blockNumber: bigint,
  now: bigint,
  limit = 100,
): Promise<{ items: CredentialView[]; total: number; truncated: boolean }> {
  const registry = requireAddress(book, "CREDENTIAL_REGISTRY");

  const total = Number(
    await client.readContract({
      address: registry,
      abi: credentialRegistryAbi,
      functionName: "credentialCount",
      blockNumber,
    }),
  );

  const take = Math.min(total, limit);
  const ids = Array.from({ length: take }, (_, i) => BigInt(total - i));
  if (ids.length === 0) return { items: [], total, truncated: false };

  const results = await client.multicall({
    contracts: ids.flatMap((id) => [
      { address: registry, abi: credentialRegistryAbi, functionName: "getCredential" as const, args: [id] },
      { address: registry, abi: credentialRegistryAbi, functionName: "isValid" as const, args: [id] },
    ]),
    allowFailure: true,
    blockNumber,
  });

  const items = ids.flatMap((credentialId, i) => {
    const raw = value<Parameters<typeof toView>[1]>(results[i * 2] as Entry);
    if (!raw) return [];
    return [toView(credentialId, raw, value<boolean>(results[i * 2 + 1] as Entry) ?? false, now)];
  });

  return { items, total, truncated: total > take };
}

function toView(
  credentialId: bigint,
  raw: {
    issuerOrgId: bigint;
    subjectOrgId: bigint;
    issuedAt: number;
    expiresAt: number;
    credType: number;
    status: number;
    subject: Address;
    credentialHash: Hex;
  },
  isValid: boolean,
  now: bigint,
): CredentialView {
  // `expireCredential` reverts unless `expiresAt != 0 && expiresAt <= block.timestamp`,
  // so the deadline second itself already qualifies. Note this differs from the escrow
  // deadlines, which use strict `>` — the protocol is not uniform and each was checked.
  const lapsed =
    raw.status === CredentialStatus.ACTIVE &&
    raw.expiresAt !== 0 &&
    BigInt(raw.expiresAt) <= now;

  return { credentialId, ...raw, isValid, isLapsed: lapsed };
}
