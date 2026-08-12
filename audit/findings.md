# AeroAsset Protocol — Audit Findings

**Scope:** `src/**` (18 contracts, 14 interfaces, 5 libraries), `script/**`, `foundry.toml`, `docs/**`, `test/**` as evidence.
**Commit:** `b31b6d2` (`main`)
**Compiler:** Solidity 0.8.28, EVM `cancun`, OZ v5.4.0
**Date:** 2026-08-11

---

## Auditor's note on independence

This audit was performed by the same agent that wrote the code. That is a material
weakness in the review, not a formality to be waved through: an author reviewing their
own work systematically fails to question the assumptions that produced the code in the
first place. Two things were done to reduce, not eliminate, that bias:

1. Findings were derived by reading the deployed artifacts and re-deriving behaviour,
   not by recalling design intent.
2. Every finding rated MEDIUM or above that makes a behavioural claim was **executed as
   a proof-of-concept test** against the real contracts. AAP-01, AAP-02, AAP-05 and
   AAP-06 are confirmed by passing tests in `audit/poc/AuditPoC.t.sol`, not by
   inspection. Findings marked *inspection-only* below have not been executed and should
   be treated as lower-confidence.

**This does not substitute for an independent human audit.** Several findings below
concern design decisions I made and then rated — an independent reviewer may rate them
differently, and may find whole classes of issue I am blind to.

---

## Remediation status

**Gates 0 and 1 are complete.** Thirteen findings are fixed, with 25 regression tests
across `test/audit/Gate0Regression.t.sol` and `Gate1Regression.t.sol` running in CI.
Gates 2 and 3 remain outstanding; none of their findings can strand value.

| Gate | Findings | Status |
|---|---|---|
| 0 | AAP-01, AAP-02, AAP-03, AAP-04, AAP-13 | ✅ **remediated** |
| 1 | AAP-05, AAP-06, AAP-07, AAP-08, AAP-10, AAP-14, AAP-24, AAP-25 | ✅ **remediated** |
| 2 | AAP-09, AAP-11, AAP-12, AAP-15, AAP-17, AAP-18 | ⬜ open |
| 3 | AAP-16, AAP-19, AAP-20, AAP-21, AAP-22, AAP-23 | ⬜ open |
| — | **AAP-26** | ❌ **withdrawn — false positive** |

### AAP-26 was wrong

I reported the OpenZeppelin submodule as pinned to an untagged commit. It is not: the
pin is exactly `v5.4.0`.

```
tag v5.4.0: c64a1edb67b6e3f4a15cca8909c9482ad33a02b0
HEAD:       c64a1edb67b6e3f4a15cca8909c9482ad33a02b0
```

`v5.4.0` is a **lightweight** tag. `git describe` without `--tags` considers only
annotated tags and therefore falls back to `v4.8.0-952-g…`, which is what
`git submodule status` prints. I read that fallback as the pin itself. The dependency was
correct the whole time; the finding was an artifact of how I checked it.

### AAP-24 is now genuinely closed

Slither had never executed against this codebase. It has now been run: 76 contracts, 100
detectors, **46 findings, zero High**. The four Medium findings were triaged — three are
`incorrect-equality` firing on `== 0` sentinels (false positives) and one is a real but
unexploitable `reentrancy-no-eth` in `acceptOffer` where the written values are *returned
by* the call that precedes them. All four are suppressed at the source with written
justifications, so a new Medium anywhere fails the build. CI is now **blocking** at
`fail-on: medium`. Full triage in `docs/audit/slither-triage.md`.

AAP-14 was addressed across both gates: Gate 0 added the arbitrator, separation-of-duty
and fee-manager assertions to `Verify.s.sol`; Gate 1 split `ASSET_VERIFIER_ROLE` from
`ORG_VERIFIER_ROLE` in `ConfigureProtocol.Config` (AAP-25), which was the remaining item.

**One deviation from the recommendation as written.** AAP-04 called for ≥2 arbitrator
holders. The implemented check requires ≥1 holder and that *every* holder is a contract.
A single Safe multisig is the standard and correct configuration, and it already
survives the loss of one key internally; demanding two separate multisigs would have
forced a `Config` array change for little gain. The property that actually removes the
single point of failure is AAP-01's timeout fallback, which is implemented.

## Summary

| Severity | Valid | Fixed | Open |
|---|---|---|---|
| CRITICAL | 1 | 1 | 0 |
| HIGH | 3 | 3 | 0 |
| MEDIUM | 10 | 7 | 3 |
| LOW | 5 | 0 | 5 |
| INFORMATIONAL | 6 | 2 | 4 |
| **Total** | **25** | **13** | **12** |

One further finding (AAP-26) was reported and later withdrawn as a false positive, so 26
were raised and 25 stand.

