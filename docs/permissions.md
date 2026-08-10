# AeroAsset Protocol — Permission Matrix

Function-level authorization. Every entry here has a corresponding positive test **and**
a negative test asserting an unauthorized caller reverts (`test/unit/**/*Access.t.sol`).

Legend — `ADMIN` = `PROTOCOL_ADMIN_ROLE` · `OWNER` = asset owner per `AssetOwnership`
· `ORG` = acting for a `VERIFIED` organization · `—` = permissionless.

---

## L0 — Protocol core

| Contract · function | Authorized | Notes |
|---|---|---|
| `ProtocolAddressRegistry.setAddress` | `ADMIN` | Timelocked. Emits old + new. |
| `ProtocolAddressRegistry.getAddress` | — | `view`; reverts on unset key. |
| `RoleManager.grantRole` / `revokeRole` | `DEFAULT_ADMIN_ROLE` | Timelock only. |
| `RoleManager.renounceRole` | self | OZ semantics. |

## L1 — Identity

| Contract · function | Authorized | Notes |
|---|---|---|
| `OrganizationRegistry.registerOrganization` | — | Self-registers to `PENDING`. Name hash must be unique. |
| `.updateOrganization` | org `admin` | Metadata only; cannot change type or status. |
| `.transferOrganizationAdmin` | org `admin` | Step 1 of 2. |
| `.acceptOrganizationAdmin` | pending admin | Step 2 of 2. |
| `.cancelOrganizationAdminTransfer` | org `admin` **or** pending admin | Either side may abandon it. |
| `.setOperator` | org `admin` | Operators may act for the org but cannot manage admins or operators. |
| `.verifyOrganization` / `.rejectOrganization` | `ORG_VERIFIER_ROLE` | |
| `.suspendOrganization` / `.reactivateOrganization` | `ORG_VERIFIER_ROLE` | |
| `.revokeOrganization` | `ADMIN` | Terminal, timelocked. |
| `CredentialRegistry.issueCredential` | `CREDENTIAL_ISSUER_ROLE` | |
| `.suspendCredential` / `.reinstateCredential` / `.revokeCredential` | `CREDENTIAL_ISSUER_ROLE` | |
| `.expireCredential` | — | Only when `expiresAt <= now`. |

## L2 — Assets

| Contract · function | Authorized | Notes |
|---|---|---|
| `AssetRegistry.registerAsset` | `ORG` | Caller must act for a `VERIFIED` org. Never sets `verifiedAt`. |
| `.registerAssetFor` | `ASSET_MINTER_ROLE` | Held only by `AircraftRegistry`/`ComponentRegistry`, which check org membership themselves. Re-checks the org is `VERIFIED`. |
| `.updateAssetMetadata` | `OWNER` or registrar `ORG` | Blocked once terminal. |
| `.setAssetStatus` | `OWNER` | Transition must be legal. Terminal status freezes ownership atomically. |
| `.verifyAsset` / `.unverifyAsset` | `ASSET_VERIFIER_ROLE` | Separate from registration. |
| `AircraftRegistry.registerAircraft` | `ORG` | Mints via `AssetRegistry` under `ASSET_MINTER_ROLE`, attaches airframe data. |
| `.updateAircraft` | `OWNER` | Model, category and tail number only. Build facts are immutable. |
| `ComponentRegistry.registerComponent` | `ORG` | Generic `AssetKind` is derived from `ComponentKind`, never caller-supplied. |
| `.installComponent` | `OWNER` of **both** component and parent | Parent must be a non-terminal `AIRCRAFT`; position must be free for that kind. |
| `.removeComponent` | `OWNER` of the component | |
| `.setComponentStatus` | `OWNER` of the component | Cannot reach `INSTALLED`. Leaving `INSTALLED` detaches. |
| `AssetOwnership.initializeOwnership` | `AssetRegistry` only | Address-registry check, not a role. |
| `.freezeTransfers` | `AssetRegistry` only | Permanent; no unfreeze exists. |
| `.initiateTransfer` | `OWNER` | Blocked while locked or frozen. |
| `.acceptTransfer` | `pendingOwner` | Blocked while frozen or past the offer deadline. |
| `.cancelTransfer` | `OWNER` or `pendingOwner` | |
| `.setTransferLock` | `SETTLEMENT_ROLE` | Taking a lock records the holder and clears any pending direct transfer. Releasing requires being that holder. |
| `.settleTransfer` | `SETTLEMENT_ROLE` **and** current lock holder | **Highest-value edge.** See the design note below. |

