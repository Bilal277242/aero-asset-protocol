# AeroAsset Protocol — Event Catalogue

Events are the protocol's read API. Every state change emits exactly one event, and
every event carries enough data to reconstruct the new state without an RPC follow-up.

## Conventions

1. **Indexing budget.** Three indexed parameters maximum (EVM limit for named events).
   Indexed slots go to the fields an indexer filters on: the primary id, and the
   principal actor addresses/ids.
2. **`bytes32` hashes are never indexed** unless lookup-by-hash is a real access
   pattern (`DocumentRegistered.documentHash` is, because duplicate detection is a
   user-facing query).
3. **Enums are emitted as the enum type**, not `uint8`, so ABI consumers get names.
4. **Both sides of a change are emitted** for admin/config updates (`oldValue`,
   `newValue`). A monitoring system must be able to detect an unexpected change without
   holding prior state.
5. **No event is emitted on a `view` path**, and no function emits conditionally —
   a caller can rely on "the call succeeded ⟹ the event fired".

---

## L0 — Protocol core

```solidity
event ProtocolAddressSet(bytes32 indexed key, address indexed oldAddress, address indexed newAddress);
event Paused(address indexed account);      // OZ
event Unpaused(address indexed account);    // OZ
event Upgraded(address indexed implementation); // ERC-1967
```

## L1 — Identity

```solidity
event OrganizationRegistered(
    uint256 indexed orgId, address indexed admin, OrganizationType orgType, bytes32 nameHash
);
event OrganizationUpdated(uint256 indexed orgId, bytes32 metadataHash, string metadataURI);
event OrganizationStatusChanged(
    uint256 indexed orgId, OrganizationStatus indexed oldStatus, OrganizationStatus indexed newStatus, address by
);
event OrganizationAdminTransferStarted(uint256 indexed orgId, address indexed from, address indexed to);
event OrganizationAdminTransferCancelled(uint256 indexed orgId, address indexed cancelledBy);
event OrganizationAdminTransferred(uint256 indexed orgId, address indexed from, address indexed to);
event OrganizationOperatorSet(uint256 indexed orgId, address indexed operator, bool allowed);

event CredentialIssued(
    uint256 indexed credentialId, uint256 indexed issuerOrgId, address indexed subject,
    uint256 subjectOrgId, CredentialType credType, uint40 expiresAt, bytes32 credentialHash
);
event CredentialStatusChanged(
    uint256 indexed credentialId, CredentialStatus indexed oldStatus, CredentialStatus indexed newStatus, address by
);
```

## L2 — Assets

```solidity
event AssetRegistered(
    uint256 indexed assetId, uint256 indexed registrarOrgId, address indexed owner,
    AssetKind kind, bytes32 serialNumberHash
);
event AssetStatusChanged(uint256 indexed assetId, AssetStatus indexed oldStatus, AssetStatus indexed newStatus);
event AssetVerificationChanged(uint256 indexed assetId, uint256 indexed verifierOrgId, bool verified, address by);
event AssetMetadataUpdated(uint256 indexed assetId, bytes32 metadataHash, string metadataURI);

event AircraftRegistered(
    uint256 indexed assetId, uint256 indexed manufacturerOrgId, bytes32 model,
    uint16 manufactureYear, AircraftCategory category
);
event AircraftUpdated(uint256 indexed assetId, bytes32 model, bytes32 registrationMarkHash);

event ComponentRegistered(uint256 indexed assetId, ComponentKind kind, bytes32 partNumber);
event ComponentInstalled(uint256 indexed componentAssetId, uint256 indexed parentAssetId, uint16 position);
event ComponentRemoved(uint256 indexed componentAssetId, uint256 indexed previousParentAssetId);
event ComponentStatusChanged(
    uint256 indexed componentAssetId, ComponentStatus indexed oldStatus, ComponentStatus indexed newStatus
);

event OwnershipTransferStarted(uint256 indexed assetId, address indexed from, address indexed to, uint40 expiresAt);
event OwnershipTransferred(uint256 indexed assetId, address indexed from, address indexed to, bytes32 reason);
event OwnershipTransferCancelled(uint256 indexed assetId, address indexed cancelledBy);
event TransferLockChanged(uint256 indexed assetId, bool locked, address indexed by);
```

