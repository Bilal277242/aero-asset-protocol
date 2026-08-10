# AeroAsset Protocol — Custom Error Catalogue

`require` with a string is not used anywhere in `src/`. Every revert is a custom error.

## Conventions

1. **Errors carry the offending value.** `AssetNotFound(uint256 assetId)`, not
   `AssetNotFound()`. A failed transaction must be diagnosable from the trace alone.
2. **Shared errors live in `src/libraries/ProtocolErrors.sol`**; contract-specific
   errors are declared on the contract or its interface. Selector collisions across the
   protocol are checked by `test/unit/ErrorSelectors.t.sol`.
3. **State-machine violations use one shaped error per domain**
   (`InvalidOrganizationTransition(from, to)`) rather than a distinct error per illegal
   pair. Distinct-per-pair would mean hundreds of selectors and no added information.
4. **Authorization errors name the requirement, not the caller's identity** —
   `MissingRole(bytes32 role, address account)`, so an operator reading a failed
   transaction learns what to grant.

---

## Shared — `ProtocolErrors.sol`

```solidity
error ZeroAddress();
error ZeroAmount();
error ZeroHash();
error InvalidId(uint256 id);
error MissingRole(bytes32 role, address account);
error NotAuthorized(address caller);
error ContractPaused();
error ValueTooLarge(uint256 value, uint256 max);   // SafeCast boundary
error DeadlineInPast(uint40 deadline, uint40 nowTs);
error DeadlineTooFar(uint40 deadline, uint40 max);
error AddressNotRegistered(bytes32 key);
error UnexpectedCaller(address expected, address actual);
```

## Identity

```solidity
// OrganizationRegistry
error OrganizationNotFound(uint256 orgId);
error OrganizationNameTaken(bytes32 nameHash, uint256 existingOrgId);
error OrganizationNotVerified(uint256 orgId, OrganizationStatus status);
error InvalidOrganizationTransition(OrganizationStatus from, OrganizationStatus to);
error NotOrganizationAdmin(uint256 orgId, address caller);
error NotActingForOrganization(uint256 orgId, address caller);
error NoPendingAdminTransfer(uint256 orgId);
error NotPendingAdmin(uint256 orgId, address caller, address pendingAdmin);
error AdminTransferToCurrentAdmin(uint256 orgId);
error InvalidOrganizationType(OrganizationType provided);

// CredentialRegistry
error CredentialNotFound(uint256 credentialId);
error CredentialNotValid(uint256 credentialId, CredentialStatus status);
error CredentialExpired(uint256 credentialId, uint40 expiresAt);
error CredentialNotExpired(uint256 credentialId, uint40 expiresAt);
error InvalidCredentialTransition(CredentialStatus from, CredentialStatus to);
error InvalidCredentialSubject();          // subject address and subjectOrgId both zero
error InvalidCredentialType(CredentialType provided);
error SubjectOrganizationNotVerified(uint256 orgId);
error IssuerOrganizationNotFound(uint256 orgId);
error DuplicateValidCredential(uint256 subjectOrgId, CredentialType credType, uint256 existingCredentialId);
```

## Assets

```solidity
// AssetRegistry
error AssetNotFound(uint256 assetId);
error SerialNumberTaken(bytes32 serialHash, uint256 existingAssetId);
error InvalidAssetTransition(AssetStatus from, AssetStatus to);
error AssetTerminal(uint256 assetId, AssetStatus status);
error InvalidAssetKind(AssetKind expected, AssetKind actual);
error AssetAlreadyVerified(uint256 assetId);
error AssetNotVerified(uint256 assetId);

// AircraftRegistry
error AircraftNotFound(uint256 assetId);
error InvalidManufactureYear(uint16 year);

// ComponentRegistry
error ComponentNotFound(uint256 assetId);
error ComponentNotInstalled(uint256 assetId);
error ComponentAlreadyInstalled(uint256 assetId, uint256 parentAssetId);
error InvalidComponentTransition(ComponentStatus from, ComponentStatus to);
error PositionOccupied(uint256 parentAssetId, ComponentKind kind, uint16 position);
error ParentNotAircraft(uint256 parentAssetId, AssetKind kind);
error SelfInstallation(uint256 assetId);

// AssetOwnership
error NotAssetOwner(uint256 assetId, address caller, address owner);
error NoPendingTransfer(uint256 assetId);
error NotPendingOwner(uint256 assetId, address caller, address pendingOwner);
error TransferToCurrentOwner(uint256 assetId);
error AssetTransferLocked(uint256 assetId);
error TransferOfferExpired(uint256 assetId, uint40 expiresAt);
error SellerNoLongerOwner(uint256 assetId, address expectedSeller, address actualOwner);
```

