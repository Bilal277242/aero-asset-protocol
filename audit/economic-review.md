# Economic Review

**Scope:** marketplace mechanics, escrow incentives, fee management, value conservation,
griefing economics.
Findings referenced by ID are catalogued in [`findings.md`](findings.md).

---

## 1. Value conservation

The core accounting property holds exactly. `EscrowTerms` freezes `price` and `feeAmount`
at acceptance; `_settle` derives proceeds as the remainder:

```solidity
uint256 fee = terms.feeAmount;
uint256 proceeds = deposited - fee;      // fee + proceeds == deposited, by construction
```

`FeeManager.quote` rounds down and the caller takes the remainder, so no rounding path
can create or destroy dust. `fund()` records the **measured** balance delta and requires
exact equality with `price`, so the escrow's internal accounting can never exceed its
real balance.

Combined: an escrow always holds exactly what it believes it holds, and always pays out
exactly what it took in. I could not construct a case where value is created or lost.

`Escrow` handles no native ETH and has no sweep function, so tokens accidentally sent to
a clone are unrecoverable. Given per-trade clones with deterministic addresses this is a
narrow surface, and adding a sweep would open a far worse one. Correct trade.

## 2. Fee management

| Property | Assessment |
|---|---|
| `MAX_FEE_BPS = 1000` is a `constant` in immutable code | ✅ No admin action or upgrade can exceed 10% |
| `FeeManager` never holds, receives or moves tokens | ✅ No drain surface, no reentrancy surface |
| Fee frozen at acceptance | ✅ A later rate change cannot re-price a live trade |
| `FEE_MANAGER_ROLE` held by the timelock alone | ✅ Rate and treasury changes are delayed and public |
| Treasury resolved at settlement | ⚠️ **AAP-15** |

The design decision to give the fee module **no custody** is the single best economic
safety property in the protocol and should not be relaxed. It answers "how much" and "to
whom"; the escrow performs the transfer.

**AAP-15:** `_settle` calls `_fees().treasury()` live rather than reading a value frozen
in `EscrowTerms`. Every other economic parameter is captured at acceptance; the recipient
is not. A treasury change between acceptance and release redirects fees on already-agreed
trades. The role is timelocked so this requires a 48h public queue and the amount is
bounded by the frozen `feeAmount`, which keeps it LOW — but it is an inconsistency with
no upside.

A 10% ceiling is high for the asset class (real marketplace fees on aircraft transactions
sit well under 1%), but it is a ceiling rather than a rate and it is published in
immutable code. Acceptable.

## 3. Escrow incentives — the core problem

The escrow's payoff structure is asymmetric in the buyer's favour, and the asymmetry is
not priced.

**Timeline of a trade:**

| Phase | Duration | Asset locked? | Buyer's cost to walk | Seller's cost |
|---|---|---|---|---|
| `AWAITING_FUNDING` | up to 7d | No | Zero | Listing slot occupied; can `cancel()` immediately |
| `FUNDED` | up to 30d | **Yes** | **Zero** — full refund | Asset unsaleable for 30 days |
| `DISPUTED` | **unbounded** | Yes | — | — |

**AAP-09:** between `fund()` and `settlementDeadline` the buyer holds a 30-day American
call on the asset at the struck price, for which they pay nothing. `claimTimeout()`
returns **100%** of the deposit. A rational buyer exercises only if the asset appreciates
or their financing lands, and walks otherwise. The seller absorbs the entire cost of
every unexercised option: 30 days of lock-up, an unsaleable asset, no compensation.

On a volatile, illiquid, high-value asset, a free 30-day option carries real value. A
sophisticated buyer can fund several escrows simultaneously and exercise only the
favourable ones.

The seller's only recourse is `raiseDispute()` and a favourable arbitration — which loads
a routine economic event onto a manual, centralized process (**AAP-04**), and which the
buyer can pre-empt by disputing first (**AAP-01**).

**The `AWAITING_FUNDING` phase is fine**, and worth noting because it shows the pattern
*can* be got right: a buyer who gets an offer accepted and never funds occupies the
listing, but either party may `cancel()` at will during that phase, so the seller
recovers immediately for the cost of gas. That escape hatch is exactly what `FUNDED`
lacks.

**Recommended:** forfeit a bounded percentage of the deposit to the seller on a
buyer-fault timeout, and shorten `SETTLEMENT_WINDOW`. Thirty days is far longer than
settlement mechanically requires once funds are already escrowed; the window exists to
accommodate off-chain closing, which argues for making it a per-listing parameter within
a bounded range rather than a protocol-wide constant.

## 4. Griefing economics

For each attack: what does it cost the attacker, and what does it cost the victim?

