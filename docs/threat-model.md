# AeroAsset Protocol — Threat Model

Attacker-oriented companion to `security-model.md`. Severity is
`impact × likelihood` on the protocol's own scale; residual risk is what remains
**after** the listed mitigations.

## Attacker profiles

| # | Attacker | Capability |
|---|---|---|
| A1 | Anonymous external | Send any transaction, read all state, deploy contracts, reorder within a block via MEV. |
| A2 | Registered participant | A1 + a `VERIFIED` organization and asset ownership. |
| A3 | Compromised operational role | A2 + `ORG_VERIFIER` / `ASSET_VERIFIER` / `CREDENTIAL_ISSUER` / `ARBITRATOR`. |
| A4 | Compromised admin | Timelock proposer keys. Total control after the delay elapses. |
| A5 | Malicious counterparty | A2, engaged in a specific trade with a victim. |
| A6 | Malicious token | Contract at an allowlisted settlement-token address. |

---

## Threats

### T-01 — Admin key compromise → malicious upgrade
**A4 · Critical.** An attacker with timelock proposer keys upgrades `AssetOwnership` to
a version that reassigns every aircraft.
**Mitigations:** `DEFAULT_ADMIN_ROLE` held only by `ProtocolTimelock` (`INV-SYS-01`);
≥48h delay makes the proposal publicly visible before execution; 3/5 hardware-wallet
multisig as proposer; `PAUSER_ROLE` on separate keys can halt the protocol during the
delay window; finance contracts immutable and therefore unaffected.
**Residual:** high if the multisig threshold is met and nobody watches the queue.
Monitoring of the timelock queue is a **launch-blocking** operational requirement, not
a nice-to-have.

### T-02 — Escrow drain via reentrancy
**A6 · Critical.** A malicious token re-enters `release` during `safeTransfer` to pay
out twice.
**Mitigations:** CEI — status is terminal before any transfer; `ReentrancyGuardTransient`;
no ETH paths; token allowlist is timelocked; `INV-ESC-02` / `INV-ESC-03` assert
conservation and zero terminal balances.
**Residual:** low. Covered by dedicated `ReentrantToken` mock tests in Phase 7.

### T-03 — Fake organization / credential
**A1 · High.** An attacker self-registers "Lufthansa Technik" and records fraudulent
maintenance.
**Mitigations:** self-registration lands in `PENDING`, which can register nothing;
`ORG_VERIFIER_ROLE` gates promotion; name-hash uniqueness blocks exact duplicates;
maintenance additionally requires `MRO` type **and** a valid `MAINTENANCE_AUTHORITY`
credential.
**Residual:** medium — the protocol cannot verify real-world identity. It records *who
attested what, when*, under an explicitly named verifier. This is a bounded claim, and
`architecture.md` §1.1 states it plainly.

### T-04 — `SETTLEMENT_ROLE` abuse
**A1 · Critical.** An attacker obtains `SETTLEMENT_ROLE` and calls `settleTransfer` to
steal an aircraft record.
**Mitigations:** only `EscrowFactory` grants it; the factory is immutable and grants
only to a `Clones.cloneDeterministic` address it just predicted and verified; the role
is revoked on terminal state (`INV-ESC-05`); `settleTransfer` independently requires a
matching `ACTIVE` listing whose `seller` is still the current owner (`INV-MKT-04`), so
even a rogue role-holder can only complete a trade the owner genuinely offered.
**Residual:** low.

### T-05 — Seller double-sell
**A5 · High.** A seller lists an aircraft, takes escrow funds, then transfers it away
directly before settlement.
**Mitigations:** funding an escrow sets `transferLocked` on the asset, blocking
`initiateTransfer`; settlement re-verifies `ownerOf == listing.seller`;
`INV-MKT-02` allows at most one `ACTIVE` listing per asset; if settlement is impossible
the buyer's `claimTimeout` returns funds in full.
**Residual:** low. Worst case is a failed trade with a full refund, never a loss.

### T-06 — Buyer funds and then stalls
**A5 · Medium.** A buyer funds an escrow and never releases, locking the seller's asset.
**Mitigations:** `settlementDeadline` and permissionless `claimTimeout` bound the lock;
the lock clears on any terminal state.
**Residual:** low — a time-bounded inconvenience, no loss.

