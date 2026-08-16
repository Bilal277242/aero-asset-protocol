import type { Abi, Address } from "viem";
import {
  assetRegistryAbi,
  feeManagerAbi,
  organizationRegistryAbi,
  protocolAddressRegistryAbi,
  roleManagerAbi,
} from "@/lib/contracts/generated/abis";
import { requireAddress, type AddressBook } from "@/lib/contracts/addressBook";
import type { AddressBookKey } from "@/lib/contracts/generated/addresses";
import { ADDRESS_REGISTRY } from "@/config/env";
import type { WriteRequest } from "./writes";

/**
 * Privileged write descriptors.
 *
 * Every one of these is built here rather than in a component, so no admin screen ever
 * holds an ABI — the same containment boundary the rest of the app is under, and more
 * important here than anywhere else.
 *
 * **These are offered whether or not the connected wallet can execute them.** The console
 * gates on `hasRole`, and the simulation in `useContractWrite` gates again; but a
 * timelocked action still needs its calldata to be *visible*, because building the
 * governance proposal is the only way it will ever be executed. A console that hid the
 * calldata for everything it could not execute would be useless for exactly the actions
 * that matter most.
 */

const ALL = [
  ["admin"],
  ["organizations"],
  ["credentials"],
  ["assets"],
  ["dashboard"],
  ["marketplace"],
] as const;

function at(book: AddressBook, key: AddressBookKey, abi: Abi, functionName: string, args: readonly unknown[]): WriteRequest {
  return { address: requireAddress(book, key), abi, functionName, args, invalidates: ALL };
}

export const adminWrites = {
  // ── Organizations ─────────────────────────────────────────────────
  verifyOrganization: (b: AddressBook, orgId: bigint) =>
    at(b, "ORGANIZATION_REGISTRY", organizationRegistryAbi as Abi, "verifyOrganization", [orgId]),
  rejectOrganization: (b: AddressBook, orgId: bigint) =>
    at(b, "ORGANIZATION_REGISTRY", organizationRegistryAbi as Abi, "rejectOrganization", [orgId]),
  suspendOrganization: (b: AddressBook, orgId: bigint) =>
    at(b, "ORGANIZATION_REGISTRY", organizationRegistryAbi as Abi, "suspendOrganization", [orgId]),
  reactivateOrganization: (b: AddressBook, orgId: bigint) =>
    at(b, "ORGANIZATION_REGISTRY", organizationRegistryAbi as Abi, "reactivateOrganization", [orgId]),
  revokeOrganization: (b: AddressBook, orgId: bigint) =>
    at(b, "ORGANIZATION_REGISTRY", organizationRegistryAbi as Abi, "revokeOrganization", [orgId]),

  // ── Assets ────────────────────────────────────────────────────────
  verifyAsset: (b: AddressBook, assetId: bigint, verifierOrgId: bigint) =>
    at(b, "ASSET_REGISTRY", assetRegistryAbi as Abi, "verifyAsset", [assetId, verifierOrgId]),
  unverifyAsset: (b: AddressBook, assetId: bigint) =>
    at(b, "ASSET_REGISTRY", assetRegistryAbi as Abi, "unverifyAsset", [assetId]),
  recoverTerminalAsset: (b: AddressBook, assetId: bigint, newStatus: number) =>
    at(b, "ASSET_REGISTRY", assetRegistryAbi as Abi, "recoverTerminalAsset", [assetId, newStatus]),
  releaseSerialNumberHash: (b: AddressBook, assetId: bigint) =>
    at(b, "ASSET_REGISTRY", assetRegistryAbi as Abi, "releaseSerialNumberHash", [assetId]),

  // ── Fees ──────────────────────────────────────────────────────────
  setFeeBps: (b: AddressBook, feeType: `0x${string}`, bps: number) =>
    at(b, "FEE_MANAGER", feeManagerAbi as Abi, "setFeeBps", [feeType, bps]),
  setTreasury: (b: AddressBook, treasury: Address) =>
    at(b, "FEE_MANAGER", feeManagerAbi as Abi, "setTreasury", [treasury]),
  setTokenAllowed: (b: AddressBook, token: Address, allowed: boolean) =>
    at(b, "FEE_MANAGER", feeManagerAbi as Abi, "setTokenAllowed", [token, allowed]),

  // ── Roles ─────────────────────────────────────────────────────────
  grantRole: (b: AddressBook, role: `0x${string}`, account: Address) =>
    at(b, "ROLE_MANAGER", roleManagerAbi as Abi, "grantRole", [role, account]),
  revokeRole: (b: AddressBook, role: `0x${string}`, account: Address) =>
    at(b, "ROLE_MANAGER", roleManagerAbi as Abi, "revokeRole", [role, account]),
  setRoleAdmin: (b: AddressBook, role: `0x${string}`, adminRole: `0x${string}`) =>
    at(b, "ROLE_MANAGER", roleManagerAbi as Abi, "setRoleAdmin", [role, adminRole]),

  // ── Configuration ─────────────────────────────────────────────────
  /**
   * Pause and unpause are identical across all nine modules, so one ABI serves for each.
   * The target is a module key rather than a fixed address — a console that could only
   * pause one contract would be no use in an incident.
   */
  pause: (b: AddressBook, moduleKey: AddressBookKey) =>
    at(b, moduleKey, organizationRegistryAbi as Abi, "pause", []),
  unpause: (b: AddressBook, moduleKey: AddressBookKey) =>
    at(b, moduleKey, organizationRegistryAbi as Abi, "unpause", []),

  /**
   * The address registry is not a key in its own book — it *is* the book, resolved from
   * configuration as the single root of trust. Looking it up through `requireAddress`
   * would fail, so it comes from `ADDRESS_REGISTRY` directly.
   */
  setAddress: (key: `0x${string}`, newAddress: Address): WriteRequest => ({
    address: ADDRESS_REGISTRY,
    abi: protocolAddressRegistryAbi as Abi,
    functionName: "setAddress",
    args: [key, newAddress],
    invalidates: [...ALL, ["addressBook"]],
  }),
};
