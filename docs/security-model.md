# AeroAsset Protocol — Security Model

Trust assumptions and the controls that enforce them. Read with `threat-model.md`
(attacker-oriented) and `invariants.md` (property-oriented).

---

## 1. Trust assumptions

Stated explicitly because an unstated assumption is an undiscovered vulnerability.

**T-A1 — The protocol admin is trusted, and that trust is bounded by a timelock.**
`PROTOCOL_ADMIN_ROLE` can upgrade every registry and rewire the address registry. A
compromise is total for the L1–L3 registries. Bound: the role is held only by
`ProtocolTimelock`, so every such action is delayed ≥ 48h and publicly observable. The
finance contracts (`Escrow`, `EscrowFactory`, `FeeManager`) are immutable and remain
outside this blast radius.

**T-A2 — Verifiers are trusted for attestations, not for custody.**
`ORG_VERIFIER_ROLE`, `ASSET_VERIFIER_ROLE` and `CREDENTIAL_ISSUER_ROLE` can make false
attestations. They **cannot** move assets or funds. The worst outcome of a compromised
verifier is bad data, which is recoverable by revocation; it is not theft.

**T-A3 — The arbitrator is trusted to choose, not to steal.**
`ARBITRATOR_ROLE` picks buyer or seller on a disputed escrow. It cannot change amounts,
pay a third party, or touch a non-disputed escrow. A malicious arbitrator can award a
trade wrongly; it cannot extract funds for itself. Roadmap §13 accepts this for V1.

**T-A4 — Off-chain data availability is not the protocol's responsibility.**
The chain stores hashes and URIs. If IPFS content disappears, the on-chain commitment
remains valid and verifiable against any recovered copy. The protocol never asserts a
document is retrievable.

**T-A5 — Settlement tokens are well-behaved.**
Allowlisted ERC-20s only. No fee-on-transfer, no rebasing, no callback-on-transfer
hooks (ERC-777). Enforced by policy at allowlisting **and** by measured balance deltas
at runtime, so a token that violates the assumption fails loudly rather than silently.

**T-A6 — `block.timestamp` is accurate to ~12 seconds.**
Every deadline in the protocol is measured in hours or days. Validator timestamp
manipulation of a few seconds is immaterial. No logic depends on sub-minute precision,
and no randomness is derived from block properties anywhere.

**T-A7 — On-chain state is public.**
Nothing is confidential. Serial numbers and tail numbers are hashed, which is a
commitment, not encryption — see §7.

---

## 2. Reentrancy

**Entry points that touch external contracts:** `Escrow.fund`, `Escrow.release`,
`Escrow.refund`, `Escrow.claimTimeout`, `Escrow.resolveDispute`, `FeeManager.collect`.
These are the only functions in the protocol that call out to a token.

Controls, applied together rather than relying on any one:

1. **Checks-Effects-Interactions, without exception.** Status is written to its terminal
   value *before* any `safeTransfer`. A reentrant call therefore finds a terminal state
   and reverts on the state-machine guard alone, before the guard modifier matters.
2. **`ReentrancyGuardTransient`** (OZ v5.1+, EIP-1153) on every fund-moving function.
   Transient storage makes the guard ~2.1k gas cheaper per call than the storage-slot
   version. The Cancun EVM target this requires is asserted by
   `test/unit/Foundation.t.sol`.
3. **No native ETH anywhere.** No `receive`, no `fallback`, no `.call{value:}`. The
   protocol cannot be reentered through an ETH transfer because it never makes one
   (`INV-SYS-03`).
4. **Cross-contract reentrancy is considered explicitly.** `Escrow.release` calls
   `AssetOwnership.settleTransfer` and `Marketplace.markSold`. Both are protocol
   contracts with their own guards, and both are called *after* the escrow's own status
   is terminal, so a reentrant path through them finds consistent state.

## 3. Access control

- One `RoleManager`; no per-contract role state to drift (`architecture.md` §D4).
- `SETTLEMENT_ROLE` is scoped to a live escrow's lifetime and revoked on terminal
  state (`INV-ESC-05`), plus a second independent check on the listing
  (`permissions.md`, design notes).
- Every role-gated function has a negative test with a fuzzed unauthorized caller,
  constrained by `BaseTest._assumeUnprivileged`.
- `DEFAULT_ADMIN_ROLE` membership is asserted to be exactly `{timelock}`
  (`INV-SYS-01`).

## 4. Address-registry freshness

Modules resolve peers through `ProtocolAddressRegistry`. Two policies, chosen per
call site rather than globally:

