# AeroAsset Protocol — Storage Model & Upgrade Safety

## 1. ERC-7201 namespaced storage

Every upgradeable contract stores all state in a single struct at a computed namespace
slot. No contract declares a state variable at sequential slot 0, 1, 2…

```solidity
/// @custom:storage-location erc7201:aeroasset.storage.AssetRegistry
struct AssetRegistryStorage {
    uint256 assetCount;
    mapping(uint256 => Asset) assets;
    mapping(uint256 => string) metadataURI;
    mapping(bytes32 => uint256) assetIdBySerialHash;
}

// keccak256(abi.encode(uint256(keccak256("aeroasset.storage.AssetRegistry")) - 1))
//   & ~bytes32(uint256(0xff))
bytes32 private constant _ASSET_REGISTRY_STORAGE =
    0x...;

function _s() private pure returns (AssetRegistryStorage storage $) {
    assembly { $.slot := _ASSET_REGISTRY_STORAGE }
}
```

**Why this and not `__gap` arrays.** Sequential layout plus reserved gaps is a
*convention* — it fails silently when someone inserts a variable above the gap or
changes an inheritance order. Namespaced storage makes the collision structurally
impossible: two different namespaces cannot overlap, and inheritance order stops
mattering. It is also what OZ v5 itself uses, so our layout composes correctly with
`OwnableUpgradeable`, `PausableUpgradeable` and friends rather than sitting beneath them.

Namespace constants are computed once and committed. `test/upgrade/Namespaces.t.sol`
recomputes each from its string and asserts equality, so a typo cannot ship.

### Namespace registry

| Contract | Namespace string |
|---|---|
| `OrganizationRegistry` | `aeroasset.storage.OrganizationRegistry` |
| `CredentialRegistry` | `aeroasset.storage.CredentialRegistry` |
| `AssetRegistry` | `aeroasset.storage.AssetRegistry` |
| `AssetOwnership` | `aeroasset.storage.AssetOwnership` |
| `AircraftRegistry` | `aeroasset.storage.AircraftRegistry` |
| `ComponentRegistry` | `aeroasset.storage.ComponentRegistry` |
| `DocumentRegistry` | `aeroasset.storage.DocumentRegistry` |
| `MaintenanceRegistry` | `aeroasset.storage.MaintenanceRegistry` |
| `Marketplace` | `aeroasset.storage.Marketplace` |

Immutable contracts (`RoleManager`, `ProtocolAddressRegistry`, `FeeManager`,
`EscrowFactory`, `Escrow`, `AssetPassport`) use ordinary sequential storage — there is
no upgrade to be compatible with.

## 2. Packing summary

| Struct | Slots | Bytes used / 32 in slot 0 |
|---|---|---|
| `Organization` | 3 | 32 (full) |
| `Credential` | 3 | 32 (full) |
| `Asset` | 3 | 28 |
| `Aircraft` | 4 | 12 |
| `Component` | 2 | 22 |
| `Document` | 2 | 31 |
| `MaintenanceRecord` | 2 | 30 |
| `Listing` | 3 | 31 |
| `Offer` | 2 | 31 |
| `OwnershipRecord` | 3 | 26 |

Packing rules applied throughout (`asset-model.md` §0): ids are `uint64`, timestamps
`uint40`, enums `uint8`, short human strings `bytes32`, long strings in side mappings.

### Narrowing-cast policy

Packing only works if narrowing a value into it cannot silently truncate — a truncated
id would alias an unrelated record. The rule, stated once here because it was previously
inferable only by reading every call site (audit AAP-21):

> **Every narrowing cast of a caller-supplied value goes through `ProtocolCast`**, which
> reverts with `ValueTooLarge` rather than truncating. **`block.timestamp` is exempt**
> and is cast directly.

The exemption is not a shortcut. `ProtocolCast` exists to reject hostile or mistaken
*input*; `block.timestamp` is neither caller-supplied nor capable of exceeding `uint40`
before the year 36812, so a checked cast there is a branch on a condition that cannot
occur, on paths that write it on every registration, transfer and settlement.

Caller-supplied *deadlines* are a different matter and are **not** exempt — they arrive
as `uint40` at the ABI boundary and are range-checked against `block.timestamp` by the
function that accepts them.

Two consequences worth stating: this rule is what makes a grep for `uint40(` reviewable
(every hit should be `block.timestamp`), and widening a timestamp field later would
require revisiting it.

**Measured effect** (recorded in `.gas-snapshot` from Phase 3 onward): registering an
aircraft writes 6 slots rather than the 11 an unpacked layout would require — roughly
110k gas saved on a cold registration.

**Reading rule.** A packed struct read as `storage` and touched field-by-field costs one
`SLOAD` per *slot*, but the compiler will not always coalesce them. Hot paths load the
struct into `memory` once (`Asset memory a = $.assets[id]`) when three or more fields
are read; single-field reads use direct storage access to avoid copying unused slots.
Phase 8 measures rather than assumes this.

## 3. Upgrade rules

1. **Append only.** New fields go at the end of a namespace struct. Never reorder,
   never remove, never change a field's type.
2. **Widening is not free.** `uint40 → uint64` on a packed field shifts every field
   after it in that slot. Treated as a breaking change.
3. **New state uses a new namespace** when it belongs to a new concern, rather than
   growing an existing struct past its natural boundary.
4. **`reinitializer(n)`** with strictly increasing `n` for any upgrade needing new
   initialization; `_disableInitializers()` in every implementation constructor.
5. **Baseline diffing.** `forge inspect <C> storageLayout` output is committed under
   `docs/storage/` and diffed in CI. An unexplained diff fails the build.

## 4. Transient storage

`ReentrancyGuardTransient` (EIP-1153) is used on all fund-moving functions. Transient
slots are not persistent storage and are exempt from the layout rules above, but the
`cancun` EVM target is mandatory — `test/unit/Foundation.t.sol` asserts `TSTORE`/`TLOAD`
availability so a downgraded profile fails immediately rather than at deploy time.

## 5. Constants and immutables

Values that must never change post-deployment are `constant` or `immutable`, never
storage — this removes them from the upgrade attack surface entirely:

- `FeeManager.MAX_FEE_BPS` — `constant`. No upgrade-free path can exceed it
  (`INV-FEE-01`); `FeeManager` is not upgradeable at all.
- Role identifiers — `constant`.
- Address-registry keys — `constant`.
- `Escrow` implementation address in `EscrowFactory` — `immutable`.
- `RoleManager` address in immutable contracts — `immutable`.

Escrow clones cannot use `immutable` (no constructor runs on a minimal proxy), so their
trade parameters are written once in `initialize` and never mutated. `INV-ESC-06`
asserts this holds across the whole trade lifecycle.
