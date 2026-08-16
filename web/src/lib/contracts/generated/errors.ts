// GENERATED FILE - DO NOT EDIT.
// Produced by `npm run codegen` from every {type:'error'} entry across the sixteen deployed ABIs.
// Re-run codegen after any contract change; CI fails on a diff.

/**
 * Every custom error the protocol can revert with, as one ABI.
 *
 * Pass this to viem's `decodeErrorResult` or `BaseError.walk` to turn a raw revert
 * into a named error with typed arguments.
 */
export const protocolErrorAbi = [
  {
    "type": "error",
    "name": "AccessControlBadConfirmation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AccessControlUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "neededRole",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "AddressEmptyCode",
    "inputs": [
      {
        "name": "target",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "AddressNotRegistered",
    "inputs": [
      {
        "name": "key",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "AdminTransferToCurrentAdmin",
    "inputs": [
      {
        "name": "orgId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "AircraftNotFound",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "AssetAlreadyListed",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "existingListingId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "AssetAlreadyLocked",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "lockedBy",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "AssetAlreadyVerified",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "AssetLockedBySettlement",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "lockHolder",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "AssetNotFound",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "AssetNotTerminal",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum IAssetRegistry.AssetStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "AssetNotTransferable",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "AssetNotVerified",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "AssetTerminal",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum IAssetRegistry.AssetStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "AssetTransferFrozen",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "AssetTransferLocked",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "lockedBy",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "CannotReadministerDefaultAdmin",
    "inputs": []
  },
  {
    "type": "error",
    "name": "CloneAddressMismatch",
    "inputs": [
      {
        "name": "predicted",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "deployed",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ComponentAlreadyInstalled",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "parentAssetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ComponentIsInstalled",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "parentAssetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ComponentNotFound",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ComponentNotInstalled",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "CredentialExpired",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiresAt",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "CredentialNotExpired",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiresAt",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "CredentialNotFound",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "CredentialNotValid",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum ICredentialRegistry.CredentialStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "DeadlineInPast",
    "inputs": [
      {
        "name": "deadline",
        "type": "uint40",
        "internalType": "uint40"
      },
      {
        "name": "nowTs",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "DeadlineTooFar",
    "inputs": [
      {
        "name": "deadline",
        "type": "uint40",
        "internalType": "uint40"
      },
      {
        "name": "max",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "DisputeDeadlineNotPassed",
    "inputs": [
      {
        "name": "deadline",
        "type": "uint40",
        "internalType": "uint40"
      },
      {
        "name": "nowTs",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "DocumentAssetMismatch",
    "inputs": [
      {
        "name": "documentId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expectedAssetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "actualAssetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "DocumentHashTaken",
    "inputs": [
      {
        "name": "documentHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "existingDocumentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "DocumentNotActive",
    "inputs": [
      {
        "name": "documentId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum IDocumentRegistry.DocumentStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "DocumentNotFound",
    "inputs": [
      {
        "name": "documentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "DuplicateValidCredential",
    "inputs": [
      {
        "name": "subjectOrgId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "credType",
        "type": "uint8",
        "internalType": "enum ICredentialRegistry.CredentialType"
      },
      {
        "name": "existingCredentialId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1967InvalidImplementation",
    "inputs": [
      {
        "name": "implementation",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1967NonPayable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EnforcedPause",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EscrowInProgress",
    "inputs": [
      {
        "name": "listingId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "escrowId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "EscrowNotFound",
    "inputs": [
      {
        "name": "escrowId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ExpectedPause",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FailedCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FailedDeployment",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FeeExceedsMaximum",
    "inputs": [
      {
        "name": "requested",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "maximum",
        "type": "uint16",
        "internalType": "uint16"
      }
    ]
  },
  {
    "type": "error",
    "name": "FeeExceedsPrice",
    "inputs": [
      {
        "name": "feeAmount",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "price",
        "type": "uint128",
        "internalType": "uint128"
      }
    ]
  },
  {
    "type": "error",
    "name": "FundingDeadlineNotPassed",
    "inputs": [
      {
        "name": "deadline",
        "type": "uint40",
        "internalType": "uint40"
      },
      {
        "name": "nowTs",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "FundingDeadlinePassed",
    "inputs": [
      {
        "name": "deadline",
        "type": "uint40",
        "internalType": "uint40"
      },
      {
        "name": "nowTs",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "IncorrectFundingAmount",
    "inputs": [
      {
        "name": "expected",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "received",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsufficientBalance",
    "inputs": [
      {
        "name": "balance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidAircraftCategory",
    "inputs": [
      {
        "name": "provided",
        "type": "uint8",
        "internalType": "enum IAircraftRegistry.AircraftCategory"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidAssetKind",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expected",
        "type": "uint8",
        "internalType": "enum IAssetRegistry.AssetKind"
      },
      {
        "name": "actual",
        "type": "uint8",
        "internalType": "enum IAssetRegistry.AssetKind"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidAssetTransition",
    "inputs": [
      {
        "name": "from",
        "type": "uint8",
        "internalType": "enum IAssetRegistry.AssetStatus"
      },
      {
        "name": "to",
        "type": "uint8",
        "internalType": "enum IAssetRegistry.AssetStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidComponentKind",
    "inputs": [
      {
        "name": "provided",
        "type": "uint8",
        "internalType": "enum IComponentRegistry.ComponentKind"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidComponentTransition",
    "inputs": [
      {
        "name": "from",
        "type": "uint8",
        "internalType": "enum IComponentRegistry.ComponentStatus"
      },
      {
        "name": "to",
        "type": "uint8",
        "internalType": "enum IComponentRegistry.ComponentStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidCredentialSubject",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidCredentialTransition",
    "inputs": [
      {
        "name": "from",
        "type": "uint8",
        "internalType": "enum ICredentialRegistry.CredentialStatus"
      },
      {
        "name": "to",
        "type": "uint8",
        "internalType": "enum ICredentialRegistry.CredentialStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidCredentialType",
    "inputs": [
      {
        "name": "provided",
        "type": "uint8",
        "internalType": "enum ICredentialRegistry.CredentialType"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidDocumentType",
    "inputs": [
      {
        "name": "provided",
        "type": "uint8",
        "internalType": "enum IDocumentRegistry.DocumentType"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidEscrowTransition",
    "inputs": [
      {
        "name": "from",
        "type": "uint8",
        "internalType": "enum IEscrow.EscrowStatus"
      },
      {
        "name": "to",
        "type": "uint8",
        "internalType": "enum IEscrow.EscrowStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidInitialization",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidListingTransition",
    "inputs": [
      {
        "name": "from",
        "type": "uint8",
        "internalType": "enum IMarketplace.ListingStatus"
      },
      {
        "name": "to",
        "type": "uint8",
        "internalType": "enum IMarketplace.ListingStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidMaintenanceType",
    "inputs": [
      {
        "name": "provided",
        "type": "uint8",
        "internalType": "enum IMaintenanceRegistry.MaintenanceType"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidManufactureYear",
    "inputs": [
      {
        "name": "year",
        "type": "uint16",
        "internalType": "uint16"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidOfferTransition",
    "inputs": [
      {
        "name": "from",
        "type": "uint8",
        "internalType": "enum IMarketplace.OfferStatus"
      },
      {
        "name": "to",
        "type": "uint8",
        "internalType": "enum IMarketplace.OfferStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidOrganizationTransition",
    "inputs": [
      {
        "name": "from",
        "type": "uint8",
        "internalType": "enum IOrganizationRegistry.OrganizationStatus"
      },
      {
        "name": "to",
        "type": "uint8",
        "internalType": "enum IOrganizationRegistry.OrganizationStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidOrganizationType",
    "inputs": [
      {
        "name": "provided",
        "type": "uint8",
        "internalType": "enum IOrganizationRegistry.OrganizationType"
      }
    ]
  },
  {
    "type": "error",
    "name": "IssuedAtInFuture",
    "inputs": [
      {
        "name": "issuedAt",
        "type": "uint40",
        "internalType": "uint40"
      },
      {
        "name": "nowTs",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "IssuerOrganizationNotFound",
    "inputs": [
      {
        "name": "orgId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "LastProtocolAdmin",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ListingNotActive",
    "inputs": [
      {
        "name": "listingId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum IMarketplace.ListingStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "ListingNotExpired",
    "inputs": [
      {
        "name": "listingId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiresAt",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "ListingNotFound",
    "inputs": [
      {
        "name": "listingId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "MaintenanceRecordNotFound",
    "inputs": [
      {
        "name": "recordId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "MissingManufacturer",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MissingRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NoPendingAdminTransfer",
    "inputs": [
      {
        "name": "orgId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NoPendingTransfer",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NoSerialNumberRecorded",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NoValidMaintenanceCredential",
    "inputs": [
      {
        "name": "orgId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotActingForOrganization",
    "inputs": [
      {
        "name": "orgId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotAssetController",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotAssetOwner",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotAuthorizedMro",
    "inputs": [
      {
        "name": "orgId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "orgType",
        "type": "uint8",
        "internalType": "enum IOrganizationRegistry.OrganizationType"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotDocumentController",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotEscrowBuyer",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "buyer",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotEscrowParty",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotInitializing",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotListingSeller",
    "inputs": [
      {
        "name": "listingId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotLockHolder",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "lockedBy",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotOfferBuyer",
    "inputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotOrganizationAdmin",
    "inputs": [
      {
        "name": "orgId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotPendingAdmin",
    "inputs": [
      {
        "name": "orgId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "pendingAdmin",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotPendingOwner",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "pendingOwner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NothingToWithdraw",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OfferListingMismatch",
    "inputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expectedListingId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "actualListingId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "OfferNotActive",
    "inputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum IMarketplace.OfferStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "OfferNotExpired",
    "inputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiresAt",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "OfferNotFound",
    "inputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "OrganizationNameTaken",
    "inputs": [
      {
        "name": "nameHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "existingOrgId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "OrganizationNotFound",
    "inputs": [
      {
        "name": "orgId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "OrganizationNotVerified",
    "inputs": [
      {
        "name": "orgId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum IOrganizationRegistry.OrganizationStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnershipAlreadyInitialized",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnershipNotFound",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ParentNotAircraft",
    "inputs": [
      {
        "name": "parentAssetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "PerformedAtInFuture",
    "inputs": [
      {
        "name": "performedAt",
        "type": "uint40",
        "internalType": "uint40"
      },
      {
        "name": "nowTs",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "PositionOccupied",
    "inputs": [
      {
        "name": "parentAssetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "kind",
        "type": "uint8",
        "internalType": "enum IComponentRegistry.ComponentKind"
      },
      {
        "name": "position",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "occupantAssetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "PriceTooLow",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "SelfInstallation",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SelfOffer",
    "inputs": [
      {
        "name": "seller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "SelfSupersede",
    "inputs": [
      {
        "name": "documentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SellerNoLongerOwner",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expectedSeller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "actualOwner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "SerialNumberNotHeld",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "serialNumberHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "SerialNumberTaken",
    "inputs": [
      {
        "name": "serialHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "existingAssetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SettlementDeadlineNotPassed",
    "inputs": [
      {
        "name": "deadline",
        "type": "uint40",
        "internalType": "uint40"
      },
      {
        "name": "nowTs",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "SettlementDeadlinePassed",
    "inputs": [
      {
        "name": "deadline",
        "type": "uint40",
        "internalType": "uint40"
      },
      {
        "name": "nowTs",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "SubjectOrganizationNotVerified",
    "inputs": [
      {
        "name": "orgId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "TimelockInsufficientDelay",
    "inputs": [
      {
        "name": "delay",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minDelay",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "TimelockInvalidOperationLength",
    "inputs": [
      {
        "name": "targets",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "payloads",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "values",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "TimelockUnauthorizedCaller",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "TimelockUnexecutedPredecessor",
    "inputs": [
      {
        "name": "predecessorId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "TimelockUnexpectedOperationState",
    "inputs": [
      {
        "name": "operationId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "expectedStates",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "TokenNotAllowed",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "TransferOfferExpired",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiresAt",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "TransferToCurrentOwner",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "UUPSUnauthorizedCallContext",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UUPSUnsupportedProxiableUUID",
    "inputs": [
      {
        "name": "slot",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnexpectedCaller",
    "inputs": [
      {
        "name": "expected",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "actual",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnexpectedOwner",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expectedOwner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "actualOwner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnspecifiedAssetKind",
    "inputs": [
      {
        "name": "provided",
        "type": "uint8",
        "internalType": "enum IAssetRegistry.AssetKind"
      }
    ]
  },
  {
    "type": "error",
    "name": "UseInstallComponent",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ValueTooLarge",
    "inputs": [
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "max",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroHash",
    "inputs": []
  }
] as const;

/** Signatures, for coverage checks against the copy table. */
export const protocolErrorSignatures = [
  "AccessControlBadConfirmation()",
  "AccessControlUnauthorizedAccount(address,bytes32)",
  "AddressEmptyCode(address)",
  "AddressNotRegistered(bytes32)",
  "AdminTransferToCurrentAdmin(uint256)",
  "AircraftNotFound(uint256)",
  "AssetAlreadyListed(uint256,uint256)",
  "AssetAlreadyLocked(uint256,address)",
  "AssetAlreadyVerified(uint256)",
  "AssetLockedBySettlement(uint256,address)",
  "AssetNotFound(uint256)",
  "AssetNotTerminal(uint256,uint8)",
  "AssetNotTransferable(uint256)",
  "AssetNotVerified(uint256)",
  "AssetTerminal(uint256,uint8)",
  "AssetTransferFrozen(uint256)",
  "AssetTransferLocked(uint256,address)",
  "CannotReadministerDefaultAdmin()",
  "CloneAddressMismatch(address,address)",
  "ComponentAlreadyInstalled(uint256,uint256)",
  "ComponentIsInstalled(uint256,uint256)",
  "ComponentNotFound(uint256)",
  "ComponentNotInstalled(uint256)",
  "CredentialExpired(uint256,uint40)",
  "CredentialNotExpired(uint256,uint40)",
  "CredentialNotFound(uint256)",
  "CredentialNotValid(uint256,uint8)",
  "DeadlineInPast(uint40,uint40)",
  "DeadlineTooFar(uint40,uint40)",
  "DisputeDeadlineNotPassed(uint40,uint40)",
  "DocumentAssetMismatch(uint256,uint256,uint256)",
  "DocumentHashTaken(bytes32,uint256)",
  "DocumentNotActive(uint256,uint8)",
  "DocumentNotFound(uint256)",
  "DuplicateValidCredential(uint256,uint8,uint256)",
  "ERC1967InvalidImplementation(address)",
  "ERC1967NonPayable()",
  "EnforcedPause()",
  "EscrowInProgress(uint256,uint256)",
  "EscrowNotFound(uint256)",
  "ExpectedPause()",
  "FailedCall()",
  "FailedDeployment()",
  "FeeExceedsMaximum(uint16,uint16)",
  "FeeExceedsPrice(uint128,uint128)",
  "FundingDeadlineNotPassed(uint40,uint40)",
  "FundingDeadlinePassed(uint40,uint40)",
  "IncorrectFundingAmount(uint256,uint256)",
  "InsufficientBalance(uint256,uint256)",
  "InvalidAircraftCategory(uint8)",
  "InvalidAssetKind(uint256,uint8,uint8)",
  "InvalidAssetTransition(uint8,uint8)",
  "InvalidComponentKind(uint8)",
  "InvalidComponentTransition(uint8,uint8)",
  "InvalidCredentialSubject()",
  "InvalidCredentialTransition(uint8,uint8)",
  "InvalidCredentialType(uint8)",
  "InvalidDocumentType(uint8)",
  "InvalidEscrowTransition(uint8,uint8)",
  "InvalidInitialization()",
  "InvalidListingTransition(uint8,uint8)",
  "InvalidMaintenanceType(uint8)",
  "InvalidManufactureYear(uint16)",
  "InvalidOfferTransition(uint8,uint8)",
  "InvalidOrganizationTransition(uint8,uint8)",
  "InvalidOrganizationType(uint8)",
  "IssuedAtInFuture(uint40,uint40)",
  "IssuerOrganizationNotFound(uint256)",
  "LastProtocolAdmin()",
  "ListingNotActive(uint256,uint8)",
  "ListingNotExpired(uint256,uint40)",
  "ListingNotFound(uint256)",
  "MaintenanceRecordNotFound(uint256)",
  "MissingManufacturer()",
  "MissingRole(bytes32,address)",
  "NoPendingAdminTransfer(uint256)",
  "NoPendingTransfer(uint256)",
  "NoSerialNumberRecorded(uint256)",
  "NoValidMaintenanceCredential(uint256)",
  "NotActingForOrganization(uint256,address)",
  "NotAssetController(uint256,address)",
  "NotAssetOwner(uint256,address,address)",
  "NotAuthorizedMro(uint256,uint8)",
  "NotDocumentController(uint256,address)",
  "NotEscrowBuyer(address,address)",
  "NotEscrowParty(address)",
  "NotInitializing()",
  "NotListingSeller(uint256,address)",
  "NotLockHolder(uint256,address,address)",
  "NotOfferBuyer(uint256,address)",
  "NotOrganizationAdmin(uint256,address)",
  "NotPendingAdmin(uint256,address,address)",
  "NotPendingOwner(uint256,address,address)",
  "NothingToWithdraw(address)",
  "OfferListingMismatch(uint256,uint256,uint256)",
  "OfferNotActive(uint256,uint8)",
  "OfferNotExpired(uint256,uint40)",
  "OfferNotFound(uint256)",
  "OrganizationNameTaken(bytes32,uint256)",
  "OrganizationNotFound(uint256)",
  "OrganizationNotVerified(uint256,uint8)",
  "OwnershipAlreadyInitialized(uint256)",
  "OwnershipNotFound(uint256)",
  "ParentNotAircraft(uint256)",
  "PerformedAtInFuture(uint40,uint40)",
  "PositionOccupied(uint256,uint8,uint16,uint256)",
  "PriceTooLow()",
  "ReentrancyGuardReentrantCall()",
  "SafeERC20FailedOperation(address)",
  "SelfInstallation(uint256)",
  "SelfOffer(address)",
  "SelfSupersede(uint256)",
  "SellerNoLongerOwner(uint256,address,address)",
  "SerialNumberNotHeld(uint256,bytes32)",
  "SerialNumberTaken(bytes32,uint256)",
  "SettlementDeadlineNotPassed(uint40,uint40)",
  "SettlementDeadlinePassed(uint40,uint40)",
  "SubjectOrganizationNotVerified(uint256)",
  "TimelockInsufficientDelay(uint256,uint256)",
  "TimelockInvalidOperationLength(uint256,uint256,uint256)",
  "TimelockUnauthorizedCaller(address)",
  "TimelockUnexecutedPredecessor(bytes32)",
  "TimelockUnexpectedOperationState(bytes32,bytes32)",
  "TokenNotAllowed(address)",
  "TransferOfferExpired(uint256,uint40)",
  "TransferToCurrentOwner(uint256)",
  "UUPSUnauthorizedCallContext()",
  "UUPSUnsupportedProxiableUUID(bytes32)",
  "UnexpectedCaller(address,address)",
  "UnexpectedOwner(uint256,address,address)",
  "UnspecifiedAssetKind(uint8)",
  "UseInstallComponent()",
  "ValueTooLarge(uint256,uint256)",
  "ZeroAddress()",
  "ZeroHash()"
] as const;

/** Which contracts declare each error. Useful when an error name is ambiguous. */
export const protocolErrorOwners: Record<string, string[]> = {
  "AccessControlBadConfirmation()": [
    "ProtocolTimelock",
    "RoleManager"
  ],
  "AccessControlUnauthorizedAccount(address,bytes32)": [
    "ProtocolTimelock",
    "RoleManager"
  ],
  "AddressEmptyCode(address)": [
    "AircraftRegistry",
    "AssetOwnership",
    "AssetRegistry",
    "ComponentRegistry",
    "CredentialRegistry",
    "DocumentRegistry",
    "MaintenanceRegistry",
    "Marketplace",
    "OrganizationRegistry"
  ],
  "AddressNotRegistered(bytes32)": [
    "ProtocolAddressRegistry"
  ],
  "AdminTransferToCurrentAdmin(uint256)": [
    "OrganizationRegistry"
  ],
  "AircraftNotFound(uint256)": [
    "AircraftRegistry"
  ],
  "AssetAlreadyListed(uint256,uint256)": [
    "Marketplace"
  ],
  "AssetAlreadyLocked(uint256,address)": [
    "AssetOwnership"
  ],
  "AssetAlreadyVerified(uint256)": [
    "AssetRegistry"
  ],
  "AssetLockedBySettlement(uint256,address)": [
    "AssetRegistry"
  ],
  "AssetNotFound(uint256)": [
    "AssetRegistry"
  ],
  "AssetNotTerminal(uint256,uint8)": [
    "AssetRegistry"
  ],
  "AssetNotTransferable(uint256)": [
    "Marketplace"
  ],
  "AssetNotVerified(uint256)": [
    "AssetRegistry",
    "Marketplace"
  ],
  "AssetTerminal(uint256,uint8)": [
    "AircraftRegistry",
    "AssetRegistry",
    "ComponentRegistry",
    "DocumentRegistry",
    "MaintenanceRegistry",
    "Marketplace"
  ],
  "AssetTransferFrozen(uint256)": [
    "AssetOwnership"
  ],
  "AssetTransferLocked(uint256,address)": [
    "AssetOwnership"
  ],
  "CannotReadministerDefaultAdmin()": [
    "RoleManager"
  ],
  "CloneAddressMismatch(address,address)": [
    "EscrowFactory"
  ],
  "ComponentAlreadyInstalled(uint256,uint256)": [
    "ComponentRegistry"
  ],
  "ComponentIsInstalled(uint256,uint256)": [
    "Marketplace"
  ],
  "ComponentNotFound(uint256)": [
    "ComponentRegistry"
  ],
  "ComponentNotInstalled(uint256)": [
    "ComponentRegistry"
  ],
  "CredentialExpired(uint256,uint40)": [
    "CredentialRegistry"
  ],
  "CredentialNotExpired(uint256,uint40)": [
    "CredentialRegistry"
  ],
  "CredentialNotFound(uint256)": [
    "CredentialRegistry"
  ],
  "CredentialNotValid(uint256,uint8)": [
    "CredentialRegistry"
  ],
  "DeadlineInPast(uint40,uint40)": [
    "AssetOwnership",
    "CredentialRegistry",
    "Marketplace"
  ],
  "DeadlineTooFar(uint40,uint40)": [
    "Marketplace"
  ],
  "DisputeDeadlineNotPassed(uint40,uint40)": [
    "Escrow"
  ],
  "DocumentAssetMismatch(uint256,uint256,uint256)": [
    "DocumentRegistry",
    "MaintenanceRegistry"
  ],
  "DocumentHashTaken(bytes32,uint256)": [
    "DocumentRegistry"
  ],
  "DocumentNotActive(uint256,uint8)": [
    "DocumentRegistry",
    "MaintenanceRegistry"
  ],
  "DocumentNotFound(uint256)": [
    "DocumentRegistry"
  ],
  "DuplicateValidCredential(uint256,uint8,uint256)": [
    "CredentialRegistry"
  ],
  "ERC1967InvalidImplementation(address)": [
    "AircraftRegistry",
    "AssetOwnership",
    "AssetRegistry",
    "ComponentRegistry",
    "CredentialRegistry",
    "DocumentRegistry",
    "MaintenanceRegistry",
    "Marketplace",
    "OrganizationRegistry"
  ],
  "ERC1967NonPayable()": [
    "AircraftRegistry",
    "AssetOwnership",
    "AssetRegistry",
    "ComponentRegistry",
    "CredentialRegistry",
    "DocumentRegistry",
    "MaintenanceRegistry",
    "Marketplace",
    "OrganizationRegistry"
  ],
  "EnforcedPause()": [
    "AircraftRegistry",
    "AssetOwnership",
    "AssetRegistry",
    "ComponentRegistry",
    "CredentialRegistry",
    "DocumentRegistry",
    "MaintenanceRegistry",
    "Marketplace",
    "OrganizationRegistry"
  ],
  "EscrowInProgress(uint256,uint256)": [
    "Marketplace"
  ],
  "EscrowNotFound(uint256)": [
    "EscrowFactory"
  ],
  "ExpectedPause()": [
    "AircraftRegistry",
    "AssetOwnership",
    "AssetRegistry",
    "ComponentRegistry",
    "CredentialRegistry",
    "DocumentRegistry",
    "MaintenanceRegistry",
    "Marketplace",
    "OrganizationRegistry"
  ],
  "FailedCall()": [
    "AircraftRegistry",
    "AssetOwnership",
    "AssetRegistry",
    "ComponentRegistry",
    "CredentialRegistry",
    "DocumentRegistry",
    "MaintenanceRegistry",
    "Marketplace",
    "OrganizationRegistry",
    "ProtocolTimelock"
  ],
  "FailedDeployment()": [
    "EscrowFactory"
  ],
  "FeeExceedsMaximum(uint16,uint16)": [
    "FeeManager"
  ],
  "FeeExceedsPrice(uint128,uint128)": [
    "Escrow"
  ],
  "FundingDeadlineNotPassed(uint40,uint40)": [
    "Escrow"
  ],
  "FundingDeadlinePassed(uint40,uint40)": [
    "Escrow"
  ],
  "IncorrectFundingAmount(uint256,uint256)": [
    "Escrow"
  ],
  "InsufficientBalance(uint256,uint256)": [
    "EscrowFactory"
  ],
  "InvalidAircraftCategory(uint8)": [
    "AircraftRegistry"
  ],
  "InvalidAssetKind(uint256,uint8,uint8)": [
    "AssetRegistry"
  ],
  "InvalidAssetTransition(uint8,uint8)": [
    "AssetRegistry"
  ],
  "InvalidComponentKind(uint8)": [
    "ComponentRegistry"
  ],
  "InvalidComponentTransition(uint8,uint8)": [
    "ComponentRegistry"
  ],
  "InvalidCredentialSubject()": [
    "CredentialRegistry"
  ],
  "InvalidCredentialTransition(uint8,uint8)": [
    "CredentialRegistry"
  ],
  "InvalidCredentialType(uint8)": [
    "CredentialRegistry"
  ],
  "InvalidDocumentType(uint8)": [
    "DocumentRegistry"
  ],
  "InvalidEscrowTransition(uint8,uint8)": [
    "Escrow"
  ],
  "InvalidInitialization()": [
    "AircraftRegistry",
    "AssetOwnership",
    "AssetRegistry",
    "ComponentRegistry",
    "CredentialRegistry",
    "DocumentRegistry",
    "Escrow",
    "MaintenanceRegistry",
    "Marketplace",
    "OrganizationRegistry"
  ],
  "InvalidListingTransition(uint8,uint8)": [
    "Marketplace"
  ],
  "InvalidMaintenanceType(uint8)": [
    "MaintenanceRegistry"
  ],
  "InvalidManufactureYear(uint16)": [
    "AircraftRegistry"
  ],
  "InvalidOfferTransition(uint8,uint8)": [
    "Marketplace"
  ],
  "InvalidOrganizationTransition(uint8,uint8)": [
    "OrganizationRegistry"
  ],
  "InvalidOrganizationType(uint8)": [
    "OrganizationRegistry"
  ],
  "IssuedAtInFuture(uint40,uint40)": [
    "DocumentRegistry"
  ],
  "IssuerOrganizationNotFound(uint256)": [
    "CredentialRegistry"
  ],
  "LastProtocolAdmin()": [
    "RoleManager"
  ],
  "ListingNotActive(uint256,uint8)": [
    "Marketplace"
  ],
  "ListingNotExpired(uint256,uint40)": [
    "Marketplace"
  ],
  "ListingNotFound(uint256)": [
    "Marketplace"
  ],
  "MaintenanceRecordNotFound(uint256)": [
    "MaintenanceRegistry"
  ],
  "MissingManufacturer()": [
    "AircraftRegistry"
  ],
  "MissingRole(bytes32,address)": [
    "AircraftRegistry",
    "AssetOwnership",
    "AssetRegistry",
    "ComponentRegistry",
    "CredentialRegistry",
    "DocumentRegistry",
    "Escrow",
    "FeeManager",
    "MaintenanceRegistry",
    "Marketplace",
    "OrganizationRegistry",
    "ProtocolAddressRegistry",
    "RoleManager"
  ],
  "NoPendingAdminTransfer(uint256)": [
    "OrganizationRegistry"
  ],
  "NoPendingTransfer(uint256)": [
    "AssetOwnership"
  ],
  "NoSerialNumberRecorded(uint256)": [
    "AssetRegistry"
  ],
  "NoValidMaintenanceCredential(uint256)": [
    "MaintenanceRegistry"
  ],
  "NotActingForOrganization(uint256,address)": [
    "OrganizationRegistry"
  ],
  "NotAssetController(uint256,address)": [
    "AssetRegistry"
  ],
  "NotAssetOwner(uint256,address,address)": [
    "AssetOwnership"
  ],
  "NotAuthorizedMro(uint256,uint8)": [
    "MaintenanceRegistry"
  ],
  "NotDocumentController(uint256,address)": [
    "DocumentRegistry"
  ],
  "NotEscrowBuyer(address,address)": [
    "Escrow"
  ],
  "NotEscrowParty(address)": [
    "Escrow"
  ],
  "NotInitializing()": [
    "AircraftRegistry",
    "AssetOwnership",
    "AssetRegistry",
    "ComponentRegistry",
    "CredentialRegistry",
    "DocumentRegistry",
    "Escrow",
    "MaintenanceRegistry",
    "Marketplace",
    "OrganizationRegistry"
  ],
  "NotListingSeller(uint256,address)": [
    "Marketplace"
  ],
  "NotLockHolder(uint256,address,address)": [
    "AssetOwnership"
  ],
  "NotOfferBuyer(uint256,address)": [
    "Marketplace"
  ],
  "NotOrganizationAdmin(uint256,address)": [
    "OrganizationRegistry"
  ],
  "NotPendingAdmin(uint256,address,address)": [
    "OrganizationRegistry"
  ],
  "NotPendingOwner(uint256,address,address)": [
    "AssetOwnership"
  ],
  "NothingToWithdraw(address)": [
    "Escrow"
  ],
  "OfferListingMismatch(uint256,uint256,uint256)": [
    "Marketplace"
  ],
  "OfferNotActive(uint256,uint8)": [
    "Marketplace"
  ],
  "OfferNotExpired(uint256,uint40)": [
    "Marketplace"
  ],
  "OfferNotFound(uint256)": [
    "Marketplace"
  ],
  "OrganizationNameTaken(bytes32,uint256)": [
    "OrganizationRegistry"
  ],
  "OrganizationNotFound(uint256)": [
    "OrganizationRegistry"
  ],
  "OrganizationNotVerified(uint256,uint8)": [
    "AssetRegistry",
    "OrganizationRegistry"
  ],
  "OwnershipAlreadyInitialized(uint256)": [
    "AssetOwnership"
  ],
  "OwnershipNotFound(uint256)": [
    "AssetOwnership"
  ],
  "ParentNotAircraft(uint256)": [
    "ComponentRegistry"
  ],
  "PerformedAtInFuture(uint40,uint40)": [
    "MaintenanceRegistry"
  ],
  "PositionOccupied(uint256,uint8,uint16,uint256)": [
    "ComponentRegistry"
  ],
  "PriceTooLow()": [
    "Marketplace"
  ],
  "ReentrancyGuardReentrantCall()": [
    "Escrow",
    "Marketplace"
  ],
  "SafeERC20FailedOperation(address)": [
    "Escrow"
  ],
  "SelfInstallation(uint256)": [
    "ComponentRegistry"
  ],
  "SelfOffer(address)": [
    "Marketplace"
  ],
  "SelfSupersede(uint256)": [
    "DocumentRegistry"
  ],
  "SellerNoLongerOwner(uint256,address,address)": [
    "Marketplace"
  ],
  "SerialNumberNotHeld(uint256,bytes32)": [
    "AssetRegistry"
  ],
  "SerialNumberTaken(bytes32,uint256)": [
    "AssetRegistry"
  ],
  "SettlementDeadlineNotPassed(uint40,uint40)": [
    "Escrow"
  ],
  "SettlementDeadlinePassed(uint40,uint40)": [
    "Escrow"
  ],
  "SubjectOrganizationNotVerified(uint256)": [
    "CredentialRegistry"
  ],
  "TimelockInsufficientDelay(uint256,uint256)": [
    "ProtocolTimelock"
  ],
  "TimelockInvalidOperationLength(uint256,uint256,uint256)": [
    "ProtocolTimelock"
  ],
  "TimelockUnauthorizedCaller(address)": [
    "ProtocolTimelock"
  ],
  "TimelockUnexecutedPredecessor(bytes32)": [
    "ProtocolTimelock"
  ],
  "TimelockUnexpectedOperationState(bytes32,bytes32)": [
    "ProtocolTimelock"
  ],
  "TokenNotAllowed(address)": [
    "FeeManager"
  ],
  "TransferOfferExpired(uint256,uint40)": [
    "AssetOwnership"
  ],
  "TransferToCurrentOwner(uint256)": [
    "AssetOwnership"
  ],
  "UUPSUnauthorizedCallContext()": [
    "AircraftRegistry",
    "AssetOwnership",
    "AssetRegistry",
    "ComponentRegistry",
    "CredentialRegistry",
    "DocumentRegistry",
    "MaintenanceRegistry",
    "Marketplace",
    "OrganizationRegistry"
  ],
  "UUPSUnsupportedProxiableUUID(bytes32)": [
    "AircraftRegistry",
    "AssetOwnership",
    "AssetRegistry",
    "ComponentRegistry",
    "CredentialRegistry",
    "DocumentRegistry",
    "MaintenanceRegistry",
    "Marketplace",
    "OrganizationRegistry"
  ],
  "UnexpectedCaller(address,address)": [
    "AssetOwnership",
    "Escrow",
    "EscrowFactory",
    "Marketplace"
  ],
  "UnexpectedOwner(uint256,address,address)": [
    "AssetOwnership"
  ],
  "UnspecifiedAssetKind(uint8)": [
    "AssetRegistry"
  ],
  "UseInstallComponent()": [
    "ComponentRegistry"
  ],
  "ValueTooLarge(uint256,uint256)": [
    "AssetRegistry",
    "ComponentRegistry",
    "CredentialRegistry",
    "DocumentRegistry",
    "MaintenanceRegistry",
    "Marketplace"
  ],
  "ZeroAddress()": [
    "AircraftRegistry",
    "AssetOwnership",
    "AssetPassport",
    "AssetRegistry",
    "ComponentRegistry",
    "CredentialRegistry",
    "DocumentRegistry",
    "Escrow",
    "EscrowFactory",
    "FeeManager",
    "MaintenanceRegistry",
    "Marketplace",
    "OrganizationRegistry",
    "ProtocolAddressRegistry",
    "RoleManager"
  ],
  "ZeroHash()": [
    "AircraftRegistry",
    "ComponentRegistry",
    "CredentialRegistry",
    "DocumentRegistry",
    "MaintenanceRegistry",
    "OrganizationRegistry"
  ]
};

/**
 * Four-byte selector to error name.
 *
 * The fallback for when a revert arrives with its arguments already discarded. viem
 * decodes against the ABI of the contract that was *called*, so an error declared
 * elsewhere — every `AssetPassport` revert, for instance — surfaces as a bare
 * selector with no payload. This still names it.
 */
export const protocolErrorSelectors: Record<string, string> = {
  "0x6697b232": "AccessControlBadConfirmation",
  "0xe2517d3f": "AccessControlUnauthorizedAccount",
  "0x9996b315": "AddressEmptyCode",
  "0xa453e9c0": "AddressNotRegistered",
  "0x9024c2ee": "AdminTransferToCurrentAdmin",
  "0x6e7d9360": "AircraftNotFound",
  "0x887c7949": "AssetAlreadyListed",
  "0x79982685": "AssetAlreadyLocked",
  "0xadf0f65f": "AssetAlreadyVerified",
  "0xc56efa90": "AssetLockedBySettlement",
  "0xad917ae7": "AssetNotFound",
  "0xd907f744": "AssetNotTerminal",
  "0x48a5eb53": "AssetNotTransferable",
  "0x91b86ad3": "AssetNotVerified",
  "0x7793affd": "AssetTerminal",
  "0x1bee1ae9": "AssetTransferFrozen",
  "0xe95c72f8": "AssetTransferLocked",
  "0xb7d253a2": "CannotReadministerDefaultAdmin",
  "0x7dfb0a71": "CloneAddressMismatch",
  "0x1f4d9fdb": "ComponentAlreadyInstalled",
  "0x077d3d7c": "ComponentIsInstalled",
  "0x922a0c32": "ComponentNotFound",
  "0x38c4cef5": "ComponentNotInstalled",
  "0x84101237": "CredentialExpired",
  "0x616219e9": "CredentialNotExpired",
  "0x9a1c8dc6": "CredentialNotFound",
  "0x6e94f463": "CredentialNotValid",
  "0x357c8dd3": "DeadlineInPast",
  "0x8686ccdc": "DeadlineTooFar",
  "0x27976176": "DisputeDeadlineNotPassed",
  "0xc03b5e68": "DocumentAssetMismatch",
  "0x449ce32f": "DocumentHashTaken",
  "0xaae8d0d4": "DocumentNotActive",
  "0x51114639": "DocumentNotFound",
  "0x20c5b7f6": "DuplicateValidCredential",
  "0x4c9c8ce3": "ERC1967InvalidImplementation",
  "0xb398979f": "ERC1967NonPayable",
  "0xd93c0665": "EnforcedPause",
  "0xa7b86368": "EscrowInProgress",
  "0x0b668f2e": "EscrowNotFound",
  "0x8dfc202b": "ExpectedPause",
  "0xd6bda275": "FailedCall",
  "0xb06ebf3d": "FailedDeployment",
  "0x9cd0d57c": "FeeExceedsMaximum",
  "0x23c5c01d": "FeeExceedsPrice",
  "0x54e3738c": "FundingDeadlineNotPassed",
  "0x9358b2c6": "FundingDeadlinePassed",
  "0x3673c7ef": "IncorrectFundingAmount",
  "0xcf479181": "InsufficientBalance",
  "0x44214bc6": "InvalidAircraftCategory",
  "0xc0b63b36": "InvalidAssetKind",
  "0xe26bc2a7": "InvalidAssetTransition",
  "0x221f53b1": "InvalidComponentKind",
  "0x5113a833": "InvalidComponentTransition",
  "0x3eb514bd": "InvalidCredentialSubject",
  "0x15bbae3e": "InvalidCredentialTransition",
  "0x26ec44bc": "InvalidCredentialType",
  "0x81df7004": "InvalidDocumentType",
  "0x46bbdd43": "InvalidEscrowTransition",
  "0xf92ee8a9": "InvalidInitialization",
  "0x2eb124b3": "InvalidListingTransition",
  "0x6cff452d": "InvalidMaintenanceType",
  "0xe21e510d": "InvalidManufactureYear",
  "0xc227089a": "InvalidOfferTransition",
  "0x73673acd": "InvalidOrganizationTransition",
  "0x7a5785ac": "InvalidOrganizationType",
  "0xb776a075": "IssuedAtInFuture",
  "0x6a609dfd": "IssuerOrganizationNotFound",
  "0xd372b990": "LastProtocolAdmin",
  "0xe67c3b74": "ListingNotActive",
  "0x317d6417": "ListingNotExpired",
  "0x0193e51c": "ListingNotFound",
  "0xbf98390c": "MaintenanceRecordNotFound",
  "0xeb817643": "MissingManufacturer",
  "0x75000dc0": "MissingRole",
  "0xecf11b1f": "NoPendingAdminTransfer",
  "0x796f29de": "NoPendingTransfer",
  "0x89ac8644": "NoSerialNumberRecorded",
  "0xb47c2529": "NoValidMaintenanceCredential",
  "0x424b8218": "NotActingForOrganization",
  "0xc5b03f9d": "NotAssetController",
  "0xc79bcb68": "NotAssetOwner",
  "0x0d9b2071": "NotAuthorizedMro",
  "0x43b24cec": "NotDocumentController",
  "0x216f1bf8": "NotEscrowBuyer",
  "0xef7e4f33": "NotEscrowParty",
  "0xd7e6bcf8": "NotInitializing",
  "0x30b558e3": "NotListingSeller",
  "0x66229865": "NotLockHolder",
  "0xce7be802": "NotOfferBuyer",
  "0xc4389af8": "NotOrganizationAdmin",
  "0xc8b4603a": "NotPendingAdmin",
  "0x416a0097": "NotPendingOwner",
  "0xdc69dc16": "NothingToWithdraw",
  "0xe832c8d0": "OfferListingMismatch",
  "0xf611eb50": "OfferNotActive",
  "0x40d97c16": "OfferNotExpired",
  "0x1f376e4c": "OfferNotFound",
  "0xaad504fb": "OrganizationNameTaken",
  "0xd54d6263": "OrganizationNotFound",
  "0x584f8e00": "OrganizationNotVerified",
  "0x4216ff96": "OwnershipAlreadyInitialized",
  "0x7e18c518": "OwnershipNotFound",
  "0x092cd075": "ParentNotAircraft",
  "0x7c9767f0": "PerformedAtInFuture",
  "0x049f28e4": "PositionOccupied",
  "0xdbbbe822": "PriceTooLow",
  "0x3ee5aeb5": "ReentrancyGuardReentrantCall",
  "0x5274afe7": "SafeERC20FailedOperation",
  "0x8a8bf1e6": "SelfInstallation",
  "0xfb446ad6": "SelfOffer",
  "0x082c15ff": "SelfSupersede",
  "0xd06075c9": "SellerNoLongerOwner",
  "0x24318516": "SerialNumberNotHeld",
  "0xc484d12b": "SerialNumberTaken",
  "0x11af2f38": "SettlementDeadlineNotPassed",
  "0x3c3f6563": "SettlementDeadlinePassed",
  "0x00892ebe": "SubjectOrganizationNotVerified",
  "0x54336609": "TimelockInsufficientDelay",
  "0xffb03211": "TimelockInvalidOperationLength",
  "0xe2850c59": "TimelockUnauthorizedCaller",
  "0x90a9a618": "TimelockUnexecutedPredecessor",
  "0x5ead8eb5": "TimelockUnexpectedOperationState",
  "0x94403b70": "TokenNotAllowed",
  "0x60debc77": "TransferOfferExpired",
  "0x212eae84": "TransferToCurrentOwner",
  "0xe07c8dba": "UUPSUnauthorizedCallContext",
  "0xaa1d49a4": "UUPSUnsupportedProxiableUUID",
  "0xd8a510f2": "UnexpectedCaller",
  "0x3920e677": "UnexpectedOwner",
  "0x08df666a": "UnspecifiedAssetKind",
  "0x6b47331d": "UseInstallComponent",
  "0x280b172c": "ValueTooLarge",
  "0xd92e233d": "ZeroAddress",
  "0xf1ae58d5": "ZeroHash"
};
