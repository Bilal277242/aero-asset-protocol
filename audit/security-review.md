# Security Review

**Scope:** external calls, token transfers, signature verification, replay protection,
reentrancy, front-running, integer arithmetic, DoS, storage collisions, initialization,
event correctness, error handling.
Findings referenced by ID are catalogued in [`findings.md`](findings.md).

---

## 1. External calls

The full inventory is in [`architecture-review.md`](architecture-review.md) §3. The
conclusion that matters here:

> **The ERC-20 settlement token is the only untrusted external callee in `src/`.**

Every other callee is a protocol contract resolved live through
`ProtocolAddressRegistry`, whose entries only the timelock can write. There are no
delegatecalls outside the OZ proxy machinery, no low-level `call`, no assembly beyond
the ERC-7201 slot accessors, and no `selfdestruct`.

`Escrow` never handles native ETH: no `receive`, no `fallback`, no `call{value:}`. It
cannot be reentered through an ETH transfer because it never makes one. This closes an
entire category and is worth preserving explicitly.

Address-registry resolution reverts on an unset key (`AddressNotRegistered`) rather than
returning `address(0)`, so a misconfiguration fails loudly instead of calling into the
zero address.

## 2. Token transfers

`SafeERC20` is used throughout. Three properties were verified against the code:

**Measured balance deltas.** `fund()` records what actually arrived, not what was asked
for:

```solidity
uint256 balanceBefore = token.balanceOf(address(this));
token.safeTransferFrom(msg.sender, address(this), terms.price);
uint256 received = token.balanceOf(address(this)) - balanceBefore;
if (received != terms.price) { revert IncorrectFundingAmount(terms.price, received); }
```

A fee-on-transfer or rebasing token therefore fails to reach `FUNDED` rather than
silently short-paying the seller. Correct, and the strict equality is the right choice
over `>=`.

**Exact conservation.** `_settle` derives `proceeds = deposited - fee` where `fee` was
frozen at acceptance, so `fee + proceeds == deposited` by construction with no rounding
path. `FeeManager.quote` rounds down and the caller takes the remainder. No dust is
created or destroyed.

**Allowlisted tokens only.** Enforced at `createListing` — but **not re-checked at
acceptance (AAP-18)**, so a token de-allowlisted in response to a compromise remains
reachable through existing listings. This is the weakest link in the token-handling
story, because the allowlist is precisely what makes "one untrusted callee" tolerable.

**The unhandled case is a blacklisting token (AAP-13).** USDC is the shipped default and
implements an administrative blacklist. Both terminal paths push unconditionally, so a
blacklisted buyer makes `_refund()` revert permanently and a blacklisted treasury blocks
settlement protocol-wide. `MaliciousTokens.sol` in the test suite covers fee-on-transfer,
reentrant and false-returning tokens — it does **not** cover a reverting-on-transfer
recipient, which is why this gap survived to the audit.

## 3. Signature verification

**None.** The protocol implements no signature scheme: no ECDSA recovery, no EIP-712, no
EIP-1271, no permit path, no meta-transactions. `ProtocolModuleUpgradeable` documents
that `msg.sender` is used directly rather than `_msgSender()`, specifically to avoid
implying ERC-2771 forwarder support that does not exist.

This is a real security *advantage* — the entire signature-malleability, domain-separator
and signature-replay class is absent by construction. Nothing to report, and the decision
should be preserved. If gasless approvals are added later, `permit` on the settlement
token is the correct first step and needs its own review.

## 4. Replay protection

No signatures means no signature replay. The remaining replay-adjacent surfaces:

- **Cross-chain:** no chain-id binding anywhere, correctly, because there is nothing
  signed to bind. Deployments on different chains are wholly independent.
- **Escrow clone salts:** `keccak256(abi.encode(escrowId))` where `escrowId` is a
  monotonically increasing counter, so no salt is ever reused and no clone address can
  collide. `EscrowFactory` additionally verifies the deployed address equals the
  predicted one before granting `SETTLEMENT_ROLE` — genuinely good defence in depth
  around the protocol's most dangerous authorization edge.
- **Idempotency:** every state-changing entry point is guarded by a status transition
  check, so replaying a transaction reverts on the state machine rather than
  double-applying. `Initializable` prevents re-initialization.

No findings.

## 5. Reentrancy

`ReentrancyGuardTransient` (EIP-1153) is applied to `fund`, `release`, `claimTimeout`,
`cancel`, `resolveDispute` on `Escrow` and to `acceptOffer` on `Marketplace`.

Beyond the guards, the ordering is defensive: `_settle` and `_refund` write the terminal
status **before** any external call, so a reentrant path fails the state-machine guard on
its own even if the guard were absent. I traced each reentrancy entry point:

