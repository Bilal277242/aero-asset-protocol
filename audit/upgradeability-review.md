# Upgradeability Review

**Scope:** proxy pattern, storage layout, initialization, upgrade authorization, the
mutable/immutable split, migration and build reproducibility.
Findings referenced by ID are catalogued in [`findings.md`](findings.md).

---

## 1. The hybrid split

| Upgradeable (UUPS + ERC-1967) | Immutable |
|---|---|
| `OrganizationRegistry` | `RoleManager` |
| `CredentialRegistry` | `ProtocolAddressRegistry` |
| `AssetRegistry` | `ProtocolTimelock` |
| `AssetOwnership` | `FeeManager` |
| `AircraftRegistry` | `Escrow` (+ implementation) |
| `ComponentRegistry` | `EscrowFactory` |
| `DocumentRegistry` | `AssetPassport` |
| `MaintenanceRegistry` | |
| `Marketplace` | |

**The split is drawn in the right place, and the reasoning is verifiable in the code
rather than only asserted.** Everything that holds or moves value is immutable;
everything that records data is upgradeable.

The load-bearing consequence: `Marketplace` is upgradeable, and this is only safe because
**it never custodies funds or assets**. It records intent; `Escrow` moves money and
`AssetOwnership` moves title. An upgrade to `Marketplace` therefore cannot reach anyone's
money. I verified this — `Marketplace` holds no token balance, has no transfer call, and
its only value-adjacent power is calling `openEscrow`.