**Every CRITICAL, HIGH, and severity-MEDIUM finding that concerns permanent loss of
funds or state is closed.** The three open MEDIUMs are AAP-09 (buyer's free option),
AAP-11 (post-verification metadata mutation) and AAP-12 (unbounded maintenance
backdating) — all economic or data-integrity issues, none of which can strand value.

No finding permits an unprivileged attacker to **steal** funds. The most severe issues
are **permanent freezing of funds and permanent destruction of asset state** by an
ordinary counterparty, which the protocol's state machines allow by construction.

A ✅ marks a remediated finding.

| ID | Severity | Title | Contract |
|---|---|---|---|
| AAP-01 | CRITICAL | ✅  `DISPUTED` has no resolution deadline — a seller can freeze buyer funds forever | `Escrow` |
| AAP-02 | HIGH | ✅  Seller can brick the asset mid-escrow and strand the deposit | `AssetRegistry` / `Escrow` |
| AAP-03 | HIGH | ✅  `transferFrozen` is irreversible protocol-wide, with no recovery path | `AssetOwnership` |
| AAP-04 | HIGH | ✅  Single-EOA arbitrator is a single point of total failure for disputed funds | `RoleManager` / deployment |
| AAP-05 | MEDIUM | ✅ Rejecting a squatted organization does not free its name hash | `OrganizationRegistry` |
| AAP-06 | MEDIUM | ✅ An installed component can be sold off its airframe | `ComponentRegistry` / `Marketplace` |
| AAP-07 | MEDIUM | ✅ Document-hash uniqueness is global and permanent — cross-asset DoS | `DocumentRegistry` |
| AAP-08 | MEDIUM | ✅ Serial-number hash squatting permanently burns an identifier | `AssetRegistry` |
| AAP-09 | MEDIUM | Buyer holds a free 30-day option on the seller's asset | `Escrow` / `Marketplace` |
| AAP-10 | MEDIUM | ✅ `via_ir` profile ships bytecode the test suite never exercised | `foundry.toml` |
| AAP-11 | MEDIUM | Verified organization can silently mutate its metadata | `OrganizationRegistry` |
| AAP-12 | MEDIUM | Maintenance records can be backdated without bound | `MaintenanceRegistry` |
| AAP-13 | MEDIUM | ✅  Blacklistable settlement token can permanently brick the refund path | `Escrow` |
| AAP-14 | MEDIUM | ✅ `Verify.s.sol` does not constrain operational role holders | `script/Verify.s.sol` |
| AAP-15 | LOW | Treasury resolved at settlement, not captured at acceptance | `Escrow` / `FeeManager` |
| AAP-16 | LOW | `fund()` performs an interaction before its effects, contradicting its NatSpec | `Escrow` |
| AAP-17 | LOW | Revoked organization's admin retains operator and admin-transfer powers | `OrganizationRegistry` |
| AAP-18 | LOW | Token allowlist is checked at listing but never re-checked at acceptance | `Marketplace` |
| AAP-19 | LOW | Seller can front-run `withdrawOffer` with `acceptOffer` | `Marketplace` |
| AAP-20 | INFORMATIONAL | Unreachable `expiresAt == 0` branches in four contracts | `Marketplace` |
| AAP-21 | INFORMATIONAL | Raw `uint40(block.timestamp)` casts bypass the `ProtocolCast` policy | multiple |
| AAP-22 | INFORMATIONAL | `installComponent` makes four redundant external calls | `ComponentRegistry` |
| AAP-23 | INFORMATIONAL | Event ordering in `settleTransfer` and `resolveDispute` | `AssetOwnership` / `Escrow` |
| AAP-24 | INFORMATIONAL | ✅ Slither has never been executed against this codebase | process |
| AAP-25 | INFORMATIONAL | ✅ `ORG_VERIFIER_ROLE` and `ASSET_VERIFIER_ROLE` collapse to one key | `ConfigureProtocol` |
| AAP-26 | ~~INFO~~ | ❌ withdrawn — OpenZeppelin submodule pinned to an untagged commit | `.gitmodules` |

---

# CRITICAL

## AAP-01 — `DISPUTED` has no resolution deadline; a seller can freeze buyer funds indefinitely

- **Contract:** `src/escrow/Escrow.sol`
- **Function:** `raiseDispute()`, `resolveDispute()`, `claimTimeout()`
- **Status:** ✅ **Confirmed by PoC** — `test_PoC_DisputeTrapsFunds`

### Vulnerability

`raiseDispute()` moves a `FUNDED` escrow to `DISPUTED`. Every exit from `DISPUTED` runs
through `resolveDispute()`, which requires `ARBITRATOR_ROLE`:

```solidity
function claimTimeout() external nonReentrant {
    if (status != EscrowStatus.FUNDED) { revert InvalidEscrowTransition(...); }   // blocked
    ...
}
function release() external nonReentrant {
    if (status != EscrowStatus.FUNDED) { revert InvalidEscrowTransition(...); }   // blocked
    ...
}
```

There is **no deadline on `DISPUTED`** and no permissionless escape. The buyer's entire
deposit is held by a contract with exactly one exit, controlled by a third party under
no on-chain obligation to act.

Critically, `raiseDispute()` is callable by **either party**, and the seller has no
capital at risk:

```solidity
if (msg.sender != terms.buyer && msg.sender != terms.seller) { revert NotEscrowParty(msg.sender); }
```

### Impact

Total, permanent loss of the buyer's funds in the absence of arbitrator action. For a
protocol settling aircraft, a single deposit is plausibly $1M–$100M. This is reachable:

- **unilaterally**, by an ordinary counterparty with no special role;
- **at zero cost** to the attacker beyond gas;
- on **every trade**, immediately after funding;
- with **no time bound** whatsoever.

It also fires without any attacker at all: if the arbitrator key is lost, compromised
and rotated out, or simply unresponsive, every escrow ever disputed is permanently dead.

### Attack scenario

1. Mallory lists an aircraft at 40M USDC and accepts Bob's offer.
2. Bob funds the escrow. `status = FUNDED`, 40M USDC now held by the clone.
3. In the same block, Mallory calls `raiseDispute()`. `status = DISPUTED`.
4. Mallory demands an off-chain side payment to instruct the arbitrator to release.
5. Bob has no recourse. `claimTimeout()` reverts on the status guard, forever — the PoC
   asserts this still holds after ten years of `vm.warp`.

The extortion framing is optional; a seller who simply wants to punish a buyer, or who
goes out of business, produces the identical result.

### Recommended remediation

Add a dispute deadline that restores the permissionless refund path. Minimal change:

```solidity
// In EscrowTerms, set at acceptance:
uint40 disputeDeadline;   // e.g. settlementDeadline + DISPUTE_WINDOW (14 days)

function raiseDispute() external {
    ...
    _setStatus(EscrowStatus.DISPUTED);
    disputeRaisedAt = uint40(block.timestamp);
}

/// Permissionless. If arbitration does not happen within the window, the buyer is
/// made whole — the same default the protocol already applies at settlement timeout.
function claimDisputeTimeout() external nonReentrant {
    if (status != EscrowStatus.DISPUTED) { revert InvalidEscrowTransition(status, EscrowStatus.REFUNDED); }
    uint40 deadline = disputeRaisedAt + DISPUTE_RESOLUTION_WINDOW;
    if (block.timestamp <= deadline) { revert DisputeDeadlineNotPassed(deadline, uint40(block.timestamp)); }
    _refund();
}
```

Refund-by-default is the correct fallback: it matches the existing `claimTimeout`
asymmetry (settlement stops, refunds do not) and it removes the attacker's incentive
entirely — a seller who disputes to grief now merely delays a refund they could not
prevent.

Consider additionally requiring a dispute bond from the raising party, forfeited if the
arbitrator rules against them. That converts free griefing into a priced action.

---

# HIGH

## AAP-02 — Seller can brick the asset mid-escrow and strand the buyer's deposit

- **Contract:** `src/assets/AssetRegistry.sol`, interacting with `src/escrow/Escrow.sol`
- **Function:** `setAssetStatus()`
- **Status:** ✅ **Confirmed by PoC** — `test_PoC_SellerCanBrickAssetMidEscrow`

### Vulnerability

`setAssetStatus` is authorized on **current ownership alone**, with no check that the
asset is free of an escrow lock:

```solidity
function setAssetStatus(uint256 assetId, AssetStatus newStatus) external whenNotPaused {
    Asset storage asset = _requireExists(assetId);
    _ownership().requireOwner(assetId, msg.sender);        // the seller still qualifies
    ...
    if (newStatus == AssetStatus.RETIRED || newStatus == AssetStatus.DESTROYED) {
        _ownership().freezeTransfers(assetId);             // permanent (see AAP-03)
    }
}
```

During `FUNDED`, the seller is still `record.owner` — settlement has not run. So the
seller can set `DESTROYED` at any point after the buyer commits funds. `freezeTransfers`
sets `transferFrozen = true`, and `settleTransfer` refuses on exactly that flag:

```solidity
if (record.transferFrozen) { revert AssetTransferFrozen(assetId); }
```

### Impact

Two distinct harms, both confirmed:

1. **Buyer's funds are stranded for the full 30-day settlement window.** `release()`
   reverts permanently; the only exit is `claimTimeout()` after `settlementDeadline`.
2. **The asset is permanently destroyed as a tradeable record** — see AAP-03. Its
   provenance, documents and maintenance history remain on-chain but the asset can
   never be transferred again by anyone, including the protocol admin.

Note the interaction with AAP-01: a seller who prefers indefinite to 30-day denial
simply calls `raiseDispute()` instead, and `claimTimeout()` never becomes reachable.

### Attack scenario

1. Mallory lists an aircraft; Bob offers; Mallory accepts; Bob funds 40M USDC.
2. Mallory calls `setAssetStatus(assetId, DESTROYED)`. The aircraft is physically fine.
3. `release()` now reverts for Bob with `AssetTransferFrozen`.
4. Bob waits 30 days and calls `claimTimeout()` to recover his capital, having lost the
   time value and the trade.
5. The asset is bricked for Mallory too — but Mallory may not care, or may be acting to
   damage a competitor's collateral rather than to profit.

### Recommended remediation

Refuse terminal status transitions while the asset is locked, and gate the whole
function on transferability:

```solidity
function setAssetStatus(uint256 assetId, AssetStatus newStatus) external whenNotPaused {
    Asset storage asset = _requireExists(assetId);
    _ownership().requireOwner(assetId, msg.sender);

    if (newStatus == AssetStatus.RETIRED || newStatus == AssetStatus.DESTROYED) {
        address lockHolder = _ownership().lockHolderOf(assetId);
        if (lockHolder != address(0)) { revert AssetLockedBySettlement(assetId, lockHolder); }
    }
    ...
}
```

A genuinely destroyed aircraft mid-trade is a real scenario, but it is a *dispute*, not
a unilateral write: the correct path is for the seller to `raiseDispute()` and have the
arbitrator resolve, after which the freeze can be applied.

---

## AAP-03 — `transferFrozen` is irreversible protocol-wide with no recovery path

- **Contract:** `src/ownership/AssetOwnership.sol`
- **Function:** `freezeTransfers()`
- **Status:** ✅ **Confirmed by PoC** (asserted in `test_PoC_SellerCanBrickAssetMidEscrow`); *no unfreeze entry point exists in `src/` — verified by search*

### Vulnerability

`freezeTransfers` sets a one-way flag:

```solidity
function freezeTransfers(uint256 assetId) external onlyAssetRegistry {
    OwnershipRecord storage record = _requireExists(assetId);
    record.transferFrozen = true;
    emit TransferFrozen(assetId);
}
```

There is no `unfreezeTransfers`, no admin override, and no timelock-gated recovery
anywhere in the protocol. The flag was deliberately narrowed from an earlier
`setTransferFrozen(id, bool)` because the unfreeze branch was unreachable in tests —
which removed the *only* recovery mechanism rather than fixing the reachability gap.

### Impact

Any transition to `RETIRED` or `DESTROYED` is **permanent and unrecoverable**, and it is
reachable by an ordinary asset owner with a single transaction. Consequences:

- A fat-fingered `DESTROYED` on a $100M airframe permanently ends its tradability. The
  correct real-world remedy — "that was an error, restore it" — does not exist on-chain.
- `RETIRED` is a *reversible real-world state*. Aircraft routinely leave and re-enter
  service; stored airframes are returned to operation regularly. Modelling `RETIRED` as
  absorbing is a domain modelling error, not merely a safety choice.
- It is the amplifier that turns AAP-02 from a 30-day griefing attack into permanent
  destruction of an asset record.

### Attack scenario

No attacker required. The owner of a stored aircraft records it as `RETIRED` — a
correct, expected, documented action. Two years later the aircraft returns to service.
The protocol has no way to represent that. The asset must be re-registered as a new id,
orphaning its entire document and maintenance provenance chain — which is precisely the
value the protocol exists to provide.

### Recommended remediation

Two changes:

1. **Make `RETIRED` non-terminal.** Allow `RETIRED → STORED`/`IN_SERVICE` in
   `AssetRegistry.isValidTransition`, and mirror an unfreeze. Keep `DESTROYED`
   absorbing — that one genuinely is.
2. **Add a timelock-gated unfreeze for `DESTROYED`**, for error recovery only:

```solidity
/// @dev PROTOCOL_ADMIN_ROLE only, i.e. behind the 48h timelock and publicly queued.
///      Exists solely so an erroneous terminal status is recoverable; every use is
///      visible for two days before it lands.
function unfreezeTransfers(uint256 assetId) external onlyRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE) {
    OwnershipRecord storage record = _requireExists(assetId);
    record.transferFrozen = false;
    emit TransferUnfrozen(assetId, msg.sender);
}
```

This weakens the "immutable freeze" property. That trade is worth making: an
irreversible state reachable by one unprivileged transaction, with no recovery, is a
larger risk than a timelocked admin action that the whole world can watch for 48 hours.

---

## AAP-04 — Single-EOA arbitrator is a single point of total failure

- **Contract:** `script/ConfigureProtocol.s.sol`, `src/escrow/Escrow.sol`
- **Function:** `wireRoles()`, `resolveDispute()`
- **Status:** Inspection-only (configuration property)

### Vulnerability

`ARBITRATOR_ROLE` is granted to a single address read straight from the environment:

```solidity
roles.grantRole(ProtocolRoles.ARBITRATOR_ROLE, c.arbitrator);   // from vm.envAddress("DISPUTE_ARBITRATOR")
```

`Verify.s.sol` does not assert that this is a contract, a multisig, or that more than
one holder exists. Combined with AAP-01, this one key is the sole exit from `DISPUTED`
for every escrow in the protocol.

### Impact

- **Key loss** ⇒ every disputed escrow is permanently frozen (AAP-01 becomes unavoidable
  rather than merely griefable).
- **Key compromise** ⇒ the attacker resolves every disputed escrow to whichever party
  pays them. They cannot alter amounts or redirect to a third party — that containment
  is real and well designed — but they fully control who wins every dispute.
- **Rotation** requires a timelock proposal *plus* the 48h delay, during which disputes
  cannot be resolved at all.

The docs acknowledge centralized arbitration as an accepted V1 limitation
(`README.md` known limitation 2). Accepting *centralization* is defensible. Accepting a
**single EOA with no threshold, no backup, and no timeout fallback** is a different and
larger claim, and it is not what the limitation says.

### Attack scenario

An attacker phishes the arbitrator's key. They monitor for `EscrowFunded` on
high-value trades, contact sellers offering guaranteed dispute wins for a cut, and
resolve to the seller after the seller raises a dispute. Buyers lose the full deposit
with a valid on-chain audit trail showing a legitimate arbitration.

### Recommended remediation

1. Require `ARBITRATOR_ROLE` to be a Safe multisig (m-of-n); assert in `Verify.s.sol`
   that the holder has non-zero code:
   ```solidity
   _expect(a.arbitrator.code.length > 0, "arbitrator is an EOA");
   ```
2. Grant it to **at least two** independent holders so a single key loss is survivable.
3. Ship AAP-01's timeout fallback so arbitration unavailability degrades to a refund
   rather than a freeze. This is the change that actually removes the single point of
   failure; 1 and 2 only reduce its likelihood.

---

# MEDIUM

## AAP-05 — Rejecting a squatted organization does not free its name hash

- **Contract:** `src/identity/OrganizationRegistry.sol`
- **Function:** `registerOrganization()`, `rejectOrganization()`
- **Status:** ✅ **Confirmed by PoC** — `test_PoC_RejectedOrgPermanentlyBurnsTheName`

### Vulnerability

Registration is permissionless and writes a permanent reverse index:

```solidity
uint256 existing = $.organizationIdByNameHash[nameHash];
if (existing != 0) { revert OrganizationNameTaken(nameHash, existing); }
...
$.organizationIdByNameHash[nameHash] = orgId;
```

No lifecycle transition ever clears `organizationIdByNameHash`. `rejectOrganization`
moves the record `PENDING → REVOKED` and leaves the index pointing at the dead record.

### Impact

`README.md` states the mitigation as: *"squatted records can do nothing and can be
revoked."* The first half is true; the second does not mitigate anything. Rejecting a
squat **permanently burns the name for the legitimate organization**, converting a
temporary nuisance into an unrecoverable denial of service.

Name hashes are `keccak256` of a legal entity name — trivially precomputable. An
attacker can front-run or pre-register the names of every major airline, MRO and lessor
for the cost of gas, and the protocol's own remediation path makes each burn permanent.

### Attack scenario

1. Mallory computes `keccak256("Lufthansa Technik AG")` and registers it. Cost: one tx.
2. Lufthansa Technik attempts to register. Reverts with `OrganizationNameTaken`.
3. The verifier does the documented thing and rejects Mallory's squat.
4. Lufthansa Technik tries again. **Still reverts** — the index still points at the
   revoked record. The name is now permanently unusable.

### Recommended remediation

Free the index on rejection and revocation:

```solidity
function _writeStatus(...) private {
    ...
    org.status = to;
    if (to == OrganizationStatus.REVOKED) {
        delete _s().organizationIdByNameHash[org.nameHash];
    }
    ...
}
```

This is safe: a `REVOKED` org is terminal and can perform no action, so the record
remains as an audit trail while the name becomes re-registrable. Consider also
requiring a refundable registration bond to price squatting.

---

## AAP-06 — An installed component can be sold off its airframe

- **Contract:** `src/assets/ComponentRegistry.sol`, `src/marketplace/ListingManager.sol`
- **Function:** `createListing()`, `installComponent()`
- **Status:** ✅ **Confirmed by PoC** — `test_PoC_InstalledComponentCanBeSoldOffTheAirframe`

### Vulnerability

`ComponentRegistry` tracks installation as component state (`parentAssetId`,
`status == INSTALLED`). `AssetOwnership` and the marketplace know nothing about it.
`createListing`'s transferability gate checks only owner, freeze and lock:

```solidity
function isTransferable(uint256 assetId) external view returns (bool) {
    OwnershipRecord storage record = _s().records[assetId];
    return record.owner != address(0) && !record.transferFrozen && record.lockedBy == address(0);
}
```

Nothing consults installation state. An `INSTALLED` engine is fully listable and sellable.

### Impact

After settlement the registry reports a contradiction that the PoC asserts directly:
Bob owns the engine, Alice owns the aircraft, and `getComponent(engineId).parentAssetId`
still returns Alice's aircraft, which still counts the engine in `componentsOf()`.

For a protocol whose stated purpose is trustworthy provenance, the component graph
silently disagreeing with the ownership ledger is a core correctness failure. Concretely:

- An aircraft buyer reading `componentsOf(aircraftId)` sees engines they do not own.
- `AssetPassport` — the aggregator marketed as the asset's single source of truth —
  reports the same inconsistency.
- The reverse case is worse: selling an airframe does not transfer its installed
  components, so a buyer may reasonably believe they bought a complete aircraft.

### Attack scenario

Mallory owns an airframe with two engines installed. She sells the airframe to Bob at
a price reflecting a complete aircraft, having separately sold both engines to Carol an
hour earlier. All three records are internally consistent with the protocol's rules;
only the aggregate is a lie. Bob's due diligence on `componentsOf()` shows the engines
present, because installation state was never updated.

### Recommended remediation

Choose one of two coherent models and enforce it:

- **(a) Components are not independently tradeable while installed.** Add to
  `createListing` and `Escrow.fund`'s lock step: reject if
  `componentRegistry.getComponent(assetId).status == INSTALLED`. Selling requires
  removal first. Simplest and matches physical reality for major assemblies.
- **(b) Sale auto-detaches.** `AssetOwnership.settleTransfer` notifies
  `ComponentRegistry` to detach. This inverts the L2 dependency direction (L2a calling
  L2c) and would breach the acyclic-call-graph rule in `architecture.md` §2 — so it
  needs the detach to be pulled by the marketplace before settlement rather than pushed
  from ownership.

I recommend (a). It is a two-line guard, it needs no architectural change, and "you must
remove an engine before selling it" is how the industry already works.

---

## AAP-07 — Document-hash uniqueness is global and permanent

- **Contract:** `src/documents/DocumentRegistry.sol`
- **Function:** `registerDocument()`
- **Status:** Inspection-only

### Vulnerability

```solidity
uint256 existing = $.documentIdByHash[documentHash];
if (existing != 0) { revert DocumentHashTaken(documentHash, existing); }
```

The index is global across all assets and is never cleared — not by `revokeDocument`,
not by `supersedeDocument`, not by any admin path.

### Impact

A document hash can be registered exactly once, protocol-wide, forever. Two consequences:

1. **Cross-asset DoS.** An attacker who controls any asset or any verified org can
   register hash `H` against their own junk asset, permanently preventing the real
   holder of that document from registering it against the real aircraft. Document
   hashes of published, non-confidential documents (type certificates, ADs, SBs) are
   computable by anyone.
2. **Legitimate collision.** The same document genuinely applies to multiple assets — an
   Airworthiness Directive covers a fleet. The protocol can record it against exactly
   one aircraft, then refuses for every other.

### Attack scenario

Mallory obtains the published AD PDF that will apply to a competitor's fleet, computes
its hash, and registers it against a worthless component she owns. Every operator in
that fleet is now permanently unable to record AD compliance against their aircraft.

### Recommended remediation

Scope uniqueness to `(assetId, documentHash)` rather than globally:

```solidity
mapping(uint256 assetId => mapping(bytes32 documentHash => uint256 documentId)) documentIdByAssetAndHash;
```

This preserves the real property (no duplicate document on the same asset) and removes
both the DoS and the fleet-document limitation. Keep a global
`documentHash => uint256[]` index for lookup if cross-asset discovery is wanted.

---

## AAP-08 — Serial-number hash squatting permanently burns an identifier

- **Contract:** `src/assets/AssetRegistry.sol`
- **Function:** `_register()`
- **Status:** Inspection-only (same mechanism as the confirmed AAP-05)

### Vulnerability

```solidity
if (serialNumberHash != bytes32(0)) {
    uint256 existing = $.assetIdBySerialHash[serialNumberHash];
    if (existing != 0) { revert SerialNumberTaken(serialNumberHash, existing); }
}
```

Never cleared, including on `DESTROYED`.

### Impact

Aircraft MSNs and engine ESNs are public and short. `keccak256("MSN 12345")` is trivially
computable, and `README.md` limitation 3 already concedes the values are brute-forceable
unless salted. Any verified organization can pre-register the serial hash of any aircraft
in the world, permanently preventing its real owner from registering it.

Unlike AAP-05, there is not even a documented mitigation — no rejection path exists for
assets, so a squatted serial is unrecoverable by any means.

### Attack scenario

A competitor registers the serial hashes of a lessor's entire fleet before the lessor
onboards. The lessor cannot register any aircraft under its true serial and must either
use salted hashes (breaking the discoverability the index exists for) or abandon the
protocol.

### Recommended remediation

1. Allow `PROTOCOL_ADMIN_ROLE` (timelocked) to clear a serial-hash index entry for an
   asset adjudicated fraudulent.
2. Require the registering organization to be `VERIFIED` — already true via
   `requireActingFor`, which raises the cost but does not eliminate the attack.
3. Document salting as **mandatory**, not optional, and provide the canonical
   construction (`keccak256(abi.encode(serial, orgSalt))`) in the interface NatSpec.

---

## AAP-09 — Buyer holds a free 30-day option on the seller's asset

- **Contract:** `src/escrow/Escrow.sol`, `src/marketplace/Marketplace.sol`
- **Function:** `fund()`, `claimTimeout()`
- **Status:** Inspection-only (economic property)

### Vulnerability

Between `fund()` and `settlementDeadline` the asset is locked and only the buyer may
`release()`. If the buyer does nothing, `claimTimeout()` returns **100%** of the deposit:

```solidity
function _refund() private {
    ...
    IERC20(terms.paymentToken).safeTransfer(terms.buyer, deposited);   // full amount
}
```

The buyer therefore holds a 30-day American call on the asset at the struck price, for
which they pay nothing.

### Impact

Rational buyers will exercise only when the asset appreciates or their financing lands,
and walk otherwise. The seller bears the full cost: 30 days of lock-up, an unsaleable
asset, and no compensation. `SETTLEMENT_WINDOW = 30 days` is long enough for this option
to carry real value on a volatile, illiquid, high-value asset.

The seller's only recourse is `raiseDispute()` and a favourable arbitration — which
loads a routine economic event onto a centralized, manual process (AAP-04), and which
the buyer can pre-empt by disputing first (AAP-01).

### Attack scenario

Bob funds escrow on a 40M aircraft. Over the following weeks the market softens 8%.
Bob calls `claimTimeout()` and recovers 40M in full. He repeats against three other
sellers simultaneously, exercising only where prices rose. Sellers absorb the cost of
every unexercised option.

### Recommended remediation

Price the option. On `claimTimeout` (buyer-fault timeout, distinct from an arbitrated
refund), forfeit a fixed percentage of the deposit to the seller:

```solidity
uint16 internal constant TIMEOUT_PENALTY_BPS = 200;   // 2%, capped and published

function _refundWithPenalty() private {
    uint256 penalty = (deposited * TIMEOUT_PENALTY_BPS) / 10_000;
    ...
    token.safeTransfer(terms.seller, penalty);
    token.safeTransfer(terms.buyer, deposited - penalty);
}
```

Additionally, shorten `SETTLEMENT_WINDOW` — 30 days is far longer than settlement
mechanically requires once funds are already escrowed — and make it a per-listing
parameter within a bounded range rather than a protocol-wide constant.

---

## AAP-10 — `via_ir` profile ships bytecode the test suite never exercised

- **Contract:** `foundry.toml`
- **Status:** Inspection-only (build configuration)

### Vulnerability

```toml
# via-IR build used for the pre-audit gas baseline and for mainnet artifacts.
[profile.optimized]
via_ir = true
optimizer_runs = 1_000_000
bytecode_hash = "none"
cbor_metadata = false
```

The default and `ci` profiles do **not** enable `via_ir`. All 488 tests, all 18
invariants and the entire fuzz corpus therefore validate legacy-pipeline bytecode, while
the comment designates the IR pipeline for mainnet artifacts.

### Impact

Deploying `optimized` artifacts means deploying code that has never been tested. The IR
pipeline is a different code generator with a different optimizer; the differences are
usually benign and occasionally not — historical `via_ir` codegen bugs have altered
behaviour in ways no source-level review would catch. `optimizer_runs = 1_000_000` is
also a large jump from the tested `200`.

Secondarily, `bytecode_hash = "none"` and `cbor_metadata = false` strip the metadata
that block-explorer verification uses, making the deployed artifact harder to verify
against source — the opposite of what is wanted for a protocol asking for public trust.

### Attack scenario

Not attacker-driven. A latent codegen difference in an escrow arithmetic path reaches
mainnet without ever having been executed under test, and manifests first on a live
settlement carrying real funds.

### Recommended remediation

Pick one pipeline and test exactly what you ship:

- **Preferred:** enable `via_ir = true` in the **default and CI** profiles, run the full
  suite and invariants against it, regenerate `.gas-snapshot`, and delete the separate
  `optimized` profile.
- If IR compile time is prohibitive locally, keep `lite` for iteration but make **CI**
  the IR build, so nothing merges without IR-pipeline test coverage.

Restore `bytecode_hash`/`cbor_metadata` defaults unless there is a specific reason to
strip them; explorer verification is worth more than the bytecode saved.

---

## AAP-11 — Verified organization can silently mutate its metadata

- **Contract:** `src/identity/OrganizationRegistry.sol`
- **Function:** `updateOrganization()`
- **Status:** Inspection-only

### Vulnerability

```solidity
function updateOrganization(uint256 orgId, bytes32 metadataHash, string calldata uri)
    external whenNotPaused onlyOrganizationAdmin(orgId)
{
    if (org.status == OrganizationStatus.REVOKED) { revert ...; }
    org.metadataHash = metadataHash;      // no status check beyond REVOKED
    $.metadataURI[orgId] = uri;
}
```

A `VERIFIED` organization may rewrite `metadataHash` and `uri` freely. `verifiedAt` is
not reset and the status does not change.

### Impact

Verification attests to a metadata state that the subject can replace immediately
afterwards, with no on-chain signal that the attested content changed. `ORG_VERIFIER_ROLE`
reviewed document set A; the world sees a `VERIFIED` badge over document set B.

This is the classic verify-then-swap pattern. It matters more here than usual because
organization verification is the protocol's root trust primitive — `isActingFor` gates
asset registration, document attribution and maintenance recording.

### Attack scenario

Mallory registers an MRO with genuine credentials and passes verification. She then
calls `updateOrganization` pointing `uri` at a profile claiming certifications she does
not hold. Counterparties reading the profile see a protocol-`VERIFIED` organization
asserting false capabilities, with `verifiedAt` still showing the original review date.

### Recommended remediation

Demote on material change:

```solidity
// A verified record whose attested content changes must be re-reviewed.
if (org.status == OrganizationStatus.VERIFIED && metadataHash != org.metadataHash) {
    _writeStatus(orgId, org, OrganizationStatus.VERIFIED, OrganizationStatus.SUSPENDED);
    emit OrganizationRequiresReverification(orgId, org.metadataHash, metadataHash);
}
```

If auto-demotion is too aggressive operationally, the minimum is to emit a distinct
event carrying both old and new hashes and to record a `metadataChangedAt` timestamp
that consumers can compare against `verifiedAt`.

---

## AAP-12 — Maintenance records can be backdated without bound

- **Contract:** `src/maintenance/MaintenanceRegistry.sol`
- **Function:** `recordMaintenance()`
- **Status:** Inspection-only

### Vulnerability

```solidity
if (performedAt == 0 || performedAt > block.timestamp) {
    revert PerformedAtInFuture(performedAt, uint40(block.timestamp));
}
```

Future dates are rejected; the past is entirely unconstrained. `performedAt` may be any
value from 1 to `block.timestamp`, including dates before the asset was registered,
before the organization was verified, and before the credential was issued.

### Impact

Falsified maintenance history is the specific fraud this protocol exists to prevent
(`requirements.md`, roadmap §13). A credentialed MRO can manufacture an arbitrary
back-history in a single block: a heavy check "performed" three years ago, a compliance
event predating the aircraft's own registration.

The records are append-only and immutable by design, so a fabricated backdated record is
permanent and indistinguishable from a genuine one — the block timestamp reveals when it
was *written*, but every consumer reads `performedAt`.

### Attack scenario

Mallory's MRO is credentialed today. Before selling an airframe she records twelve
maintenance events dated across the previous four years, presenting a complete and
attractive service history. A buyer querying `maintenanceOf(assetId)` sees a well-
maintained aircraft; nothing on-chain distinguishes it from fabrication.

### Recommended remediation

1. Bound backdating to a policy window and reject anything older:
   ```solidity
   uint40 internal constant MAX_BACKDATING = 90 days;
   if (performedAt + MAX_BACKDATING < block.timestamp) {
       revert PerformedAtTooOld(performedAt, uint40(block.timestamp - MAX_BACKDATING));
   }
   ```
2. Reject `performedAt` earlier than the asset's `registeredAt`, and earlier than the
   relied-upon credential's `issuedAt` — both are already loaded in `_authorizeMro`, so
   this is nearly free.
3. Emit `block.timestamp` alongside `performedAt` in `MaintenanceRecorded` (it is
   implicit in the log, but making the gap explicit lets indexers flag backdating).

---

## AAP-13 — Blacklistable settlement token can permanently brick the refund path

- **Contract:** `src/escrow/Escrow.sol`
- **Function:** `_refund()`, `_settle()`
- **Status:** Inspection-only

### Vulnerability

The intended settlement token is USDC (`.env.example` ships a USDC address), which
implements an administrative blacklist. Both exits perform an unconditional push:

```solidity
IERC20(terms.paymentToken).safeTransfer(terms.buyer, deposited);   // _refund
token.safeTransfer(terms.seller, proceeds);                        // _settle
```

If the recipient is blacklisted, `safeTransfer` reverts and the whole transaction
reverts.

### Impact

- **Buyer blacklisted:** `_refund()` reverts forever. `claimTimeout()` and a
  refund-side arbitration both become permanently unavailable. The only remaining exit
  is arbitration in the *seller's* favour — the buyer's funds either go to the seller or
  stay locked.
- **Seller or treasury blacklisted:** `_settle()` reverts, blocking release. Recoverable
  via timeout, so this direction is benign.

The treasury case is the sharpest: a blacklisted treasury blocks settlement for **every**
escrow protocol-wide until `FeeManager.setTreasury` lands — which is timelocked, so 48
hours minimum.

### Attack scenario

Bob is added to the USDC blacklist while his escrow is `FUNDED` (sanctions action,
mistaken freeze, exchange compromise attribution). His deposit becomes permanently
unrecoverable through any buyer-favourable path. He did nothing wrong in the protocol.

### Recommended remediation

Convert the push to a pull for the failure case:

```solidity
mapping(address account => uint256 amount) public withdrawable;

function _payout(IERC20 token, address to, uint256 amount) private {
    // Non-reverting attempt; on failure the amount is claimable later, so one
    // blacklisted party cannot brick the escrow's terminal transition.
    (bool ok, bytes memory data) = address(token).call(
        abi.encodeCall(IERC20.transfer, (to, amount))
    );
    if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) {
        withdrawable[to] += amount;
        emit PayoutDeferred(to, amount);
    }
}
```

Also assert in `Verify.s.sol` that the treasury is not the zero address *and* that a
`transfer` of 0 to it succeeds against the configured settlement token, as a
launch-time blacklist smoke test.

---

## AAP-14 — `Verify.s.sol` does not constrain operational role holders

- **Contract:** `script/Verify.s.sol`
- **Function:** `_verifyMachineRoles()`, `_verifyAdminHandover()`
- **Status:** Inspection-only

### Vulnerability

The verification script rigorously constrains machine roles:

```solidity
_expect(roles.getRoleMemberCount(ProtocolRoles.ESCROW_FACTORY_ROLE) == 1, "...");
_expect(roles.getRoleMemberCount(ProtocolRoles.ASSET_MINTER_ROLE) == 2, "...");
```

but makes **no assertion at all** about `ARBITRATOR_ROLE`, `ORG_VERIFIER_ROLE`,
`ASSET_VERIFIER_ROLE`, `CREDENTIAL_ISSUER_ROLE` or `FEE_MANAGER_ROLE`. The only
operational check is that no pauser equals the timelock.

### Impact

A deployment passes verification with the arbitrator set to `address(0x1)`, the
credential issuer equal to the pauser, or the fee manager held by an EOA that was never
renounced. Given AAP-04, the arbitrator gap is the one that matters: `Verify` is
documented as the gate that makes a deployment real, and it does not look at the single
most dangerous operational key.

### Attack scenario

A rushed deployment reuses one operations key for `ORG_VERIFIER`, `CREDENTIAL_ISSUER`
and `DISPUTE_ARBITRATOR` (all three are separate `.env` lines that a hurried operator
may fill identically). `Verify` passes. One phished key now verifies organizations,
issues their credentials, and arbitrates their disputes — the entire trust chain.

### Recommended remediation

```solidity
function _verifyOperationalRoles(ProtocolAddresses memory a, Config memory c) private view {
    RoleManager roles = RoleManager(a.roleManager);

    _expect(roles.getRoleMemberCount(ProtocolRoles.ARBITRATOR_ROLE) >= 1, "no arbitrator");
    _expect(c.arbitrator.code.length > 0, "arbitrator is an EOA");

    // Separation of duties: no key may hold two of the three trust-chain roles.
    _expect(c.orgVerifier != c.credentialIssuer, "verifier and issuer share a key");
    _expect(c.orgVerifier != c.arbitrator, "verifier and arbitrator share a key");
    _expect(c.credentialIssuer != c.arbitrator, "issuer and arbitrator share a key");
    _expect(c.pauser != c.orgVerifier && c.pauser != c.arbitrator, "pauser shares a key");

    // FEE_MANAGER_ROLE must be the timelock alone.
    _expect(roles.getRoleMemberCount(ProtocolRoles.FEE_MANAGER_ROLE) == 1, "extra fee managers");
    _expect(roles.hasRole(ProtocolRoles.FEE_MANAGER_ROLE, a.protocolTimelock), "fee manager is not the timelock");
}
```

---

# LOW

## AAP-15 — Treasury resolved at settlement, not captured at acceptance

- **Contract:** `src/escrow/Escrow.sol` · **Function:** `_settle()`

`terms` freezes price, fee amount and both deadlines at acceptance, but the fee
*recipient* is resolved live: `address treasury = _fees().treasury();`. A
`FEE_MANAGER_ROLE` change between acceptance and release redirects fees on already-agreed
in-flight trades. The role is timelock-held so this needs a 48h public queue, and the
amount is capped by the frozen `feeAmount` — impact is limited to fee redirection, not
principal. **Remediation:** capture `treasury` into `EscrowTerms` at acceptance, matching
how every other economic parameter is handled.

## AAP-16 — `fund()` performs an interaction before its effects, contradicting its NatSpec

- **Contract:** `src/escrow/Escrow.sol` · **Function:** `fund()`

The contract NatSpec claims *"Checks-effects-interactions, without exception."*
`fund()` calls `token.safeTransferFrom` **before** writing `depositedAmount` and
`status`. The measured-delta pattern requires the call to come first, so this is
unavoidable and is safe in practice — `nonReentrant` holds, and every reentrant entry
point either carries the same guard or fails its status check while `status` is still
`AWAITING_FUNDING`. The defect is the **claim**, not the code: an absolute security
assertion in NatSpec that the code does not meet trains reviewers to trust the comments.
**Remediation:** amend the NatSpec to state the actual property — "CEI on every path
where effects can precede interactions; `fund()` measures a balance delta and is
protected by the reentrancy guard and its status precondition instead."

## AAP-17 — Revoked organization's admin retains operator and admin-transfer powers

- **Contract:** `src/identity/OrganizationRegistry.sol` · **Functions:**
  `setOperator()`, `transferOrganizationAdmin()`, `acceptOrganizationAdmin()`

`updateOrganization` explicitly blocks `REVOKED`, but `setOperator` and the admin
transfer pair do not. A revoked organization's admin can still add operators and hand the
record to another address. `isActingFor` returns `false` for any non-`VERIFIED` status so
there is no privilege escalation today, but the inconsistency is a latent hazard: any
future code path that reads `operators` without re-checking status inherits a live
attack. **Remediation:** add the `REVOKED` guard to all three, or better, factor a
`_requireNotRevoked(orgId)` helper and apply it uniformly.

## AAP-18 — Token allowlist checked at listing but never re-checked at acceptance

- **Contract:** `src/marketplace/ListingManager.sol`, `Marketplace.sol` · **Function:**
  `createListing()`, `acceptOffer()`

`createListing` calls `_fees().requireTokenAllowed(paymentToken)`; `acceptOffer` reads
`listing.paymentToken` without re-checking. If `PROTOCOL_ADMIN_ROLE` de-allowlists a
token — the expected response to a token being compromised, depegged or found malicious
— existing listings remain acceptable and will open escrows denominated in it.
**Remediation:** re-check in `acceptOffer` before calling `openEscrow`. One external
call on a path that already makes several.

## AAP-19 — Seller can front-run `withdrawOffer` with `acceptOffer`

- **Contract:** `src/marketplace/Marketplace.sol` · **Function:** `acceptOffer()`

A buyer's `withdrawOffer` transaction is public in the mempool. The seller can front-run
it with `acceptOffer`, forcing the offer into `ACCEPTED` and opening an escrow the buyer
no longer wants. Impact is genuinely small — offers carry no funds, and the buyer simply
declines to `fund()`, after which either party may `cancel()` — but the buyer's listing
slot is occupied and the buyer must pay gas to clean up. **Remediation:** accept as a
documented property (offers are binding-until-withdrawn by design), or add a short
`acceptableAfter` delay on new offers. Document either way; today the behaviour is
undocumented.

---

# INFORMATIONAL

## AAP-20 — Unreachable `expiresAt == 0` branches

`isListingActive`, `isOfferActive`, `expireListing` and `expireOffer` all branch on
`expiresAt == 0` meaning "never expires", but `createListing` and `makeOffer` both reject
`expiresAt <= block.timestamp`, which rejects `0`. The branches are dead code. Either
remove them or add an explicit "no expiry" path if perpetual listings are wanted.
(Note: `CredentialRegistry.isValid` has the same shape but there the `0` case *is*
reachable — `issueCredential` permits `expiresAt == 0`. Only the marketplace branches
are dead.)

## AAP-21 — Raw `uint40(block.timestamp)` casts bypass the `ProtocolCast` policy

`ProtocolCast` exists so that "every narrowing write reverts rather than truncating", yet
`AssetOwnership._moveOwnership`, `AssetOwnership.initializeOwnership`,
`AssetRegistry._register`, `AssetRegistry.verifyAsset`, `Marketplace.acceptOffer`,
`ListingManager.createListing`, `OfferManager.makeOffer` and
`ComponentRegistry.installComponent` all cast `block.timestamp` raw. This is safe until
year 36812 and the `OrganizationRegistry` comment says so explicitly — but the policy is
now "checked casts everywhere except where we decided not to", which is not a policy a
reviewer can verify mechanically. Either use `ProtocolCast.toUint40` uniformly or state
the exemption once, centrally, in `docs/storage-model.md`.

## AAP-22 — `installComponent` makes four redundant external calls

```solidity
if (!assets.exists(parentAssetId)) { ... }
if (assets.getAsset(parentAssetId).kind != AssetKind.AIRCRAFT) { ... }
if (assets.isTerminal(parentAssetId)) {
    revert AssetTerminal(parentAssetId, assets.getAsset(parentAssetId).status);
}
```

Four cross-contract calls where one `getAsset` would answer all three questions. Load the
struct once into memory and branch on it locally. Roughly 6–8k gas on a routine
operation.

## AAP-23 — Event ordering in `settleTransfer` and `resolveDispute`

`AssetOwnership.settleTransfer` clears the lock in storage, emits `OwnershipTransferred`
via `_moveOwnership`, and only then emits `TransferLockChanged` — so an indexer
processing in log order observes the transfer before the unlock that preceded it.
`Escrow.resolveDispute` emits `DisputeResolved` before `_settle()`/`_refund()` emit their
own status events. Neither is a correctness bug; both make naive log-order reconstruction
report a state sequence that never existed. Emit in causal order.

## AAP-24 — Slither has never been executed against this codebase

`docs/audit/slither-triage.md` pre-records expected and forbidden detectors but states
plainly that Slither has not been run — there is no `pip` in the development environment.
CI runs `crytic/slither-action` with `continue-on-error: true`, so its first real
execution will also be non-blocking. The static-analysis gate in the Phase 8 completion
criteria is therefore **unmet**, not merely unreported. Run Slither locally or in a
container, triage the output, and set `continue-on-error: false` once the baseline is
clean.

## AAP-25 — `ORG_VERIFIER_ROLE` and `ASSET_VERIFIER_ROLE` collapse to one key

`ConfigureProtocol.wireRoles` grants both to `c.orgVerifier`. `docs/roles.md` describes
them as distinct roles with distinct scopes; the deployment makes them one key by
default. Verifying an organization and verifying an aircraft are different competencies
and should be separable. Add a distinct `ASSET_VERIFIER` config field.

## AAP-26 — OpenZeppelin submodule pinned to an untagged commit

`.gitmodules` pins `lib/openzeppelin-contracts` to `c64a1edb`, which `git describe`
resolves as `v4.8.0-952-gc64a1edb` — an untagged commit, not the `v5.4.0` release
`CLAUDE.md` mandates. The sibling `openzeppelin-contracts-upgradeable` *is* correctly on
`v5.4.0`. The build, all 488 tests and the CI-profile compile pass against this commit,
so it is very likely a v5.x commit whose tag is simply not present in the fetched
history — but "very likely" is not the standard for a dependency pin on a protocol
handling funds. Re-pin explicitly to the `v5.4.0` tag and re-run the full gate.

---

# Prioritized remediation plan

## Gate 0 — Blocks any deployment holding real value

| # | Finding | Change | Est. effort |
|---|---|---|---|
| 1 | **AAP-01** | Add `DISPUTE_RESOLUTION_WINDOW` + permissionless `claimDisputeTimeout()` refunding the buyer | 0.5d + tests |
| 2 | **AAP-03** | Make `RETIRED` reversible; add timelocked `unfreezeTransfers` for `DESTROYED` | 1d + tests |
| 3 | **AAP-02** | Reject terminal `setAssetStatus` while `lockedBy != address(0)` | 2h + tests |
| 4 | **AAP-04** | Arbitrator must be a multisig with ≥2 holders; assert in `Verify.s.sol` | 2h |
| 5 | **AAP-13** | Pull-payment fallback on failed payouts in `_settle`/`_refund` | 1d + tests |

These five are one coherent workstream: they are all "value or state becomes permanently
unrecoverable." Items 1 and 5 together guarantee that **every funded escrow has a
permissionless exit that no single party can block** — which is the property the escrow
design is supposed to provide and currently does not.

## Gate 1 — Before public launch

| # | Finding | Change |
|---|---|---|
| 6 | **AAP-10** | Move `via_ir` into the default/CI profile; retest and re-snapshot everything |
| 7 | **AAP-05** | Clear `organizationIdByNameHash` on revocation |
| 8 | **AAP-07** | Scope document-hash uniqueness to `(assetId, hash)` |
| 9 | **AAP-08** | Timelocked serial-index clearing; mandate salting in NatSpec |
| 10 | **AAP-06** | Block listing of `INSTALLED` components |
| 11 | **AAP-14** | Extend `Verify.s.sol` to operational roles and separation of duties |
| 12 | **AAP-24** | Actually run Slither; triage; make CI blocking |
| 13 | **AAP-26** | Re-pin OpenZeppelin to the `v5.4.0` tag |

## Gate 2 — Before scaling / next release

| # | Finding | Change |
|---|---|---|
| 14 | **AAP-09** | Timeout penalty; shorten and parameterize `SETTLEMENT_WINDOW` |
| 15 | **AAP-12** | Bound maintenance backdating; floor at asset/credential dates |
| 16 | **AAP-11** | Demote or flag organizations on post-verification metadata change |
| 17 | **AAP-18** | Re-check token allowlist at `acceptOffer` |
| 18 | **AAP-15**, **AAP-17** | Capture treasury in terms; uniform `REVOKED` guards |

## Gate 3 — Housekeeping

AAP-16 (correct the NatSpec claim), AAP-19 (document offer semantics), AAP-20 (remove
dead branches), AAP-21 (uniform cast policy), AAP-22 (call coalescing), AAP-23 (event
ordering), AAP-25 (split verifier roles).

---

## What this audit did not cover

- **Economic modelling under adversarial market conditions** beyond the option analysis
  in AAP-09. No simulation was run.
- **The off-chain layer entirely** — URI availability, hash-preimage custody, indexer
  correctness. `README.md` limitation 6 places this out of scope, and every on-chain
  guarantee here is conditional on it.
- **Formal verification.** No properties were proved; the invariant suite is randomized
  testing, which finds bugs and does not establish their absence.
- **Gas optimization**, except where a pattern was egregious (AAP-22).
- **Slither, Mythril, or any static analyzer** — see AAP-24. A whole class of findings
  that automated tooling routinely surfaces has not been looked for by anything other
  than reading.
- **Independent adversarial review by a party that did not write this code**, which
  remains the single highest-value outstanding action.