| Reentrant target during a token callback | Blocked by |
|---|---|
| `fund()` | `nonReentrant` |
| `release()` | `nonReentrant` + status already terminal |
| `claimTimeout()` | `nonReentrant` + status already terminal |
| `cancel()` | `nonReentrant` |
| `resolveDispute()` | `nonReentrant` |
| `raiseDispute()` | **no guard**, but requires `status == FUNDED`, which is false during `_settle`/`_refund` and during `fund()` |

`raiseDispute` is the only unguarded fund-adjacent function. It moves no value, and its
status precondition makes it unreachable at every point where a reentrant call could
originate. Safe, but it is the one place where the protection is a status check rather
than a guard, and it should stay documented as such.

**AAP-16** notes that `fund()` performs its interaction before its effects, contradicting
the contract's absolute NatSpec claim of "checks-effects-interactions, without
exception." The code is safe; the claim is wrong, and an overstated security assertion in
NatSpec is itself a hazard.

## 6. Front-running

| Surface | Assessment |
|---|---|
| `acceptOffer` front-running `withdrawOffer` | **AAP-19**, LOW. Offers carry no funds; buyer declines to fund and either party cancels. |
| `registerOrganization` name squatting | **AAP-05**, MEDIUM. Front-running is the *entry* to the attack; permanence is what makes it severe. |
| `registerAsset` serial squatting | **AAP-08**, MEDIUM. Same shape. |
| `registerDocument` hash squatting | **AAP-07**, MEDIUM. Same shape. |
| `expireListing` / `expireOffer` | Permissionless by design; only records elapsed time and reverts otherwise. Benign. |
| `claimTimeout` | Permissionless, but funds always go to the buyer regardless of caller. Benign. |
| Sandwiching a settlement | Not applicable — prices are fixed at acceptance, no AMM interaction, no oracle. |

No MEV extraction path exists against the escrow: amounts are frozen in `EscrowTerms` at
acceptance and no participant can alter them.

The three squatting findings share one root cause — **a permissionless write to a
permanent global index**. They should be fixed as one workstream.

## 7. Integer arithmetic

Solidity 0.8.28 with checked arithmetic throughout. `unchecked` appears in exactly six
places, all of the form:

```solidity
unchecked { assetId = ++$.assetCount; }
```

One increment per transaction against a `uint256` counter. Correct and safe.

Narrowing casts route through `ProtocolCast` (`toUint64`, `toUint128`, `toUint40`), which
reverts with `ValueTooLarge` rather than truncating — a silently truncated id would alias
an unrelated record, so this matters. The library is small, correct and unit-tested.

**AAP-21** notes the policy is applied inconsistently: eight call sites cast
`uint40(block.timestamp)` raw. Safe until year 36812, but it makes the policy
unverifiable by inspection.

`Marketplace.acceptOffer` computes `uint40(block.timestamp) + SETTLEMENT_WINDOW` in
checked `uint40` arithmetic, so an overflow reverts rather than wrapping a deadline into
the past. Correct.

`FeeManager.quote` performs `(amount * bps) / 10_000` with `amount` bounded by
`uint128` and `bps ≤ 1000`, so the multiplication cannot overflow `uint256`.

No findings.

## 8. DoS risks

**No unbounded loop exists in any state-changing function.** I verified this
exhaustively: every loop in `src/` is inside a `view` function with explicit
`offset`/`limit` pagination (`documentsOf`, `maintenanceOf`, `componentsOf`) or is the
bounded pauser scan in `Verify.s.sol`. `OfferManager` explicitly declines to bulk-reject
sibling offers on acceptance for exactly this reason, and `ProtocolAddressRegistry`
declines to offer a batch setter. The rule is applied without exception.

`ComponentRegistry._detach` uses swap-and-pop with an `indexInParent` map, making removal
O(1) rather than a search. Correct.

The real DoS findings are not loop-based:

| Finding | Mechanism |
|---|---|
| **AAP-01** | Seller freezes buyer funds indefinitely via `raiseDispute` |
| **AAP-02** | Seller bricks the asset mid-escrow via `setAssetStatus` |
| **AAP-13** | Blacklisted recipient makes a terminal transition permanently revert |
| **AAP-05/07/08** | Permanent burn of a name / document / serial identifier |

Unbounded storage growth (offer spam, document spam) is possible but costs the attacker
gas and is never iterated, so it degrades indexing rather than the chain state. Not a
finding.

## 9. Storage collisions

