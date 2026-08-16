# AeroAsset Protocol — Contract-to-Frontend Capability Map

Ground truth for frontend integration. Every function, event and error listed here was
extracted from the **compiled ABI** in `out/<Contract>.sol/<Contract>.json` and
cross-checked against the Solidity source. Nothing is included because a specification
document mentioned it.

Where a capability does not exist in the deployed bytecode it is marked
**`NOT AVAILABLE IN CURRENT CONTRACTS`**, regardless of what `/docs` says.

- **Chain:** Sepolia, `11155111`
- **Surveyed at block:** 11,493,660
- **Contracts:** 16 deployed
- **Custom errors in `src/`:** 116
- **Events:** 55 distinct names, 56 declarations (`EscrowOpened` is declared twice)

> This document describes the **contract surface**, not the UI. Route names reference the
> plan in the console blueprint and are the intended home for each capability, not an
> assertion that the page exists.

---

## 1. Address and ABI index

| Contract | Sepolia address | ABI artifact |
|---|---|---|
| ProtocolTimelock | `0x9Ed700bD47c8782b6C428F0eDd50c2F7Ea57728F` | `out/ProtocolTimelock.sol/ProtocolTimelock.json` |
| RoleManager | `0x8C39Daef421BF14BB4Bb56712eDd8bc52CEF7126` | `out/RoleManager.sol/RoleManager.json` |
| ProtocolAddressRegistry | `0xc9cf5998604A65e2C115476b7D165CB7A68e6224` | `out/ProtocolAddressRegistry.sol/ProtocolAddressRegistry.json` |
| OrganizationRegistry | `0x64fBD54f4Cb8bA641a05a32C789924Be31722EBB` | `out/OrganizationRegistry.sol/OrganizationRegistry.json` |
| CredentialRegistry | `0xEdB1aE99c7F1a32b3A6a0F39c7F421386eC6d1e9` | `out/CredentialRegistry.sol/CredentialRegistry.json` |
| AssetOwnership | `0xeA2b26E8B8d1ed33Fd2339478cd50465478Ad812` | `out/AssetOwnership.sol/AssetOwnership.json` |
| AssetRegistry | `0x88E3A5094DFA93926f3B6D5ED57173D3473EA660` | `out/AssetRegistry.sol/AssetRegistry.json` |
| AircraftRegistry | `0xA68ff461Fe0F79ee9C9587EB5a20b896Cdd44f1C` | `out/AircraftRegistry.sol/AircraftRegistry.json` |
| ComponentRegistry | `0xe1d04AD09C240Adf4B494F89869fA4B06Add4B31` | `out/ComponentRegistry.sol/ComponentRegistry.json` |
| DocumentRegistry | `0x6167260075f2300f01ce8152df65E724d985fE9f` | `out/DocumentRegistry.sol/DocumentRegistry.json` |
| MaintenanceRegistry | `0xe25c0A7F34cC30cB0bf37bBe990f332114F29B9B` | `out/MaintenanceRegistry.sol/MaintenanceRegistry.json` |
| AssetPassport | `0x057FA5385B4CbD4c6d0a5B5d109B171F883763e4` | `out/AssetPassport.sol/AssetPassport.json` |
| Marketplace | `0xA38072A464D8EDC2a7C74B84eC463e3E1eA36B86` | `out/Marketplace.sol/Marketplace.json` |
| FeeManager | `0xb69A4c294D994B94B097307F38adf9c1634CC083` | `out/FeeManager.sol/FeeManager.json` |
| EscrowFactory | `0x3F0A2CC772d0e714970425beC8b31dd415E0c390` | `out/EscrowFactory.sol/EscrowFactory.json` |
| Escrow (implementation) | `0xfC317babD11079c5Edb75311C6a6146699C88006` | `out/Escrow.sol/Escrow.json` |

**Nine of these are ERC-1967 proxies.** `deployments/11155111.json` additionally records
`*Impl` addresses. Those are for Etherscan verification only — calling an implementation
directly reads empty storage and returns plausible zeroes.

`out/` is git-ignored. ABIs must be generated into the frontend from a `forge build` and
the generated output committed, or no hosted build can compile. The artifact `.ast` node
is the **only** machine-readable source of enum member names; the ABI alone gives `uint8`.

### Common proxy surface

Every UUPS module (`OrganizationRegistry`, `CredentialRegistry`, `AssetOwnership`,
`AssetRegistry`, `AircraftRegistry`, `ComponentRegistry`, `DocumentRegistry`,
`MaintenanceRegistry`, `Marketplace`) shares this surface. It is documented once and not
repeated per contract.

| Kind | Members |
|---|---|
| Reads | `roleManager()` · `addressRegistry()` · `hasRole(bytes32,address)` · `paused()` · `proxiableUUID()` · `UPGRADE_INTERFACE_VERSION()` |
| Writes | `initialize(address,address)` *(once, at deploy)* · `pause()` · `unpause()` · `upgradeToAndCall(address,bytes)` |
| Events | `Initialized(uint64)` · `Paused(address)` · `Unpaused(address)` · `Upgraded(address indexed)` |
| Errors | `EnforcedPause` · `ExpectedPause` · `InvalidInitialization` · `NotInitializing` · `MissingRole(bytes32,address)` · `ERC1967InvalidImplementation` · `ERC1967NonPayable` · `UUPSUnauthorizedCallContext` · `UUPSUnsupportedProxiableUUID` · `AddressEmptyCode` · `FailedCall` · `ZeroAddress` |
| Roles | `pause()` → `PAUSER_ROLE` · `unpause()` → `PROTOCOL_ADMIN_ROLE` · `upgradeToAndCall` → `PROTOCOL_ADMIN_ROLE` |

`FeeManager`, `EscrowFactory`, `Escrow`, `AssetPassport`, `RoleManager` and
`ProtocolAddressRegistry` are **immutable and have no pause**. `Escrow` having no pause is
load-bearing: `claimTimeout()` works while the rest of the protocol is halted.

---

## 2. L0 — Core

### 2.1 ProtocolAddressRegistry

`0xc9cf5998604A65e2C115476b7D165CB7A68e6224` · immutable · the frontend's single root of trust.

| | |
|---|---|
| **Reads** | `getAddress(bytes32 key) → address` *(reverts `AddressNotRegistered`)* · `tryGetAddress(bytes32) → address` *(returns zero, never reverts — use this)* · `isRegistered(bytes32) → bool` · `addresses(bytes32) → address` · `ROLE_MANAGER() → address` |
| **Writes** | `setAddress(bytes32 key, address newAddress)` |
| **Events** | `ProtocolAddressSet(bytes32 key ⓘ, address oldAddress ⓘ, address newAddress ⓘ)` |
| **Errors** | `AddressNotRegistered(bytes32)` · `MissingRole(bytes32,address)` · `ZeroAddress()` |
| **Roles** | `setAddress` → `PROTOCOL_ADMIN_ROLE` (held by Timelock ⇒ 48 h delay) |
| **Dependencies** | `RoleManager` (immutable reference) |

**14 keys**, each `keccak256("aeroasset.address.<NAME>")`: `ROLE_MANAGER`,
`PROTOCOL_TIMELOCK`, `ORGANIZATION_REGISTRY`, `CREDENTIAL_REGISTRY`, `ASSET_REGISTRY`,
`ASSET_OWNERSHIP`, `AIRCRAFT_REGISTRY`, `COMPONENT_REGISTRY`, `DOCUMENT_REGISTRY`,
`MAINTENANCE_REGISTRY`, `ASSET_PASSPORT`, `MARKETPLACE`, `ESCROW_FACTORY`, `FEE_MANAGER`.

**Frontend:** resolve all 14 at boot via `tryGetAddress` multicall; a mismatch against the
committed snapshot raises a drift banner and the registry wins. → `/protocol`

### 2.2 RoleManager

`0x8C39Daef421BF14BB4Bb56712eDd8bc52CEF7126` · immutable · OZ `AccessControlEnumerable`.

| | |
|---|---|
| **Reads** | `hasRole(bytes32,address) → bool` · `getRoleMembers(bytes32) → address[]` · `getRoleMemberCount(bytes32) → uint256` · `getRoleMember(bytes32,uint256) → address` · `getRoleAdmin(bytes32) → bytes32` · `checkRole(bytes32,address)` *(reverts)* · `DEFAULT_ADMIN_ROLE()` |
| **Writes** | `grantRole(bytes32,address)` · `revokeRole(bytes32,address)` · `renounceRole(bytes32,address)` · `setRoleAdmin(bytes32,bytes32)` |
| **Events** | `RoleGranted(bytes32 ⓘ, address ⓘ, address ⓘ)` · `RoleRevoked(…)` · `RoleAdminChanged(…)` |
| **Errors** | `MissingRole` · `CannotReadministerDefaultAdmin()` · `LastProtocolAdmin()` · `AccessControlUnauthorizedAccount` · `AccessControlBadConfirmation` · `ZeroAddress` |
| **Roles** | grant/revoke → role's admin (`DEFAULT_ADMIN_ROLE` for most) · `setRoleAdmin` → `DEFAULT_ADMIN_ROLE` |

