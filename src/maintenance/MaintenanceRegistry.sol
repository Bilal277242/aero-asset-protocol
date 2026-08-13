// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolModuleUpgradeable} from "../core/ProtocolModuleUpgradeable.sol";
import {IAssetRegistry} from "../interfaces/IAssetRegistry.sol";
import {ICredentialRegistry} from "../interfaces/ICredentialRegistry.sol";
import {IDocumentRegistry} from "../interfaces/IDocumentRegistry.sol";
import {IMaintenanceRegistry} from "../interfaces/IMaintenanceRegistry.sol";
import {IOrganizationRegistry} from "../interfaces/IOrganizationRegistry.sol";
import {ProtocolAddressKeys} from "../libraries/ProtocolAddressKeys.sol";
import {ProtocolCast} from "../libraries/ProtocolCast.sol";
import {ZeroHash} from "../libraries/ProtocolErrors.sol";

/// @title MaintenanceRegistry
/// @author AeroAsset Protocol
/// @notice Append-only record of maintenance events performed on aviation assets.
/// @dev Layer L3. Records are **immutable**: no edit, no delete, no status. A
///      correction is a new record referencing the prior one off-chain. Anything else
///      would let history be rewritten, which is the one thing a maintenance log must
///      not permit.
///
///      Writing requires three independent conditions, each checked on-chain here
///      (roadmap §13):
///
///      1. the caller acts for the organization, and it is `VERIFIED`;
///      2. that organization is of type `MRO`;
///      3. it holds a currently-valid `MAINTENANCE_AUTHORITY` credential.
///
///      Condition 3 uses `CredentialRegistry`'s O(1) `validCredentialOfType` lookup,
///      which is precisely why that registry enforces at most one valid credential per
///      `(organization, type)` — a search would be an unbounded loop.
///
///      Later revocation of the organization or the credential does **not**
///      retroactively invalidate records already written. Protocol history is
///      append-only (`docs/state-machines.md` §1), and the credential relied upon is
///      emitted so an auditor can pin every record to a specific credential.
///
///      **Backdating is visible, not prevented** (audit AAP-12). `performedAt` is a
///      caller-supplied assertion about the physical world, bounded only by not being
///      in the future. The protocol cannot verify it, and must not forbid old dates:
///      backfilling an airframe's existing service history at onboarding is a primary
///      use case, so any cap tight enough to stop fabrication would also break the
///      legitimate case.
///
///      What the protocol can do — and now does — is record `recordedAt`, its own
///      observation of when the claim was made, alongside the claim. Twelve records
///      spanning four years that all appeared on-chain in the same block are then
///      plainly visible as such.
///
///      **A consumer reading `performedAt` without `recordedAt` is misreading this
///      registry.** Only the second date is one the protocol witnessed.
///
///      **Non-claim.** Recording maintenance is a protocol permission. It is not a
///      regulatory approval, not a certificate of release to service, and not a
///      determination of airworthiness by any civil aviation authority.
contract MaintenanceRegistry is ProtocolModuleUpgradeable, IMaintenanceRegistry {
    using ProtocolCast for uint256;

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice ERC-7201 namespaced storage for this registry.
    /// @param maintenanceCount Highest minted record id. Ids are dense from 1.
    /// @param records Maintenance records by id.
    /// @param assetRecords Per-asset history index. View-read only.
    /// @custom:storage-location erc7201:aeroasset.storage.MaintenanceRegistry
    struct MaintenanceRegistryStorage {
        uint256 maintenanceCount;
        mapping(uint256 recordId => MaintenanceRecord) records;
        mapping(uint256 assetId => uint256[]) assetRecords;
    }

    /// @dev `keccak256(abi.encode(uint256(keccak256("aeroasset.storage.MaintenanceRegistry")) - 1))
    ///      & ~bytes32(uint256(0xff))`. Asserted in `test/upgrade/Namespaces.t.sol`.
    bytes32 private constant _MAINTENANCE_REGISTRY_STORAGE =
        0x6ff46557adf223318e3fa8a56c7d35f87b2e9d07175dc08529c080ea1db62900;

    /*//////////////////////////////////////////////////////////////
                              INITIALIZATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Initializes the registry behind its ERC-1967 proxy.
    /// @param roleManager_ The protocol `RoleManager`. Must be non-zero.
    /// @param addressRegistry_ The protocol `ProtocolAddressRegistry`. Must be non-zero.
    function initialize(address roleManager_, address addressRegistry_) external initializer {
        __ProtocolModule_init(roleManager_, addressRegistry_);
    }

    /*//////////////////////////////////////////////////////////////
                                FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IMaintenanceRegistry
    function recordMaintenance(
        uint256 assetId,
        uint256 performedByOrgId,
        MaintenanceType mType,
        uint40 performedAt,
        uint256 documentId,
        bytes32 recordHash
    ) external whenNotPaused returns (uint256 recordId) {
        if (mType == MaintenanceType.UNSPECIFIED) {
            revert InvalidMaintenanceType(mType);
        }
        if (recordHash == bytes32(0)) {
            revert ZeroHash();
        }
        if (performedAt == 0 || performedAt > block.timestamp) {
            revert PerformedAtInFuture(performedAt, uint40(block.timestamp));
        }

        uint256 credentialId = _authorizeMro(performedByOrgId);
        _requireLiveAsset(assetId);
        if (documentId != 0) {
            _requireSupportingDocument(documentId, assetId);
        }

        MaintenanceRegistryStorage storage $ = _s();

        // Cannot realistically overflow: one increment per recording transaction.
        unchecked {
            recordId = ++$.maintenanceCount;
        }

        uint40 recordedAt = uint40(block.timestamp);

        $.records[recordId] = MaintenanceRecord({
            assetId: assetId.toUint64(),
            performedByOrgId: performedByOrgId.toUint64(),
            documentId: documentId.toUint64(),
            performedAt: performedAt,
            mType: mType,
            recordedAt: recordedAt,
            recordHash: recordHash
        });
        $.assetRecords[assetId].push(recordId);

        emit MaintenanceRecorded(
            recordId, assetId, performedByOrgId, mType, performedAt, recordedAt, credentialId, documentId, recordHash
        );
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IMaintenanceRegistry
    function getMaintenanceRecord(uint256 recordId) external view returns (MaintenanceRecord memory) {
        MaintenanceRecord storage record = _s().records[recordId];
        if (record.recordHash == bytes32(0)) {
            revert MaintenanceRecordNotFound(recordId);
        }
        return record;
    }

    /// @inheritdoc IMaintenanceRegistry
    function maintenanceCountOf(uint256 assetId) external view returns (uint256) {
        return _s().assetRecords[assetId].length;
    }

    /// @inheritdoc IMaintenanceRegistry
    function maintenanceOf(uint256 assetId, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids)
    {
        uint256[] storage all = _s().assetRecords[assetId];
        uint256 total = all.length;

        if (offset >= total) {
            return new uint256[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        uint256 size = end - offset;

        ids = new uint256[](size);
        for (uint256 i; i < size; ++i) {
            ids[i] = all[offset + i];
        }
    }

    /// @inheritdoc IMaintenanceRegistry
    function maintenanceCount() external view returns (uint256) {
        return _s().maintenanceCount;
    }

    /// @notice Reports whether an organization may currently record maintenance.
    /// @dev Exposed so a client can check the three conditions before spending gas on
    ///      a transaction that would revert.
    /// @param orgId The organization id.
    /// @param account The account proposing to act for it.
    /// @return True if all three authorization conditions hold.
    function canRecordMaintenance(uint256 orgId, address account) external view returns (bool) {
        IOrganizationRegistry organizations = IOrganizationRegistry(_resolve(ProtocolAddressKeys.ORGANIZATION_REGISTRY));

        if (!organizations.isActingFor(orgId, account)) {
            return false;
        }
        if (organizations.getOrganization(orgId).orgType != IOrganizationRegistry.OrganizationType.MRO) {
            return false;
        }

        return ICredentialRegistry(_resolve(ProtocolAddressKeys.CREDENTIAL_REGISTRY))
            .hasValidCredentialOfType(orgId, ICredentialRegistry.CredentialType.MAINTENANCE_AUTHORITY);
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @notice Enforces the three-way maintenance authorization gate.
    /// @param orgId The organization the caller claims to act for.
    /// @return credentialId The credential relied upon, emitted for audit.
    function _authorizeMro(uint256 orgId) private view returns (uint256 credentialId) {
        IOrganizationRegistry organizations = IOrganizationRegistry(_resolve(ProtocolAddressKeys.ORGANIZATION_REGISTRY));

        // 1. Caller acts for the organization, and it is VERIFIED.
        organizations.requireActingFor(orgId, msg.sender);

        // 2. The organization is an MRO. A verified airline must not be able to sign
        //    off its own heavy maintenance simply by being verified.
        IOrganizationRegistry.OrganizationType orgType = organizations.getOrganization(orgId).orgType;
        if (orgType != IOrganizationRegistry.OrganizationType.MRO) {
            revert NotAuthorizedMro(orgId, orgType);
        }

        // 3. It holds a currently-valid maintenance credential. O(1) by construction.
        credentialId = ICredentialRegistry(_resolve(ProtocolAddressKeys.CREDENTIAL_REGISTRY))
            .validCredentialOfType(orgId, ICredentialRegistry.CredentialType.MAINTENANCE_AUTHORITY);
        if (credentialId == 0) {
            revert NoValidMaintenanceCredential(orgId);
        }
    }

    /// @notice Reverts unless the asset exists and is not terminal.
    /// @param assetId The asset id.
    function _requireLiveAsset(uint256 assetId) private view {
        IAssetRegistry.Asset memory asset =
            IAssetRegistry(_resolve(ProtocolAddressKeys.ASSET_REGISTRY)).getAsset(assetId);

        if (asset.status == IAssetRegistry.AssetStatus.RETIRED || asset.status == IAssetRegistry.AssetStatus.DESTROYED)
        {
            revert IAssetRegistry.AssetTerminal(assetId, asset.status);
        }
    }

    /// @notice Validates an optional supporting document.
    /// @dev A `view`-only read of a same-layer peer. It stops a record citing a
    ///      document that belongs to a different aircraft, which would otherwise be
    ///      an easy way to launder evidence between assets.
    /// @param documentId The supporting document.
    /// @param assetId The asset the record describes.
    function _requireSupportingDocument(uint256 documentId, uint256 assetId) private view {
        IDocumentRegistry.Document memory document =
            IDocumentRegistry(_resolve(ProtocolAddressKeys.DOCUMENT_REGISTRY)).getDocument(documentId);

        if (document.status != IDocumentRegistry.DocumentStatus.ACTIVE) {
            revert IDocumentRegistry.DocumentNotActive(documentId, document.status);
        }
        if (document.assetId != assetId) {
            revert IDocumentRegistry.DocumentAssetMismatch(documentId, assetId, document.assetId);
        }
    }

    /// @notice Returns a pointer to this contract's ERC-7201 storage struct.
    /// @return $ The registry storage.
    function _s() private pure returns (MaintenanceRegistryStorage storage $) {
        assembly ("memory-safe") {
            $.slot := _MAINTENANCE_REGISTRY_STORAGE
        }
    }
}
