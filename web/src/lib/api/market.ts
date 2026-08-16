import type { Address, Hex, PublicClient } from "viem";
import {
  aircraftRegistryAbi,
  assetOwnershipAbi,
  assetPassportAbi,
  componentRegistryAbi,
  escrowAbi,
  feeManagerAbi,
  marketplaceAbi,
} from "@/lib/contracts/generated/abis";
import { AssetKind, ListingStatus, OfferStatus } from "@/lib/contracts/generated/enums";
import { requireAddress, type AddressBook } from "@/lib/contracts/addressBook";
import { value } from "@/hooks/useContractRead";
import { abiEvent, scanLogs } from "./logs";

/**
 * The marketplace read layer.
 *
 * `ListingState` uses deliberately different words from the on-chain `ListingStatus`, so
 * a raw enum value cannot be assigned to it without a type error. That is the point: the
 * stored status goes stale. A listing past its `expiresAt` still reads `ACTIVE` in
 * storage until somebody pays gas to record the expiry, and `isListingActive` exists
 * precisely because reading the field alone is wrong.
 *
 * `lapsed` has no on-chain counterpart. It is the trap promoted to a first-class state.
 */

type Entry = { status: "success"; result: unknown } | { status: "failure" };
const ZERO = "0x0000000000000000000000000000000000000000";

export const ERC20_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

// ──────────────────────────────────────────────────────────── types ────

export type ListingState =
  /** Stored ACTIVE and inside its window. The only state that accepts offers. */
  | "active"
  /** Stored ACTIVE, past `expiresAt`, expiry unrecorded. Every action reverts. */
  | "lapsed"
  /** Expiry recorded on-chain. */
  | "expired"
  | "sold"
  | "cancelled";

export type OfferState =
  | "active"
  | "lapsed"
  | "expired"
  | "accepted"
  | "withdrawn"
  | "rejected";

export type ListingView = {
  listingId: bigint;
  state: ListingState;
  seller: Address;
  assetId: bigint;
  paymentToken: Address;
  price: bigint;
  createdAt: number;
  expiresAt: number;
  /** Set while a trade is mid-flight. The listing is still `active`. */
  escrow: { escrowId: bigint; address: Address } | null;
  /** `seller` is a snapshot taken at listing time and never re-read. */
  currentOwner: Address | null;
  sellerStillOwns: boolean | null;
  /** Asset context, so the market table is readable without a second page. */
  asset: { kind: number; verified: boolean; label: Hex | null } | null;
  blockNumber: bigint;
};

export type OfferView = {
  offerId: bigint;
  listingId: bigint;
  state: OfferState;
  buyer: Address;
  price: bigint;
  createdAt: number;
  expiresAt: number;
};

export type TokenMeta = { address: Address; decimals: number; symbol: string };

// ─────────────────────────────────────────────────────── derivations ────

/** Mirrors `isListingActive`, including its strict `expiresAt > block.timestamp`. */
export function deriveListingState(
  status: number,
  expiresAt: number,
  now: bigint,
): ListingState {
  switch (status) {
    case ListingStatus.SOLD:
      return "sold";
    case ListingStatus.CANCELLED:
      return "cancelled";
    case ListingStatus.EXPIRED:
      return "expired";
    case ListingStatus.ACTIVE:
      return BigInt(expiresAt) > now ? "active" : "lapsed";
    default:
      // NONE cannot reach here — `getListing` reverts first — but treating an unknown
      // status as anything other than "not buyable" is the wrong default to hold.
      return "expired";
  }
}

export function deriveOfferState(status: number, expiresAt: number, now: bigint): OfferState {
  switch (status) {
    case OfferStatus.ACCEPTED:
      return "accepted";
    case OfferStatus.WITHDRAWN:
      return "withdrawn";
    case OfferStatus.REJECTED:
      return "rejected";
    case OfferStatus.EXPIRED:
      return "expired";
    case OfferStatus.ACTIVE:
      return BigInt(expiresAt) > now ? "active" : "lapsed";
    default:
      return "expired";
  }
}

