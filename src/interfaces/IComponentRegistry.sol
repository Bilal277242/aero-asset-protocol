// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IComponentRegistry
/// @author AeroAsset Protocol
/// @notice Interface, types, events and errors for components and the installation
///         graph that binds them to airframes.
/// @dev Sub-layer L2c. Like aircraft, components attach to an `assetId` minted by
///      `AssetRegistry`.
///
///      **The structural invariant of this module is `parentAssetId != 0` if and only
///      if `status == INSTALLED`** (`INV-COMP-01`). Installation state lives on the
///      *component*, not as a list on the aircraft, so "installed on two airframes at
///      once" has no representation in storage — it is not merely rejected, it cannot
///      be expressed.
///
///      **Non-claim.** Records here describe what an owner asserted about a part's
///      fitment. They are not a determination of airworthiness or of approved-part
///      status by any civil aviation authority.
interface IComponentRegistry {
    /*//////////////////////////////////////////////////////////////
                                  TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Category of component.
    enum ComponentKind {
        /// @notice Reserved sentinel. Never valid as an argument.
        UNSPECIFIED,
        /// @notice Propulsion engine.
        ENGINE,
        /// @notice Auxiliary power unit.
        APU,
        /// @notice Landing gear assembly.
        LANDING_GEAR,
        /// @notice Avionics unit.
        AVIONICS,
        /// @notice Primary or secondary airframe structure.
        AIRFRAME_STRUCTURE,
        /// @notice Cabin interior item.
        INTERIOR,
        /// @notice Propeller assembly.
        PROPELLER,
        /// @notice Any component outside the enumerated categories.
        OTHER
    }

    /// @notice Lifecycle state of a component.
    enum ComponentStatus {
        /// @notice Reserved sentinel, and the value of any unregistered id.
        NONE,
        /// @notice Exists and is not fitted to any airframe.
        UNINSTALLED,
        /// @notice Fitted to exactly one parent airframe.
        INSTALLED,
        /// @notice Away for repair or overhaul.
        IN_REPAIR,
        /// @notice Held as a suspected unapproved part.
        QUARANTINED,
        /// @notice Terminal. Permanently withdrawn.
        SCRAPPED
    }

    /// @notice Component data attached to an asset id.
    /// @dev Packed to two slots.
    /// @param parentAssetId The airframe this component is fitted to. **Non-zero if
    ///        and only if `status == INSTALLED`.**
    /// @param installedAt Unix time of the current installation, or 0.
    /// @param removedAt Unix time of the most recent removal, or 0.
    /// @param position Fitment position, e.g. engine position 1..4. Meaningful only
    ///        while installed.
    /// @param kind Category of component. Immutable after registration.
    /// @param status Current lifecycle state.
    /// @param partNumber Short-string part number.
    struct Component {
        uint64 parentAssetId;
        uint40 installedAt;
        uint40 removedAt;
        uint16 position;
        ComponentKind kind;
        ComponentStatus status;
        bytes32 partNumber;
    }

    /// @notice Arguments for {registerComponent}.
    /// @param orgId The registering organization. The caller must act for it.
    /// @param owner The initial owner. Must be non-zero.
    /// @param serialNumberHash Commitment to the component serial number. May be 0.
    /// @param metadataHash Commitment to off-chain asset metadata. May be 0.
    /// @param uri Off-chain metadata location. May be empty.
    /// @param kind Category of component. Must not be `UNSPECIFIED`.
    /// @param partNumber Short-string part number. Must be non-zero.
    struct ComponentParams {
        uint256 orgId;
        address owner;
        bytes32 serialNumberHash;
        bytes32 metadataHash;
        string uri;
        ComponentKind kind;
        bytes32 partNumber;
    }

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when component data is attached to a newly minted asset id.
    /// @param assetId The asset id minted by `AssetRegistry`.
    /// @param kind The category of component.
    /// @param partNumber The part number.
    event ComponentRegistered(uint256 indexed assetId, ComponentKind kind, bytes32 partNumber);

    /// @notice Emitted when a component is fitted to an airframe.
    /// @param componentAssetId The component's asset id.
    /// @param parentAssetId The airframe's asset id.
    /// @param position The fitment position.
    event ComponentInstalled(uint256 indexed componentAssetId, uint256 indexed parentAssetId, uint16 position);

    /// @notice Emitted when a component ceases to be fitted to an airframe.
    /// @dev Fires on **every** exit from `INSTALLED`, including repair, quarantine and
    ///      scrapping — not only on an explicit removal.
    /// @param componentAssetId The component's asset id.
    /// @param previousParentAssetId The airframe it was fitted to.
    event ComponentRemoved(uint256 indexed componentAssetId, uint256 indexed previousParentAssetId);

    /// @notice Emitted on every component lifecycle transition.
    /// @param componentAssetId The component's asset id.
    /// @param oldStatus The status before the transition.
    /// @param newStatus The status after the transition.
    event ComponentStatusChanged(
        uint256 indexed componentAssetId, ComponentStatus indexed oldStatus, ComponentStatus indexed newStatus
    );

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when no component data exists for an asset id.
    /// @param assetId The offending id.
    error ComponentNotFound(uint256 assetId);

    /// @notice Thrown when a lifecycle transition is not permitted.
    /// @param from The current status.
    /// @param to The attempted status.
    error InvalidComponentTransition(ComponentStatus from, ComponentStatus to);

    /// @notice Thrown when `UNSPECIFIED` is supplied as a component kind.
    /// @param provided The offending value.
    error InvalidComponentKind(ComponentKind provided);

    /// @notice Thrown when a component is not currently installed.
    /// @param assetId The component's asset id.
    error ComponentNotInstalled(uint256 assetId);

    /// @notice Thrown when installing a component that is already fitted.
    /// @param assetId The component's asset id.
    /// @param parentAssetId The airframe it is already fitted to.
    error ComponentAlreadyInstalled(uint256 assetId, uint256 parentAssetId);

    /// @notice Thrown when another component of the same kind occupies the position.
    /// @param parentAssetId The airframe.
    /// @param kind The component category.
    /// @param position The contested position.
    /// @param occupantAssetId The component already fitted there.
    error PositionOccupied(uint256 parentAssetId, ComponentKind kind, uint16 position, uint256 occupantAssetId);

    /// @notice Thrown when the proposed parent is not an aircraft.
    /// @param parentAssetId The offending id.
    error ParentNotAircraft(uint256 parentAssetId);

    /// @notice Thrown when a component would be installed into itself.
    /// @param assetId The offending id.
    error SelfInstallation(uint256 assetId);

    /// @notice Thrown when `INSTALLED` is requested through the generic status setter.
    /// @dev Installation needs a parent and a position, so it has its own entry point.
    error UseInstallComponent();

    /*//////////////////////////////////////////////////////////////
                                FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Registers a component, minting an asset id and attaching component data.
    /// @dev The caller must be acting for `params.orgId`, which must be `VERIFIED`.
    ///      The generic `AssetKind` is derived from `params.kind`, so the two can never
    ///      disagree.
    /// @param params The registration arguments.
    /// @return assetId The newly minted asset id.
    function registerComponent(ComponentParams calldata params) external returns (uint256 assetId);