### T-07 — Griefing dispute
**A5 · Medium.** A counterparty raises a spurious dispute to freeze funds indefinitely.
**Mitigations:** `raiseDispute` is unavailable after `settlementDeadline`, so it cannot
be used to block the refund path; the arbitrator resolves to exactly one party.
**Residual:** medium — the arbitrator's responsiveness is a trust assumption (T-A3).
A dispute-resolution SLA is an operational, not a protocol, control.

### T-08 — Fee-on-transfer / rebasing token
**A6 · High.** A token delivering less than the transferred amount under-funds the seller.
**Mitigations:** allowlist policy excludes them; `depositedAmount` is the **measured**
balance delta, so an under-delivering token leaves the escrow unable to reach `FUNDED`
and the buyer refundable; `INV-ESC-04` requires `fee + proceeds == depositedAmount`
exactly.
**Residual:** low.

### T-09 — Storage collision on upgrade
**A4/accident · Critical.** A new implementation shifts storage and corrupts ownership.
**Mitigations:** ERC-7201 namespaced storage removes sequential-layout collisions
entirely; `_disableInitializers()` in every implementation constructor; CI diffs
`forge inspect storageLayout` against a committed baseline; upgrade tests replay real
state across the upgrade.
**Residual:** low.

### T-10 — Uninitialized implementation hijack
**A1 · Medium.** An attacker calls `initialize` on a bare implementation and, for a
UUPS contract, upgrades it to a `selfdestruct`-equivalent.
**Mitigations:** `_disableInitializers()` in every implementation constructor, asserted
by `test/upgrade/InitializerProtection.t.sol` for every implementation.
**Residual:** very low.

### T-11 — Component installed on two aircraft
**A2 · Medium.** Forging provenance by presenting one engine as fitted to two airframes.
**Mitigations:** structural — the parent is a scalar field on the component, so the
conflicting state has no representation (`INV-COMP-01`); `install` requires
`UNINSTALLED`; `INV-COMP-03` blocks position collisions.
**Residual:** very low.

### T-12 — Credential resurrection
**A3 · Medium.** A compromised issuer un-revokes a credential to retro-legitimize
fraudulent maintenance.
**Mitigations:** `REVOKED` and `EXPIRED` are terminal with no transition out
(`INV-CRED-03`); reissuance mints a new id; every maintenance record emits the
credential id relied upon, so an audit can pin each record to a specific credential.
**Residual:** medium — a compromised issuer can still issue *new* valid credentials.
Bounded by 2/3 multisig custody and by the fact that records are append-only and
timestamped.

### T-13 — Passport read DoS
**A1 · Low.** An attacker registers thousands of documents against an asset so passport
reads exceed the block gas limit.
**Mitigations:** all aggregation is `view` and paginated; no state-changing path
iterates these arrays; document registration is fee-gated.
**Residual:** low — degraded read UX, no protocol impact.

### T-14 — Front-running listings and offers
**A1 · Low.** See `security-model.md` §6. Bilateral fixed-price trades with no auction,
oracle, or liquidation leave essentially no extractable value.
**Residual:** low.

### T-15 — Timestamp manipulation
**A1 · Low.** Validator shifts `block.timestamp` by seconds to cross a deadline.
**Mitigations:** all deadlines are hours-to-days (T-A6); no randomness from block
properties; no sub-minute logic.
**Residual:** negligible.

### T-16 — Name-hash squatting
**A1 · Low.** Pre-registering a real operator's name hash to block or impersonate them.
**Mitigations:** squatted orgs sit in `PENDING` and can do nothing; `ORG_VERIFIER_ROLE`
never verifies them; `revokeOrganization` frees the hash.
**Residual:** low. Accepted V1 limitation (`security-model.md` §11.4).

---

## Pre-audit checklist

| Threat | Test artifact |
|---|---|
| T-01, T-09, T-10 | `test/upgrade/` — authorization, layout diff, initializer protection |
| T-02, T-08 | `test/unit/escrow/` with `ReentrantToken`, `FeeOnTransferToken`, `ReturnsFalseToken` mocks |
| T-03, T-12 | `test/unit/identity/` lifecycle + access tests |
| T-04, T-05 | `test/integration/SettlementAuthorization.t.sol` |
| T-06, T-07, T-15 | `test/fuzz/EscrowDeadlines.t.sol` |
| T-11 | `test/invariant/ComponentInstallation.t.sol` |
| T-13, T-14 | Documented as accepted; no test gate |

Static analysis (Slither, `fail-on: medium`) runs in CI on every PR. Every finding is
either fixed or recorded with a written justification in `docs/audit/slither-triage.md`
before the Phase 24 external audit.