export const LISTING_TONE: Record<ListingState, "confirmed" | "blocked" | "adverse" | "unrecorded" | "neutral"> = {
  active: "confirmed",
  lapsed: "unrecorded",
  expired: "neutral",
  sold: "neutral",
  cancelled: "adverse",
};

export const LISTING_LABEL: Record<ListingState, string> = {
  active: "Active",
  lapsed: "Lapsed",
  expired: "Expired",
  sold: "Sold",
  cancelled: "Cancelled",
};

export const OFFER_TONE: Record<OfferState, "confirmed" | "blocked" | "adverse" | "unrecorded" | "neutral"> = {
  active: "confirmed",
  lapsed: "unrecorded",
  expired: "neutral",
  accepted: "blocked",
  withdrawn: "neutral",
  rejected: "adverse",
};

// ────────────────────────────────────────────────────────── readers ────

type RawListing = {
  seller: Address;
  createdAt: number;
  expiresAt: number;
  status: number;
  paymentToken: Address;
  assetId: bigint;
  price: bigint;
  escrowId: bigint;
};

/**
 * A page of listings, with the effective state computed alongside the stored one.
 *
 * Transport-agnostic by design: it takes ids and returns views, so the day the id source
 * becomes a subgraph rather than a descending counter window, only the caller changes.
 */
export async function readListingPage(
  client: PublicClient,
  book: AddressBook,
  ids: bigint[],
  now: bigint,
  blockNumber: bigint,
): Promise<ListingView[]> {
  if (ids.length === 0) return [];
  const marketplace = requireAddress(book, "MARKETPLACE");

  const results = await client.multicall({
    contracts: ids.flatMap((id) => [
      { address: marketplace, abi: marketplaceAbi, functionName: "getListing" as const, args: [id] },
      { address: marketplace, abi: marketplaceAbi, functionName: "isListingActive" as const, args: [id] },
      { address: marketplace, abi: marketplaceAbi, functionName: "escrowOf" as const, args: [id] },
    ]),
    allowFailure: true,
    blockNumber,
  });

  const found: { listingId: bigint; raw: RawListing; isActive: boolean | null; escrow: Address | null }[] = [];
  ids.forEach((listingId, i) => {
    const raw = value<RawListing>(results[i * 3] as Entry);
    if (!raw) return;
    found.push({
      listingId,
      raw,
      isActive: value<boolean>(results[i * 3 + 1] as Entry),
      escrow: value<Address>(results[i * 3 + 2] as Entry),
    });
  });

  if (found.length === 0) return [];

  // Owner and asset context, so a market row is readable without opening the passport.
  const assetIds = [...new Set(found.map((f) => f.raw.assetId.toString()))].map(BigInt);
  const context = await client.multicall({
    contracts: assetIds.flatMap((assetId) => [
      {
        address: requireAddress(book, "ASSET_OWNERSHIP"),
        abi: assetOwnershipAbi,
        functionName: "ownerOf" as const,
        args: [assetId],
      },
      {
        address: requireAddress(book, "ASSET_PASSPORT"),
        abi: assetPassportAbi,
        functionName: "getPassport" as const,
        args: [assetId],
      },
    ]),
    allowFailure: true,
    blockNumber,
  });

  const owners = new Map<string, Address>();
  const passports = new Map<string, { kind: number; verified: boolean }>();
  assetIds.forEach((assetId, i) => {
    const owner = value<Address>(context[i * 2] as Entry);
    if (owner) owners.set(assetId.toString(), owner);
    const p = value<{ kind: number; verified: boolean }>(context[i * 2 + 1] as Entry);
    if (p) passports.set(assetId.toString(), { kind: p.kind, verified: p.verified });
  });

  const labels = await readAssetLabels(client, book, assetIds, passports, blockNumber);

  return found.map(({ listingId, raw, isActive, escrow }) => {
    const state = deriveListingState(raw.status, raw.expiresAt, now);
    assertAgrees(listingId, state, isActive);

    const currentOwner = owners.get(raw.assetId.toString()) ?? null;
    const p = passports.get(raw.assetId.toString());

    return {
      listingId,
      state,
      seller: raw.seller,
      assetId: raw.assetId,
      paymentToken: raw.paymentToken,
      price: raw.price,
      createdAt: raw.createdAt,
      expiresAt: raw.expiresAt,
      escrow: escrow && escrow !== ZERO ? { escrowId: raw.escrowId, address: escrow } : null,
      currentOwner,
      sellerStillOwns:
        currentOwner === null ? null : currentOwner.toLowerCase() === raw.seller.toLowerCase(),
      asset: p ? { kind: p.kind, verified: p.verified, label: labels.get(raw.assetId.toString()) ?? null } : null,
      blockNumber,
    };
  });
}

