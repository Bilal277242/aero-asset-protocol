# AeroAsset Protocol — Invariants

Properties that must hold after **every** externally reachable call sequence. Each has
a stable ID referenced from NatSpec, and each maps to a concrete Foundry encoding
implemented in Phase 8 (`test/invariant/`).

Roadmap §16 lists six required invariants; they appear here as `INV-OWN-01`,
`INV-ESC-02`, `INV-MKT-01`, `INV-CRED-03`, `INV-COMP-01` and `INV-OWN-03`. The
remainder were derived from the state machines and data model.

---

## Identity

| ID | Property | Encoding |
|---|---|---|
| `INV-ORG-01` | `orgIdByNameHash[h] == id ⟺ organizations[id].nameHash == h`. No two organizations share a name hash. | Ghost map of registered hashes; assert bijection. |
| `INV-ORG-02` | `status == VERIFIED ⟹ verifiedAt != 0`, and `status == PENDING ⟹ verifiedAt == 0`. | Per-id assertion over `1..orgCount`. |
| `INV-ORG-03` | `REVOKED` is absorbing: an org observed `REVOKED` is `REVOKED` at every later point. | Ghost set, monotonic membership. |
| `INV-CRED-01` | `isValid(id) ⟹ status == ACTIVE ∧ (expiresAt == 0 ∨ expiresAt > now)`. | Direct assertion. |
| `INV-CRED-02` | A credential past `expiresAt` is never `isValid`, regardless of stored `status`. | Handler warps time past random expiries. |
| `INV-CRED-03` | **(roadmap)** A `REVOKED` or `EXPIRED` credential never becomes `ACTIVE` again. Reissuance produces a strictly greater id. | Ghost set of terminal ids; assert none re-enters `ACTIVE`. |
| `INV-CRED-04` | At most one **valid** credential exists per `(subjectOrgId, credType)` pair, and `validCredentialOfType` returns exactly that one, or 0. | Sweep all credentials, group by `(org, type)`, assert at most one passes `isValid` and that it matches the O(1) lookup. |
| `INV-CRED-05` | The `activeOrgCredential` index is never *stale-positive*: if it returns a non-zero id, that credential is genuinely valid. It may legitimately hold a lapsed id internally, which the accessor filters. | Compare the raw index slot against `validCredentialOfType` after time warps. |

## Assets