`getRoleMembers` returns the whole array in one call — the authorization map needs no loop.

**11 roles**, each `keccak256("aeroasset.role.<NAME>")`. Live holders:

| Role | Holders (Sepolia) | Human-holdable |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` (`0x00…`) | Timelock | no |
| `PROTOCOL_ADMIN` | Timelock | no |
| `FEE_MANAGER` | Timelock | no |
| `PAUSER` | `0x7f3f…7581` | yes |
| `ORG_VERIFIER` | `0x4eaD…FF70` | yes |
| `ASSET_VERIFIER` | `0x4eaD…FF70` | yes |
| `CREDENTIAL_ISSUER` | `0x4aB6…c085` | yes |
| `ARBITRATOR` | `0xE077…7Bfd` | yes |
| `ASSET_MINTER` | AircraftRegistry, ComponentRegistry | **machine only** |
| `ESCROW_FACTORY` | EscrowFactory | **machine only** |
| `SETTLEMENT` | *(0 — granted per live escrow)* | **machine only** |

**Frontend:** eleven `hasRole` calls at connect resolve the entire permission model. → `/protocol`, nav gating

### 2.3 ProtocolTimelock

`0x9Ed700bD47c8782b6C428F0eDd50c2F7Ea57728F` · OZ `TimelockController` · **min delay 172,800 s (48 h)**.

| | |
|---|---|
| **Reads** | `getMinDelay()` · `getOperationState(bytes32) → uint8` · `getTimestamp(bytes32)` · `isOperation/isOperationPending/isOperationReady/isOperationDone(bytes32)` · `hashOperation(address,uint256,bytes,bytes32,bytes32)` · `hashOperationBatch(…)` · `PROPOSER_ROLE/EXECUTOR_ROLE/CANCELLER_ROLE()` |
| **Writes** | `schedule(target,value,data,predecessor,salt,delay)` · `scheduleBatch(…)` · `execute(…)` · `executeBatch(…)` · `cancel(bytes32 id)` · `updateDelay(uint256)` |
| **Events** | `CallScheduled(bytes32 ⓘ, uint256 ⓘ, …)` · `CallExecuted(…)` · `CallSalt` · `Cancelled(bytes32 ⓘ)` · `MinDelayChange` |
| **Errors** | `TimelockUnauthorizedCaller` · `TimelockInsufficientDelay` · `TimelockUnexpectedOperationState` · `TimelockUnexecutedPredecessor` · `TimelockInvalidOperationLength` |
| **Roles** | `PROPOSER_ROLE` schedules · `EXECUTOR_ROLE` executes · `CANCELLER_ROLE` cancels |

**Every** admin action in the protocol routes through here. `getOperationState` returns
`Unset(0) / Waiting(1) / Ready(2) / Done(3)` — that enum is the governance queue UI.

**Frontend:** → `/ops/governance`. Rendered as proposals with a countdown, never as buttons.

---

## 3. L1 — Identity

### 3.1 OrganizationRegistry

`0x64fBD54f4Cb8bA641a05a32C789924Be31722EBB` · UUPS proxy.

**Struct** `Organization` — `getOrganization(uint256) → (address admin, uint40 registeredAt, uint40 verifiedAt, uint8 orgType, uint8 status, bytes32 nameHash, bytes32 metadataHash)`

| Read | Returns |
|---|---|
| `getOrganization(orgId)` | full record *(reverts `OrganizationNotFound`)* |
| `isVerified(orgId)` | `bool` — **status == VERIFIED**, not `verifiedAt != 0` |
| `isActingFor(orgId,account)` | `bool` — admin **or** operator, and org verified |
| `isOperator(orgId,account)` | `bool` |
| `pendingAdmin(orgId)` | `address` |
| `organizationCount()` | highest id |
| `organizationIdByNameHash(bytes32)` | `uint256` |
| `metadataURI(orgId)` | `string` |
| `isValidTransition(uint8,uint8)` | `bool` |
| `requireActingFor(orgId,account)` | reverts `NotActingForOrganization` |

| Write | Parameters | Authorized |
|---|---|---|
| `registerOrganization` | `uint8 orgType, bytes32 nameHash, bytes32 metadataHash, string uri` → `uint256 orgId` | **permissionless** |
| `updateOrganization` | `orgId, bytes32 metadataHash, string uri` | org admin |
| `transferOrganizationAdmin` | `orgId, address newAdmin` | org admin |
| `acceptOrganizationAdmin` | `orgId` | pending admin |
| `cancelOrganizationAdminTransfer` | `orgId` | admin **or** pending admin |
| `setOperator` | `orgId, address operator, bool allowed` | org admin |
| `verifyOrganization` | `orgId` | `ORG_VERIFIER_ROLE` |
| `rejectOrganization` | `orgId` | `ORG_VERIFIER_ROLE` |
| `suspendOrganization` | `orgId` | `ORG_VERIFIER_ROLE` |
| `reactivateOrganization` | `orgId` | `ORG_VERIFIER_ROLE` |
| `revokeOrganization` | `orgId` | `PROTOCOL_ADMIN_ROLE` (48 h) |

**Events:** `OrganizationRegistered(orgId ⓘ, admin ⓘ, orgType, nameHash)` ·
`OrganizationStatusChanged(orgId ⓘ, oldStatus ⓘ, newStatus ⓘ, by)` ·
`OrganizationUpdated(orgId ⓘ, metadataHash, metadataURI)` ·
`OrganizationRequiresReverification(orgId ⓘ, previousHash, newHash)` ·
`OrganizationAdminTransferStarted/Cancelled/Transferred` ·
`OrganizationOperatorSet(orgId ⓘ, operator ⓘ, allowed)` ·
`OrganizationNameReleased(orgId ⓘ, nameHash ⓘ)`

**Errors (23):** notably `OrganizationNameTaken(bytes32,uint256)`,
`NotOrganizationAdmin`, `NotPendingAdmin`, `NoPendingAdminTransfer`,
`AdminTransferToCurrentAdmin`, `InvalidOrganizationTransition`,
`OrganizationNotVerified`, `InvalidOrganizationType`, `ZeroHash`.

**State transitions** — `PENDING → VERIFIED | REVOKED` · `VERIFIED ⇄ SUSPENDED` ·
`VERIFIED | SUSPENDED → REVOKED` (terminal).

> **Self-demotion trap.** A `VERIFIED` org that changes its `metadataHash` via
> `updateOrganization` is demoted to `SUSPENDED` in the same transaction and
> `OrganizationRequiresReverification` fires. Changing only `uri` does not demote. **The
> UI must warn before submitting a metadata-hash change**, because the caller loses
> verification as a side effect of an edit that looks routine.

**Frontend:** → `/registry`, `/org/[orgId]`, `/ops/organizations`

### 3.2 CredentialRegistry

`0xEdB1aE99c7F1a32b3A6a0F39c7F421386eC6d1e9` · UUPS proxy.

**Struct** `Credential` — `(uint64 issuerOrgId, uint64 subjectOrgId, uint40 issuedAt, uint40 expiresAt, uint8 credType, uint8 status, uint32 reserved, address subject, bytes32 credentialHash)`

| Read | Returns |
|---|---|
| `getCredential(credentialId)` | full record |
| `isValid(credentialId)` | `bool` — **effective**: status **and** expiry |
| `hasValidCredentialOfType(subjectOrgId, uint8 credType)` | `bool` |
| `validCredentialOfType(subjectOrgId, credType)` | `uint256 credentialId` (0 if none) |
| `credentialCount()` | highest id |
| `requireValid(credentialId)` | reverts `CredentialNotValid` |

| Write | Parameters | Authorized |
|---|---|---|
| `issueCredential` | `uint256 issuerOrgId, address subject, uint256 subjectOrgId, uint8 credType, uint40 expiresAt, bytes32 credentialHash` → `uint256` | `CREDENTIAL_ISSUER_ROLE` |
| `suspendCredential` / `reinstateCredential` / `revokeCredential` | `credentialId` | `CREDENTIAL_ISSUER_ROLE` |
| `expireCredential` | `credentialId` | **permissionless**, only when `expiresAt <= now` |

**Events:** `CredentialIssued(credentialId ⓘ, issuerOrgId ⓘ, subject ⓘ, subjectOrgId, credType, expiresAt, credentialHash)` · `CredentialStatusChanged(credentialId ⓘ, oldStatus ⓘ, newStatus ⓘ, by)`

**Errors (25):** `DuplicateValidCredential(subjectOrgId, credType, existingId)`,
`CredentialExpired`, `CredentialNotExpired`, `CredentialNotValid`, `CredentialNotFound`,
`InvalidCredentialTransition`, `InvalidCredentialType`, `InvalidCredentialSubject`,
`SubjectOrganizationNotVerified`, `IssuerOrganizationNotFound`, `DeadlineInPast`.

**State transitions** — `ACTIVE ⇄ SUSPENDED` · both `→ REVOKED` · both `→ EXPIRED`
(permissionless, only past `expiresAt`). `REVOKED` and `EXPIRED` are terminal; reissuance
means a **new id**, never resurrection.

> At most one valid credential per `(subjectOrgId, credType)`. Issuance reverts
> `DuplicateValidCredential`. Reinstatement additionally fails if the credential expired
> while suspended, or if another of the same type became valid meanwhile. **Show the
> incumbent before the issue form is submitted.**

**Frontend:** → `/registry`, `/ops/credentials`

---

## 4. L2 — Assets

### 4.1 AssetRegistry

`0x88E3A5094DFA93926f3B6D5ED57173D3473EA660` · UUPS proxy.

**Struct** `Asset` — `(uint64 registrarOrgId, uint64 verifierOrgId, uint40 registeredAt, uint40 verifiedAt, uint8 kind, uint8 status, bytes32 serialNumberHash, bytes32 metadataHash)`

| Read | Returns |
|---|---|
| `getAsset(assetId)` | full record *(reverts `AssetNotFound`)* |
| `exists(assetId)` | `bool` |
| `isVerified(assetId)` | `bool` |
| `isTerminal(assetId)` | `bool` — RETIRED or DESTROYED |
| `assetCount()` | highest id |
| `assetIdBySerialHash(bytes32)` | `uint256` |
| `metadataURI(assetId)` | `string` |
| `isValidTransition(uint8,uint8)` | `bool` |
| `requireKind(assetId, uint8 kind)` | reverts `InvalidAssetKind` |

| Write | Parameters | Authorized |
|---|---|---|
| `registerAsset` | `orgId, address owner, uint8 kind, bytes32 serialNumberHash, bytes32 metadataHash, string uri` → `uint256` | acting for **VERIFIED** org |
| `registerAssetFor` | same | `ASSET_MINTER_ROLE` (machine) |
| `updateAssetMetadata` | `assetId, bytes32 metadataHash, string uri` | owner **or** registrar org |
| `setAssetStatus` | `assetId, uint8 newStatus` | asset owner |
| `verifyAsset` | `assetId, uint256 verifierOrgId` | `ASSET_VERIFIER_ROLE` |
| `unverifyAsset` | `assetId` | `ASSET_VERIFIER_ROLE` |
| `recoverTerminalAsset` | `assetId, uint8 newStatus` | `PROTOCOL_ADMIN_ROLE` (48 h) |
| `releaseSerialNumberHash` | `assetId` | `PROTOCOL_ADMIN_ROLE` (48 h) |

**Events:** `AssetRegistered(assetId ⓘ, registrarOrgId ⓘ, owner ⓘ, kind, serialNumberHash)` ·
`AssetStatusChanged(assetId ⓘ, oldStatus ⓘ, newStatus ⓘ)` ·
`AssetVerificationChanged(assetId ⓘ, verifierOrgId ⓘ, verified, by)` ·
`AssetMetadataUpdated(assetId ⓘ, metadataHash, metadataURI)` ·
`AssetTerminalStatusRecovered(assetId ⓘ, from ⓘ, to ⓘ, by)` ·
`SerialNumberHashReleased(assetId ⓘ, serialNumberHash ⓘ, by)`

**Errors (27):** `AssetNotFound`, `AssetTerminal`, `AssetNotTerminal`, `AssetNotVerified`,
`AssetAlreadyVerified`, `AssetLockedBySettlement(assetId, lockHolder)`,
`SerialNumberTaken(hash, existingAssetId)`, `SerialNumberNotHeld`, `NoSerialNumberRecorded`,
`InvalidAssetTransition`, `InvalidAssetKind`, `UnspecifiedAssetKind`, `NotAssetController`,
`OrganizationNotVerified`, `ValueTooLarge`.

**State transitions** — the four operational statuses (`REGISTERED`, `IN_SERVICE`,
`STORED`, `UNDER_MAINTENANCE`) are mutually reachable. `RETIRED` is **reversible** back to
any operational status; `DESTROYED` is absorbing for the owner. Both freeze transfers.
A terminal transition is **refused while an escrow holds the lock** (`AssetLockedBySettlement`).

Verification is an orthogonal axis, not a status.

**Frontend:** → `/fleet`, `/fleet/[assetId]`, `/assets`, `/ops/assets`

### 4.2 AssetOwnership

`0xeA2b26E8B8d1ed33Fd2339478cd50465478Ad812` · UUPS proxy.

**Struct** `OwnershipRecord` — `(address owner, uint40 since, bool transferFrozen, address pendingOwner, uint40 offerExpiresAt, address lockedBy)`

| Read | Returns |
|---|---|
| `ownerOf(assetId)` | `address` |
| `getOwnership(assetId)` | full record — **the only source of `pendingOwner` / `offerExpiresAt`** |
| `isTransferable(assetId)` | `bool` — **not** frozen and **not** locked |
| `lockHolderOf(assetId)` | `address` |
| `requireOwner(assetId,account)` | reverts `NotAssetOwner` |

| Write | Parameters | Authorized |
|---|---|---|
| `initiateTransfer` | `assetId, address to, uint40 expiresAt` | asset owner |
| `acceptTransfer` | `assetId` | `pendingOwner` |
| `cancelTransfer` | `assetId` | owner **or** pendingOwner |
| `initializeOwnership` | `assetId, address owner` | `AssetRegistry` only |
| `freezeTransfers` | `assetId` | `AssetRegistry` only |
| `unfreezeTransfers` | `assetId` | `AssetRegistry` only |
| `setTransferLock` | `assetId, bool locked` | `SETTLEMENT_ROLE` |
| `settleTransfer` | `assetId, address from, address to` | `SETTLEMENT_ROLE` **and** current lock holder **and** `from` must still be owner |

**Events:** `OwnershipInitialized(assetId ⓘ, owner ⓘ)` ·
`OwnershipTransferStarted(assetId ⓘ, from ⓘ, to ⓘ, expiresAt)` ·
`OwnershipTransferred(assetId ⓘ, from ⓘ, to ⓘ, bytes32 reason)` ·
`OwnershipTransferCancelled(assetId ⓘ, cancelledBy ⓘ)` ·
`TransferLockChanged(assetId ⓘ, lockedBy ⓘ, by ⓘ)` · `TransferFrozen(assetId ⓘ)` ·
`TransferUnfrozen(assetId ⓘ)`

**Errors (26):** `NotAssetOwner`, `NotPendingOwner`, `NoPendingTransfer`,
`TransferOfferExpired(assetId, expiresAt)`, `TransferToCurrentOwner`,
`AssetTransferFrozen`, `AssetTransferLocked(assetId, lockedBy)`,
`AssetAlreadyLocked`, `NotLockHolder`, `UnexpectedOwner`, `UnexpectedCaller`,
`OwnershipNotFound`, `OwnershipAlreadyInitialized`, `DeadlineInPast`.

> **Stale-field trap.** `pendingOwner` is never cleared by the passage of time. An expired
> offer still reads as a pending transfer; only `offerExpiresAt <= block.timestamp`
> reveals it. `acceptTransfer` reverts `TransferOfferExpired` at exactly `>=`, so the
> deadline second itself is already too late. Taking a settlement lock **does** clear a
> pending offer.

**Frontend:** → `/fleet/[assetId]`, `/assets`

### 4.3 AircraftRegistry

`0xA68ff461Fe0F79ee9C9587EB5a20b896Cdd44f1C` · UUPS proxy · holds `ASSET_MINTER_ROLE`.

**Struct** `Aircraft` — `(uint64 manufacturerOrgId, uint16 manufactureYear, uint8 category, bytes32 model, bytes32 manufacturerName, bytes32 registrationMarkHash)`

| | |
|---|---|
| **Reads** | `getAircraft(assetId)` *(reverts `AircraftNotFound`)* · `isAircraft(assetId) → bool` |
| **Writes** | `registerAircraft(AircraftParams) → uint256 assetId` — acting for VERIFIED org · `updateAircraft(assetId, bytes32 model, uint8 category, bytes32 registrationMarkHash)` — asset owner |
| **Events** | `AircraftRegistered(assetId ⓘ, manufacturerOrgId ⓘ, model, manufactureYear, category)` · `AircraftUpdated(assetId ⓘ, model, category, registrationMarkHash)` |
| **Errors** | `AircraftNotFound` · `InvalidAircraftCategory` · `InvalidManufactureYear` · `MissingManufacturer` · `AssetTerminal` · `ZeroHash` |
| **Dependencies** | `AssetRegistry` (mints), `OrganizationRegistry` (membership), `ProtocolAddressRegistry` |

`AircraftParams` — `(uint256 orgId, address owner, bytes32 serialNumberHash, bytes32 metadataHash, string uri, uint64 manufacturerOrgId, bytes32 manufacturerName, bytes32 model, uint16 manufactureYear, uint8 category, bytes32 registrationMarkHash)`

`updateAircraft` changes **model, category and tail number only**. Manufacture year,
manufacturer and serial are immutable after registration.

**Frontend:** → `/fleet/[assetId]`, asset registration form

### 4.4 ComponentRegistry

`0xe1d04AD09C240Adf4B494F89869fA4B06Add4B31` · UUPS proxy · holds `ASSET_MINTER_ROLE`.

**Struct** `Component` — `(uint64 parentAssetId, uint40 installedAt, uint40 removedAt, uint16 position, uint8 kind, uint8 status, bytes32 partNumber)`

| Read | Returns |
|---|---|
| `getComponent(assetId)` | full record |
| `isComponent(assetId)` | `bool` |
| `componentsOf(parentAssetId, offset, limit)` | `uint256[]` — **swap-and-pop array** |
| `componentCountOf(parentAssetId)` | `uint256` |
| `positionOccupant(parentAssetId, uint8 kind, uint16 position)` | `uint256` — 0 if free |
| `isValidTransition(uint8,uint8)` | `bool` |

| Write | Parameters | Authorized |
|---|---|---|
| `registerComponent` | `ComponentParams` → `uint256` | acting for VERIFIED org |
| `installComponent` | `componentAssetId, parentAssetId, uint16 position` | owner of **both** |
| `removeComponent` | `componentAssetId` | component owner |
| `setComponentStatus` | `componentAssetId, uint8 newStatus` | component owner |

**Events:** `ComponentRegistered(assetId ⓘ, kind, partNumber)` ·
`ComponentInstalled(componentAssetId ⓘ, parentAssetId ⓘ, position)` ·
`ComponentRemoved(componentAssetId ⓘ, previousParentAssetId ⓘ)` ·
`ComponentStatusChanged(componentAssetId ⓘ, oldStatus ⓘ, newStatus ⓘ)`

**Errors (24):** `ComponentNotFound`, `ComponentAlreadyInstalled`, `ComponentNotInstalled`,
`ParentNotAircraft`, `PositionOccupied(parentAssetId, kind, position, occupantAssetId)`,
`SelfInstallation`, `UseInstallComponent`, `InvalidComponentKind`,
`InvalidComponentTransition`, `AssetTerminal`.

**State transitions** — `UNINSTALLED ⇄ INSTALLED` · `IN_REPAIR` · `QUARANTINED` ·
`SCRAPPED` (terminal). `INSTALLED` is reachable **only** through `installComponent`;
`setComponentStatus` rejects it with `UseInstallComponent`. **Every** exit from `INSTALLED`
detaches — sending to repair, quarantining or scrapping all clear the parent.

> `componentsOf` is swap-and-pop: removing a component moves the last element into the
> freed slot. Paging across a removal **skips one entry and duplicates another**. Pin the
> block height for the whole paged read.

`positionOccupant` lets the install form validate before signing rather than reverting.

**Frontend:** → `/fleet/[assetId]`, install/remove flows

---

## 5. L3 — Provenance

### 5.1 DocumentRegistry

`0x6167260075f2300f01ce8152df65E724d985fE9f` · UUPS proxy.

**Struct** `Document` — `(uint64 assetId, uint64 issuerOrgId, uint64 supersededById, uint40 issuedAt, uint8 docType, uint8 status, bytes32 documentHash)`

| Read | Returns |
|---|---|
| `getDocument(documentId)` | full record |
| `documentURI(documentId)` | `string` |
| `documentsOf(assetId, offset, limit)` | `uint256[]` |
| `documentCountOf(assetId)` | `uint256` |
| `documentIdOf(assetId, bytes32 documentHash)` | `uint256` — duplicate detection |
| `documentCount()` | highest id |

| Write | Parameters | Authorized |
|---|---|---|
| `registerDocument` | `assetId, uint256 issuerOrgId, uint8 docType, bytes32 documentHash, uint40 issuedAt, string uri` → `uint256` | asset owner (with `issuerOrgId == 0`) **or** acting for `issuerOrgId` |
| `supersedeDocument` | `documentId, uint256 supersededById` | document controller |
| `revokeDocument` | `documentId` | document controller **or** `PROTOCOL_ADMIN_ROLE`; **callable while paused** |

**Events:** `DocumentRegistered(documentId ⓘ, assetId ⓘ, issuerOrgId ⓘ, docType, documentHash, uri)` ·
`DocumentSuperseded(documentId ⓘ, supersededById ⓘ)` · `DocumentRevoked(documentId ⓘ, by ⓘ)`

**Errors (23):** `DocumentNotFound`, `DocumentNotActive`, `DocumentHashTaken(hash, existingId)`,
`DocumentAssetMismatch`, `SelfSupersede`, `NotDocumentController`,
`IssuedAtInFuture(issuedAt, nowTs)`, `InvalidDocumentType`, `AssetTerminal`, `ZeroHash`.

**State transitions** — `ACTIVE → SUPERSEDED | REVOKED`, both terminal.

`documentHash` is a `keccak256` commitment to the **document bytes** — this is what the
local file-verification tool compares against.

> **`documentHash` is NOT indexed** on `DocumentRegistered`; all three indexed slots are
> taken by `documentId`, `assetId` and `issuerOrgId`. Lookup-by-hash is served by the
> **`documentIdOf(assetId, documentHash)` view**, not by a log filter — and that view is
> scoped to a single asset, so there is no global hash → document search. See §8.3.

A caller can **never** attribute a document to an organization it does not act for.

> **A document has no verification flag.** What exists is `status`
> (`ACTIVE`/`SUPERSEDED`/`REVOKED`) and the hash. There is no `verified` boolean, no
> verifier org, and no equivalent of `AssetRegistry.isVerified`. A "verification status"
> for a document can only mean its lifecycle status, or the result of comparing a file
> against `documentHash` — and the second is a check the *reader* performs, not a claim
> the protocol stores.

> **`issuedAt` is claimed; the witnessed time is the registration block.** Unlike
> `MaintenanceRecord`, `Document` has no `recordedAt` — the interface says outright that
> the block timestamp is already in the event and storing it would cost a field for
> nothing. So the only date in storage is the unverifiable one, and showing when the
> chain actually saw the document requires reading `DocumentRegistered`.

**Frontend:** → `/documents`, `/documents/[id]` (hash verification), and the
`/assets/[id]` documents tab

### 5.2 MaintenanceRegistry

`0xe25c0A7F34cC30cB0bf37bBe990f332114F29B9B` · UUPS proxy.

**Struct** `MaintenanceRecord` — `(uint64 assetId, uint64 performedByOrgId, uint64 documentId, uint40 performedAt, uint8 mType, uint40 recordedAt, bytes32 recordHash)`

| | |
|---|---|
| **Reads** | `getMaintenanceRecord(recordId)` · `maintenanceOf(assetId, offset, limit) → uint256[]` · `maintenanceCountOf(assetId)` · `maintenanceCount()` · **`canRecordMaintenance(orgId, account) → bool`** |
| **Writes** | `recordMaintenance(assetId, performedByOrgId, uint8 mType, uint40 performedAt, uint256 documentId, bytes32 recordHash) → uint256` |
| **Events** | `MaintenanceRecorded(recordId ⓘ, assetId ⓘ, performedByOrgId ⓘ, mType, performedAt, recordedAt, credentialId, documentId, recordHash)` |
| **Errors** | `NotAuthorizedMro(orgId, orgType)` · `NoValidMaintenanceCredential(orgId)` · `PerformedAtInFuture` · `DocumentNotActive` · `DocumentAssetMismatch` · `MaintenanceRecordNotFound` · `InvalidMaintenanceType` · `AssetTerminal` |
| **Dependencies** | `OrganizationRegistry`, `CredentialRegistry`, `AssetRegistry`, `DocumentRegistry` |

`recordMaintenance` requires **three independent on-chain checks**:
1. caller acts for `performedByOrgId` (verified org),
2. that org's `orgType == MRO`,
3. the org holds a **valid `MAINTENANCE_AUTHORITY` credential**.

`canRecordMaintenance(orgId, account)` answers all three in one call. **Gate the UI on it.**

> **Two dates, one witnessed.** `performedAt` is the caller's unverifiable claim;
> `recordedAt` is the protocol's own observation. Rendering `performedAt` without
> `recordedAt` misrepresents the registry (audit AAP-12). Backdating is made *visible*,
> not prevented.

> **A maintenance record has no status.** The struct above is the whole record. There is
> no `status` field, no edit, no delete and no lifecycle — a correction is a *new* record
> referencing the prior one off-chain, because anything else would let a maintenance log
> be rewritten. Any status rendered against a maintenance record is invented by the
> interface. What *can* change is the standing of things the record points at: the
> organization, and the supporting document. Neither retroactively invalidates it.

> **The acting account is not stored, and not in the event.** `MaintenanceRecorded` and
> `DocumentRegistered` both attribute to an *organization*; `msg.sender` appears in
> neither. (`DocumentRevoked(documentId, by)` is the one exception.) To show who signed,
> read the log's `transactionHash` and take the transaction's `from`.

> **`credentialId` is emitted and never stored.** It pins a record to the exact
> `MAINTENANCE_AUTHORITY` credential that authorised it — the audit trail that survives
> the credential's later suspension or revocation. Unavailable to any storage read.

**Frontend:** → `/maintenance`, `/maintenance/[id]`, and the `/assets/[id]` maintenance tab

### 5.3 AssetPassport

`0x057FA5385B4CbD4c6d0a5B5d109B171F883763e4` · **immutable, zero storage, zero writes, zero events.**

| Read | Returns |
|---|---|
| `getPassport(assetId)` | 17-field struct (below) |
| `metadataURI(assetId)` | `string` |
| `getAircraft(assetId)` | `Aircraft` |
| `getComponent(assetId)` | `Component` |
| `components(assetId, offset, limit)` | `uint256[]` |
| `documents(assetId, offset, limit)` | `uint256[]` |
| `maintenance(assetId, offset, limit)` | `uint256[]` |
| `ADDRESS_REGISTRY()` | `address` |

`Passport` — `(uint256 assetId, uint8 kind, uint8 status, bool verified, uint256 registrarOrgId, uint256 verifierOrgId, uint40 registeredAt, uint40 verifiedAt, bytes32 serialNumberHash, bytes32 metadataHash, address owner, uint40 ownedSince, bool transferFrozen, address lockedBy, uint256 componentCount, uint256 documentCount, uint256 maintenanceCount)`

**Only error:** `ZeroAddress()` (constructor). Reverts propagate from the modules it calls.

> The passport does **not** include `pendingOwner` or `offerExpiresAt`. A UI showing
> transfer state must additionally call `AssetOwnership.getOwnership`. It also carries no
> marketplace state — `Marketplace.activeListingOf` is a separate call.

**Frontend:** primary read surface for `/fleet/[assetId]`

---

## 6. L4 — Transaction

### 6.1 Marketplace

`0xA38072A464D8EDC2a7C74B84eC463e3E1eA36B86` · UUPS proxy. **Never custodies funds or assets.**

**Struct** `Listing` — `(address seller, uint40 createdAt, uint40 expiresAt, uint8 status, address paymentToken, uint64 assetId, uint128 price, uint64 escrowId)`
**Struct** `Offer` — `(address buyer, uint40 createdAt, uint40 expiresAt, uint8 status, uint64 listingId, uint128 price)`

| Read | Returns |
|---|---|
| `getListing(listingId)` | raw record — **status goes stale** |
| `getOffer(offerId)` | raw record — **status goes stale** |
| **`isListingActive(listingId)`** | `bool` — status **and** `expiresAt > block.timestamp` |
| **`isOfferActive(offerId)`** | `bool` — same |
| `activeListingOf(assetId)` | `uint256` — already freshness-filtered, returns 0 when lapsed |
| `escrowOf(listingId)` | `address` |
| `listingCount()` / `offerCount()` | highest id |
| `isValidListingTransition` / `isValidOfferTransition` | `bool` |

| Write | Parameters | Authorized |
|---|---|---|
| `createListing` | `assetId, address paymentToken, uint128 price, uint40 expiresAt` → `uint256` | asset owner |
| `cancelListing` | `listingId` | seller; reverts if escrow live |
| `expireListing` | `listingId` | **permissionless**, only past `expiresAt` |
| `makeOffer` | `listingId, uint128 price, uint40 expiresAt` → `uint256` | any address ≠ seller |
| `withdrawOffer` | `offerId` | offer buyer |
| `rejectOffer` | `offerId` | listing seller |
| `expireOffer` | `offerId` | **permissionless**, only past `expiresAt` |
| `acceptOffer` | `offerId` → `(uint256 escrowId, address escrow)` | listing seller |
| `markSold` | `listingId` | `SETTLEMENT_ROLE` **and** attached escrow |
| `clearEscrow` | `listingId` | `SETTLEMENT_ROLE` **and** attached escrow |

**Events:** `ListingCreated(listingId ⓘ, assetId ⓘ, seller ⓘ, paymentToken, price, expiresAt)` ·
`ListingStatusChanged(listingId ⓘ, oldStatus ⓘ, newStatus ⓘ)` ·
`OfferMade(offerId ⓘ, listingId ⓘ, buyer ⓘ, price, expiresAt)` ·
`OfferStatusChanged(offerId ⓘ, oldStatus ⓘ, newStatus ⓘ)` ·
`EscrowOpened(listingId ⓘ, offerId ⓘ, escrowId ⓘ, escrow, price, feeAmount)` ·
`EscrowCleared(listingId ⓘ, escrowId ⓘ)`

**Errors (37):** `ListingNotFound`, `ListingNotActive(listingId, status)`, `ListingNotExpired`,
`AssetAlreadyListed`, `AssetNotVerified`, `AssetNotTransferable`, `AssetTerminal`,
`ComponentIsInstalled(assetId, parentAssetId)`, `PriceTooLow`, `DeadlineInPast`,
`DeadlineTooFar(deadline, max)`, `EscrowInProgress(listingId, escrowId)`,
`NotListingSeller`, `SelfOffer(seller)`, `OfferNotFound`, `OfferNotActive`,
`OfferNotExpired`, `NotOfferBuyer`, `OfferListingMismatch`,
**`SellerNoLongerOwner(assetId, expectedSeller, actualOwner)`**, `InvalidListingTransition`,
`InvalidOfferTransition`, `UnexpectedCaller`, `ReentrancyGuardReentrantCall`.

**`createListing` has nine preconditions** — price non-zero; `expiresAt` in the future;
within `MAX_LISTING_DURATION` (365 days); token allowlisted; caller owns the asset; asset
verified; asset not terminal; asset transferable; asset not an installed component; and no
existing active listing. Render these as a live checklist.

**State transitions** — Listing: `ACTIVE → SOLD | CANCELLED | EXPIRED`, all terminal.
Offer: `ACTIVE → ACCEPTED | WITHDRAWN | REJECTED | EXPIRED`, all terminal.

> **Accepting an offer does not reject its siblings.** They stay `ACTIVE` but become
> unacceptable once the listing leaves `ACTIVE`. Bulk rejection would be an unbounded loop.
>
> **`acceptOffer` return values are unavailable from a transaction.** Parse `EscrowOpened`
> from the receipt logs, or read `escrowOf(listingId)` after confirmation.
>
> **A listing with a live escrow is still `active`.** `makeOffer` succeeds; `acceptOffer`
> reverts `EscrowInProgress` and `cancelListing` reverts. Two different facts — model them
> as two fields, not one state.

**Frontend:** → `/market`, `/market/[listingId]`, `/assets`

### 6.2 FeeManager

`0xb69A4c294D994B94B097307F38adf9c1634CC083` · **immutable, no pause.** Never touches tokens.

| | |
|---|---|
| **Reads** | `quote(bytes32 feeType, uint256 amount) → uint256 fee` · `feeBps(bytes32) → uint16` · `treasury() → address` · `isTokenAllowed(address) → bool` · `requireTokenAllowed(address)` *(reverts)* · `MAX_FEE_BPS() → uint16` · `FEE_TYPE_MARKETPLACE() → bytes32` · `ROLE_MANAGER()` |
| **Writes** | `setFeeBps(bytes32,uint16)` → `FEE_MANAGER_ROLE` · `setTreasury(address)` → `FEE_MANAGER_ROLE` · `setTokenAllowed(address,bool)` → `PROTOCOL_ADMIN_ROLE` |
| **Events** | `FeeBpsChanged(feeType ⓘ, oldBps, newBps)` · `TreasuryChanged(oldTreasury ⓘ, newTreasury ⓘ)` · `TokenAllowanceChanged(token ⓘ, allowed)` |
| **Errors** | `FeeExceedsMaximum(requested, maximum)` · `TokenNotAllowed(address)` · `MissingRole` · `ZeroAddress` |

Live: 200 bps, cap 1000 bps (a `constant` — no admin action can exceed it). `FEE_MANAGER_ROLE`
is held by the **Timelock**, so even a fee change is 48 h delayed.

Only one fee category exists: `FEE_TYPE_MARKETPLACE`.

> **Two different fee numbers.** `quote()` is indicative at today's rate; `terms.feeAmount`
> is frozen into the escrow at acceptance. Label them separately, always.

**Frontend:** → `/protocol`, `/market/[listingId]`, `/ops/governance`

### 6.3 EscrowFactory

`0x3F0A2CC772d0e714970425beC8b31dd415E0c390` · **immutable.** Holds `ESCROW_FACTORY_ROLE`.

| | |
|---|---|
| **Reads** | `escrowOf(escrowId) → address` · `isEscrow(address) → bool` · `escrowCount()` · `predictEscrowAddress(escrowId) → address` · `ESCROW_IMPLEMENTATION()` · `ADDRESS_REGISTRY()` · `ROLE_MANAGER()` |
| **Writes** | `openEscrow(EscrowTerms) → (uint256 escrowId, address escrow)` — **`Marketplace` only** |
| **Events** | `EscrowOpened(escrowId ⓘ, escrow ⓘ, listingId ⓘ, address buyer, address seller, uint128 price, uint128 feeAmount)` |
| **Errors** | `CloneAddressMismatch(predicted, deployed)` · `EscrowNotFound` · `FailedDeployment` · `InsufficientBalance` · `UnexpectedCaller` · `ZeroAddress` |

`EscrowTerms` — `(uint256 listingId, uint256 assetId, address buyer, address seller, address paymentToken, address treasury, uint128 price, uint128 feeAmount, uint40 fundingDeadline, uint40 settlementDeadline)`

> **`buyer` and `seller` are NOT indexed** on this event, and neither are they on
> `Marketplace.EscrowOpened`. "My trades" cannot be a filtered `eth_getLogs` — every escrow
> event must be downloaded and filtered client-side. `EscrowFactory` is immutable, so this
> cannot be fixed on-chain.

**Frontend:** → `/trades`

### 6.4 Escrow

Implementation `0xfC317babD11079c5Edb75311C6a6146699C88006` · **immutable, no pause** · one
EIP-1167 clone per trade. Live clone on Sepolia: `0x60e13a5a85e7f3d102984e714B0b6a0B58C05Fa2`.

| Read | Returns |
|---|---|
| `status()` | `uint8` EscrowStatus |
| `getTerms()` | frozen `EscrowTerms` |
| `depositedAmount()` | measured amount held |
| `isTerminal()` | `bool` |
| `escrowId()` | `uint256` |
| `disputeRaisedAt()` / `disputeDeadline()` | `uint40` |
| `withdrawable(address)` | `uint256` — deferred payout |
| `totalDeferred()` | `uint256` |
| `DISPUTE_RESOLUTION_WINDOW()` | `uint40` = 1,209,600 (14 d) |
| `TIMEOUT_PENALTY_BPS()` | `uint16` = 200 (2%) |

| Write | Authorized | Notes |
|---|---|---|
| `fund()` | buyer | requires ERC-20 allowance for `price`; **measured** balance delta; locks the asset |
| `release()` | **buyer only** | seller cannot release |
| `cancel()` | either party, or **anyone** after `fundingDeadline` | unfunded only |
| `raiseDispute()` | buyer or seller, **before** `settlementDeadline` | |
| `resolveDispute(bool releaseToSeller)` | `ARBITRATOR_ROLE` | from `DISPUTED` only |
| `claimTimeout()` | **permissionless** after `settlementDeadline` | buyer refunded **less 2%**, which goes to the seller |
| `claimDisputeTimeout()` | **permissionless** after dispute window | buyer refunded **in full** |
| `withdraw(address account)` | **permissionless** | funds only ever go to the recorded recipient |

**Events:** `EscrowFunded(escrowId ⓘ, buyer ⓘ, amount)` ·
`EscrowStatusChanged(escrowId ⓘ, oldStatus ⓘ, newStatus ⓘ)` ·
`EscrowSettled(escrowId ⓘ, seller ⓘ, sellerProceeds, feeAmount)` ·
`EscrowRefunded(escrowId ⓘ, buyer ⓘ, amount)` · `DisputeRaised(escrowId ⓘ, raisedBy ⓘ)` ·
`DisputeDeadlineSet(escrowId ⓘ, deadline)` ·
`DisputeResolved(escrowId ⓘ, arbitrator ⓘ, releasedToSeller)` ·
`FeeCollected(token ⓘ, treasury ⓘ, amount, feeType ⓘ)` ·
`PayoutDeferred(recipient ⓘ, amount)` · `PayoutWithdrawn(recipient ⓘ, amount)` ·
`TimeoutPenaltyCharged(escrowId ⓘ, seller ⓘ, amount)`

**Errors (18):** `NotEscrowBuyer(caller, buyer)`, `NotEscrowParty`,
`IncorrectFundingAmount(expected, received)`, `FundingDeadlinePassed`,
`FundingDeadlineNotPassed`, `SettlementDeadlinePassed`, `SettlementDeadlineNotPassed`,
`DisputeDeadlineNotPassed`, `InvalidEscrowTransition`, `FeeExceedsPrice`,
`NothingToWithdraw`, `SafeERC20FailedOperation`, `UnexpectedCaller`, `MissingRole`.

**State transitions**

```
AWAITING_FUNDING ──fund()──▶ FUNDED ──release()──▶ RELEASED   (terminal)
       │                       │
       │ cancel()              ├─raiseDispute()─▶ DISPUTED
       ▼                       │                    ├─resolveDispute─▶ RELEASED | REFUNDED
   CANCELLED                   │                    └─claimDisputeTimeout─▶ REFUNDED (full)
   (terminal)                  └─claimTimeout()──▶ REFUNDED (less 2%)