| Attack | Finding | Attacker cost | Victim cost | Priced? |
|---|---|---|---|---|
| Seller disputes to freeze buyer funds | **AAP-01** | Gas | **100% of deposit, indefinitely** | ❌ |
| Seller bricks asset mid-escrow | **AAP-02** | Gas + own asset | 30d capital lock-up | ❌ |
| Buyer walks at timeout | **AAP-09** | Capital lock-up | 30d unsaleable asset | ❌ |
| Org name squatting | **AAP-05** | Gas | **Permanent** loss of identifier | ❌ |
| Serial squatting | **AAP-08** | Gas + verified org | **Permanent** loss of identifier | ❌ |
| Document hash squatting | **AAP-07** | Gas + any asset | **Permanent** inability to record | ❌ |
| Offer spam | — | Gas per offer | Storage bloat only, never iterated | ✅ gas |

**Every griefing vector in the protocol is free to the attacker.** The protocol has no
bonds, no deposits, no slashing and no fees on any action other than settlement. In a
system where the identifiers are permanent (§5) and the escrow has no universal exit,
that is the structural economic weakness.

The asymmetry is stark in AAP-01: one transaction's gas, perhaps $2, freezes an
arbitrarily large deposit for an unbounded period.

**Recommended:** introduce a refundable bond on the two actions where permanence or
freezing is the consequence — `raiseDispute` (forfeited if the arbitrator rules against
the raiser) and `registerOrganization` (returned on verification, forfeited on
rejection). Both convert free griefing into a priced action without affecting honest
users, who get their bond back.

## 5. Permanent identifiers as an economic surface

Three global indexes are written permissionlessly and never cleared: organization name
hashes (**AAP-05**), asset serial hashes (**AAP-08**), document hashes (**AAP-07**).

The economics are one-sided: the attacker pays gas once; the victim loses the identifier
forever, with no buy-back, no arbitration and no admin path. Because aviation identifiers
are public and short — an MSN, an ESN, a legal entity name — the preimages are trivially
computable and the attack is scriptable across an entire fleet or industry.

The confidentiality caveat is documented (`README.md` limitation 3: hashes are
commitments, brute-forceable unless salted) but the **squatting direction is the more
serious one and is not** — and the documented mitigation for organizations (reject the
squat) provably does not work (**AAP-05**, confirmed by PoC).

Scoping uniqueness where possible (documents → per-asset) and adding timelocked index
clearing (organizations, serials) removes the permanence without weakening the property
the indexes exist for.

## 6. Market mechanics

**Offers carry no funds.** A buyer commits capital only when the seller accepts and the
escrow is funded. This is the right choice — locking funds at offer time would make offer
spam expensive for honest buyers and create a second custody surface. The cost is that
acceptance does not guarantee funding, which is handled by the 7-day window and the
mutual `cancel()`.

**One active listing per asset**, enforced O(1) via `activeListingOf` with a freshness
check on read. No search, no unbounded loop.

**Accepting an offer does not bulk-reject siblings.** Correct: that would iterate an
attacker-controlled array in a state-changing function. Siblings simply become
unacceptable once the listing leaves `ACTIVE`, and no funds are locked by an unaccepted
offer, so nothing is at risk while one sits idle.

**Stale-seller protection** is well done. The listing's `seller` is a snapshot, and
acceptance asserts it still matches live ownership:

```solidity
address currentOwner = _ownership().ownerOf(assetId);
if (currentOwner != listing.seller) { revert SellerNoLongerOwner(assetId, listing.seller, currentOwner); }
```

This closes the sell-it-twice race, and `settleTransfer` re-asserts the same property at
settlement with `UnexpectedOwner`. Two independent checks at both ends of the trade.

**No price oracle, no AMM, no slippage surface.** Prices are peer-agreed and frozen at
acceptance. This eliminates the entire oracle-manipulation and sandwich-attack class.
For an illiquid asset class where every trade is negotiated, it is the right model.

## 7. Summary of economic recommendations

| Priority | Change | Addresses |
|---|---|---|
| 1 | Dispute resolution deadline with permissionless refund | AAP-01 |
| 2 | Pull-payment fallback so one blacklisted party cannot block a terminal transition | AAP-13 |
| 3 | Timeout penalty (bounded %) forfeited to the seller on buyer-fault timeout | AAP-09 |
| 4 | Shorten and parameterize `SETTLEMENT_WINDOW` | AAP-09 |
| 5 | Refundable bonds on `raiseDispute` and `registerOrganization` | AAP-01, AAP-05 |
| 6 | Scope document-hash uniqueness per asset; timelocked clearing for orgs and serials | AAP-05/07/08 |
| 7 | Capture `treasury` in `EscrowTerms` at acceptance | AAP-15 |

Items 1–2 are correctness — funds must always have an exit. Items 3–5 are incentive
design — every griefing action should cost the griefer something. Items 6–7 are
consistency fixes.