async function readAssetLabels(
  client: PublicClient,
  book: AddressBook,
  assetIds: bigint[],
  passports: Map<string, { kind: number }>,
  blockNumber: bigint,
): Promise<Map<string, Hex>> {
  if (assetIds.length === 0) return new Map();

  const results = await client.multicall({
    contracts: assetIds.map((assetId) =>
      passports.get(assetId.toString())?.kind === AssetKind.AIRCRAFT
        ? {
            address: requireAddress(book, "AIRCRAFT_REGISTRY"),
            abi: aircraftRegistryAbi,
            functionName: "getAircraft" as const,
            args: [assetId],
          }
        : {
            address: requireAddress(book, "COMPONENT_REGISTRY"),
            abi: componentRegistryAbi,
            functionName: "getComponent" as const,
            args: [assetId],
          },
    ),
    allowFailure: true,
    blockNumber,
  });

  const out = new Map<string, Hex>();
  assetIds.forEach((assetId, i) => {
    const spec = value<{ model?: Hex; partNumber?: Hex }>(results[i] as Entry);
    const label = spec?.model ?? spec?.partNumber;
    if (label) out.set(assetId.toString(), label);
  });
  return out;
}

/**
 * The dev-mode tripwire.
 *
 * The derivation above reimplements `isListingActive` in TypeScript, and the contract's
 * own answer arrives in the same multicall, so comparing them is free. It catches what
 * unit tests structurally cannot: an enum shifted by a redeploy, a regenerated ABI that
 * reordered a struct, a `now` accidentally taken from the browser clock.
 */
function assertAgrees(listingId: bigint, state: ListingState, isActive: boolean | null): void {
  if (process.env.NODE_ENV === "production" || isActive === null) return;
  if ((state === "active") !== isActive) {
    console.error(
      `[market] listing ${listingId}: derived "${state}" but isListingActive() returned ` +
        `${isActive}. The effective-status layer and the contract disagree — treat every ` +
        `listing state on this page as untrustworthy until this is explained.`,
    );
  }
}

export async function readListingCount(client: PublicClient, book: AddressBook): Promise<bigint> {
  return client.readContract({
    address: requireAddress(book, "MARKETPLACE"),
    abi: marketplaceAbi,
    functionName: "listingCount",
  });
}

/** Descending id window, newest first. Ids are dense from 1. */
export function descendingWindow(count: bigint, size: number): bigint[] {
  const ids: bigint[] = [];
  for (let i = 0; i < size; i++) {
    const id = count - BigInt(i);
    if (id < 1n) break;
    ids.push(id);
  }
  return ids;
}

