import type { Address } from "viem";
import { EscrowStatus } from "@/lib/contracts/generated/enums";
import type { EscrowView, ListingView, OfferView } from "./market";

/**
 * Which actions the protocol will actually accept, and why not when it will not.
 *
 * Pure functions over already-read state. Keeping them here rather than inside components
 * means the awkward cases — a lapsed listing, an escrow already open, a seller who no
 * longer owns the asset — are decided in one place and are exhaustively testable.
 *
 * A disabled control always carries a reason. "Greyed out with no explanation" is the
 * commonest failure in permissioned interfaces, and this protocol has a lot of
 * preconditions.
 */

export type Action = {
  id: string;
  label: string;
  /** Who this is offered to. Used to group the UI. */
  actor: "seller" | "buyer" | "anyone";
  enabled: boolean;
  /** Why it is unavailable. Always present when `enabled` is false. */
  reason?: string;
  destructive?: boolean;
  primary?: boolean;
  /**
   * Whether this viewer is the party the action belongs to.
   *
   * A disabled control with a reason is helpful to the person who *could* have used it,
   * and pure noise to everyone else. Showing a disconnected visitor "Accept / Reject /
   * Withdraw" on someone else's offer teaches them nothing.
   */
  relevant: boolean;
};

export type Viewer = {
  address: Address | undefined;
  isConnected: boolean;
};