    /// @notice Fits a component to an airframe.
    /// @dev Callable by an address that owns **both** the component and the airframe.
    ///      The component must be `UNINSTALLED`, the parent must be a non-terminal
    ///      aircraft, and the position must be free for that component kind.
    /// @param componentAssetId The component to fit.
    /// @param parentAssetId The airframe to fit it to.
    /// @param position The fitment position.
    function installComponent(uint256 componentAssetId, uint256 parentAssetId, uint16 position) external;

    /// @notice Removes a fitted component from its airframe.
    /// @dev Callable by the owner of the component. The component returns to
    ///      `UNINSTALLED`.
    /// @param componentAssetId The component to remove.
    function removeComponent(uint256 componentAssetId) external;

    /// @notice Moves a component to a new lifecycle status.
    /// @dev Callable by the component's owner. Cannot be used to reach `INSTALLED` —
    ///      use {installComponent}. Leaving `INSTALLED` by any path detaches the
    ///      component from its parent, which is what makes `INV-COMP-01` hold.
    /// @param componentAssetId The component's asset id.
    /// @param newStatus The status to move to.
    function setComponentStatus(uint256 componentAssetId, ComponentStatus newStatus) external;

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the component data for an asset.
    /// @param assetId The asset id.
    /// @return The component record.
    function getComponent(uint256 assetId) external view returns (Component memory);

    /// @notice Reports whether component data exists for an asset id.
    /// @param assetId The asset id.
    /// @return True if a record exists.
    function isComponent(uint256 assetId) external view returns (bool);

    /// @notice Returns the number of components currently fitted to an airframe.
    /// @param parentAssetId The airframe.
    /// @return The count of installed components.
    function componentCountOf(uint256 parentAssetId) external view returns (uint256);

    /// @notice Returns a page of the components fitted to an airframe.
    /// @dev Paginated because the installed set is unbounded. No state-changing path
    ///      in the protocol ever iterates it (`docs/security-model.md` §5).
    /// @param parentAssetId The airframe.
    /// @param offset Index to start from.
    /// @param limit Maximum number of ids to return.
    /// @return ids The component asset ids in the requested page.
    function componentsOf(uint256 parentAssetId, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids);

    /// @notice Returns the component occupying a position on an airframe.
    /// @param parentAssetId The airframe.
    /// @param kind The component category.
    /// @param position The fitment position.
    /// @return The occupying component's asset id, or 0 if free.
    function positionOccupant(uint256 parentAssetId, ComponentKind kind, uint16 position)
        external
        view
        returns (uint256);
}
