// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAircraftRegistry} from "../interfaces/IAircraftRegistry.sol";
import {IAssetOwnership} from "../interfaces/IAssetOwnership.sol";
import {IAssetRegistry} from "../interfaces/IAssetRegistry.sol";
import {IComponentRegistry} from "../interfaces/IComponentRegistry.sol";
import {IDocumentRegistry} from "../interfaces/IDocumentRegistry.sol";
import {IMaintenanceRegistry} from "../interfaces/IMaintenanceRegistry.sol";
import {IProtocolAddressRegistry} from "../interfaces/IProtocolAddressRegistry.sol";
import {ProtocolAddressKeys} from "../libraries/ProtocolAddressKeys.sol";
import {ZeroAddress} from "../libraries/ProtocolErrors.sol";

/// @title AssetPassport
/// @author AeroAsset Protocol
/// @notice Read-only aggregator that assembles an asset's full picture — identity,
///         ownership, status, components, documents and maintenance — in one call.
/// @dev Layer L3, and **the only contract in the protocol that owns no storage at
///      all**. It has no initializer, no state variables beyond one immutable, and no
///      function that writes anything. Roadmap Phase 6 becomes a god-contract if the
///      passport is implemented as a data store; making it a pure fan-out read means
///      it can never be a source of state divergence, and can be redeployed and
///      re-pointed without migrating anything (`docs/architecture.md` §D6).
///
///      Deliberately **not upgradeable**, for the same reason: there is no storage to
///      preserve. A new version is a fresh deployment plus one
///      `ProtocolAddressRegistry` write.
///
///      Every list accessor is paginated. A passport is unbounded in principle — an
///      airframe accumulates documents and maintenance records for decades — so no
///      accessor here returns a whole collection.
contract AssetPassport {
    /*//////////////////////////////////////////////////////////////
                                  TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Aggregated summary of one asset.
    /// @param assetId The asset id.
    /// @param kind Category of asset.
    /// @param status Current operational status.
    /// @param verified True if the asset has been verified.
    /// @param registrarOrgId Organization that registered it.
    /// @param verifierOrgId Organization credited with verification, or 0.
    /// @param registeredAt Unix time of registration.
    /// @param verifiedAt Unix time of verification, or 0.
    /// @param serialNumberHash Commitment to the serial number, or 0.
    /// @param metadataHash Commitment to off-chain metadata.
    /// @param owner Current owner.
    /// @param ownedSince Unix time the current owner acquired it.
    /// @param transferFrozen True when a terminal status has frozen transfers.
    /// @param lockedBy Settlement contract holding the asset, or zero.
    /// @param componentCount Components currently installed on this asset.
    /// @param documentCount Documents registered against this asset.
    /// @param maintenanceCount Maintenance records against this asset.
    struct Passport {
        uint256 assetId;
        IAssetRegistry.AssetKind kind;
        IAssetRegistry.AssetStatus status;
        bool verified;
        uint256 registrarOrgId;
        uint256 verifierOrgId;
        uint40 registeredAt;
        uint40 verifiedAt;
        bytes32 serialNumberHash;
        bytes32 metadataHash;
        address owner;
        uint40 ownedSince;
        bool transferFrozen;
        address lockedBy;
        uint256 componentCount;
        uint256 documentCount;
        uint256 maintenanceCount;
    }

    /*//////////////////////////////////////////////////////////////
                                  STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice The address book this aggregator resolves every module through.
    /// @dev The contract's only storage, and it is immutable. Module addresses are
    ///      resolved live on each call, so a rotated registry is reflected
    ///      immediately with no cache to invalidate.
    IProtocolAddressRegistry public immutable ADDRESS_REGISTRY;

    /// @notice Deploys the aggregator bound to the protocol address registry.
    /// @param addressRegistry The protocol `ProtocolAddressRegistry`. Must be non-zero.
    constructor(address addressRegistry) {
        if (addressRegistry == address(0)) {
            revert ZeroAddress();
        }
        ADDRESS_REGISTRY = IProtocolAddressRegistry(addressRegistry);
    }

    /*//////////////////////////////////////////////////////////////
                                 SUMMARY
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the aggregated summary for an asset.
    /// @dev Reverts through `AssetRegistry` if the asset does not exist.
    ///
    ///      Assembled field by field rather than as one struct literal. A single
    ///      17-field literal holds every value live at once, which overflows the EVM
    ///      stack under the IR pipeline — `Variable _53 is 1 too deep in the stack`.
    ///      Writing straight into the named return lets each value die immediately
    ///      after its assignment. Identical output; purely a codegen concession.
    /// @param assetId The asset id.
    /// @return passport The aggregated summary.
    function getPassport(uint256 assetId) external view returns (Passport memory passport) {
        IAssetRegistry.Asset memory asset = _assets().getAsset(assetId);

        passport.assetId = assetId;
        passport.kind = asset.kind;
        passport.status = asset.status;
        passport.verified = asset.verifiedAt != 0;
        passport.registrarOrgId = asset.registrarOrgId;
        passport.verifierOrgId = asset.verifierOrgId;
        passport.registeredAt = asset.registeredAt;
        passport.verifiedAt = asset.verifiedAt;
        passport.serialNumberHash = asset.serialNumberHash;
        passport.metadataHash = asset.metadataHash;

        IAssetOwnership.OwnershipRecord memory ownership = _ownership().getOwnership(assetId);

        passport.owner = ownership.owner;
        passport.ownedSince = ownership.since;
        passport.transferFrozen = ownership.transferFrozen;
        passport.lockedBy = ownership.lockedBy;

        passport.componentCount = _components().componentCountOf(assetId);
        passport.documentCount = _documents().documentCountOf(assetId);
        passport.maintenanceCount = _maintenance().maintenanceCountOf(assetId);
    }

    /// @notice Returns an asset's off-chain metadata location.
    /// @param assetId The asset id.
    /// @return The stored URI, which may be empty.
    function metadataURI(uint256 assetId) external view returns (string memory) {
        return _assets().metadataURI(assetId);
    }

    /*//////////////////////////////////////////////////////////////
                              SPECIALIZATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns airframe data for an asset of kind `AIRCRAFT`.
    /// @param assetId The asset id.
    /// @return The aircraft record.
    function getAircraft(uint256 assetId) external view returns (IAircraftRegistry.Aircraft memory) {
        return
            IAircraftRegistry(ADDRESS_REGISTRY.getAddress(ProtocolAddressKeys.AIRCRAFT_REGISTRY)).getAircraft(assetId);
    }

    /// @notice Returns component data for a component asset.
    /// @param assetId The asset id.
    /// @return The component record.
    function getComponent(uint256 assetId) external view returns (IComponentRegistry.Component memory) {
        return _components().getComponent(assetId);
    }

    /*//////////////////////////////////////////////////////////////
                              PAGINATED LISTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns a page of the components installed on an asset.
    /// @param assetId The parent asset id.
    /// @param offset Index to start from.
    /// @param limit Maximum number of ids to return.
    /// @return The component asset ids in the requested page.
    function components(uint256 assetId, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _components().componentsOf(assetId, offset, limit);
    }

    /// @notice Returns a page of the documents registered against an asset.
    /// @param assetId The asset id.
    /// @param offset Index to start from.
    /// @param limit Maximum number of ids to return.
    /// @return The document ids in the requested page.
    function documents(uint256 assetId, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _documents().documentsOf(assetId, offset, limit);
    }

    /// @notice Returns a page of the maintenance records against an asset.
    /// @param assetId The asset id.
    /// @param offset Index to start from.
    /// @param limit Maximum number of ids to return.
    /// @return The maintenance record ids in the requested page.
    function maintenance(uint256 assetId, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _maintenance().maintenanceOf(assetId, offset, limit);
    }

    /*//////////////////////////////////////////////////////////////
                                RESOLVERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Resolves the generic asset registry.
    /// @return The current `AssetRegistry`.
    function _assets() private view returns (IAssetRegistry) {
        return IAssetRegistry(ADDRESS_REGISTRY.getAddress(ProtocolAddressKeys.ASSET_REGISTRY));
    }

    /// @notice Resolves the ownership ledger.
    /// @return The current `AssetOwnership`.
    function _ownership() private view returns (IAssetOwnership) {
        return IAssetOwnership(ADDRESS_REGISTRY.getAddress(ProtocolAddressKeys.ASSET_OWNERSHIP));
    }

    /// @notice Resolves the component registry.
    /// @return The current `ComponentRegistry`.
    function _components() private view returns (IComponentRegistry) {
        return IComponentRegistry(ADDRESS_REGISTRY.getAddress(ProtocolAddressKeys.COMPONENT_REGISTRY));
    }

    /// @notice Resolves the document registry.
    /// @return The current `DocumentRegistry`.
    function _documents() private view returns (IDocumentRegistry) {
        return IDocumentRegistry(ADDRESS_REGISTRY.getAddress(ProtocolAddressKeys.DOCUMENT_REGISTRY));
    }

    /// @notice Resolves the maintenance registry.
    /// @return The current `MaintenanceRegistry`.
    function _maintenance() private view returns (IMaintenanceRegistry) {
        return IMaintenanceRegistry(ADDRESS_REGISTRY.getAddress(ProtocolAddressKeys.MAINTENANCE_REGISTRY));
    }
}