`OwnershipTransferred.reason` is a `bytes32` discriminator — `"DIRECT"` or
`"SETTLEMENT"` — so an indexer can distinguish a peer-to-peer transfer from a
marketplace settlement without correlating against escrow events.

## L3 — Provenance

```solidity
event DocumentRegistered(
    uint256 indexed documentId, uint256 indexed assetId, uint256 indexed issuerOrgId,
    DocumentType docType, bytes32 documentHash, string uri
);
event DocumentSuperseded(uint256 indexed documentId, uint256 indexed supersededById);
event DocumentRevoked(uint256 indexed documentId, address indexed by);

event MaintenanceRecorded(
    uint256 indexed recordId, uint256 indexed assetId, uint256 indexed performedByOrgId,
    MaintenanceType mType, uint40 performedAt, uint256 credentialId, uint256 documentId, bytes32 recordHash
);
```

`MaintenanceRecorded.credentialId` is emitted but **not stored** — it is the audit
trail proving which credential authorized the write at the time it happened. Storing it
would cost a slot for data no on-chain logic ever reads again.

## L4 — Transaction

```solidity
event ListingCreated(
    uint256 indexed listingId, uint256 indexed assetId, address indexed seller,
    address paymentToken, uint128 price, uint40 expiresAt
);
event ListingStatusChanged(
    uint256 indexed listingId, ListingStatus indexed oldStatus, ListingStatus indexed newStatus
);
event OfferMade(
    uint256 indexed offerId, uint256 indexed listingId, address indexed buyer, uint128 price, uint40 expiresAt
);
event OfferStatusChanged(uint256 indexed offerId, OfferStatus indexed oldStatus, OfferStatus indexed newStatus);

event EscrowOpened(
    uint256 indexed escrowId, address indexed escrow, uint256 indexed listingId,
    address buyer, address seller, uint128 price, uint128 feeAmount
);
event EscrowFunded(uint256 indexed escrowId, address indexed buyer, uint256 amount);
event EscrowStatusChanged(uint256 indexed escrowId, EscrowStatus indexed oldStatus, EscrowStatus indexed newStatus);
event EscrowSettled(
    uint256 indexed escrowId, address indexed seller, uint256 sellerProceeds, uint256 feeAmount
);
event EscrowRefunded(uint256 indexed escrowId, address indexed buyer, uint256 amount);
event DisputeRaised(uint256 indexed escrowId, address indexed raisedBy);
event DisputeResolved(uint256 indexed escrowId, address indexed arbitrator, bool releasedToSeller);

event FeeCollected(address indexed token, address indexed treasury, uint256 amount, bytes32 indexed feeType);
event FeeBpsChanged(bytes32 indexed feeType, uint16 oldBps, uint16 newBps);
event TreasuryChanged(address indexed oldTreasury, address indexed newTreasury);
event TokenAllowanceChanged(address indexed token, bool allowed);
```

---

## Indexer reconstruction guarantee

The following must be fully derivable from events alone, with no `eth_call`:

- current owner of any asset, and its complete ownership history
- an asset's full passport: identity, components, documents, maintenance, status
- every organization's and credential's current status and history
- every listing and offer's lifecycle
- every escrow's funding, settlement and dispute history, with exact amounts
- total protocol fees collected, per token and per fee type

Phase 9 validates this by replaying a Sepolia deployment's logs into a reconstructed
state and asserting it matches on-chain reads. An event that turns out to be
insufficient for reconstruction is a **bug**, fixed before mainnet — events cannot be
added to already-emitted history.
