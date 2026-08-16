import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { deriveEscrowActions, type Viewer } from "@/lib/api/actions";
import type { EscrowView } from "@/lib/api/market";
import { EscrowStatus } from "@/lib/contracts/generated/enums";

/**
 * The complete purchase lifecycle, asserted against the contract's real behaviour.
 *
 * Every boundary here was read out of `Escrow.sol` rather than assumed, because an
 * earlier version of the derivation used `<=` where the contract uses `<` and offered
 * `fund` one second after it stops working and `claimTimeout` one second before it starts.
 *
 * The contract's guards, verbatim:
 *
 *   fund()                 reverts when `block.timestamp >  fundingDeadline`
 *   cancel() by a stranger reverts when `block.timestamp <= fundingDeadline`
 *   claimTimeout()         reverts when `block.timestamp <= settlementDeadline`
 *   raiseDispute()         reverts when `block.timestamp >  settlementDeadline`
 *   claimDisputeTimeout()  reverts when `block.timestamp <= disputeRaisedAt + WINDOW`
 */

const BUYER = "0x00000000000000000000000000000000000000b1" as Address;
const SELLER = "0x00000000000000000000000000000000000000e5" as Address;
const STRANGER = "0x0000000000000000000000000000000000000f00" as Address;

const FUNDING_DEADLINE = 1_000_000;
const SETTLEMENT_DEADLINE = 2_000_000;
const DISPUTE_WINDOW = 14 * 86_400;

function escrow(over: Partial<EscrowView> = {}): EscrowView {
  return {
    address: "0x00000000000000000000000000000000000000ee" as Address,
    escrowId: 1n,
    status: EscrowStatus.AWAITING_FUNDING,
    deposited: 0n,
    isTerminal: false,
    disputeRaisedAt: 0,
    disputeDeadline: 0,
    timeoutPenaltyBps: 200,
    totalDeferred: 0n,
    terms: {
      listingId: 1n,
      assetId: 1n,
      buyer: BUYER,
      seller: SELLER,
      paymentToken: "0x00000000000000000000000000000000000000cc" as Address,
      treasury: "0x00000000000000000000000000000000000000aa" as Address,
      price: 1_000_000n,
      feeAmount: 20_000n,
      fundingDeadline: FUNDING_DEADLINE,
      settlementDeadline: SETTLEMENT_DEADLINE,
    },
    ...over,
  };
}

const viewer = (address: Address | undefined): Viewer => ({
  address,
  isConnected: address !== undefined,
});

const funded = { balance: 10_000_000n, allowance: 1_000_000n };
const noAllowance = { balance: 10_000_000n, allowance: 0n };
const brokeBuyer = { balance: 0n, allowance: 1_000_000n };

function action(
  e: EscrowView,
  v: Viewer,
  now: bigint,
  id: string,
  fundingState = funded,
  paused = false,
) {
  const found = deriveEscrowActions(e, v, now, fundingState, paused).find((a) => a.id === id);
  if (!found) throw new Error(`No action "${id}" was derived`);
  return found;
}

// ═══════════════════════════════════════════════════ 1 · FUNDING ════

describe("lifecycle · awaiting funding", () => {
  const e = escrow();

  it("offers approve when the allowance is short", () => {
    expect(action(e, viewer(BUYER), 500n, "approve", noAllowance).enabled).toBe(true);
    expect(action(e, viewer(BUYER), 500n, "fund", noAllowance).enabled).toBe(false);
  });

  it("offers fund once approved", () => {
    expect(action(e, viewer(BUYER), 500n, "fund").enabled).toBe(true);
    expect(action(e, viewer(BUYER), 500n, "approve").enabled).toBe(false);
  });

  it("refuses to fund on an insufficient balance, and says why", () => {
    const a = action(e, viewer(BUYER), 500n, "fund", brokeBuyer);
    expect(a.enabled).toBe(false);
    expect(a.reason).toMatch(/balance is below/i);
  });

  it("offers funding to the buyer only", () => {
    expect(action(e, viewer(SELLER), 500n, "fund").enabled).toBe(false);
    expect(action(e, viewer(STRANGER), 500n, "fund").reason).toMatch(/only the buyer/i);
  });

  // ── The boundary the contract actually enforces ──────────────────────
  it("allows funding AT the deadline second", () => {
    // `fund()` reverts only when `block.timestamp > fundingDeadline`.
    expect(action(e, viewer(BUYER), BigInt(FUNDING_DEADLINE), "fund").enabled).toBe(true);
  });

  it("refuses funding one second after the deadline", () => {
    expect(action(e, viewer(BUYER), BigInt(FUNDING_DEADLINE + 1), "fund").enabled).toBe(false);
  });
});