| ID | Property | Encoding |
|---|---|---|
| `INV-ASSET-01` | Ids are dense and monotonic: every `1..assetCount` exists, `assetCount+1` does not. | Boundary assertion. |
| `INV-ASSET-02` | `assetIdBySerialHash` is injective; no two assets share a non-zero serial hash. | Ghost map. |
| `INV-ASSET-03` | **Registration never verifies.** Immediately after `registerAsset`, `verifiedAt == 0`. Only `ASSET_VERIFIER_ROLE` can make it non-zero. | Handler asserts post-condition on every registration; role-gated fuzz on the setter. |
| `INV-ASSET-04` | `status ∈ {RETIRED, DESTROYED}` is absorbing. | Ghost set. |
| `INV-COMP-01` | **(roadmap)** `parentAssetId != 0 ⟺ status == INSTALLED`. A component never belongs to two aircraft. | Assertion per component; plus a reverse sweep showing each component appears in at most one parent's index. |
| `INV-COMP-02` | Every id in `installedComponents[p]` has `parentAssetId == p`; the index has no duplicates and no stale entries. | Nested sweep, bounded by handler-tracked ids. |
| `INV-COMP-03` | No two `INSTALLED` components of the same `kind` share a `position` on one parent. | Sweep per parent. |
| `INV-OWN-01` | **(roadmap)** Every existing asset has exactly one non-zero owner. | Sweep `1..assetCount`, assert `ownerOf != address(0)`. |
| `INV-OWN-02` | `pendingOwner != 0 ⟹ pendingOwner != owner`, and a pending transfer past `offerExpiresAt` is not acceptable. | Assertion + time-warping handler. |
| `INV-OWN-03` | **(roadmap)** Unauthorized accounts cannot transfer restricted assets: ownership changes only via `acceptTransfer` (by `pendingOwner`) or `settleTransfer` (by the asset's lock holder). | Ghost log of owner changes; assert every delta has a matching authorized call. |
| `INV-OWN-04` | `lockedBy != 0 ⟹ a live escrow references the asset`. Locks are never orphaned. | Cross-check against the factory's escrow set. |
| `INV-OWN-05` | `lockedBy != 0 ⟹ pendingOwner == 0`. Taking a lock clears any in-flight direct transfer, so no offer can fire the moment settlement releases. | Assertion after every lock in the handler. |
| `INV-OWN-06` | `transferFrozen` in `AssetOwnership` agrees with `isTerminal` in `AssetRegistry` for every asset. The mirror never drifts. | Cross-contract sweep over `1..assetCount`. |

## Provenance

| ID | Property | Encoding |
|---|---|---|
| `INV-DOC-01` | `documentHash` is unique and non-zero across all documents. | Ghost map. |
| `INV-DOC-02` | Documents are append-only: `documentHash`, `assetId` and `issuerOrgId` never change after registration. | Snapshot on create, compare each round. |
| `INV-DOC-03` | `status == SUPERSEDED ⟺ supersededById != 0`, and the superseding document exists and points at the same asset. | Assertion. |
| `INV-MNT-01` | Maintenance records are immutable and append-only; count is monotonically non-decreasing. | Snapshot comparison. |
| `INV-MNT-02` | Every record's `performedByOrgId` was an `MRO`-type, `VERIFIED` org holding a valid `MAINTENANCE_AUTHORITY` credential *at write time*. | Handler asserts at call time (later revocation does not retro-invalidate — see `state-machines.md` §1). |
| `INV-MNT-04` | Every record's `documentId` is either 0 or refers to a document describing the **same** asset. Evidence cannot be laundered between aircraft. | Sweep all records; cross-check `DocumentRegistry`. |
| `INV-PASS-01` | `AssetPassport` holds no storage: every slot reads zero after any call sequence. | `vm.load` sweep after a populated fixture; asserted in `test/unit/passport/AssetPassport.t.sol`. |
| `INV-MNT-03` | `performedAt <= block.timestamp` for every record. No future-dated maintenance. | Sweep. |

## Marketplace

| ID | Property | Encoding |
|---|---|---|
| `INV-MKT-01` | **(roadmap)** `SOLD`, `CANCELLED` and `EXPIRED` are absorbing. A sold listing never becomes `ACTIVE`. | Ghost set of terminal listing ids. |
| `INV-MKT-02` | At most one listing per asset is `ACTIVE` at any time. | Per-asset counter sweep. |
| `INV-MKT-03` | `status == SOLD ⟹ escrowId != 0` and that escrow is `RELEASED`. | Cross-contract assertion. |
| `INV-MKT-04` | A listing is settleable only while `ownerOf(assetId) == listing.seller`. | Asserted in the settlement handler. |
| `INV-MKT-05` | `price > 0` and `paymentToken` was allowlisted at creation for every listing. | Sweep. |

## Escrow & fees

| ID | Property | Encoding |
|---|---|---|
| `INV-ESC-01` | Escrow token balance ≥ sum of `depositedAmount` over all non-terminal escrows. Protocol solvency. | Sum over factory-tracked escrows vs. `balanceOf`. |
| `INV-ESC-02` | **(roadmap)** Escrowed funds never exceed deposited funds: an escrow pays out at most `depositedAmount`, and `depositedAmount` is the measured balance delta. | Ghost accounting of in/out per escrow. |
| `INV-ESC-03` | Terminal escrows hold a zero token balance — funds are always fully distributed. | Sweep terminal set. |
| `INV-ESC-04` | `feeAmount + sellerProceeds == depositedAmount` exactly, on every `RELEASED` escrow. No rounding leak in either direction. | Assertion at settlement; fuzzed over prices and fee rates. |
| `INV-ESC-05` | An escrow holds `SETTLEMENT_ROLE` **iff** its status is non-terminal. | Cross-check `RoleManager` against factory set. |
| `INV-ESC-06` | Escrow parameters (`buyer`, `seller`, `price`, `assetId`, `paymentToken`) never change after `initialize`. | Snapshot comparison. |
| `INV-FEE-01` | `feeBps <= MAX_FEE_BPS` always, where `MAX_FEE_BPS` is a `constant`. | Assertion; fuzzed setter. |
| `INV-FEE-02` | `treasury != address(0)` always. | Assertion. |

## System

| ID | Property | Encoding |
|---|---|---|
| `INV-SYS-01` | `RoleManager.getRoleMemberCount(DEFAULT_ADMIN_ROLE) == 1` and the member is `ProtocolTimelock`. | Assertion; also checked by `Verify.s.sol`. |
| `INV-SYS-02` | No `ProtocolAddressRegistry` entry required by a deployed module is `address(0)`. | Sweep known keys. |
| `INV-SYS-03` | No contract in the protocol holds a native ETH balance. The protocol settles only in ERC-20. | Sweep `.balance`. |
| `INV-SYS-04` | Pausing never blocks `Escrow.claimTimeout` or `Escrow.cancel`. | Handler pauses randomly; assert the refund path still succeeds. |

---

## Handler design (Phase 8)

One `ProtocolHandler` drives a bounded actor set through the realistic action space:
`registerOrganization`, `verifyOrganization`, `issueCredential`, `revokeCredential`,
`registerAircraft`, `registerComponent`, `installComponent`, `removeComponent`,
`recordMaintenance`, `registerDocument`, `transferAsset`, `createListing`,
`cancelListing`, `makeOffer`, `acceptOffer`, `fundEscrow`, `releaseEscrow`,
`disputeEscrow`, `resolveDispute`, `claimTimeout`, plus `warpTime` and `togglePause`.

Rules the handler must follow:

- **Bounded actors and ids.** Fuzzed addresses are mapped into a fixed actor array and
  fuzzed ids into `1..count`, so sequences reach deep protocol state instead of
  bouncing off "does not exist" reverts.
- **`fail_on_revert = false`**, paired with per-action call/success counters asserted
  non-zero at teardown. Silent zero-coverage is the real failure mode of an invariant
  suite, and this is what catches it.
- **Ghost variables mirror intent, not implementation.** Deposits, payouts, owner
  changes and terminal-state sets are tracked in the handler so the assertions do not
  merely restate the contract's own storage back to itself.
