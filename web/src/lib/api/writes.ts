import type { Abi, Address } from "viem";
import { escrowAbi, marketplaceAbi } from "@/lib/contracts/generated/abis";
import { ERC20_ABI } from "./market";
import { requireAddress, type AddressBook } from "@/lib/contracts/addressBook";

/**
 * Write descriptors.
 *
 * Reads were already confined to this layer; writes belong here for the same reason. A
 * component that imports an ABI to build a write can just as easily build a read, and the
 * containment boundary stops meaning anything.
 *
 * Each factory returns everything `useContractWrite` needs, with the address resolved
 * from the live address book rather than a constant — so a module redeployed behind the
 * registry is picked up without a code change.
 */

export type WriteRequest = {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  invalidates: readonly (readonly unknown[])[];
};

const MARKET_KEYS = [["market"], ["dashboard"], ["asset"]] as const;

/** Marketplace: listings and offers. */
export const marketWrites = {
  createListing(
    book: AddressBook,
    args: { assetId: bigint; token: Address; price: bigint; expiresAt: number },
  ): WriteRequest {
    return {
      address: requireAddress(book, "MARKETPLACE"),
      abi: marketplaceAbi as Abi,
      functionName: "createListing",
      args: [args.assetId, args.token, args.price, args.expiresAt],
      invalidates: MARKET_KEYS,
    };
  },

  cancelListing(book: AddressBook, listingId: bigint): WriteRequest {
    return call(book, "cancelListing", [listingId]);
  },

  expireListing(book: AddressBook, listingId: bigint): WriteRequest {
    return call(book, "expireListing", [listingId]);
  },

  makeOffer(
    book: AddressBook,
    args: { listingId: bigint; price: bigint; expiresAt: number },
  ): WriteRequest {
    return call(book, "makeOffer", [args.listingId, args.price, args.expiresAt]);
  },

  withdrawOffer(book: AddressBook, offerId: bigint): WriteRequest {
    return call(book, "withdrawOffer", [offerId]);
  },

  rejectOffer(book: AddressBook, offerId: bigint): WriteRequest {
    return call(book, "rejectOffer", [offerId]);
  },

  acceptOffer(book: AddressBook, offerId: bigint): WriteRequest {
    return call(book, "acceptOffer", [offerId]);
  },

  expireOffer(book: AddressBook, offerId: bigint): WriteRequest {
    return call(book, "expireOffer", [offerId]);
  },
};

function call(book: AddressBook, functionName: string, args: readonly unknown[]): WriteRequest {
  return {
    address: requireAddress(book, "MARKETPLACE"),
    abi: marketplaceAbi as Abi,
    functionName,
    args,
    invalidates: MARKET_KEYS,
  };
}

/** Escrow: the settlement path. Every call targets one specific clone. */
export const escrowWrites = {
  fund: (escrow: Address): WriteRequest => escrowCall(escrow, "fund"),
  release: (escrow: Address): WriteRequest => escrowCall(escrow, "release"),
  cancel: (escrow: Address): WriteRequest => escrowCall(escrow, "cancel"),
  raiseDispute: (escrow: Address): WriteRequest => escrowCall(escrow, "raiseDispute"),
  claimTimeout: (escrow: Address): WriteRequest => escrowCall(escrow, "claimTimeout"),
  claimDisputeTimeout: (escrow: Address): WriteRequest =>
    escrowCall(escrow, "claimDisputeTimeout"),
};

function escrowCall(escrow: Address, functionName: string): WriteRequest {
  return {
    address: escrow,
    abi: escrowAbi as Abi,
    functionName,
    args: [],
    invalidates: MARKET_KEYS,
  };
}

/**
 * ERC-20 approval, for an exact amount and one specific spender.
 *
 * There is deliberately no unlimited-approval helper. Each escrow is a single-use clone,
 * so an unlimited allowance is pure downside with no convenience gain — and the absence
 * of the function is a stronger guarantee than a comment asking people not to.
 */
export function approveExact(token: Address, spender: Address, amount: bigint): WriteRequest {
  return {
    address: token,
    abi: ERC20_ABI as Abi,
    functionName: "approve",
    args: [spender, amount],
    invalidates: MARKET_KEYS,
  };
}
