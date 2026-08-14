import { describe, expect, it } from "vitest";
import { deriveTransferState } from "@/lib/domain/passport";

/**
 * The transfer-state derivation, exhaustively.
 *
 * This is the passport's instance of the protocol-wide trap: `pendingOwner` stays
 * non-zero forever once an offer is made, and nothing on-chain clears it when the
 * deadline passes. A UI that reads the field alone tells a buyer "awaiting your
 * acceptance" about an offer that `acceptTransfer` would revert on.
 */

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const ALICE = "0x00000000000000000000000000000000000000a1" as const;
const ESCROW = "0x00000000000000000000000000000000000000e5" as const;

const free = { transferFrozen: false, lockedBy: ZERO };

type Ownership = NonNullable<Parameters<typeof deriveTransferState>[1]>;

function ownership(over: Partial<Ownership> = {}): Ownership {
  return {
    owner: ALICE,
    since: 0,
    transferFrozen: false,
    pendingOwner: ZERO,
    offerExpiresAt: 0,
    lockedBy: ZERO,
    ...over,
  };
}

describe("deriveTransferState", () => {
  it("is free with no freeze, no lock and no offer", () => {
    expect(deriveTransferState(free, ownership(), 1000n)).toEqual({ kind: "free" });
  });

  it("reports frozen ahead of everything else", () => {
    // A retired or destroyed asset is frozen permanently. Nothing overrides it, so an
    // outstanding offer must not be shown as actionable.
    const state = deriveTransferState(
      { transferFrozen: true, lockedBy: ESCROW },
      ownership({ pendingOwner: ALICE, offerExpiresAt: 9999 }),
      1000n,
    );
    expect(state).toEqual({ kind: "frozen" });
  });

  it("reports the escrow lock ahead of a pending offer", () => {
    // `AssetOwnership.lock` clears any pending offer, so this pair cannot arise on-chain
    // today. The ordering is asserted anyway: if that ever changes, a locked asset must
    // not start advertising an acceptance that `acceptTransfer` will refuse.
    const state = deriveTransferState(
      { transferFrozen: false, lockedBy: ESCROW },
      ownership({ pendingOwner: ALICE, offerExpiresAt: 9999 }),
      1000n,
    );
    expect(state).toEqual({ kind: "locked", by: ESCROW });
  });

  it("treats a zero pendingOwner as no offer", () => {
    expect(deriveTransferState(free, ownership({ pendingOwner: ZERO }), 1000n)).toEqual({
      kind: "free",
    });
  });

  it("reports an offer before its deadline as pending", () => {
    expect(
      deriveTransferState(free, ownership({ pendingOwner: ALICE, offerExpiresAt: 1001 }), 1000n),
    ).toEqual({ kind: "pending", to: ALICE, expiresAt: 1001 });
  });

  it("reports an offer past its deadline as expired, not pending", () => {
    expect(
      deriveTransferState(free, ownership({ pendingOwner: ALICE, offerExpiresAt: 999 }), 1000n),
    ).toEqual({ kind: "offerExpired", to: ALICE, expiresAt: 999 });
  });

  it("treats the deadline itself as expired, matching the contract", () => {
    // `AssetOwnership.acceptTransfer` reverts when `block.timestamp >= offerExpiresAt`,
    // so equality is already too late. Off-by-one here shows a live Accept button in the
    // exact second it stops working.
    expect(
      deriveTransferState(free, ownership({ pendingOwner: ALICE, offerExpiresAt: 1000 }), 1000n),
    ).toEqual({ kind: "offerExpired", to: ALICE, expiresAt: 1000 });
  });

  it("treats a zero deadline as never expiring", () => {
    expect(
      deriveTransferState(free, ownership({ pendingOwner: ALICE, offerExpiresAt: 0 }), 1000n),
    ).toEqual({ kind: "pending", to: ALICE, expiresAt: 0 });
  });

  it("falls back to free when the ownership read failed", () => {
    // `getOwnership` is a separate multicall entry and can fail on its own. Without the
    // pending fields there is nothing to claim, and inventing an offer would be worse.
    expect(deriveTransferState(free, null, 1000n)).toEqual({ kind: "free" });
  });
});
