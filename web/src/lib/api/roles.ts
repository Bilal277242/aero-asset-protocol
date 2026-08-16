import type { Address, PublicClient } from "viem";
import { roleManagerAbi } from "@/lib/contracts/generated/abis";
import { requireAddress, type AddressBook } from "@/lib/contracts/addressBook";
import { value } from "@/hooks/useContractRead";
import {
  DEFAULT_ADMIN_ROLE,
  PROTOCOL_ROLES,
  ROLE_INFO,
  emptyRoleSet,
  roleHash,
  type ProtocolRole,
  type RoleSet,
} from "./role-catalog";

/**
 * Reading roles from the chain.
 *
 * `RoleManager` is the authorization authority; this module only reports what it says.
 * Nothing here grants permission — a role check that passes in the browser and fails
 * on-chain simply means the UI offered a button that will revert, and a role check that
 * fails here while passing on-chain means a control was hidden that would have worked.
 * Both are usability defects; neither is a security boundary.
 *
 * The names and identifiers themselves live in `./role-catalog`, which has no chain
 * dependency, and are re-exported here so callers need only one import.
 */

export {
  DEFAULT_ADMIN_ROLE,
  PROTOCOL_ROLES,
  ROLE_INFO,
  emptyRoleSet,
  roleHash,
  type ProtocolRole,
  type RoleSet,
};

/** Which roles an account holds. One multicall, eleven answers. */
export async function readRoles(
  client: PublicClient,
  book: AddressBook,
  account: Address | undefined,
  blockNumber: bigint,
): Promise<RoleSet> {
  const empty = emptyRoleSet();
  if (!account) return empty;

  const roleManager = requireAddress(book, "ROLE_MANAGER");
  const hashes = [DEFAULT_ADMIN_ROLE, ...PROTOCOL_ROLES.map(roleHash)];

  const results = await client.multicall({
    contracts: hashes.map((hash) => ({
      address: roleManager,
      abi: roleManagerAbi,
      functionName: "hasRole" as const,
      args: [hash, account],
    })),
    allowFailure: true,
    blockNumber,
  });

  const out = { ...empty };
  out.DEFAULT_ADMIN = value<boolean>(results[0] as never) ?? false;
  PROTOCOL_ROLES.forEach((role, i) => {
    out[role] = value<boolean>(results[i + 1] as never) ?? false;
  });
  return out;
}

/** Every holder of every role, for the public authorization map. */
export async function readRoleHolders(
  client: PublicClient,
  book: AddressBook,
  blockNumber: bigint,
): Promise<{ role: ProtocolRole | "DEFAULT_ADMIN"; label: string; permits: string; holders: Address[] }[]> {
  const roleManager = requireAddress(book, "ROLE_MANAGER");
  const keys: (ProtocolRole | "DEFAULT_ADMIN")[] = ["DEFAULT_ADMIN", ...PROTOCOL_ROLES];
  const hashes = [DEFAULT_ADMIN_ROLE, ...PROTOCOL_ROLES.map(roleHash)];

  const results = await client.multicall({
    contracts: hashes.map((hash) => ({
      address: roleManager,
      abi: roleManagerAbi,
      // `getRoleMembers` returns the whole array, so no per-index loop is needed.
      functionName: "getRoleMembers" as const,
      args: [hash],
    })),
    allowFailure: true,
    blockNumber,
  });

  return keys.map((key, i) => ({
    role: key,
    label: ROLE_INFO[key].label,
    permits: ROLE_INFO[key].permits,
    holders: (value<readonly Address[]>(results[i] as never) ?? []) as Address[],
  }));
}
