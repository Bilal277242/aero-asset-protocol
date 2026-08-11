# Architecture Review

**Scope:** contract architecture, module boundaries, dependency graph, asset /
organization / credential / maintenance / document lifecycles.
Findings referenced by ID are catalogued in [`findings.md`](findings.md).

---

## 1. Layering

The protocol declares five layers with dependencies pointing strictly downward:

```
L4  TRANSACTION   Marketplace · EscrowFactory · Escrow · FeeManager
L3  PROVENANCE    DocumentRegistry · MaintenanceRegistry · AssetPassport
L2  ASSET         L2c AircraftRegistry · ComponentRegistry
                  L2b AssetRegistry
                  L2a AssetOwnership
L1  IDENTITY      OrganizationRegistry · CredentialRegistry
L0  CORE          ProtocolAddressRegistry · RoleManager · ProtocolTimelock
```

**Verdict: the layering holds.** I traced every `_resolve(...)` call site and every
interface import in `src/`. No contract imports a type from a higher layer, and no
state-changing call travels upward or sideways. The two sideways reads that exist are
`view`-only and documented:

- `CredentialRegistry → OrganizationRegistry` (L1 → L1) for subject validation.
- `MaintenanceRegistry → DocumentRegistry` (L3 → L3) in `_requireSupportingDocument`.

The L2 sub-layering is the load-bearing decision. `AssetRegistry` must create an
ownership record inside `registerAsset`, which naively makes L2 cyclic. Splitting
`AssetOwnership` beneath it and having it import no asset types at all — it tracks
opaque `uint256` ids — resolves this cleanly. The `transferFrozen` bit mirrored downward
from `AssetRegistry` is the one piece of duplicated state, and it is written in the same
transaction as its source, so the two cannot drift.

**One architectural consequence was not followed through**, and it produces AAP-06:
because `AssetOwnership` deliberately knows nothing about assets, it also knows nothing
about *component installation*. Nothing in the ownership or marketplace path can
therefore see that an engine is bolted to an airframe, and an installed component is
freely sellable. The acyclic graph was preserved at the cost of a correctness gap the
graph itself makes hard to close from below. The fix must be pulled from L4/L2c
(marketplace checks installation before listing), not pushed from L2a.

## 2. Module boundaries

`ProtocolAddressRegistry` as a live-resolved address book is the right call and is
applied consistently — peers are re-read on every call rather than cached, so a rotated
module loses its privileges immediately rather than at the next manual revocation. The
single exception is `roleManager`, cached in `ProtocolModuleUpgradeable` storage, with a
stated rationale (roles are revoked *within* the manager, so replacing it is a migration
rather than a rotation). That reasoning is sound.

The `MarketplaceBase` / `ListingManager` / `OfferManager` split is a source-file
boundary, not a deployment boundary — all three share one ERC-7201 namespace and deploy
as one `Marketplace`. This is correct: they are two halves of one state machine, and
splitting them into separate contracts would require cross-contract authorization
between halves of the same machine for no isolation benefit, since neither custodies
value.

`FeeManager` holding **no** custody is the strongest boundary decision in the codebase.
It answers "how much" and "to whom" and never touches a token, so it has no drain
surface and no reentrancy surface at all. This should not be relaxed.

## 3. Dependency graph — external call inventory

Every cross-contract call in `src/` (excluding OZ libraries):

| From | To | Kind | Notes |
|---|---|---|---|
| `Escrow` | `AssetOwnership` | state | `setTransferLock`, `settleTransfer` |
| `Escrow` | `Marketplace` | state | `markSold`, `clearEscrow` |
| `Escrow` | `FeeManager` | view | `treasury()` — see AAP-15 |
| `Escrow` | `RoleManager` | state | `renounceRole` (self-disarm) |
| `Escrow` | ERC-20 | state | `safeTransferFrom`, `safeTransfer` — **only untrusted callee** |
| `EscrowFactory` | `Escrow` clone | state | `initialize` |
| `EscrowFactory` | `RoleManager` | state | `grantRole` |
| `Marketplace` | `EscrowFactory` | state | `openEscrow` |
| `Marketplace` | `AssetOwnership`, `AssetRegistry`, `FeeManager` | view | guards |
| `AssetRegistry` | `AssetOwnership` | state | `initializeOwnership`, `freezeTransfers` |
| `AssetRegistry` | `OrganizationRegistry` | view | `requireActingFor`, `isVerified` |
| `Aircraft`/`ComponentRegistry` | `AssetRegistry` | state | `registerAssetFor` |
| `Document`/`MaintenanceRegistry` | L1/L2 | view | authorization + validation |
| every module | `RoleManager`, `ProtocolAddressRegistry` | view | resolution + role checks |

**The only untrusted external callee in the entire protocol is the ERC-20 settlement
token.** Every other callee is a protocol contract resolved through the address registry
and controlled by the timelock. That is a genuinely small and well-defined trust
surface, and it is the architecture's best property.

The allowlist is what makes it hold, which raises the significance of AAP-18: a token
de-allowlisted in response to a compromise remains usable by existing listings.

## 4. Asset lifecycle

`NONE → REGISTERED → {IN_SERVICE, STORED, IN_MAINTENANCE} → {RETIRED, DESTROYED}`

