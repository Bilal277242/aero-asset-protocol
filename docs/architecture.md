# AeroAsset Protocol — System Architecture

> Status: **approved for implementation** (Phase 0 deliverable)
> Solidity `0.8.28` · Foundry · OpenZeppelin `v5.4.0` · EVM target `cancun`

---

## 1. Purpose and scope

AeroAsset is blockchain infrastructure for aviation assets, not an NFT marketplace.
It provides trusted digital records for aircraft, engines, components, documents,
maintenance events, credentials, ownership, marketplace transactions and escrow.

**Core principle:** the chain stores *proofs, identities, ownership, permissions and
critical state*. Large or confidential aviation documents remain off-chain (IPFS or
encrypted object storage); the chain records verifiable hashes and references.

### 1.1 What the protocol does NOT claim

These boundaries are load-bearing and are repeated in NatSpec on the relevant contracts:

- On-chain ownership state is **not** legal title under any aviation authority.
- A protocol "verified" flag is **not** an airworthiness certification, and a
  recorded maintenance event is **not** a regulatory approval or release to service.
- Organization and credential records reflect what an authorized protocol role
  asserted, not the position of any civil aviation authority.

The protocol models *who the protocol permits to act* and *what was attested, by whom,
and when*. Legal and regulatory effect is out of scope.

### 1.2 Explicitly out of scope for V1

Per roadmap §30: fractional ownership, tokenized securities, aircraft-backed lending,
DAO governance, cross-chain bridges, automated valuation, DeFi yield, fully
decentralized arbitration, and on-chain document storage.

---

## 2. Layering

Five layers. **Every state-changing dependency points downward — never sideways within
a layer, never upward.** This is the property that keeps the system auditable as it
grows, and it is enforced by test `test/integration/LayerBoundaries.t.sol`.

**One qualified exception: `view`-only reads between peers in the same layer are
permitted.** `CredentialRegistry` reads `OrganizationRegistry` to validate a
credential's subject at issuance. The alternative — treating organization ids as
opaque integers — would allow issuing a maintenance authority to an organization that
does not exist, which is a data-integrity hole the registry is specifically supposed to
close. A `view` read creates no reentrancy surface, no write ordering to reason about,
and no upgrade coupling. A module must never call a *state-changing* function on a
peer in its own layer.

```
┌─────────────────────────────────────────────────────────────┐
│ L4  TRANSACTION      Marketplace · EscrowFactory · Escrow    │
│                      FeeManager                              │
├─────────────────────────────────────────────────────────────┤
│ L3  PROVENANCE       DocumentRegistry · MaintenanceRegistry  │
│                      AssetPassport (view-only aggregator)    │
├─────────────────────────────────────────────────────────────┤
│ L2  ASSET            AssetRegistry · AssetOwnership          │
│                      AircraftRegistry · ComponentRegistry    │
├─────────────────────────────────────────────────────────────┤
│ L1  IDENTITY         OrganizationRegistry · CredentialRegistry│
├─────────────────────────────────────────────────────────────┤
│ L0  PROTOCOL CORE    ProtocolAddressRegistry · RoleManager    │
│                      ProtocolTimelock                         │
└─────────────────────────────────────────────────────────────┘
```

Concretely: `Marketplace` never reads maintenance records. `MaintenanceRegistry` never
knows escrow exists. `AssetRegistry` never imports a marketplace type.

---

## 3. Module inventory

| Contract | Layer | Upgradeable | Holds funds | Owns state |
|---|---|---|---|---|
| `ProtocolAddressRegistry` | L0 | No (immutable) | No | Yes |
| `RoleManager` | L0 | No (immutable) | No | Yes |
| `ProtocolTimelock` | L0 | No (immutable) | No | Yes |
| `OrganizationRegistry` | L1 | **UUPS** | No | Yes |
| `CredentialRegistry` | L1 | **UUPS** | No | Yes |
| `AssetRegistry` | L2 | **UUPS** | No | Yes |
| `AssetOwnership` | L2 | **UUPS** | No | Yes |
| `AircraftRegistry` | L2 | **UUPS** | No | Yes |
| `ComponentRegistry` | L2 | **UUPS** | No | Yes |
| `DocumentRegistry` | L3 | **UUPS** | No | Yes |
| `MaintenanceRegistry` | L3 | **UUPS** | No | Yes |
| `AssetPassport` | L3 | No (immutable) | No | **No — zero state** |
| `Marketplace` | L4 | **UUPS** | No | Yes |
| `FeeManager` | L4 | No (immutable) | Transiently | Yes |
| `EscrowFactory` | L4 | No (immutable) | No | Yes |
| `Escrow` (clone) | L4 | No (immutable) | **Yes** | Yes |