/**
 * Every offer against a listing.
 *
 * There is no on-chain index from a listing to its offers — building one would have meant
 * an unbounded array, which the protocol forbids in state-changing functions — so the ids
 * come from `OfferMade` logs, filtered on the indexed `listingId` so the provider does
 * the work rather than the browser.
 *
 * **The logs supply ids and nothing else.** Every field rendered comes from a fresh
 * `getOffer` at a pinned height: an offer that has since been withdrawn, rejected or
 * accepted still has its original `OfferMade` sitting in the chain, unchanged and
 * completely misleading.
 */
export async function readOffersForListing(
  client: PublicClient,
  book: AddressBook,
  listingId: bigint,
  now: bigint,
  fromBlock: bigint,
  blockNumber: bigint,
): Promise<OfferView[]> {
  const marketplace = requireAddress(book, "MARKETPLACE");

  const logs = await scanLogs(client, {
    address: marketplace,
    event: abiEvent(marketplaceAbi, "OfferMade"),
    args: { listingId },
    fromBlock,
    toBlock: blockNumber,
  });

  const ids = [
    ...new Set(
      logs
        .map((l) => l.args.offerId)
        .filter((id): id is bigint => typeof id === "bigint")
        .map(String),
    ),
  ].map(BigInt);

  if (ids.length === 0) return [];

  const results = await client.multicall({
    contracts: ids.map((id) => ({
      address: marketplace,
      abi: marketplaceAbi,
      functionName: "getOffer" as const,
      args: [id],
    })),
    allowFailure: true,
    blockNumber,
  });

  return ids
    .flatMap((offerId, i) => {
      const raw = value<{
        buyer: Address;
        createdAt: number;
        expiresAt: number;
        status: number;
        listingId: bigint;
        price: bigint;
      }>(results[i] as Entry);
      if (!raw) return [];
      return [
        {
          offerId,
          listingId: raw.listingId,
          state: deriveOfferState(raw.status, raw.expiresAt, now),
          buyer: raw.buyer,
          price: raw.price,
          createdAt: raw.createdAt,
          expiresAt: raw.expiresAt,
        },
      ];
    })
    .sort((a, b) => {
      // Best price first; ties to the earlier offer, which is the fairer read.
      if (a.price !== b.price) return a.price > b.price ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
}

/** Token metadata. Immutable per token, so cached for the process lifetime. */
const tokenCache = new Map<string, TokenMeta>();

export async function readTokenMeta(
  client: PublicClient,
  token: Address,
): Promise<TokenMeta> {
  const key = token.toLowerCase();
  const hit = tokenCache.get(key);
  if (hit) return hit;

  const [decimals, symbol] = await client.multicall({
    contracts: [
      { address: token, abi: ERC20_ABI, functionName: "decimals" },
      { address: token, abi: ERC20_ABI, functionName: "symbol" },
    ],
    allowFailure: true,
  });

  const meta: TokenMeta = {
    address: token,
    // A token that will not say is shown in base units rather than guessed at. Wrong
    // decimals are worse than none: they look like a price.
    decimals: decimals.status === "success" ? Number(decimals.result) : 0,
    symbol: symbol.status === "success" ? String(symbol.result) : "units",
  };
  tokenCache.set(key, meta);
  return meta;
}

/**
 * The indicative protocol fee.
 *
 * Indicative is not a hedge. `feeBps` is governable, and the number that binds a trade is
 * `feeAmount`, frozen into the escrow terms at acceptance. Anything shown before
 * acceptance is a quote at today's rate and must be labelled as one.
 */
export async function quoteFee(
  client: PublicClient,
  book: AddressBook,
  price: bigint,
): Promise<bigint | null> {
  try {
    const feeManager = requireAddress(book, "FEE_MANAGER");
    const feeType = await client.readContract({
      address: feeManager,
      abi: feeManagerAbi,
      functionName: "FEE_TYPE_MARKETPLACE",
    });
    return await client.readContract({
      address: feeManager,
      abi: feeManagerAbi,
      functionName: "quote",
      args: [feeType, price],
    });
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────── escrow ────

export type EscrowView = {
  address: Address;
  escrowId: bigint;
  status: number;
  deposited: bigint;
  isTerminal: boolean;
  terms: {
    listingId: bigint;
    assetId: bigint;
    buyer: Address;
    seller: Address;
    paymentToken: Address;
    treasury: Address;
    price: bigint;
    feeAmount: bigint;
    fundingDeadline: number;
    settlementDeadline: number;
  };
  disputeRaisedAt: number;
  disputeDeadline: number;
  timeoutPenaltyBps: number;
  /**
   * Payouts that could not be delivered and are now claimable.
   *
   * Non-zero means a transfer failed at settlement — a blocked account on the settlement
   * token, most plausibly. The escrow still reached its terminal state; the money is
   * recoverable through `withdraw`. Silent is the one thing this must not be.
   */
  totalDeferred: bigint;
};

export async function readEscrow(
  client: PublicClient,
  address: Address,
  blockNumber: bigint,
): Promise<EscrowView | null> {
  const results = await client.multicall({
    contracts: [
      { address, abi: escrowAbi, functionName: "escrowId" },
      { address, abi: escrowAbi, functionName: "status" },
      { address, abi: escrowAbi, functionName: "depositedAmount" },
      { address, abi: escrowAbi, functionName: "isTerminal" },
      { address, abi: escrowAbi, functionName: "getTerms" },
      { address, abi: escrowAbi, functionName: "disputeRaisedAt" },
      { address, abi: escrowAbi, functionName: "disputeDeadline" },
      { address, abi: escrowAbi, functionName: "TIMEOUT_PENALTY_BPS" },
      { address, abi: escrowAbi, functionName: "totalDeferred" },
    ],
    allowFailure: true,
    blockNumber,
  });

  const terms = value<EscrowView["terms"]>(results[4] as Entry);
  const escrowId = value<bigint>(results[0] as Entry);
  const status = value<number>(results[1] as Entry);
  if (!terms || escrowId === null || status === null) return null;

  return {
    address,
    escrowId,
    status,
    deposited: value<bigint>(results[2] as Entry) ?? 0n,
    isTerminal: value<boolean>(results[3] as Entry) ?? false,
    terms,
    disputeRaisedAt: value<number>(results[5] as Entry) ?? 0,
    disputeDeadline: value<number>(results[6] as Entry) ?? 0,
    timeoutPenaltyBps: value<number>(results[7] as Entry) ?? 0,
    totalDeferred: value<bigint>(results[8] as Entry) ?? 0n,
  };
}

/**
 * Whether the ownership module is paused.
 *
 * Kept separate because it gates `release` specifically: `settleTransfer` is pause-gated
 * while `markSold` is not, so a buyer can fund into a state whose only exit is a
 * penalised timeout. `paused()` is identical across every module built on
 * `ProtocolModuleUpgradeable`, so the marketplace ABI serves for the call.
 */
export async function readAssetsPaused(
  client: PublicClient,
  book: AddressBook,
  blockNumber: bigint,
): Promise<boolean> {
  try {
    return (await client.readContract({
      address: requireAddress(book, "ASSET_OWNERSHIP"),
      abi: marketplaceAbi,
      functionName: "paused",
      blockNumber,
    })) as boolean;
  } catch {
    return false;
  }
}

/** Buyer's balance and current allowance to a specific escrow clone. */
export async function readFunding(
  client: PublicClient,
  token: Address,
  owner: Address,
  spender: Address,
  blockNumber: bigint,
): Promise<{ balance: bigint; allowance: bigint }> {
  const [balance, allowance] = await client.multicall({
    contracts: [
      { address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [owner] },
      { address: token, abi: ERC20_ABI, functionName: "allowance", args: [owner, spender] },
    ],
    allowFailure: true,
    blockNumber,
  });

  return {
    balance: value<bigint>(balance as Entry) ?? 0n,
    allowance: value<bigint>(allowance as Entry) ?? 0n,
  };
}