Operational statuses are mutually reachable; both terminal statuses are absorbing.
Registration and verification are correctly independent axes — `registerAsset` can never
set `verifiedAt`, and `INV-ASSET-03` asserts it.

Two problems, both in `findings.md`:

- **AAP-03:** `RETIRED` is modelled as absorbing. Aircraft leave and re-enter storage
  routinely; this is a domain modelling error, and combined with the irreversible
  `transferFrozen` mirror it permanently destroys an asset's tradability.
- **AAP-02:** the transition is authorized on ownership alone, with no check that the
  asset is not currently locked by a live escrow.

The status transition table itself (`isValidTransition`) is expressed exactly once and
re-checked defensively at the write site. That pattern is used consistently across
`AssetRegistry`, `OrganizationRegistry`, `CredentialRegistry`, `ComponentRegistry` and
`MarketplaceBase`, and it is good practice — the legal set never appears in two places
where it could diverge.

## 5. Organization lifecycle

`NONE → PENDING → {VERIFIED ⇄ SUSPENDED} → REVOKED`

Permissionless registration landing in `PENDING`, with verification as the trust
boundary, is the correct shape: open registration creates no privilege because
`isActingFor` returns `false` for every non-`VERIFIED` status.

Suspension and revocation deliberately block only *future* actions and do not
retroactively invalidate assets registered or maintenance recorded. For an audit trail
this is right — retroactive voiding would make history unreadable.

Weaknesses: **AAP-05** (revocation does not free the name hash, so the documented
anti-squatting mitigation does not work), **AAP-11** (verified organizations can
silently rewrite the metadata that was verified), **AAP-17** (`REVOKED` guard applied
inconsistently across the admin functions).

The two-step admin transfer (`transferOrganizationAdmin` → `acceptOrganizationAdmin`,
with either party able to cancel) is correctly implemented and mirrors the ownership
transfer pattern. No issues.

## 6. Credential lifecycle

`NONE → ACTIVE ⇄ SUSPENDED → {REVOKED, EXPIRED}`

The design decision that carries weight is **validity is computed, never stored**:
`isValid` checks status *and* expiry, so a credential can sit at `ACTIVE` in storage
while already expired. This is correct — nobody is obliged to pay gas to record the
passage of time — and it is applied consistently, with the same pattern in
`MarketplaceBase.isListingActive` and `activeListingOf`.

The **at most one valid credential per `(orgId, type)`** invariant is what lets
`validCredentialOfType` answer in O(1), which in turn is why `MaintenanceRegistry` needs
no loop over credential history. The index is maintained on every status write and
re-validated for freshness on read, and `reinstateCredential` correctly re-checks the
slot before restoring — a subtle case that is easy to miss and was handled.

Address-only subjects (`subjectOrgId == 0`) are deliberately not indexed and can hold
multiple simultaneous credentials of a type. Documented, and no consumer relies on
uniqueness for them. Acceptable.

No findings against this contract. It is the cleanest module in the protocol.

## 7. Document integrity

Hash-plus-URI with no on-chain payload, append-only records, supersede-or-revoke but
never edit. The attribution rule is well constructed: with a non-zero `issuerOrgId` the
caller must act for that organization, with zero it must be the asset owner — so a
caller can never attribute a document to an organization it does not control, which
would otherwise be trivial provenance forgery.

`supersedeDocument` correctly requires the replacement to describe the same asset,
closing an evidence-laundering path between aircraft.

The defect is **AAP-07**: global, permanent hash uniqueness. It creates a cross-asset
denial of service and it cannot represent a document that legitimately applies to a
fleet — an Airworthiness Directive can be recorded against exactly one aircraft in the
entire protocol.

The confidentiality caveat is correctly documented (a hash is a commitment, not
encryption) and correctly repeated in the contract NatSpec.

## 8. Maintenance records

The three-condition authorization gate — acting for a `VERIFIED` org, org type is `MRO`,
org holds a valid `MAINTENANCE_AUTHORITY` credential — is enforced on-chain in
`_authorizeMro` and is the right design. The credential relied upon is emitted in the
event so an auditor can pin every record to a specific credential, which is a thoughtful
touch.

Records are immutable with no status field at all: no edit, no delete, no revocation.
For a maintenance log this is correct.

The defect is **AAP-12**: `performedAt` is bounded above by `block.timestamp` and
unbounded below. A credentialed MRO can fabricate an arbitrary multi-year service
history in one transaction, and because records are immutable the fabrication is
permanent and indistinguishable from genuine history. Falsified maintenance records are
the specific fraud this protocol is built to prevent, which makes this the most
domain-relevant finding in the audit.

## 9. Architecture-level recommendations

1. **Close the installation/ownership gap (AAP-06)** by adding a guard at L4, not by
   inverting the L2 dependency. The acyclic graph is worth keeping.
2. **Reconsider terminal-state absorption generally.** `RETIRED` (AAP-03) and the three
   permanent hash indexes (AAP-05, AAP-07, AAP-08) share one root cause: irreversibility
   was treated as a security property in places where it is really a liability. The
   pattern to apply is *irreversible by default, recoverable through the timelock* —
   which preserves the guarantee against unilateral action while keeping a public,
   delayed escape hatch for error.
3. **The escrow state machine needs a universal exit (AAP-01).** Every other state
   machine in the protocol has the property that no single party can trap another's
   position indefinitely. `Escrow` does not, and it is the only one holding funds.