const is = (a: Address | undefined, b: Address | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

// ────────────────────────────────────────────────────────── listing ────

export function deriveListingActions(
  listing: ListingView,
  viewer: Viewer,
  now: bigint,
): Action[] {
  const isSeller = is(viewer.address, listing.seller);
  const hasEscrow = listing.escrow !== null;
  const past = BigInt(listing.expiresAt) <= now;

  const actions: Action[] = [];

  // ── Offer ───────────────────────────────────────────────────────────
  actions.push({
    id: "makeOffer",
    label: "Make an offer",
    actor: "buyer",
    primary: true,
    relevant: !isSeller,
    enabled:
      viewer.isConnected && !isSeller && listing.state === "active" && !!listing.sellerStillOwns,
    reason: !viewer.isConnected
      ? "Connect a wallet to make an offer."
      : isSeller
        ? "You cannot bid on your own listing."
        : listing.state === "lapsed"
          ? "This listing passed its deadline. Offers are refused even though the stored status still reads ACTIVE."
          : listing.state !== "active"
            ? `This listing is ${listing.state}.`
            : listing.sellerStillOwns === false
              ? "The seller no longer owns this asset, so any offer would fail at acceptance."
              : undefined,
  });

  // ── Cancel ──────────────────────────────────────────────────────────
  actions.push({
    id: "cancelListing",
    label: "Cancel listing",
    actor: "seller",
    destructive: true,
    relevant: isSeller,
    enabled: isSeller && listing.state === "active" && !hasEscrow,
    reason: !isSeller
      ? "Only the seller can cancel a listing."
      : hasEscrow
        ? "A trade is already in progress. A seller cannot cancel out from under a buyer who has committed."
        : listing.state !== "active"
          ? `This listing is already ${listing.state}.`
          : undefined,
  });

  // ── Record expiry — permissionless, and genuinely useful ────────────
  actions.push({
    id: "expireListing",
    label: "Record expiry",
    actor: "anyone",
    // Permissionless, so it is relevant to whoever is looking when it applies.
    relevant: listing.state === "lapsed",
    enabled: viewer.isConnected && listing.state === "lapsed",
    reason: !viewer.isConnected
      ? "Connect a wallet to record the expiry."
      : listing.state === "active"
        ? "This listing is still inside its window."
        : past && listing.state !== "lapsed"
          ? "The expiry has already been recorded."
          : "Only a lapsed listing can have its expiry recorded.",
  });

  return actions;
}

// ──────────────────────────────────────────────────────────── offer ────

export function deriveOfferActions(
  offer: OfferView,
  listing: ListingView,
  viewer: Viewer,
): Action[] {
  const isSeller = is(viewer.address, listing.seller);
  const isBuyer = is(viewer.address, offer.buyer);
  const hasEscrow = listing.escrow !== null;

  return [
    {
      id: "acceptOffer",
      label: "Accept",
      actor: "seller",
      primary: true,
      relevant: isSeller,
      enabled:
        isSeller &&
        offer.state === "active" &&
        listing.state === "active" &&
        !hasEscrow &&
        listing.sellerStillOwns !== false,
      reason: !isSeller
        ? "Only the seller can accept an offer."
        : offer.state === "lapsed"
          ? "This offer passed its deadline. Acceptance is refused even though the stored status still reads ACTIVE."
          : offer.state !== "active"
            ? `This offer is ${offer.state}.`
            : listing.state !== "active"
              ? `The listing is ${listing.state}.`
              : hasEscrow
                ? "A trade is already open against this listing."
                : listing.sellerStillOwns === false
                  ? "You no longer own this asset, so acceptance would revert."
                  : undefined,
    },
    {
      id: "rejectOffer",
      label: "Reject",
      actor: "seller",
      destructive: true,
      relevant: isSeller,
      enabled: isSeller && offer.state === "active",
      reason: !isSeller
        ? "Only the seller can reject an offer."
        : offer.state !== "active"
          ? `This offer is already ${offer.state}.`
          : undefined,
    },
    {
      id: "withdrawOffer",
      label: "Withdraw",
      actor: "buyer",
      destructive: true,
      relevant: isBuyer,
      enabled: isBuyer && offer.state === "active",
      reason: !isBuyer
        ? "Only the buyer can withdraw their own offer."
        : offer.state !== "active"
          ? `This offer is already ${offer.state}.`
          : undefined,
    },
    {
      id: "expireOffer",
      label: "Record expiry",
      actor: "anyone",
      relevant: offer.state === "lapsed",
      enabled: viewer.isConnected && offer.state === "lapsed",
      reason: !viewer.isConnected
        ? "Connect a wallet to record the expiry."
        : offer.state !== "lapsed"
          ? "Only a lapsed offer can have its expiry recorded."
          : undefined,
    },
  ];
}

// ─────────────────────────────────────────────────────────── escrow ────

export type EscrowFunding = {
  balance: bigint;
  allowance: bigint;
};

/**
 * The escrow cockpit.
 *
 * `release` gates on `AssetOwnership.paused()` — **not** `Marketplace.paused()` — because
 * `markSold` has no pause gate but `settleTransfer` does. Getting that backwards produces
 * a button that looks available and always reverts.
 */
export function deriveEscrowActions(
  escrow: EscrowView,
  viewer: Viewer,
  now: bigint,
  funding: EscrowFunding | null,
  assetsPaused: boolean,
): Action[] {
  const isBuyer = is(viewer.address, escrow.terms.buyer);
  const isSeller = is(viewer.address, escrow.terms.seller);
  const isParty = isBuyer || isSeller;

  /*
   * Deadline comparisons, taken from the contract rather than assumed.
   *
   * `Escrow.sol` uses **strict** comparisons throughout, so the deadline second itself
   * still belongs to the earlier phase:
   *
   *   fund()                reverts when `block.timestamp >  fundingDeadline`
   *   cancel() by a stranger reverts when `block.timestamp <= fundingDeadline`
   *   claimTimeout()        reverts when `block.timestamp <= settlementDeadline`
   *   raiseDispute()        reverts when `block.timestamp >  settlementDeadline`
   *   claimDisputeTimeout() reverts when `block.timestamp <= disputeRaisedAt + WINDOW`
   *
   * An earlier version of this file used `<=` for all of them, which offered `fund` one
   * second too late and `claimTimeout` one second too early — the exact window in which
   * a confidently enabled button reverts.
   */
  const fundingOpen = now <= BigInt(escrow.terms.fundingDeadline);
  const anyoneMayCancel = now > BigInt(escrow.terms.fundingDeadline);
  const timeoutClaimable = now > BigInt(escrow.terms.settlementDeadline);
  const disputeAllowed = now <= BigInt(escrow.terms.settlementDeadline);
  const disputeTimeoutClaimable =
    escrow.disputeRaisedAt > 0 && now > BigInt(escrow.disputeDeadline);

  const awaiting = escrow.status === EscrowStatus.AWAITING_FUNDING;
  const funded = escrow.status === EscrowStatus.FUNDED;
  const disputed = escrow.status === EscrowStatus.DISPUTED;

  const shortfall = funding ? funding.balance < escrow.terms.price : false;
  const needsApproval = funding ? funding.allowance < escrow.terms.price : true;

  // The escrow cockpit deliberately lists every exit path, relevant or not: showing that
  // a stalled trade always has a way out is most of the reassurance this panel provides.
  return [
    {
      id: "approve",
      label: "Approve settlement token",
      actor: "buyer",
      relevant: isBuyer,
      enabled: isBuyer && awaiting && fundingOpen && needsApproval && !shortfall,
      reason: !isBuyer
        ? "Only the buyer funds this trade."
        : !awaiting
          ? "This escrow is past the funding stage."
          : !fundingOpen
            ? "The funding window has closed."
            : shortfall
              ? "Your balance is below the trade price."
              : !needsApproval
                ? "Already approved for exactly this amount."
                : undefined,
    },
    {
      id: "fund",
      label: "Fund escrow",
      actor: "buyer",
      primary: true,
      relevant: isBuyer,
      enabled: isBuyer && awaiting && fundingOpen && !needsApproval && !shortfall,
      reason: !isBuyer
        ? "Only the buyer funds this trade."
        : !awaiting
          ? "This escrow is past the funding stage."
          : !fundingOpen
            ? "The funding window has closed. Anyone may now cancel it."
            : shortfall
              ? "Your balance is below the trade price."
              : needsApproval
                ? "Approve the exact amount to this escrow first."
                : undefined,
    },
    {
      id: "release",
      label: "Release to seller",
      actor: "buyer",
      primary: true,
      relevant: isBuyer,
      enabled: isBuyer && funded && !assetsPaused,
      reason: !isBuyer
        ? "Release is buyer-only, so a seller cannot take payment without the buyer confirming delivery."
        : !funded
          ? "The escrow is not funded."
          : assetsPaused
            ? "The ownership module is paused, so title cannot move. Your only exit while it stays paused is a timeout claim, which costs 2%."
            : undefined,
    },
    {
      id: "cancel",
      label: "Cancel trade",
      actor: isParty ? (isBuyer ? "buyer" : "seller") : "anyone",
      destructive: true,
      relevant: true,
      enabled: viewer.isConnected && awaiting && (isParty || anyoneMayCancel),
      reason: !viewer.isConnected
        ? "Connect a wallet to cancel."
        : !awaiting
          ? "Only an unfunded trade can be cancelled."
          : !isParty && !anyoneMayCancel
            ? "Until the funding window closes, only the buyer or seller can cancel."
            : undefined,
    },
    {
      id: "raiseDispute",
      label: "Raise a dispute",
      actor: isBuyer ? "buyer" : "seller",
      destructive: true,
      relevant: isParty,
      enabled: isParty && funded && disputeAllowed,
      reason: !isParty
        ? "Only the buyer or the seller can dispute."
        : !funded
          ? "Only a funded trade can be disputed."
          : !disputeAllowed
            ? "Disputes close at the settlement deadline, so a last-second dispute cannot block the refund path."
            : undefined,
    },
    {
      id: "claimTimeout",
      label: "Claim timeout refund",
      actor: "anyone",
      relevant: true,
      enabled: viewer.isConnected && funded && timeoutClaimable,
      reason: !viewer.isConnected
        ? "Connect a wallet to claim."
        : !funded
          ? "Only a funded trade can time out."
          : "The settlement deadline has not passed yet.",
    },
    {
      id: "claimDisputeTimeout",
      label: "Claim unresolved dispute",
      actor: "anyone",
      relevant: true,
      enabled: viewer.isConnected && disputed && disputeTimeoutClaimable,
      reason: !viewer.isConnected
        ? "Connect a wallet to claim."
        : !disputed
          ? "This trade is not disputed."
          : "Arbitration still has time. After the window closes anyone can refund the buyer in full.",
    },
  ];
}
