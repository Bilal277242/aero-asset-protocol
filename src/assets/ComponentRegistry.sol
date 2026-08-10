// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolModuleUpgradeable} from "../core/ProtocolModuleUpgradeable.sol";
import {IAssetOwnership} from "../interfaces/IAssetOwnership.sol";
import {IAssetRegistry} from "../interfaces/IAssetRegistry.sol";
import {IComponentRegistry} from "../interfaces/IComponentRegistry.sol";
import {IOrganizationRegistry} from "../interfaces/IOrganizationRegistry.sol";
import {ProtocolAddressKeys} from "../libraries/ProtocolAddressKeys.sol";
import {ProtocolCast} from "../libraries/ProtocolCast.sol";
import {ZeroHash} from "../libraries/ProtocolErrors.sol";

/// @title ComponentRegistry
/// @author AeroAsset Protocol
/// @notice Components — engines, APUs, landing gear, avionics — and the installation
///         graph binding them to airframes.
/// @dev Sub-layer L2c.
///
///      **`parentAssetId != 0` if and only if `status == INSTALLED`** (`INV-COMP-01`).
///      Installation state lives on the component as a single scalar, so a component
///      fitted to two airframes has no representation in storage. Every exit from
///      `INSTALLED` runs through one detach path, so no individual transition has to
///      remember to clear the parent.
///
///      The installed-component index is append-on-install and swap-and-pop on
///      detach, and is read only from `view` functions. No state-changing path in this
///      contract iterates it (`docs/security-model.md` §5).
///
///      **Non-claim.** Records here describe what an owner asserted about a part's
///      fitment. They are not a determination of airworthiness or approved-part status
///      by any civil aviation authority.
contract ComponentRegistry is ProtocolModuleUpgradeable, IComponentRegistry {
    using ProtocolCast for uint256;

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice ERC-7201 namespaced storage for this registry.
    /// @param components Component records keyed by the shared asset id.
    /// @param installed Installed component ids per airframe. View-read only.
    /// @param indexInParent Position of a component within its parent's array, so
    ///        detaching is O(1) swap-and-pop rather than a search.
    /// @param occupant The component fitted at a given kind and position, for O(1)
    ///        collision detection.
    /// @custom:storage-location erc7201:aeroasset.storage.ComponentRegistry
    struct ComponentRegistryStorage {
        mapping(uint256 assetId => Component) components;
        mapping(uint256 parentAssetId => uint256[]) installed;
        mapping(uint256 componentAssetId => uint256 index) indexInParent;
        mapping(
            uint256 parentAssetId => mapping(ComponentKind => mapping(uint16 position => uint256 componentAssetId))
        ) occupant;
    }

    /// @dev `keccak256(abi.encode(uint256(keccak256("aeroasset.storage.ComponentRegistry")) - 1))
    ///      & ~bytes32(uint256(0xff))`. Asserted in `test/upgrade/Namespaces.t.sol`.
    bytes32 private constant _COMPONENT_REGISTRY_STORAGE =
        0x9345166a028144bcebc693790d7a1182eb477699cc1deffe12101e7570ad1100;

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
                              REGISTRATION
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IComponentRegistry
    function registerComponent(ComponentParams calldata params) external whenNotPaused returns (uint256 assetId) {
        if (params.kind == ComponentKind.UNSPECIFIED) {
            revert InvalidComponentKind(params.kind);
        }
        if (params.partNumber == bytes32(0)) {
            revert ZeroHash();
        }

        IOrganizationRegistry(_resolve(ProtocolAddressKeys.ORGANIZATION_REGISTRY))
            .requireActingFor(params.orgId, msg.sender);

        assetId = IAssetRegistry(_resolve(ProtocolAddressKeys.ASSET_REGISTRY))
            .registerAssetFor(
                params.orgId,
                params.owner,
                // Derived, never caller-supplied, so the generic kind and the component
                // kind can never disagree about what this asset is.
                _assetKindFor(params.kind),
                params.serialNumberHash,
                params.metadataHash,
                params.uri
            );

        _s().components[assetId] = Component({
            parentAssetId: 0,
            installedAt: 0,
            removedAt: 0,
            position: 0,
            kind: params.kind,
            status: ComponentStatus.UNINSTALLED,
            partNumber: params.partNumber
        });

        emit ComponentRegistered(assetId, params.kind, params.partNumber);
        emit ComponentStatusChanged(assetId, ComponentStatus.NONE, ComponentStatus.UNINSTALLED);
    }

    /*//////////////////////////////////////////////////////////////
                              INSTALLATION
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IComponentRegistry
    function installComponent(uint256 componentAssetId, uint256 parentAssetId, uint16 position) external whenNotPaused {
        if (componentAssetId == parentAssetId) {
            revert SelfInstallation(componentAssetId);
        }

        ComponentRegistryStorage storage $ = _s();
        Component storage component = _requireExists(componentAssetId);

        ComponentStatus from = component.status;
        if (from == ComponentStatus.INSTALLED) {
            revert ComponentAlreadyInstalled(componentAssetId, component.parentAssetId);
        }
        if (from != ComponentStatus.UNINSTALLED) {
            revert InvalidComponentTransition(from, ComponentStatus.INSTALLED);
        }

        IAssetRegistry assets = IAssetRegistry(_resolve(ProtocolAddressKeys.ASSET_REGISTRY));
        // The parent must be an airframe: components nest into aircraft, not into
        // each other. `requireKind` also proves the parent exists.
        if (!assets.exists(parentAssetId)) {
            revert ParentNotAircraft(parentAssetId);
        }
        if (assets.getAsset(parentAssetId).kind != IAssetRegistry.AssetKind.AIRCRAFT) {
            revert ParentNotAircraft(parentAssetId);
        }
        if (assets.isTerminal(parentAssetId)) {
            revert IAssetRegistry.AssetTerminal(parentAssetId, assets.getAsset(parentAssetId).status);
        }

        // Fitting a part to an airframe changes both records, so the caller must own
        // both. A lessor cannot bolt their engine onto someone else's aircraft.
        IAssetOwnership ownership = IAssetOwnership(_resolve(ProtocolAddressKeys.ASSET_OWNERSHIP));
        ownership.requireOwner(componentAssetId, msg.sender);
        ownership.requireOwner(parentAssetId, msg.sender);

        uint256 existingOccupant = $.occupant[parentAssetId][component.kind][position];
        if (existingOccupant != 0) {
            revert PositionOccupied(parentAssetId, component.kind, position, existingOccupant);
        }

        component.parentAssetId = parentAssetId.toUint64();
        component.installedAt = uint40(block.timestamp);
        component.position = position;
        component.status = ComponentStatus.INSTALLED;

        $.occupant[parentAssetId][component.kind][position] = componentAssetId;
        $.indexInParent[componentAssetId] = $.installed[parentAssetId].length;
        $.installed[parentAssetId].push(componentAssetId);

        emit ComponentInstalled(componentAssetId, parentAssetId, position);
        emit ComponentStatusChanged(componentAssetId, from, ComponentStatus.INSTALLED);
    }

    /// @inheritdoc IComponentRegistry
    function removeComponent(uint256 componentAssetId) external whenNotPaused {
        Component storage component = _requireExists(componentAssetId);

        if (component.status != ComponentStatus.INSTALLED) {
            revert ComponentNotInstalled(componentAssetId);
        }

        IAssetOwnership(_resolve(ProtocolAddressKeys.ASSET_OWNERSHIP)).requireOwner(componentAssetId, msg.sender);

        _writeStatus(componentAssetId, component, ComponentStatus.INSTALLED, ComponentStatus.UNINSTALLED);
    }

    /// @inheritdoc IComponentRegistry
    function setComponentStatus(uint256 componentAssetId, ComponentStatus newStatus) external whenNotPaused {
        Component storage component = _requireExists(componentAssetId);

        // Reaching INSTALLED needs a parent and a position, which this signature does
        // not carry. Silently ignoring it would be worse than naming the right call.
        if (newStatus == ComponentStatus.INSTALLED) {
            revert UseInstallComponent();
        }

        IAssetOwnership(_resolve(ProtocolAddressKeys.ASSET_OWNERSHIP)).requireOwner(componentAssetId, msg.sender);

        _writeStatus(componentAssetId, component, component.status, newStatus);
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IComponentRegistry
    function getComponent(uint256 assetId) external view returns (Component memory) {
        return _requireExists(assetId);
    }

    /// @inheritdoc IComponentRegistry
    function isComponent(uint256 assetId) external view returns (bool) {
        return _s().components[assetId].status != ComponentStatus.NONE;
    }

    /// @inheritdoc IComponentRegistry
    function componentCountOf(uint256 parentAssetId) external view returns (uint256) {
        return _s().installed[parentAssetId].length;
    }

    /// @inheritdoc IComponentRegistry
    function componentsOf(uint256 parentAssetId, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids)
    {
        uint256[] storage all = _s().installed[parentAssetId];
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

    /// @inheritdoc IComponentRegistry
    function positionOccupant(uint256 parentAssetId, ComponentKind kind, uint16 position)
        external
        view
        returns (uint256)
    {
        return _s().occupant[parentAssetId][kind][position];
    }

    /// @notice Reports whether a lifecycle transition is permitted.
    /// @dev `INSTALLED` is reachable only through {installComponent}; this table
    ///      describes it as a legal *source* but never as a target of
    ///      {setComponentStatus}. `SCRAPPED` is absorbing.
    ///      See `docs/state-machines.md` §4.
    /// @param from The current status.
    /// @param to The proposed status.
    /// @return True if the transition is legal.
    function isValidTransition(ComponentStatus from, ComponentStatus to) public pure returns (bool) {
        if (from == ComponentStatus.NONE || to == ComponentStatus.NONE) {
            return false;
        }
        if (from == ComponentStatus.SCRAPPED) {
            return false;
        }
        if (from == to) {
            return false;
        }

        if (from == ComponentStatus.UNINSTALLED) {
            return to != ComponentStatus.UNINSTALLED;
        }
        if (from == ComponentStatus.INSTALLED) {
            return to != ComponentStatus.INSTALLED;
        }
        if (from == ComponentStatus.IN_REPAIR) {
            return
                to == ComponentStatus.UNINSTALLED || to == ComponentStatus.QUARANTINED || to == ComponentStatus.SCRAPPED;
        }
        // QUARANTINED: released back to store, or scrapped. It must not go straight
        // back into service without passing through the uninstalled pool first.
        return to == ComponentStatus.UNINSTALLED || to == ComponentStatus.SCRAPPED;
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @notice Applies a validated status change, detaching from the parent if needed.
    /// @dev Every exit from `INSTALLED` funnels through here, so `INV-COMP-01` holds
    ///      without each individual transition having to remember to clear the parent.
    /// @param componentAssetId The component's asset id.
    /// @param component Storage pointer to the record.
    /// @param from The current status.
    /// @param to The status to move to.
    function _writeStatus(
        uint256 componentAssetId,
        Component storage component,
        ComponentStatus from,
        ComponentStatus to
    ) private {
        if (!isValidTransition(from, to)) {
            revert InvalidComponentTransition(from, to);
        }

        if (from == ComponentStatus.INSTALLED) {
            _detach(componentAssetId, component);
        }

        component.status = to;

        emit ComponentStatusChanged(componentAssetId, from, to);
    }

    /// @notice Detaches an installed component from its parent airframe.
    /// @dev Clears the parent, frees the position, and swap-and-pops the index entry
    ///      so removal is O(1) rather than a search.
    /// @param componentAssetId The component's asset id.
    /// @param component Storage pointer to the record.
    function _detach(uint256 componentAssetId, Component storage component) private {
        ComponentRegistryStorage storage $ = _s();
        uint256 parentAssetId = component.parentAssetId;

        delete $.occupant[parentAssetId][component.kind][component.position];

        uint256[] storage siblings = $.installed[parentAssetId];
        uint256 index = $.indexInParent[componentAssetId];
        uint256 lastIndex = siblings.length - 1;

        if (index != lastIndex) {
            uint256 moved = siblings[lastIndex];
            siblings[index] = moved;
            $.indexInParent[moved] = index;
        }
        siblings.pop();
        delete $.indexInParent[componentAssetId];

        component.parentAssetId = 0;
        component.position = 0;
        component.installedAt = 0;
        component.removedAt = uint40(block.timestamp);

        emit ComponentRemoved(componentAssetId, parentAssetId);
    }

    /// @notice Maps a component category to the generic asset kind it registers as.
    /// @param kind The component category.
    /// @return The corresponding `AssetKind`.
    function _assetKindFor(ComponentKind kind) private pure returns (IAssetRegistry.AssetKind) {
        if (kind == ComponentKind.ENGINE) {
            return IAssetRegistry.AssetKind.ENGINE;
        }
        if (kind == ComponentKind.APU) {
            return IAssetRegistry.AssetKind.APU;
        }
        return IAssetRegistry.AssetKind.COMPONENT;
    }

    /// @notice Returns a storage pointer to an existing component, or reverts.
    /// @param assetId The asset id.
    /// @return component Storage pointer to the record.
    function _requireExists(uint256 assetId) private view returns (Component storage component) {
        component = _s().components[assetId];
        if (component.status == ComponentStatus.NONE) {
            revert ComponentNotFound(assetId);
        }
    }

    /// @notice Returns a pointer to this contract's ERC-7201 storage struct.
    /// @return $ The registry storage.
    function _s() private pure returns (ComponentRegistryStorage storage $) {
        assembly ("memory-safe") {
            $.slot := _COMPONENT_REGISTRY_STORAGE
        }
    }
}