## L3 — Provenance

| Contract · function | Authorized | Notes |
|---|---|---|
| `DocumentRegistry.registerDocument` | `OWNER` (with `issuerOrgId == 0`) **or** acting for `issuerOrgId` | Hash non-zero and unregistered; `issuedAt` not in the future; asset non-terminal. **A caller can never attribute a document to an organization it does not act for.** |
| `.supersedeDocument` | document controller | Both documents `ACTIVE` and describing the same asset. |
| `.revokeDocument` | document controller or `ADMIN` | Terminal. Callable while paused. |
| `MaintenanceRegistry.recordMaintenance` | `ORG` **and** `MRO` type **and** valid `MAINTENANCE_AUTHORITY` credential | Three independent checks, all on-chain. A cited document must be `ACTIVE` and describe the same asset. |
| `AssetPassport.*` | — | All `view`. Zero state, zero writes, not upgradeable. |

## L4 — Transaction

| Contract · function | Authorized | Notes |
|---|---|---|
| `Marketplace.createListing` | `OWNER` | Asset not terminal, not already listed, token allowlisted. |
| `.cancelListing` | seller | Reverts if an escrow is live. |
| `.expireListing` | — | Only past `expiresAt`. |
| `.makeOffer` | any address ≠ seller | |
| `.withdrawOffer` | offer `buyer` | |
| `.acceptOffer` / `.rejectOffer` | listing `seller` | Accept opens the escrow. |
| `.expireOffer` | — | Only past `expiresAt`. |
| `.markSold` | `SETTLEMENT_ROLE` | Called by the settling escrow only. |
| `EscrowFactory.openEscrow` | `Marketplace` only | Address-registry check, not a role. |
| `Escrow.fund` | escrow `buyer` | |
| `.release` | escrow `buyer` | |
| `.cancel` | buyer or seller; anyone after `fundingDeadline` | |
| `.raiseDispute` | buyer or seller, before `settlementDeadline` | |
| `.resolveDispute` | `ARBITRATOR_ROLE` | Only from `DISPUTED`. |
| `.claimTimeout` | — | Past `settlementDeadline`. **Callable while paused.** |
| `FeeManager.setFeeBps` | `FEE_MANAGER_ROLE` | Hard-capped by a `constant`. |
| `.setTreasury` | `FEE_MANAGER_ROLE` | Non-zero. |
| `.setTokenAllowed` | `ADMIN` | Timelocked. |

## Cross-cutting

| Function | Authorized |
|---|---|
| `pause()` on any pausable module | `PAUSER_ROLE` |
| `unpause()` on any pausable module | `ADMIN` (timelocked) |
| `upgradeToAndCall` on any UUPS proxy | `ADMIN` (timelocked) |

---

## Design notes

**Why `ORG` gates registration but `OWNER` gates mutation.** Only a verified aviation
business should be able to introduce a new record into the registry — that is the
protocol's trust boundary. Once a record exists, the owner is the party with an
economic interest in its accuracy, so mutation follows ownership rather than the
original registrar. An organization losing its verification does not freeze assets it
registered for third parties.

**Why `settleTransfer` needs more than `SETTLEMENT_ROLE`.** The role alone would let
any escrow move any asset. Two further conditions close that:

1. **The caller must hold the asset's lock.** An escrow can only settle an asset it
   itself locked, so a rogue role-holder cannot touch an unlocked asset or one locked
   by a different trade.
2. **The caller must name the current owner.** `settleTransfer(assetId, from, to)`
   reverts unless `from` is still the owner, so a trade cannot complete against an
   asset that changed hands underneath it.

An earlier draft of this document required a matching `ACTIVE` listing instead. That
was dropped: it would force L2 to import the L4 `Marketplace` interface — a genuine
upward dependency — while proving less. The seller's consent is already established
two layers up (they created the listing and accepted the offer before `EscrowFactory`
would deploy the escrow at all), and the lock-holder check is strictly narrower than
"some active listing exists".

**Why organization admin transfer is two-step.** A one-step transfer to a mistyped
address permanently orphans an organization's entire asset portfolio. There is no
recovery path, so the write is made unmistakable instead.

**Why `PAUSER` cannot unpause.** See `roles.md` §2 — fast to stop, slow to restart.