describe("lifecycle · cancelling an unfunded trade", () => {
  const e = escrow();

  it("lets either party cancel at any time", () => {
    expect(action(e, viewer(BUYER), 1n, "cancel").enabled).toBe(true);
    expect(action(e, viewer(SELLER), 1n, "cancel").enabled).toBe(true);
  });

  it("refuses a stranger AT the funding deadline", () => {
    // `cancel()` reverts for a non-party when `block.timestamp <= fundingDeadline`.
    const a = action(e, viewer(STRANGER), BigInt(FUNDING_DEADLINE), "cancel");
    expect(a.enabled).toBe(false);
    expect(a.reason).toMatch(/only the buyer or seller/i);
  });

  it("lets a stranger cancel one second later", () => {
    expect(action(e, viewer(STRANGER), BigInt(FUNDING_DEADLINE + 1), "cancel").enabled).toBe(true);
  });

  it("refuses to cancel once funded", () => {
    const f = escrow({ status: EscrowStatus.FUNDED, deposited: 1_000_000n });
    expect(action(f, viewer(BUYER), 1n, "cancel").enabled).toBe(false);
  });
});

// ═══════════════════════════════════════════════════ 2 · SETTLEMENT ════

describe("lifecycle · funded", () => {
  const e = escrow({ status: EscrowStatus.FUNDED, deposited: 1_000_000n });

  it("offers release to the buyer alone", () => {
    expect(action(e, viewer(BUYER), 1n, "release").enabled).toBe(true);
    const s = action(e, viewer(SELLER), 1n, "release");
    expect(s.enabled).toBe(false);
    // The reason matters: a seller must understand this is by design, not a bug.
    expect(s.reason).toMatch(/buyer-only/i);
  });

  it("blocks release while the ownership module is paused", () => {
    // `release` gates on AssetOwnership.paused(), not Marketplace.paused(): `markSold`
    // has no pause gate but `settleTransfer` does.
    const a = action(e, viewer(BUYER), 1n, "release", funded, true);
    expect(a.enabled).toBe(false);
    expect(a.reason).toMatch(/paused/i);
    expect(a.reason).toMatch(/2%/);
  });

  it("does not offer funding again", () => {
    expect(action(e, viewer(BUYER), 1n, "fund").enabled).toBe(false);
  });
});

// ═══════════════════════════════════════════════════ 3 · TIMEOUT ════