### 3.1 Deviations from the roadmap repository layout, and why

The roadmap (§3) lists `ListingManager.sol` and `OfferManager.sol` as separate
contracts. They are implemented as **abstract base contracts** that `Marketplace`
inherits, deployed as one contract. Rationale: splitting them into separately deployed
contracts would require cross-contract authorization between two halves of one state
machine — more surface area, more gas, no isolation benefit, since neither custodies
funds. Roadmap §38 is explicit: *"Do not optimize for the number of Solidity contracts.
Optimize for clear trust boundaries."* The file layout is preserved; the deployment
footprint is not.

`ProtocolGovernor.sol` is **deferred past V1**. Roadmap §30 excludes DAO governance
from V1, so `governance/` ships `ProtocolTimelock.sol` (an OZ `TimelockController`)
only. Admin actions are multisig-proposed and timelock-executed. A `Governor` can be
added later as a proposer on the same timelock without touching any other module.

`OrganizationIdentity.sol` is folded into `OrganizationRegistry` — it would otherwise
be a data struct with no independent trust boundary.

---

## 4. Foundational design decisions

These were decided before implementation and must not be changed without an
architecture review (see `CLAUDE.md`).

### D1 — Upgradeability: hybrid

**UUPS proxies** (`ERC1967Proxy` + `UUPSUpgradeable`) for all registries. Aviation data
models acquire new fields over time; a registry that cannot evolve forces a migration
of the protocol's canonical records.

**Immutable** for `Escrow`, `EscrowFactory`, `FeeManager`, `RoleManager`,
`ProtocolAddressRegistry`, `AssetPassport`. Immutability is itself a security property
for code that custodies funds or gates authorization: it removes the admin key from the
threat model for those contracts entirely.

`_authorizeUpgrade` is restricted to `PROTOCOL_ADMIN_ROLE`, which on any production
network is held **only** by `ProtocolTimelock`. Every upgrade is therefore delayed and
publicly observable before it executes.

Storage discipline: OZ v5 **namespaced storage** (ERC-7201) for every upgradeable
contract. This makes storage-layout collisions structurally impossible rather than
merely tested for, and removes the need for `__gap` arrays. See `storage-model.md`.

### D2 — Identifiers: sequential `uint256`, per registry, starting at 1

Auto-incrementing IDs, not content-addressed hashes. Cheaper, collision-free, and they
make invariants expressible (`id <= totalCount`). **`0` is the reserved sentinel for
"does not exist"** across the entire protocol.

`keccak256` hashing is reserved for the place where the hash *is* the point: document
integrity proofs, credential proofs, and serial-number confidentiality.

There is **one global asset ID space**, minted by `AssetRegistry`. `AircraftRegistry`
and `ComponentRegistry` do not mint their own IDs; they attach specialized data to an
`assetId` that `AssetRegistry` issued. This removes an entire class of
"same ID, different registry" ambiguity.

### D3 — Address resolution: `ProtocolAddressRegistry`, never hardcoded

Every module resolves its peers through the address registry by `bytes32` key. Without
this, redeploying any one module means redeploying everything downstream of it.

Resolution is **cached in immutable/transient form where safe and re-read where
correctness demands freshness** — see `security-model.md` §4. Address changes are
timelock-gated and emit events.

### D4 — Access control: one central `RoleManager`

A single OZ `AccessControlEnumerable` instance is the protocol's authorization source
of truth. Modules do **not** each inherit `AccessControl`; they query
`roleManager.hasRole(role, caller)` through a shared `AuthorizedBase` modifier set.