`AssetOwnership` being upgradeable is the sharpest edge. An upgrade *can* rewrite the
ownership ledger, so a compromised timelock could reassign every aircraft. This is
correctly identified as the residual risk (`README.md` limitation 1: "timelock compromise
is a total compromise of the L1–L3 registries") and mitigated by the 48h delay plus
non-timelocked `PAUSER_ROLE` on separate keys. The mitigation is real but bounded: it
buys time for a human to notice and pause. Queue monitoring is therefore load-bearing,
not advisory.

`FeeManager` being immutable is what makes `MAX_FEE_BPS` a genuine guarantee rather than
a current setting — no upgrade path exists to raise it. Correct, and the reason to keep
`FeeManager` immutable even though it is the module most likely to want new fee types.

## 2. Storage layout

ERC-7201 namespaced storage in every upgradeable contract:

```solidity
/// @custom:storage-location erc7201:aeroasset.storage.AssetRegistry
struct AssetRegistryStorage { ... }

bytes32 private constant _ASSET_REGISTRY_STORAGE =
    0xb67cfe8a53e48286e73e7c1183d175a9e2ed4cb1c3dd63eced3ad89851e47600;

function _s() private pure returns (AssetRegistryStorage storage $) {
    assembly ("memory-safe") { $.slot := _ASSET_REGISTRY_STORAGE }
}
```

Namespaces are asserted against the derivation formula in `test/upgrade/Namespaces.t.sol`
— the right test, because a mistyped constant is invisible at runtime: the contract
silently reads a different slot rather than failing. This is the single most valuable
test in the upgrade suite.

Choosing namespaces over sequential-plus-`__gap` is correct. Gap arrays are a *convention*
that fails silently when someone inserts a variable or changes inheritance order; a
namespace cannot collide with another namespace, so the failure mode is removed rather
than tested for.

Verified: all ten namespaces distinct; `ListingManager`/`OfferManager` intentionally share
`Marketplace`'s (halves of one state machine, not a collision); OZ's `PausableUpgradeable`
and `ReentrancyGuardTransientUpgradeable` carry their own namespaces in v5.4.0.

**Storage packing** follows `asset-model.md`: `uint64` ids, `uint40` timestamps, `uint128`
prices, enums and bools packed into the remaining bytes. `extra_output = ["storageLayout"]`
is enabled so `forge inspect` can diff layouts across versions, and
`test/upgrade/UpgradeSafety.t.sol` exercises it.

No findings.

## 3. Initialization

- `_disableInitializers()` in `ProtocolModuleUpgradeable`'s constructor, so **every**
  implementation inherits the protection rather than depending on each author remembering
  it. `Escrow`'s constructor does the same for the clone implementation.
- Every `initialize` carries `initializer` and validates non-zero addresses.
- `__ProtocolModule_init` is `onlyInitializing`, correctly chaining `__Pausable_init`.
- `Marketplace.initialize` also chains `__ReentrancyGuardTransient_init`.
- Proxies are deployed with init calldata atomically in `DeploymentBase._proxy()`, so no
  window exists in which an uninitialized proxy can be front-run.

Threat T-10 (initialize an uninitialized UUPS implementation, then upgrade it to
arbitrary code) is genuinely closed. No findings.

## 4. Upgrade authorization

```solidity
function _authorizeUpgrade(address newImplementation)
    internal view override onlyRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE)
{
    if (newImplementation == address(0)) { revert ZeroAddress(); }
}
```

`PROTOCOL_ADMIN_ROLE` is held exclusively by `ProtocolTimelock`, asserted by
`Verify.s.sol`. Every upgrade is therefore delayed ≥48h and publicly queued.

OZ v5's `ERC1967Utils.setImplementation` already rejects an implementation with no code,
so the explicit zero check is belt-and-braces rather than the only guard. Fine.

**What is not checked, and cannot easily be on-chain:** that the new implementation's
storage layout is compatible, and that it still calls `_disableInitializers`. These are
off-chain review responsibilities. `test/upgrade/UpgradeSafety.t.sol` covers them for
known upgrades but cannot for future ones. The operational requirement — run
`forge inspect storageLayout` and diff before queueing any upgrade — should be written
into the runbook rather than left implicit.

## 5. Clone pattern

`Escrow` uses EIP-1167 minimal proxies via `Clones.cloneDeterministic`, one per trade.
Not upgradeable — clones point at a fixed implementation with no admin slot.

The per-trade isolation costs roughly 40k gas and buys blast-radius containment: a defect
in one escrow cannot reach funds held for an unrelated trade. For a protocol settling
multi-million-dollar assets that is straightforwardly worth it.

The address verification before granting the protocol's most dangerous role is good
practice:

```solidity
address predicted = Clones.predictDeterministicAddress(ESCROW_IMPLEMENTATION, salt, address(this));
address escrow = Clones.cloneDeterministic(ESCROW_IMPLEMENTATION, salt);
if (escrow != predicted) { revert CloneAddressMismatch(predicted, escrow); }
```

Salts are `keccak256(abi.encode(escrowId))` over a monotonic counter, so no salt is ever
reused and no clone address can collide. `Escrow`'s `ROLE_MANAGER` and `ADDRESS_REGISTRY`
are implementation immutables shared by every clone — they live in the implementation's
bytecode, not per-clone storage, which is correct and saves an SSTORE per trade.

No findings.

## 6. Module rotation

`ProtocolAddressRegistry` allows any module address to be replaced by the timelock, and
peers re-resolve on **every** call rather than caching. A rotated-out module loses its
privileges on the very next call rather than retaining them until someone remembers to
revoke — a genuinely good property that several protocols get wrong.

The one cached reference is `roleManager` in `ProtocolModuleUpgradeable` storage, with a
stated rationale: roles are revoked *within* the manager, so replacing it is a protocol
migration rather than a routine rotation. Sound, but it means **`RoleManager` cannot be
rotated without upgrading every module** to repoint the cached address. That is a real
migration constraint and it is worth stating explicitly in `storage-model.md`, since it
is not obvious from the code.

Note that rotation and upgrade interact: `EscrowFactory` resolves `MARKETPLACE` live, so
rotating the marketplace immediately transfers the ability to open escrows. Correct, but
it means an address-registry write is as powerful as an upgrade for some modules — both
are timelocked, so the security boundary holds.

## 7. Build reproducibility — the material gap

**AAP-10** is the only MEDIUM finding in this review, and it is a real one.

```toml
# via-IR build used for the pre-audit gas baseline and for mainnet artifacts.
[profile.optimized]
via_ir = true
optimizer_runs = 1_000_000
bytecode_hash = "none"
cbor_metadata = false
```

The default and `ci` profiles do not enable `via_ir`. So all 488 tests, all 18 invariants
and the entire fuzz corpus validate **legacy-pipeline** bytecode at `optimizer_runs = 200`,
while the comment designates the **IR** pipeline at `optimizer_runs = 1_000_000` for
mainnet artifacts.

Deploying `optimized` output means deploying code that has never been executed under
test. The IR pipeline is a different code generator with a different optimizer; the
differences are usually benign and historically sometimes not. This matters more here than
in most protocols because the upgradeable modules are the *cheap* part to fix — a codegen
difference in `Escrow`, which is immutable and holds funds, would require redeploying the
implementation and the factory and re-pointing the address registry.

Additionally, `bytecode_hash = "none"` and `cbor_metadata = false` strip the metadata that
block-explorer verification relies on, making the deployed artifact harder to verify
against source. For a protocol asking the public to trust it, that is the wrong direction.

**Recommendation:** enable `via_ir` in the default and CI profiles, run the full suite and
invariants against it, regenerate `.gas-snapshot`, and delete the separate `optimized`
profile. Test what you ship. If IR compile time is prohibitive locally, keep `lite` for
iteration but make CI the IR build so nothing merges without IR-pipeline coverage.

~~Related: **AAP-26** — `lib/openzeppelin-contracts` is pinned to an untagged commit.~~

**Withdrawn — this finding was wrong.** The submodule is pinned to exactly `v5.4.0`;
`git rev-parse v5.4.0^{commit}` and `HEAD` are the same commit. `v5.4.0` is a
*lightweight* tag, and `git describe` without `--tags` considers only annotated tags, so
it falls back to `v4.8.0-952-g…` — which is what `git submodule status` prints and what I
mistook for the pin. Verify with `git -C lib/openzeppelin-contracts describe --tags`.

## 8. Recommendations

| Priority | Change | Finding | Status |
|---|---|---|---|
| 1 | Move `via_ir` into default/CI; retest and re-snapshot everything | AAP-10 | ✅ done |
| 2 | ~~Re-pin OpenZeppelin~~ | ~~AAP-26~~ | ❌ withdrawn |
| 3 | Restore `bytecode_hash`/`cbor_metadata` defaults for explorer verification | AAP-10 | ✅ done — the `optimized` profile that stripped them was deleted |
| 4 | Write the storage-layout diff step into the upgrade runbook as a hard gate | — | ⬜ open |
| 5 | Document that `RoleManager` rotation requires upgrading every module | — | ⬜ open |

The upgradeability design itself is sound and needs no structural change. Every finding
in this review is about the **build and release process** around it, not the pattern.