describe("lifecycle · settlement timeout", () => {
  const e = escrow({ status: EscrowStatus.FUNDED, deposited: 1_000_000n });

  it("refuses a timeout claim AT the settlement deadline", () => {
    // `claimTimeout()` reverts when `block.timestamp <= settlementDeadline`.
    expect(action(e, viewer(STRANGER), BigInt(SETTLEMENT_DEADLINE), "claimTimeout").enabled).toBe(
      false,
    );
  });

  it("allows a timeout claim one second later, from anyone", () => {
    const now = BigInt(SETTLEMENT_DEADLINE + 1);
    expect(action(e, viewer(STRANGER), now, "claimTimeout").enabled).toBe(true);
    expect(action(e, viewer(BUYER), now, "claimTimeout").enabled).toBe(true);
    expect(action(e, viewer(SELLER), now, "claimTimeout").enabled).toBe(true);
  });

  it("requires a connected wallet to claim", () => {
    const a = action(e, viewer(undefined), BigInt(SETTLEMENT_DEADLINE + 1), "claimTimeout");
    expect(a.enabled).toBe(false);
    expect(a.reason).toMatch(/connect a wallet/i);
  });

  it("never offers a timeout claim on an unfunded trade", () => {
    const u = escrow();
    expect(
      action(u, viewer(STRANGER), BigInt(SETTLEMENT_DEADLINE + 1), "claimTimeout").enabled,
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════ 4 · DISPUTE ════

describe("lifecycle · disputes", () => {
  const e = escrow({ status: EscrowStatus.FUNDED, deposited: 1_000_000n });

  it("allows either party to dispute AT the settlement deadline", () => {
    // `raiseDispute()` reverts only when `block.timestamp > settlementDeadline`.
    const now = BigInt(SETTLEMENT_DEADLINE);
    expect(action(e, viewer(BUYER), now, "raiseDispute").enabled).toBe(true);
    expect(action(e, viewer(SELLER), now, "raiseDispute").enabled).toBe(true);
  });

  it("refuses a dispute one second later, so it cannot block the refund path", () => {
    const a = action(e, viewer(BUYER), BigInt(SETTLEMENT_DEADLINE + 1), "raiseDispute");
    expect(a.enabled).toBe(false);
    expect(a.reason).toMatch(/block the refund path/i);
  });

  it("refuses a dispute from a stranger", () => {
    expect(action(e, viewer(STRANGER), 1n, "raiseDispute").enabled).toBe(false);
  });

  const raisedAt = 1_500_000;
  const disputed = escrow({
    status: EscrowStatus.DISPUTED,
    deposited: 1_000_000n,
    disputeRaisedAt: raisedAt,
    disputeDeadline: raisedAt + DISPUTE_WINDOW,
  });

  it("refuses a dispute-timeout claim AT the arbitration deadline", () => {
    // `claimDisputeTimeout()` reverts when `block.timestamp <= disputeRaisedAt + WINDOW`.
    expect(
      action(disputed, viewer(STRANGER), BigInt(raisedAt + DISPUTE_WINDOW), "claimDisputeTimeout")
        .enabled,
    ).toBe(false);
  });

  it("allows it one second later, from anyone", () => {
    expect(
      action(
        disputed,
        viewer(STRANGER),
        BigInt(raisedAt + DISPUTE_WINDOW + 1),
        "claimDisputeTimeout",
      ).enabled,
    ).toBe(true);
  });

  it("never offers a dispute-timeout claim on a non-disputed trade", () => {
    expect(
      action(e, viewer(STRANGER), BigInt(raisedAt + DISPUTE_WINDOW + 1), "claimDisputeTimeout")
        .enabled,
    ).toBe(false);
  });

  it("offers no settlement action while disputed", () => {
    expect(action(disputed, viewer(BUYER), 1n, "release").enabled).toBe(false);
    expect(action(disputed, viewer(BUYER), 1n, "fund").enabled).toBe(false);
    expect(action(disputed, viewer(BUYER), 1n, "cancel").enabled).toBe(false);
  });
});

// ═══════════════════════════════════════════════ 5 · TERMINAL ════

describe("lifecycle · terminal states offer nothing", () => {
  const terminal = [
    ["released", EscrowStatus.RELEASED],
    ["refunded", EscrowStatus.REFUNDED],
    ["cancelled", EscrowStatus.CANCELLED],
  ] as const;

  for (const [name, status] of terminal) {
    it(`offers no enabled action once ${name}`, () => {
      const e = escrow({ status, isTerminal: true, deposited: 1_000_000n });
      const enabled = deriveEscrowActions(e, viewer(BUYER), 1n, funded, false).filter(
        (a) => a.enabled,
      );
      expect(enabled).toEqual([]);
    });
  }
});

// ═══════════════════════════════════════════ 6 · EVERY REFUSAL EXPLAINS ════

describe("every disabled action carries a reason", () => {
  const states = [
    EscrowStatus.AWAITING_FUNDING,
    EscrowStatus.FUNDED,
    EscrowStatus.DISPUTED,
    EscrowStatus.RELEASED,
    EscrowStatus.REFUNDED,
    EscrowStatus.CANCELLED,
  ];
  const viewers = [viewer(BUYER), viewer(SELLER), viewer(STRANGER), viewer(undefined)];
  const times = [1n, BigInt(FUNDING_DEADLINE), BigInt(SETTLEMENT_DEADLINE + 1)];

  it("across every status, viewer and deadline", () => {
    let checked = 0;
    for (const status of states) {
      for (const v of viewers) {
        for (const now of times) {
          const e = escrow({ status, deposited: status === EscrowStatus.AWAITING_FUNDING ? 0n : 1_000_000n });
          for (const a of deriveEscrowActions(e, v, now, funded, false)) {
            checked += 1;
            if (!a.enabled) {
              // A disabled control with no explanation is the commonest failure in
              // permissioned interfaces, and this protocol has many preconditions.
              expect(a.reason, `${a.id} @ status ${status}`).toBeTruthy();
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
  });
});
