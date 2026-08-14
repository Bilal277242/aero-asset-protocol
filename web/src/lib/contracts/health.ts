import type { Address, PublicClient } from "viem";
import {
  assetRegistryAbi,
  credentialRegistryAbi,
  escrowFactoryAbi,
  feeManagerAbi,
  marketplaceAbi,
  organizationRegistryAbi,
} from "@/generated/abis";
import { resolveAddressBook, type ResolvedAddressBook } from "./addressBook";

/** Modules that expose a pause. The immutable contracts have none. */
const PAUSABLE = [
  "MARKETPLACE",
  "ASSET_OWNERSHIP",
  "ASSET_REGISTRY",
  "AIRCRAFT_REGISTRY",
  "COMPONENT_REGISTRY",
  "DOCUMENT_REGISTRY",
  "MAINTENANCE_REGISTRY",
  "ORGANIZATION_REGISTRY",
  "CREDENTIAL_REGISTRY",
] as const;

export type PauseState = Record<(typeof PAUSABLE)[number], boolean | null>;

export type ProtocolHealth = {
  book: ResolvedAddressBook;
  pause: PauseState;
  /** True when any module is paused — settlement stops, refunds do not. */
  anyPaused: boolean;
  fees: {
    marketplaceBps: number | null;
    maxBps: number | null;
    treasury: Address | null;
    settlementTokenAllowed: boolean | null;
  };
  counts: {
    listings: bigint | null;
    offers: bigint | null;
    escrows: bigint | null;
    assets: bigint | null;
    organizations: bigint | null;
    credentials: bigint | null;
  };
  blockNumber: bigint;
};

/**
 * One round trip that answers "is this deployment wired, live, and the one I think it is".
 *
 * Deliberately the first page built. Every later "why did that revert" question starts
 * here — a paused module, an unallowlisted token, or an address book pointing somewhere
 * unexpected all show up immediately rather than as an opaque failure three screens deep.
 */
export async function readProtocolHealth(
  client: PublicClient,
  chainId: number,
  registry: Address,
  settlementToken: Address,
): Promise<ProtocolHealth> {
  const [book, blockNumber] = await Promise.all([
    resolveAddressBook(client, chainId, registry),
    client.getBlockNumber(),
  ]);

  const a = book.addresses;

  const pauseCalls = PAUSABLE.filter((key) => a[key]).map((key) => ({
    address: a[key],
    abi: marketplaceAbi, // `paused()` is identical across every ProtocolModuleUpgradeable
    functionName: "paused" as const,
  }));

  const [pauseResults, rest] = await Promise.all([
    client.multicall({ contracts: pauseCalls, allowFailure: true, blockNumber }),
    client.multicall({
      contracts: [
        { address: a.FEE_MANAGER, abi: feeManagerAbi, functionName: "FEE_TYPE_MARKETPLACE" },
        { address: a.FEE_MANAGER, abi: feeManagerAbi, functionName: "MAX_FEE_BPS" },
        { address: a.FEE_MANAGER, abi: feeManagerAbi, functionName: "treasury" },
        {
          address: a.FEE_MANAGER,
          abi: feeManagerAbi,
          functionName: "isTokenAllowed",
          args: [settlementToken],
        },
        { address: a.MARKETPLACE, abi: marketplaceAbi, functionName: "listingCount" },
        { address: a.MARKETPLACE, abi: marketplaceAbi, functionName: "offerCount" },
        { address: a.ESCROW_FACTORY, abi: escrowFactoryAbi, functionName: "escrowCount" },
        { address: a.ASSET_REGISTRY, abi: assetRegistryAbi, functionName: "assetCount" },
        {
          address: a.ORGANIZATION_REGISTRY,
          abi: organizationRegistryAbi,
          functionName: "organizationCount",
        },
        {
          address: a.CREDENTIAL_REGISTRY,
          abi: credentialRegistryAbi,
          functionName: "credentialCount",
        },
      ],
      allowFailure: true,
      blockNumber,
    }),
  ]);

  const pause = {} as PauseState;
  let cursor = 0;
  for (const key of PAUSABLE) {
    if (!a[key]) {
      pause[key] = null;
      continue;
    }
    const result = pauseResults[cursor++];
    pause[key] = result?.status === "success" ? (result.result as boolean) : null;
  }

  const feeType = ok<`0x${string}`>(rest[0]);
  const marketplaceBps = feeType
    ? await client
        .readContract({
          address: a.FEE_MANAGER,
          abi: feeManagerAbi,
          functionName: "feeBps",
          args: [feeType],
          blockNumber,
        })
        .then((v) => Number(v))
        .catch(() => null)
    : null;

  return {
    book,
    pause,
    anyPaused: Object.values(pause).some((v) => v === true),
    fees: {
      marketplaceBps,
      maxBps: numberOrNull(rest[1]),
      treasury: ok<Address>(rest[2]),
      settlementTokenAllowed: ok<boolean>(rest[3]),
    },
    counts: {
      listings: ok<bigint>(rest[4]),
      offers: ok<bigint>(rest[5]),
      escrows: ok<bigint>(rest[6]),
      assets: ok<bigint>(rest[7]),
      organizations: ok<bigint>(rest[8]),
      credentials: ok<bigint>(rest[9]),
    },
    blockNumber,
  };
}

type MulticallResult = { status: "success"; result: unknown } | { status: "failure" };

function ok<T>(entry: MulticallResult | undefined): T | null {
  return entry?.status === "success" ? (entry.result as T) : null;
}

function numberOrNull(entry: MulticallResult | undefined): number | null {
  const value = ok<bigint | number>(entry);
  return value === null ? null : Number(value);
}
