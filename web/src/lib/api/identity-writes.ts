import type { Abi, Address } from "viem";
import { credentialRegistryAbi, organizationRegistryAbi } from "@/lib/contracts/generated/abis";
import { requireAddress, type AddressBook } from "@/lib/contracts/addressBook";
import type { WriteRequest } from "./writes";

/**
 * Identity write descriptors.
 *
 * Kept in the domain layer with every other write, so no component ever holds an ABI.
 */

const KEYS = [["organizations"], ["credentials"], ["dashboard"], ["asset"]] as const;

function org(book: AddressBook, functionName: string, args: readonly unknown[]): WriteRequest {
  return {
    address: requireAddress(book, "ORGANIZATION_REGISTRY"),
    abi: organizationRegistryAbi as Abi,
    functionName,
    args,
    invalidates: KEYS,
  };
}

function cred(book: AddressBook, functionName: string, args: readonly unknown[]): WriteRequest {
  return {
    address: requireAddress(book, "CREDENTIAL_REGISTRY"),
    abi: credentialRegistryAbi as Abi,
    functionName,
    args,
    invalidates: KEYS,
  };
}

export const orgWrites = {
  register(
    book: AddressBook,
    a: { orgType: number; nameHash: `0x${string}`; metadataHash: `0x${string}`; uri: string },
  ): WriteRequest {
    return org(book, "registerOrganization", [a.orgType, a.nameHash, a.metadataHash, a.uri]);
  },

  update(
    book: AddressBook,
    a: { orgId: bigint; metadataHash: `0x${string}`; uri: string },
  ): WriteRequest {
    return org(book, "updateOrganization", [a.orgId, a.metadataHash, a.uri]);
  },

  setOperator(
    book: AddressBook,
    a: { orgId: bigint; operator: Address; allowed: boolean },
  ): WriteRequest {
    return org(book, "setOperator", [a.orgId, a.operator, a.allowed]);
  },

  transferAdmin(book: AddressBook, a: { orgId: bigint; newAdmin: Address }): WriteRequest {
    return org(book, "transferOrganizationAdmin", [a.orgId, a.newAdmin]);
  },

  acceptAdmin: (book: AddressBook, orgId: bigint) => org(book, "acceptOrganizationAdmin", [orgId]),
  cancelAdminTransfer: (book: AddressBook, orgId: bigint) =>
    org(book, "cancelOrganizationAdminTransfer", [orgId]),

  verify: (book: AddressBook, orgId: bigint) => org(book, "verifyOrganization", [orgId]),
  reject: (book: AddressBook, orgId: bigint) => org(book, "rejectOrganization", [orgId]),
  suspend: (book: AddressBook, orgId: bigint) => org(book, "suspendOrganization", [orgId]),
  reactivate: (book: AddressBook, orgId: bigint) => org(book, "reactivateOrganization", [orgId]),

  /**
   * Terminal, and held by the timelock.
   *
   * Calling this directly reverts for anyone but the timelock contract itself. It is
   * exposed so a proposer can see the exact calldata their governance proposal must
   * carry, not because a wallet can execute it.
   */
  revoke: (book: AddressBook, orgId: bigint) => org(book, "revokeOrganization", [orgId]),
};

export const credentialWrites = {
  issue(
    book: AddressBook,
    a: {
      issuerOrgId: bigint;
      subject: Address;
      subjectOrgId: bigint;
      credType: number;
      expiresAt: number;
      credentialHash: `0x${string}`;
    },
  ): WriteRequest {
    return cred(book, "issueCredential", [
      a.issuerOrgId,
      a.subject,
      a.subjectOrgId,
      a.credType,
      a.expiresAt,
      a.credentialHash,
    ]);
  },

  suspend: (book: AddressBook, id: bigint) => cred(book, "suspendCredential", [id]),
  reinstate: (book: AddressBook, id: bigint) => cred(book, "reinstateCredential", [id]),
  revoke: (book: AddressBook, id: bigint) => cred(book, "revokeCredential", [id]),
  /** Permissionless. Only records time that has already passed. */
  expire: (book: AddressBook, id: bigint) => cred(book, "expireCredential", [id]),
};