Rationale: with 16 contracts, per-contract role state means 16 places to audit, 16 places
to rotate a compromised key, and a real chance of drift between them. One instance means
one revocation path. `Ownable` is not used anywhere in the protocol.

### D5 — Ownership: custom registry, not ERC-721

`AssetOwnership` is the authoritative ownership record. Aircraft records are not
transferable by a bare wallet `transferFrom`: transfers are gated on protocol state
(asset status, active listing, escrow settlement) and are only executable by an
authorized module or the owner via a protocol path.

Cost: no free wallet/explorer display, no third-party NFT marketplace support. That
cost is the point — an aircraft record must not be sellable on a generic marketplace
outside the escrow layer. An optional read-only ERC-721 *view wrapper* is a documented
post-audit extension point; it is not in V1.

### D6 — `AssetPassport` owns zero state

It is a `view`-only aggregator over the other registries. Roadmap Phase 6 becomes a
god-contract if implemented as a data store. It has no `initialize`, no storage, no
write path, and cannot be a source of state divergence.

### D7 — Escrow: per-trade EIP-1167 clones

`EscrowFactory` deploys a minimal-proxy clone of an immutable `Escrow` implementation
per trade. Funds are isolated per trade: a defect cannot drain unrelated escrows.

Cost: ~40k gas per trade for the clone deployment versus a shared accounting contract.
Accepted deliberately — for aircraft-scale transaction values, blast-radius containment
outweighs the deployment cost.

### D8 — Settlement asset: any admin-approved ERC-20, USDC by default

The escrow layer settles in an allowlisted ERC-20. All transfers use
`SafeERC20`. Fee-on-transfer and rebasing tokens are **not supported** and are excluded
by allowlist policy; the escrow additionally asserts balance deltas so a
non-conforming token fails loudly rather than silently under-funding a seller.

---

## 5. Cross-module call graph

Solid arrow = state-changing call. Dashed = `view` read.

```
                     ┌──────────────────────┐
                     │   ProtocolTimelock   │  (admin of everything)
                     └──────────┬───────────┘
                                │
              ┌─────────────────┴──────────────────┐
              ▼                                    ▼
   ┌────────────────────┐            ┌──────────────────────────┐
   │    RoleManager     │◀╌╌╌╌╌╌╌╌╌╌╌│ ProtocolAddressRegistry  │
   └────────▲───────────┘   all      └────────────▲─────────────┘
            ╎ hasRole()   modules                 ╎ getAddress()
            ╎                                     ╎
   ┌────────┴─────────────────────────────────────┴─────────┐
   │                                                         │
   │  OrganizationRegistry ◀╌╌╌ CredentialRegistry           │  L1
   │           ▲  ▲                      ▲                   │
   │           ╎  ╎                      ╎                   │
   │  AssetRegistry ──────▶ AssetOwnership                   │  L2
   │       ▲   ▲                   ▲                         │
   │       │   └── AircraftRegistry│                         │
   │       └────── ComponentRegistry                         │
   │                                                         │
   │  DocumentRegistry     MaintenanceRegistry               │  L3
   │        ╎                      ╎                         │
   │        └──────▶ AssetPassport ◀──────┘ (view only)      │
   │                                                         │
   │  Marketplace ───▶ EscrowFactory ───▶ Escrow ──▶ FeeManager│ L4
   │       │                                  │              │
   │       └──────────▶ AssetOwnership ◀──────┘              │
   └─────────────────────────────────────────────────────────┘
```

### 5.1 The one upward-looking edge, and its guard

`AssetOwnership.transferFrom` must be callable by `Escrow` (L4) even though
`AssetOwnership` sits at L2. This is **not** a layer violation of the import graph —
`AssetOwnership` does not import any L4 type. It authorizes by *role*, not by type:
the caller must hold `SETTLEMENT_ROLE`, which `EscrowFactory` grants only to escrow
clones it deployed, and revokes on settlement.