- **Re-read every time** for authorization decisions (e.g. "is the caller the
  `Marketplace`?"). Caching an authorizer would let a rotated-out contract keep its
  privileges.
- **Cache in `immutable`** only for genuinely fixed references set at construction, and
  only in immutable contracts.

Escrow clones snapshot the addresses they need at `initialize` and use the snapshot for
the whole trade. Rationale: an in-flight trade must settle against the same
`AssetOwnership` it locked, and an address rotation mid-trade must not strand a funded
escrow.

## 5. Denial of service and unbounded loops

**No state-changing function iterates a user-controlled array.** The two array indexes
in the protocol — `installedComponents[parent]` and `assetDocuments[assetId]` — are
written only by push and swap-and-pop, and read only from `view` functions where the
caller pays no gas and can paginate.

Consequences accepted deliberately:

- Destroying an aircraft does not auto-remove its components (`state-machines.md` §4).
- Accepting an offer does not bulk-reject siblings (`state-machines.md` §6).
- `AssetPassport` aggregation is `view`-only and paginated; a passport with 10,000
  documents is expensive to read in one call and must be paged, not batched on-chain.

**Griefing surfaces reviewed:** an attacker can spam `PENDING` organizations, offers,
and documents. All are gas-paid by the attacker, none block another user's path, and
none enter a loop any other user must traverse. Registration fees (`FeeManager`) make
bulk spam additionally costly.

## 6. Front-running and MEV

Analysed per roadmap §19.

| Surface | Exposure | Treatment |
|---|---|---|
| `createListing` | Observer sees the price before it lands. | Immaterial — the seller sets the price; there is no better price to snipe. |
| `acceptOffer` | Buyer withdraws in the same block the seller accepts. | Seller's accept reverts on the offer's status guard. No loss, only a wasted transaction. |
| `fund` | None. | Only the named buyer may fund; the amount is fixed. |
| `claimTimeout` | Permissionless, and any caller triggers the same effect. | Refund always goes to the recorded buyer, never to `msg.sender`. Racing it is pointless. |
| `expireListing` / `expireCredential` | Permissionless. | Idempotent state-syncing only; no value transfer. |
| `verifyAsset` | Front-run to list just before verification. | Verification does not change the on-chain price. Out of scope for V1. |
| Registration name-hash squatting | Attacker registers a victim's name hash first. | Real. Mitigated socially: only `ORG_VERIFIER_ROLE` can move an org to `VERIFIED`, and a squatted `PENDING` org can register nothing. Admin may `revokeOrganization` to free the hash. Documented as an accepted V1 limitation. |

The protocol has **no auction, no AMM, no price oracle and no liquidation**, which
removes the MEV surfaces that dominate DeFi. Trades are bilateral at a fixed price.

## 7. Confidentiality

Serial numbers and registration marks are stored as `keccak256` commitments. This
hides them from a casual reader of the chain. It does **not** hide them from a
determined observer: tail numbers and serials are low-entropy, publicly enumerable, and
brute-forceable in seconds against a known hash.

**Callers who need real confidentiality must salt the preimage**
(`keccak256(abi.encode(serial, salt))`) and share the salt only with counterparties.
This is stated in the NatSpec of every function taking a hash parameter, because a
caller who does not know it will assume a protection they do not have.

The protocol does not, and cannot, prevent a caller from submitting a plaintext value
in an off-chain URI. Client responsibility.

## 8. Upgrade safety

- ERC-7201 namespaced storage everywhere (`storage-model.md`), making layout collisions
  structurally impossible rather than test-detected.
- `_disableInitializers()` in every implementation constructor — an uninitialized
  implementation contract is a well-known hijack vector.
- `_authorizeUpgrade` gated on `PROTOCOL_ADMIN_ROLE`, i.e. the timelock.
- `test/upgrade/StorageLayout.t.sol` diffs `forge inspect storageLayout` output against
  a committed baseline; a namespace change fails CI.
- Reinitializer versions are strictly increasing and asserted.

## 9. External call handling

- `SafeERC20` for every token interaction; no bare `transfer`/`approve`.
- Balance deltas are measured around every inbound transfer (`INV-ESC-02`).
- Return data from external calls is never trusted for authorization.
- No `delegatecall` outside the UUPS proxy mechanism itself.
- No arbitrary-target calls anywhere. Every external call is to a typed interface at an
  address resolved from the address registry or fixed at initialization.

## 10. Input validation

Every external function validates: non-zero addresses where required, non-zero hashes,
non-zero ids within `1..count`, enum values within range (the compiler enforces this on
`abi.decode`, but explicit `UNSPECIFIED` rejection is added where a sentinel would be
semantically wrong), `price > 0`, deadlines strictly in the future, and `performedAt`
not in the future.

Failures use custom errors carrying the offending value, so a revert is diagnosable
from the trace without re-running with a debugger.

## 11. Known accepted limitations (V1)

1. Timelock compromise is a total compromise of L1–L3. Mitigated by multisig custody
   and delay, not eliminated.
2. The arbitrator is a centralized trusted party for disputes.
3. Hashed identifiers are brute-forceable unless salted by the caller.
4. Name-hash squatting on `PENDING` organizations is possible.
5. `AssetPassport` reads do not scale to unbounded document counts in a single call;
   pagination is required.
6. Off-chain data availability is out of scope.

All six are re-stated in the README and must be presented to the external auditor in
Phase 24 as known-and-accepted rather than discovered.
