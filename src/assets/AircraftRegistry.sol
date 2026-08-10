// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolModuleUpgradeable} from "../core/ProtocolModuleUpgradeable.sol";
import {IAircraftRegistry} from "../interfaces/IAircraftRegistry.sol";
import {IAssetOwnership} from "../interfaces/IAssetOwnership.sol";
import {IAssetRegistry} from "../interfaces/IAssetRegistry.sol";
import {IOrganizationRegistry} from "../interfaces/IOrganizationRegistry.sol";
import {ProtocolAddressKeys} from "../libraries/ProtocolAddressKeys.sol";
import {ZeroHash} from "../libraries/ProtocolErrors.sol";

/// @title AircraftRegistry
/// @author AeroAsset Protocol
/// @notice Airframe-specific data for assets of kind `AIRCRAFT`.
/// @dev Sub-layer L2c. Calls **down** into `AssetRegistry` (L2b) to mint the asset id
///      and into `AssetOwnership` (L2a) to authorize mutations. It holds
///      `ASSET_MINTER_ROLE`, which is a protocol-internal trust delegation: a
///      specialization registry cannot forward `msg.sender` through a call, so it
///      performs the organization-membership check itself before delegating.
///
///      **Non-claim.** Records here describe what a registering organization
///      asserted. They are not a statement of airworthiness, not a certificate of
///      registration, and not the position of any civil aviation authority.
contract AircraftRegistry is ProtocolModuleUpgradeable, IAircraftRegistry {
    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice ERC-7201 namespaced storage for this registry.
    /// @param aircraft Airframe records keyed by the shared asset id.
    /// @custom:storage-location erc7201:aeroasset.storage.AircraftRegistry
    struct AircraftRegistryStorage {
        mapping(uint256 assetId => Aircraft) aircraft;
    }

    /// @dev `keccak256(abi.encode(uint256(keccak256("aeroasset.storage.AircraftRegistry")) - 1))
    ///      & ~bytes32(uint256(0xff))`. Asserted in `test/upgrade/Namespaces.t.sol`.
    bytes32 private constant _AIRCRAFT_REGISTRY_STORAGE =
        0x16082ff749f728e3021df36dca08566bca9ab008d9d9a48c8644f95b44fe8100;

    /// @notice Earliest accepted manufacture year (first powered flight).
    /// @dev A sanity bound that catches transposed digits and uninitialized values.
    ///      It is not a correctness guarantee about the aircraft.
    uint16 internal constant MIN_MANUFACTURE_YEAR = 1903;

    /// @notice Latest accepted manufacture year.
    uint16 internal constant MAX_MANUFACTURE_YEAR = 2200;

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

    /// @inheritdoc IAircraftRegistry
    function registerAircraft(AircraftParams calldata params) external whenNotPaused returns (uint256 assetId) {
        // This registry holds ASSET_MINTER_ROLE, so it — not AssetRegistry — is
        // responsible for proving the caller may act for the organization.
        IOrganizationRegistry(_resolve(ProtocolAddressKeys.ORGANIZATION_REGISTRY))
            .requireActingFor(params.orgId, msg.sender);

        _validate(params.model, params.manufactureYear, params.category);
        if (params.manufacturerOrgId == 0 && params.manufacturerName == bytes32(0)) {
            revert MissingManufacturer();
        }

        assetId = IAssetRegistry(_resolve(ProtocolAddressKeys.ASSET_REGISTRY))
            .registerAssetFor(
                params.orgId,
                params.owner,
                IAssetRegistry.AssetKind.AIRCRAFT,
                params.serialNumberHash,
                params.metadataHash,
                params.uri
            );

        _s().aircraft[assetId] = Aircraft({
            manufacturerOrgId: params.manufacturerOrgId,
            manufactureYear: params.manufactureYear,
            category: params.category,
            model: params.model,
            manufacturerName: params.manufacturerName,
            registrationMarkHash: params.registrationMarkHash
        });

        emit AircraftRegistered(
            assetId, params.manufacturerOrgId, params.model, params.manufactureYear, params.category
        );
    }

    /// @inheritdoc IAircraftRegistry
    function updateAircraft(uint256 assetId, bytes32 model, AircraftCategory category, bytes32 registrationMarkHash)
        external
        whenNotPaused
    {
        Aircraft storage record = _requireExists(assetId);

        IAssetRegistry assets = IAssetRegistry(_resolve(ProtocolAddressKeys.ASSET_REGISTRY));
        if (assets.isTerminal(assetId)) {
            revert IAssetRegistry.AssetTerminal(assetId, assets.getAsset(assetId).status);
        }
        IAssetOwnership(_resolve(ProtocolAddressKeys.ASSET_OWNERSHIP)).requireOwner(assetId, msg.sender);

        _validate(model, record.manufactureYear, category);

        record.model = model;
        record.category = category;
        record.registrationMarkHash = registrationMarkHash;

        emit AircraftUpdated(assetId, model, category, registrationMarkHash);
    }

    /// @inheritdoc IAircraftRegistry
    function getAircraft(uint256 assetId) external view returns (Aircraft memory) {
        return _requireExists(assetId);
    }

    /// @inheritdoc IAircraftRegistry
    function isAircraft(uint256 assetId) external view returns (bool) {
        return _s().aircraft[assetId].model != bytes32(0);
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @notice Validates the airframe fields shared by registration and update.
    /// @param model The model designation.
    /// @param manufactureYear The year of manufacture.
    /// @param category The operational category.
    function _validate(bytes32 model, uint16 manufactureYear, AircraftCategory category) private pure {
        if (model == bytes32(0)) {
            revert ZeroHash();
        }
        if (category == AircraftCategory.UNSPECIFIED) {
            revert InvalidAircraftCategory(category);
        }
        if (manufactureYear < MIN_MANUFACTURE_YEAR || manufactureYear > MAX_MANUFACTURE_YEAR) {
            revert InvalidManufactureYear(manufactureYear);
        }
    }

    /// @notice Returns a storage pointer to an existing aircraft, or reverts.
    /// @dev Existence is `model != 0`, which registration guarantees is non-zero.
    /// @param assetId The asset id.
    /// @return record Storage pointer to the airframe record.
    function _requireExists(uint256 assetId) private view returns (Aircraft storage record) {
        record = _s().aircraft[assetId];
        if (record.model == bytes32(0)) {
            revert AircraftNotFound(assetId);
        }
    }

    /// @notice Returns a pointer to this contract's ERC-7201 storage struct.
    /// @return $ The registry storage.
    function _s() private pure returns (AircraftRegistryStorage storage $) {
        assembly ("memory-safe") {
            $.slot := _AIRCRAFT_REGISTRY_STORAGE
        }
    }
}