```

Every non-terminal state is bounded by a deadline after which a **permissionless** call
reaches a terminal state. `SETTLEMENT_ROLE` is revoked from the clone on entry to any
terminal state.

> **Approve the clone, not the Marketplace**, for **exactly** `terms.price` — which is the
> *offer* price, not the listing price. Each clone is single-use, so unlimited approval is
> pure downside.
>
> **`PayoutDeferred` is reachable, not theoretical.** Sepolia USDC is Circle's permissioned
> token with live blacklisting. The buyer refund and the protocol fee are deferrable; the
> **seller payout is strict** and reverts, because an aircraft must not change hands
> against an IOU.

**Frontend:** → `/trades/[escrowId]`, `/ops/disputes`

---

## 7. Capability matrix

`⚙` = machine role, never held by a person. "Required role" of **—** means no protocol
role: authorization comes from ownership or organization membership.

| Feature | Contract | Read | Write | Events | Required role | Frontend page |
|---|---|---|---|---|---|---|
| **Organization registration** | OrganizationRegistry | `getOrganization` `organizationCount` `organizationIdByNameHash` `metadataURI` | `registerOrganization` | `OrganizationRegistered` | — *(permissionless)* | `/registry` |
| **Organization verification** | OrganizationRegistry | `isVerified` `isValidTransition` | `verifyOrganization` `rejectOrganization` `suspendOrganization` `reactivateOrganization` | `OrganizationStatusChanged` | `ORG_VERIFIER` | `/ops/organizations` |
| **Organization revocation** | OrganizationRegistry | `getOrganization` | `revokeOrganization` | `OrganizationStatusChanged` `OrganizationNameReleased` | `PROTOCOL_ADMIN` (48 h) | `/ops/governance` |
| **Organization admin & operators** | OrganizationRegistry | `isActingFor` `isOperator` `pendingAdmin` | `updateOrganization` `transferOrganizationAdmin` `acceptOrganizationAdmin` `cancelOrganizationAdminTransfer` `setOperator` | `OrganizationAdminTransfer*` `OrganizationOperatorSet` `OrganizationUpdated` `OrganizationRequiresReverification` | — *(org admin)* | `/org/[orgId]` |
| **Aircraft registration** | AircraftRegistry → AssetRegistry | `getAircraft` `isAircraft` `getAsset` | `registerAircraft` `updateAircraft` | `AircraftRegistered` `AircraftUpdated` `AssetRegistered` | — *(verified org)* ⚙`ASSET_MINTER` | `/fleet`, registration form |
| **Component registration** | ComponentRegistry → AssetRegistry | `getComponent` `isComponent` `componentsOf` `componentCountOf` `positionOccupant` | `registerComponent` `installComponent` `removeComponent` `setComponentStatus` | `ComponentRegistered` `ComponentInstalled` `ComponentRemoved` `ComponentStatusChanged` | — *(verified org / owner)* | `/fleet/[assetId]` |
| **Asset verification** | AssetRegistry | `isVerified` `getAsset` | `verifyAsset` `unverifyAsset` | `AssetVerificationChanged` | `ASSET_VERIFIER` | `/ops/assets` |
| **Asset lifecycle** | AssetRegistry | `isTerminal` `isValidTransition` | `setAssetStatus` `updateAssetMetadata` | `AssetStatusChanged` `AssetMetadataUpdated` | — *(owner)* | `/assets` |
| **Terminal-asset recovery** | AssetRegistry | `isTerminal` | `recoverTerminalAsset` `releaseSerialNumberHash` | `AssetTerminalStatusRecovered` `SerialNumberHashReleased` | `PROTOCOL_ADMIN` (48 h) | `/ops/governance` |
| **Credential management** | CredentialRegistry | `getCredential` `isValid` `hasValidCredentialOfType` `validCredentialOfType` `credentialCount` | `issueCredential` `suspendCredential` `reinstateCredential` `revokeCredential` | `CredentialIssued` `CredentialStatusChanged` | `CREDENTIAL_ISSUER` | `/ops/credentials` |
| **Credential expiry** | CredentialRegistry | `isValid` | `expireCredential` | `CredentialStatusChanged` | — *(permissionless)* | `/registry` |
| **Document management** | DocumentRegistry | `getDocument` `documentURI` `documentsOf` `documentCountOf` `documentIdOf` | `registerDocument` `supersedeDocument` `revokeDocument` | `DocumentRegistered` `DocumentSuperseded` `DocumentRevoked` | — *(owner or issuing org)* | `/fleet/[assetId]` |
| **Maintenance records** | MaintenanceRegistry | `getMaintenanceRecord` `maintenanceOf` `maintenanceCountOf` `canRecordMaintenance` | `recordMaintenance` | `MaintenanceRecorded` | — *(MRO org + valid credential)* | `/fleet/[assetId]` |
| **Ownership — direct transfer** | AssetOwnership | `ownerOf` `getOwnership` `isTransferable` `lockHolderOf` | `initiateTransfer` `acceptTransfer` `cancelTransfer` | `OwnershipTransferStarted` `OwnershipTransferred` `OwnershipTransferCancelled` | — *(owner / pendingOwner)* | `/assets`, `/fleet/[assetId]` |
| **Ownership — settlement** | AssetOwnership | `lockHolderOf` | `setTransferLock` `settleTransfer` | `TransferLockChanged` `OwnershipTransferred` | ⚙`SETTLEMENT` | *(none — machine)* |
| **Ownership — freeze** | AssetOwnership | `isTransferable` | `freezeTransfers` `unfreezeTransfers` | `TransferFrozen` `TransferUnfrozen` | ⚙ `AssetRegistry` only | *(none — machine)* |
| **Asset passport** | AssetPassport | `getPassport` `metadataURI` `getAircraft` `getComponent` `components` `documents` `maintenance` | *(none — read only)* | *(none)* | — *(public)* | `/fleet/[assetId]` |
| **Marketplace listings** | Marketplace | `getListing` `isListingActive` `activeListingOf` `listingCount` `escrowOf` | `createListing` `cancelListing` `expireListing` | `ListingCreated` `ListingStatusChanged` | — *(owner / seller / permissionless expiry)* | `/market`, `/assets` |
| **Offers** | Marketplace | `getOffer` `isOfferActive` `offerCount` | `makeOffer` `withdrawOffer` `rejectOffer` `acceptOffer` `expireOffer` | `OfferMade` `OfferStatusChanged` `EscrowOpened` | — *(any address ≠ seller; seller for accept/reject)* | `/market/[listingId]` |
| **Escrow** | EscrowFactory, Escrow | `escrowOf` `isEscrow` `escrowCount` `predictEscrowAddress` `status` `getTerms` `depositedAmount` `isTerminal` `withdrawable` `totalDeferred` `disputeDeadline` | `fund` `release` `cancel` `claimTimeout` `withdraw` | `EscrowOpened` `EscrowFunded` `EscrowSettled` `EscrowRefunded` `EscrowStatusChanged` `PayoutDeferred` `PayoutWithdrawn` `TimeoutPenaltyCharged` `FeeCollected` | — *(buyer / party / permissionless)* | `/trades/[escrowId]` |
| **Disputes** | Escrow | `status` `disputeRaisedAt` `disputeDeadline` `DISPUTE_RESOLUTION_WINDOW` | `raiseDispute` `resolveDispute` `claimDisputeTimeout` | `DisputeRaised` `DisputeDeadlineSet` `DisputeResolved` | `ARBITRATOR` *(resolve only)* | `/ops/disputes` |
| **Fees** | FeeManager | `quote` `feeBps` `treasury` `isTokenAllowed` `MAX_FEE_BPS` | `setFeeBps` `setTreasury` `setTokenAllowed` | `FeeBpsChanged` `TreasuryChanged` `TokenAllowanceChanged` | `FEE_MANAGER` / `PROTOCOL_ADMIN` — **both the Timelock** (48 h) | `/protocol`, `/ops/governance` |
| **Transactions / governance** | ProtocolTimelock | `getOperationState` `getTimestamp` `isOperationReady` `getMinDelay` `hashOperation` | `schedule` `execute` `cancel` `updateDelay` | `CallScheduled` `CallExecuted` `Cancelled` `MinDelayChange` | `PROPOSER` / `EXECUTOR` / `CANCELLER` | `/ops/governance` |
| **Authorization map** | RoleManager | `hasRole` `getRoleMembers` `getRoleMemberCount` `getRoleAdmin` | `grantRole` `revokeRole` `setRoleAdmin` | `RoleGranted` `RoleRevoked` `RoleAdminChanged` | `DEFAULT_ADMIN` (Timelock) | `/protocol`, `/ops/governance` |
| **Address book** | ProtocolAddressRegistry | `tryGetAddress` `getAddress` `isRegistered` | `setAddress` | `ProtocolAddressSet` | `PROTOCOL_ADMIN` (48 h) | `/protocol` |
| **Incident pause** | 9 UUPS modules | `paused()` | `pause()` / `unpause()` | `Paused` `Unpaused` | `PAUSER` / `PROTOCOL_ADMIN` | `/ops/incident` |

---

## 8. NOT AVAILABLE IN CURRENT CONTRACTS

Verified absent from the compiled ABI of every deployed contract. Any UI needing these
must derive them off-chain, from event logs, or not at all.

### 8.1 Enumeration — the largest gap

There is **no on-chain enumeration by owner, party or subject anywhere in the protocol.**

| Wanted | Status | Workaround |
|---|---|---|
| `assetsOf(address owner)` | **NOT AVAILABLE** | Scan `1..assetCount()` calling `ownerOf`, or scan `AssetRegistered` + `OwnershipTransferred` logs |
| `listingsOf(address seller)` | **NOT AVAILABLE** | `ListingCreated.seller` **is** indexed — log filter works |
| `offersOf(address buyer)` | **NOT AVAILABLE** | `OfferMade.buyer` **is** indexed — log filter works |
| `offersForListing(listingId)` | **NOT AVAILABLE** | `OfferMade.listingId` **is** indexed — log filter works |
| `escrowsOf(address party)` | **NOT AVAILABLE** | `buyer`/`seller` are **not indexed** on either `EscrowOpened` — download all, filter client-side |
| `credentialsOf(subjectOrgId)` | **NOT AVAILABLE** | `CredentialIssued.subjectOrgId` is **not indexed**; only `issuerOrgId` and `subject` are. `validCredentialOfType` returns **only the one currently-valid** credential, never history |
| `organizationsOf(address admin)` | **NOT AVAILABLE** | `OrganizationRegistered.admin` **is** indexed, but admin can change — must also replay `OrganizationAdminTransferred` |
| `operatorsOf(orgId)` | **NOT AVAILABLE** | `isOperator` is a point query; replay `OrganizationOperatorSet` |
| `documentsOf(issuerOrgId)` | **NOT AVAILABLE** | `DocumentRegistered.issuerOrgId` **is** indexed — log filter works |
| Global lookup: document by hash, across all assets | **NOT AVAILABLE** | `documentIdOf` needs an `assetId`; `documentHash` is **not** indexed on the event. To answer "does this file exist anywhere in the protocol", scan every `DocumentRegistered` log and match client-side |
| `allActiveListings()` | **NOT AVAILABLE** | Walk `listingCount()` descending, filter by `isListingActive` |

### 8.2 Absent protocol features

| Feature | Status |
|---|---|
| ERC-721 / ERC-20 asset tokens, `tokenURI`, wallet display | **NOT AVAILABLE IN CURRENT CONTRACTS** — ownership is a custom registry (decision D5) |
| Any human-readable on-chain asset name | **NOT AVAILABLE** — `model`/`partNumber` are `bytes32`; serial and tail number are hashes |
| Reverse lookup from a serial/tail hash to plaintext | **NOT AVAILABLE** — commitments only; brute-forceable but not stored |
| Batch operations of any kind | **NOT AVAILABLE** — no `registerAssetBatch`, `acceptOffersBatch`, etc. |
| Partial / instalment escrow funding | **NOT AVAILABLE** — `fund()` requires the exact measured `price` |
| Buy-it-now without an offer | **NOT AVAILABLE** — every trade goes listing → offer → accept → escrow |
| Seller-initiated release | **NOT AVAILABLE** — `release()` is buyer-only |
| Auctions, bidding increments, reserve prices | **NOT AVAILABLE** |
| Fractional ownership, lending, valuation | **NOT AVAILABLE** — explicitly out of V1 scope |
| Native ETH settlement | **NOT AVAILABLE** — allowlisted ERC-20 only |
| Multi-token or split payouts | **NOT AVAILABLE** — one `paymentToken`, one seller, one treasury |
| Offer counter-offers / negotiation | **NOT AVAILABLE** — a buyer withdraws and re-offers |
| On-chain messaging or dispute evidence | **NOT AVAILABLE** — `resolveDispute` takes one `bool` and nothing else |
| Arbitrator partial awards | **NOT AVAILABLE** — resolves to exactly one party, cannot alter amounts |
| Fee categories beyond marketplace | **NOT AVAILABLE** — only `FEE_TYPE_MARKETPLACE` is defined |
| Document or maintenance deletion | **NOT AVAILABLE** — revoke/supersede only; history is append-only |
| Maintenance record amendment | **NOT AVAILABLE** — no update path; record a new one |
| Organization deletion | **NOT AVAILABLE** — `REVOKED` is terminal |
| Un-revoking a credential | **NOT AVAILABLE** — reissue with a new id |
| Emergency fund recovery from an escrow | **NOT AVAILABLE** — and deliberately so |

### 8.3 Documented but not true

Found by comparing `/docs` against the compiled ABI.

| # | Claim | Location | Reality |
|---|---|---|---|
| D1 | "`freezeTransfers` … Permanent; **no unfreeze exists**" | `docs/permissions.md:53` | **Incorrect.** `AssetOwnership.unfreezeTransfers(uint256)` exists in the ABI and source, is `onlyAssetRegistry`, and is called at `AssetRegistry.sol:358` when a `RETIRED` asset returns to an operational status. `docs/state-machines.md` describes this correctly — the permission matrix is the stale document. |
| D2 | "`DocumentRegistered.documentHash` **is** indexed, because duplicate detection is a user-facing query" | `docs/events.md:11–13` | **Incorrect.** `documentHash` is not indexed; the three indexed slots are `documentId`, `assetId`, `issuerOrgId`. The document's *own* signature block at `events.md:97–100` shows this correctly, so the prose contradicts the code beside it. Duplicate detection is served by the `documentIdOf(assetId, documentHash)` **view**, which is the better mechanism anyway — but a client built from the prose would write a log filter that silently returns nothing. |

| D3 | "`documentHash` `keccak256` commitment to the document bytes. **Unique protocol-wide.**" | `src/interfaces/IDocumentRegistry.sol:74-75` (struct `@param` NatSpec) | **Incorrect, and contradicted 55 lines later by its own file.** Uniqueness is enforced **per asset**, through `documentIdByAssetAndHash`. The `DocumentHashTaken` NatSpec at `:125-131` states this correctly and explains why: a global index let anyone permanently burn a hash by claiming it against a junk asset they controlled, and could not represent a document covering a fleet (audit AAP-07). The struct comment is left over from before that fix. A client that trusted it would build a global "find this document anywhere" lookup that cannot exist. |

All three are documentation defects, not contract defects. **No Solidity change is
required or proposed.** Flagged here because a frontend built from the prose would be
wrong in every case — silently, in D2's and D3's.

---

## 9. Contract functionality with no frontend experience

Capabilities that exist on-chain and matter, but which no planned page currently owns.

| # | Capability | Why it matters | Recommendation |
|---|---|---|---|
| 1 | **`expireListing` / `expireOffer`** — permissionless | Nothing records an expiry unless someone pays gas. Without a UI affordance the chain fills with lapsed-but-`ACTIVE` records forever. | Offer a "record expiry" action on any lapsed listing/offer, open to anyone. Cheap, and it makes the effective-status layer self-healing. |
| 2 | **`expireCredential`** — permissionless | Same, for credentials. | Same treatment on `/registry`. |
| 3 | **`Escrow.withdraw(account)`** — deferred payouts | If a payout fails (USDC blacklist), funds sit claimable and **silent**. A seller or treasury could be owed money with nothing telling them. | Surface `withdrawable(me) > 0` as a persistent banner across the app, not only on the escrow page. |
| 4 | **`recoverTerminalAsset`** | The only recourse for a fat-fingered `DESTROYED` on a real airframe. Exists precisely because that mistake is unrecoverable otherwise. | Governance queue item with a prominent warning. Do not hide it. |
| 5 | **`releaseSerialNumberHash`** | The remedy for a squatted serial number. Undiscoverable without UI. | Governance queue item, reachable from the `SerialNumberTaken` error message. |
| 6 | **`OrganizationRequiresReverification`** | A verified org silently loses verification when it edits its metadata hash. | Warn **before** submitting; show the event prominently in org history. |
| 7 | **`positionOccupant`** | Lets the install form prevent `PositionOccupied` instead of reverting. | Wire into the install form as a live check. |
| 8 | **`predictEscrowAddress`** | The approval target is computable before acceptance. | Optional; useful for pre-flighting an approval. |
| 9 | **`AssetRegistry.assetIdBySerialHash`** | Duplicate-serial detection before registration. | Wire into the registration form. |
| 10 | **`DocumentRegistry.documentIdOf`** | Duplicate-document detection before upload, and the only on-chain hash lookup that exists. | Wire into the document form and the file-verification tool. Note it is per-asset, so the verification tool can only answer "does this file match *this* asset". |
| 11 | **`RoleManager.getRoleAdmin` / `setRoleAdmin`** | `SETTLEMENT_ROLE`'s admin is narrowed to `ESCROW_FACTORY_ROLE`. Misconfiguration here breaks all settlement. | Show the admin-of graph on `/protocol`. |
| 12 | **Machine-role visibility** | `SETTLEMENT_ROLE` going 0 → 1 → 0 is the clearest signal an escrow took and released an asset lock. | Authorization map on `/protocol`. |
| 13 | **`isTerminal()` on Escrow vs listing state** | An escrow can be terminal while its listing stayed `ACTIVE` via `clearEscrow`. | Show both; never infer one from the other. |
| 14 | **`Marketplace.clearEscrow` / `markSold`** | Machine-only, but their *effects* are user-visible and easily mistaken for a bug. | Explain in trade history, no controls. |

---

## 10. Integration constraints

Seven properties of the contracts that any correct client must respect.

1. **Pin every multi-read to one block height.** `componentsOf` is swap-and-pop; `getListing` at block N can contradict `isListingActive` at N+1.
2. **Use `block.timestamp`, never the browser clock.** Every deadline compares against the chain's clock.
3. **Every view function reverts on a miss.** `getPassport`, `getListing`, `getOffer`, `getAircraft`, `getComponent`, `getDocument`, `getOrganization`, `getCredential`, `getMaintenanceRecord` all revert. Batch with `allowFailure: true`.
4. **Simulate before signing.** 116 custom errors; users should essentially never see a revert.
5. **`isTransferable` is not "listable".** Verified live: `isTransferable(2) == true` for an installed engine. The block lives in `ListingManager._requireNotInstalled`.
6. **Approve the escrow clone for exactly `terms.price`.** Never the Marketplace, never unlimited.
7. **A paused `AssetOwnership` is a funding trap.** `setTransferLock` is not pause-gated but `settleTransfer` is, so a buyer can fund into a state whose only exit is a penalised timeout.

---

*Compiled from `out/` artifacts and `src/` at Sepolia block 11,493,660. No Solidity was modified.*