This is the protocol's most sensitive authorization edge and is covered by dedicated
tests in `test/integration/SettlementAuthorization.t.sol`.

---

## 6. Canonical end-to-end lifecycle

The flow that Phase 9 must execute against Sepolia in one script:

```
1. PROTOCOL_ADMIN registers an organization        → OrganizationRegistry
2. ORG_VERIFIER verifies it                        → status PENDING → VERIFIED
3. CREDENTIAL_ISSUER issues an MRO credential      → CredentialRegistry (ACTIVE)
4. Verified org registers an aircraft              → AssetRegistry mints assetId
                                                   → AircraftRegistry attaches data
5. Owner registers an engine, installs it          → ComponentRegistry (INSTALLED)
6. Credentialed MRO records a maintenance event    → MaintenanceRegistry
7. Owner registers an airworthiness document hash  → DocumentRegistry
8. Anyone reads the aggregate passport             → AssetPassport (view)
9. Owner lists the aircraft for 1,000,000 USDC     → Marketplace (ACTIVE)
10. Buyer accepts; escrow clone is deployed        → EscrowFactory → Escrow
11. Buyer funds the escrow                         → Escrow (FUNDED)
12. Both confirm / arbitrator resolves             → Escrow (RELEASED)
13. Escrow settles: asset moves, fee is taken,     → AssetOwnership + FeeManager
    seller is paid                                 → listing SOLD, escrow CLOSED
```

Every transition in this flow is enforced on-chain. **No step depends on frontend
behaviour for its security.**

---

## 7. Integration points

| Boundary | Direction | Contract | Notes |
|---|---|---|---|
| Settlement token | inbound | `Escrow`, `FeeManager` | Allowlisted ERC-20 via `SafeERC20`. No fee-on-transfer. |
| Off-chain storage | outbound | `DocumentRegistry` | `bytes32` content hash + `string` URI. Chain never stores payloads. |
| Indexers / frontend | outbound | all | Events are the API. Every state change emits. |
| External ACN | future | `CredentialRegistry` | Built standalone behind `ICredentialRegistry`; an ACN adapter can replace it by swapping one `ProtocolAddressRegistry` entry. |
| Admin operations | inbound | `ProtocolTimelock` | Multisig proposes, timelock delays, then executes. |

---

## 8. Deployment topology

Staged per roadmap §20 — no single monolithic deploy script:

```
DeployCore.s.sol        → ProtocolTimelock, RoleManager, ProtocolAddressRegistry
DeployIdentity.s.sol    → OrganizationRegistry, CredentialRegistry      (impl + proxy)
DeployAssets.s.sol      → AssetRegistry, AssetOwnership,
                          AircraftRegistry, ComponentRegistry           (impl + proxy)
DeployProvenance.s.sol  → DocumentRegistry, MaintenanceRegistry, AssetPassport
DeployMarketplace.s.sol → Marketplace                                   (impl + proxy)
DeployEscrow.s.sol      → FeeManager, Escrow impl, EscrowFactory
ConfigureProtocol.s.sol → address-registry wiring, role grants, fee params
Verify.s.sol            → post-deploy assertion of every wiring invariant
```

`Verify.s.sol` is not optional. A misconfigured `ProtocolAddressRegistry` entry is
indistinguishable from a working deployment until the first settlement fails, so
deployment ends with an on-chain assertion pass.

---

## 9. Related specifications

| Document | Contents |
|---|---|
| `requirements.md` | Functional and non-functional requirements, V1 scope gate |
| `roles.md` | Role definitions, grant/revoke paths, key custody |
| `permissions.md` | Function-level permission matrix |
| `asset-model.md` | Struct definitions, enums, field-level semantics |
| `state-machines.md` | Every lifecycle and its legal transitions |
| `events.md` | Event catalogue and indexing strategy |
| `errors.md` | Custom error catalogue |
| `storage-model.md` | ERC-7201 namespaces, packing, upgrade safety |
| `security-model.md` | Trust assumptions and security controls |
| `threat-model.md` | Attacker model, threats, mitigations |
| `invariants.md` | Protocol invariants and their Foundry encodings |