ERC-7201 namespaced storage in every upgradeable contract, with the namespace constant
asserted against the derivation formula in `test/upgrade/Namespaces.t.sol` — which is the
right test, because a mistyped constant is invisible at runtime (the contract simply
reads a different slot).

Namespaces verified distinct across `ProtocolModule`, `OrganizationRegistry`,
`CredentialRegistry`, `AssetRegistry`, `AssetOwnership`, `ComponentRegistry`,
`AircraftRegistry`, `DocumentRegistry`, `MaintenanceRegistry` and `Marketplace`.

`Marketplace` inherits `ListingManager` and `OfferManager`, which deliberately **share**
one namespace — they are halves of one state machine and this is intended, not a
collision. OZ's `PausableUpgradeable` and `ReentrancyGuardTransientUpgradeable` carry
their own ERC-7201 namespaces in v5.4.0, so no interaction.

`Escrow` is a clone, not a UUPS proxy, and uses ordinary sequential storage — correct,
since there is no upgrade to stay layout-compatible with. `FeeManager`,
`ProtocolAddressRegistry` and `RoleManager` are immutable and likewise use sequential
storage.

No findings.

## 10. Initialization

- `_disableInitializers()` is called in `ProtocolModuleUpgradeable`'s constructor, so
  **every** UUPS implementation inherits the protection rather than relying on each
  author remembering it. `Escrow`'s own constructor does the same.
- Every `initialize` carries the `initializer` modifier and validates non-zero
  addresses.
- `Escrow.initialize` additionally requires `msg.sender == escrowFactory` (resolved
  live) and rejects `feeAmount > price`.
- Deployment creates each proxy with its init calldata atomically in `_proxy()`, so
  there is no window in which an uninitialized proxy is front-runnable.

The front-running-an-uninitialized-proxy attack (threat T-10) is genuinely closed. No
findings.

## 11. Event correctness

Every state change emits an event, and the events carry enough to reconstruct state
off-chain. Status changes uniformly emit `(id, from, to)` including the synthetic
`NONE → initial` transition at creation, so an indexer sees one uniform lifecycle stream
rather than having to infer creation.

`MaintenanceRecorded` emitting the credential relied upon is a genuinely useful audit
affordance.

Two ordering defects (**AAP-23**): `AssetOwnership.settleTransfer` emits
`OwnershipTransferred` before the `TransferLockChanged` that causally preceded it, and
`Escrow.resolveDispute` emits `DisputeResolved` before the status events produced by
`_settle`/`_refund`. Neither is a correctness bug; both make naive log-order
reconstruction report a sequence that never occurred.

## 12. Error handling

Custom errors only — zero instances of `require`-with-string in `src/`, verified. Errors
carry diagnostic parameters (expected vs actual, the offending id, the current status)
rather than being bare markers, which makes failures decodable from a trace without
source access.

Shared errors live in `ProtocolErrors.sol` at file level so `MissingRole`,
`ZeroAddress`, `UnexpectedCaller` and friends decode identically everywhere. Contracts
that could have reused an OZ error deliberately raise the protocol's own — `ProtocolCast`
reverts `ValueTooLarge` rather than OZ `SafeCast`'s error for exactly this reason.

`FeeManager` and `ProtocolAddressRegistry` hold their role check in a private function
rather than inlining it in the modifier, so the check is emitted once in bytecode instead
of at every call site. Small, correct.

One inconsistency worth noting: `ListingManager.DeadlineTooFar` is declared at the bottom
of the contract rather than in `ProtocolErrors.sol` or the interface, unlike every other
marketplace error. Cosmetic.

No findings beyond the cosmetic note.

## 13. Testing posture as evidence

488 tests pass; coverage is 99.60% line / 97.92% branch on `src/`. The invariant suite
asserts 18 protocol invariants after every step of randomized sequences with a bounded
handler and ghost variables.

Two limits on how much assurance that carries:

1. **Coverage measures reachability, not adversarial thinking.** Every finding in this
   audit rated MEDIUM or above lives in code that is fully covered by passing tests. The
   tests assert the intended path works; they do not ask whether a counterparty would
   want to do something else. AAP-01 is exercised by tests that check a dispute can be
   raised and resolved — none asks what happens if it is *never* resolved.
2. **Randomized testing finds bugs, it does not establish absence.** The invariant suite
   is valuable and well built, but `fail_on_revert = false` means a handler action that
   always reverts contributes nothing while still counting as a call — a failure mode the
   suite already hit once during development and fixed with a dedicated reachability
   test.

The gap this audit most wants closed in the test suite: **negative-space tests for the
escrow state machine** — for each state, assert the complete set of reachable exits and
that no party can unilaterally remove another party's exit.