## Provenance

```solidity
// DocumentRegistry
error DocumentNotFound(uint256 documentId);
error DocumentHashTaken(bytes32 documentHash, uint256 existingDocumentId);
error DocumentNotActive(uint256 documentId, DocumentStatus status);
error DocumentAssetMismatch(uint256 documentId, uint256 expectedAssetId, uint256 actualAssetId);
error InvalidDocumentType(DocumentType provided);
error IssuedAtInFuture(uint40 issuedAt, uint40 nowTs);

// MaintenanceRegistry
error MaintenanceRecordNotFound(uint256 recordId);
error NotAuthorizedMro(uint256 orgId, OrganizationType orgType);
error NoValidMaintenanceCredential(uint256 orgId);
error PerformedAtInFuture(uint40 performedAt, uint40 nowTs);
error InvalidMaintenanceType(MaintenanceType provided);
```

## Transaction

```solidity
// Marketplace
error ListingNotFound(uint256 listingId);
error ListingNotActive(uint256 listingId, ListingStatus status);
error InvalidListingTransition(ListingStatus from, ListingStatus to);
error AssetAlreadyListed(uint256 assetId, uint256 existingListingId);
error ListingNotExpired(uint256 listingId, uint40 expiresAt);
error EscrowInProgress(uint256 listingId, uint256 escrowId);
error TokenNotAllowed(address token);
error PriceTooLow(uint128 price, uint128 minimum);

error OfferNotFound(uint256 offerId);
error OfferNotActive(uint256 offerId, OfferStatus status);
error InvalidOfferTransition(OfferStatus from, OfferStatus to);
error SelfOffer(address buyer);
error NotOfferBuyer(uint256 offerId, address caller);
error OfferNotExpired(uint256 offerId, uint40 expiresAt);

// EscrowFactory / Escrow
error EscrowNotFound(uint256 escrowId);
error InvalidEscrowTransition(EscrowStatus from, EscrowStatus to);
error NotEscrowBuyer(address caller, address buyer);
error NotEscrowParty(address caller);
error EscrowAlreadyFunded(uint256 escrowId);
error IncorrectFundingAmount(uint256 expected, uint256 received);
error FundingDeadlinePassed(uint40 deadline, uint40 nowTs);
error SettlementDeadlineNotPassed(uint40 deadline, uint40 nowTs);
error SettlementDeadlinePassed(uint40 deadline, uint40 nowTs);
error EscrowNotDisputed(uint256 escrowId, EscrowStatus status);
error CloneAddressMismatch(address predicted, address deployed);

// FeeManager
error FeeExceedsMaximum(uint16 requested, uint16 maximum);
error UnknownFeeType(bytes32 feeType);
error FeeAccountingMismatch(uint256 expected, uint256 actual);
```

---

## Testing requirement

Every error above must be reachable and have at least one test that triggers it via
`vm.expectRevert(abi.encodeWithSelector(...))` **including its arguments**. Asserting
only the selector would let a wrong-value bug pass silently.

`test/unit/ErrorSelectors.t.sol` additionally asserts that no two error signatures in
`src/` share a 4-byte selector — a collision would make two distinct failures
indistinguishable in a trace.
