import type { Address, PublicClient } from "viem";
import {
  assetOwnershipAbi,
  assetPassportAbi,
  componentRegistryAbi,
  feeManagerAbi,
  marketplaceAbi,
} from "@/lib/contracts/generated/abis";
import { AssetStatus, ComponentStatus } from "@/lib/contracts/generated/enums";
import { requireAddress, type AddressBook } from "@/lib/contracts/addressBook";
import { value } from "@/hooks/useContractRead";
import { SETTLEMENT_TOKEN } from "@/config/env";

/**
 * The nine preconditions `createListing` enforces, read live.
 *
 * The contract checks all of these and reverts with a specific typed error on the first
 * failure — but discovering them one wallet rejection at a time is a terrible way to
 * learn a protocol. Reading them up front turns nine possible dead ends into a checklist.
 *
 * Deliberately mirrors `ListingManager.createListing` in order, so a discrepancy between
 * this list and the contract is easy to spot when either changes.
 */

type Entry = { status: "success"; result: unknown } | { status: "failure" };

export type Precheck = {
  checks: { label: string; pass: boolean; detail?: string }[];
  allPass: boolean;
};

export async function readListingPrecheck(
  client: PublicClient,
  book: AddressBook,
  assetId: bigint,
  caller: Address | undefined,
  blockNumber: bigint,
): Promise<Precheck> {
  if (assetId === 0n || !caller) {
    return { checks: [], allPass: false };
  }

  const marketplace = requireAddress(book, "MARKETPLACE");

  const results = await client.multicall({
    contracts: [
      {
        address: requireAddress(book, "ASSET_PASSPORT"),
        abi: assetPassportAbi,
        functionName: "getPassport",
        args: [assetId],
      },
      {
        address: requireAddress(book, "ASSET_OWNERSHIP"),
        abi: assetOwnershipAbi,
        functionName: "isTransferable",
        args: [assetId],
      },
      {
        address: requireAddress(book, "COMPONENT_REGISTRY"),
        abi: componentRegistryAbi,
        functionName: "isComponent",
        args: [assetId],
      },
      {
        address: requireAddress(book, "COMPONENT_REGISTRY"),
        abi: componentRegistryAbi,
        functionName: "getComponent",
        args: [assetId],
      },
      { address: marketplace, abi: marketplaceAbi, functionName: "activeListingOf", args: [assetId] },
      { address: marketplace, abi: marketplaceAbi, functionName: "paused" },
      {
        address: requireAddress(book, "FEE_MANAGER"),
        abi: feeManagerAbi,
        functionName: "isTokenAllowed",
        args: [SETTLEMENT_TOKEN],
      },
    ],
    allowFailure: true,
    blockNumber,
  });

  const passport = value<{
    owner: Address;
    verified: boolean;
    status: number;
  }>(results[0] as Entry);

  const transferable = value<boolean>(results[1] as Entry);
  const isComponent = value<boolean>(results[2] as Entry) ?? false;
  const component = value<{ status: number; parentAssetId: bigint }>(results[3] as Entry);
  const activeListing = value<bigint>(results[4] as Entry) ?? 0n;
  const paused = value<boolean>(results[5] as Entry) ?? false;
  const tokenAllowed = value<boolean>(results[6] as Entry) ?? false;

  if (!passport) {
    return {
      checks: [{ label: "Asset exists", pass: false, detail: `No asset is registered under id ${assetId}.` }],
      allPass: false,
    };
  }

  const owns = passport.owner.toLowerCase() === caller.toLowerCase();
  const terminal =
    passport.status === AssetStatus.RETIRED || passport.status === AssetStatus.DESTROYED;
  const installed = isComponent && component?.status === ComponentStatus.INSTALLED;

  const checks: Precheck["checks"] = [
    { label: "Asset exists", pass: true },
    {
      label: "You own it",
      pass: owns,
      detail: owns ? undefined : `Owned by ${passport.owner.slice(0, 6)}…${passport.owner.slice(-4)}.`,
    },
    {
      label: "Attested by an asset verifier",
      pass: passport.verified,
      detail: passport.verified ? undefined : "Only a verified asset may be listed.",
    },
    {
      label: "Not retired or destroyed",
      pass: !terminal,
      detail: terminal ? "A terminal status freezes the asset." : undefined,
    },
    {
      label: "Transferable now",
      pass: transferable === true,
      detail:
        transferable === true
          ? undefined
          : "Frozen by a terminal status, or locked by a settlement in progress.",
    },
    {
      label: "Not installed in an airframe",
      pass: !installed,
      detail: installed
        ? `Fitted to asset #${component?.parentAssetId.toString()}. Remove it first.`
        : undefined,
    },
    {
      label: "No existing active listing",
      pass: activeListing === 0n,
      detail: activeListing === 0n ? undefined : `Listing #${activeListing.toString()} is already active.`,
    },
    {
      label: "Settlement token allowlisted",
      pass: tokenAllowed,
      detail: tokenAllowed ? undefined : "The configured token is not permitted for settlement.",
    },
    {
      label: "Marketplace not paused",
      pass: !paused,
      detail: paused ? "The marketplace module is halted." : undefined,
    },
  ];

  return { checks, allPass: checks.every((c) => c.pass) };
}
