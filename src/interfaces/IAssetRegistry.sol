// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IAssetRegistry
/// @author AeroAsset Protocol
/// @notice Interface, types, events and errors for the generic aviation asset registry.
/// @dev Sub-layer L2b. Owns the protocol's **single global asset-id space**: aircraft
///      and components do not mint their own ids, they attach specialized data to an
///      id minted here. That removes an entire class of "same id, different registry"
///      ambiguity (`docs/architecture.md` §D2).
///
///      **Registration and verification are independent axes.** Registering an asset
///      never verifies it (roadmap §7, `INV-ASSET-03`). Verification is
///      `verifiedAt != 0` rather than a status value or a boolean, so there is exactly
///      one source of truth for it.
///
///      **Non-claim.** A verified flag records that an authorized protocol role
///      attested to an asset at a point in time. It is **not** an airworthiness
///      certification, not a statement of legal title, and not the position of any
///      civil aviation authority.
interface IAssetRegistry {
    /*//////////////////////////////////////////////////////////////
                                  TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Category of aviation asset.
    enum AssetKind {
        /// @notice Reserved sentinel. Never valid as an argument.
        UNSPECIFIED,
        /// @notice A complete airframe.
        AIRCRAFT,
        /// @notice A propulsion engine.
        ENGINE,
        /// @notice An auxiliary power unit.
        APU,
        /// @notice A major installable component, e.g. landing gear or avionics.
        COMPONENT,
        /// @notice An individual part.
        PART,
        /// @notice Ground or support equipment.
        EQUIPMENT
    }

    /// @notice Operational lifecycle state of an asset.
    /// @dev Verification is **not** represented here; see {Asset}.
    enum AssetStatus {
        /// @notice Reserved sentinel, and the value of any unregistered id.
        NONE,
        /// @notice Exists in the registry. Explicitly not verified.
        REGISTERED,
        /// @notice In active operational service.
        IN_SERVICE,
        /// @notice Preserved or parked, not in service.
        STORED,
        /// @notice Undergoing maintenance.
        UNDER_MAINTENANCE,
        /// @notice Terminal. Permanently withdrawn from service.
        RETIRED,
        /// @notice Terminal. Physically destroyed.
        DESTROYED
    }

    /// @notice A registered aviation asset.
    /// @dev Packed to three slots; see `docs/storage-model.md` §2. There is
    ///      deliberately no `updatedAt`: it is fully reconstructible from events and
    ///      would cost an extra slot plus an SSTORE on every write.
    /// @param registrarOrgId Organization that registered the asset.
    /// @param verifierOrgId Organization credited with verification, or 0.
    /// @param registeredAt Unix time of registration.
    /// @param verifiedAt Unix time of verification, or 0 while unverified.
    /// @param kind Category of asset. Immutable after registration.
    /// @param status Current operational status.
    struct Asset {
        uint64 registrarOrgId;
        uint64 verifierOrgId;
        uint40 registeredAt;
        uint40 verifiedAt;
        AssetKind kind;
        AssetStatus status;
        bytes32 serialNumberHash;
        bytes32 metadataHash;
    }

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when an asset is registered.
    /// @param assetId The newly minted asset id.
    /// @param registrarOrgId The registering organization.
    /// @param owner The initial owner.
    /// @param kind The category of asset.
    /// @param serialNumberHash Commitment to the serial number, or 0 if none recorded.
    event AssetRegistered(
        uint256 indexed assetId,
        uint256 indexed registrarOrgId,
        address indexed owner,
        AssetKind kind,
        bytes32 serialNumberHash
    );

    /// @notice Emitted on every operational status transition.
    /// @param assetId The asset id.
    /// @param oldStatus The status before the transition.
    /// @param newStatus The status after the transition.
    event AssetStatusChanged(uint256 indexed assetId, AssetStatus indexed oldStatus, AssetStatus indexed newStatus);

    /// @notice Emitted when an asset's verification state changes.
    /// @param assetId The asset id.
    /// @param verifierOrgId The organization credited, or 0.
    /// @param verified True on verification, false on withdrawal.
    /// @param by The account that performed the change.
    event AssetVerificationChanged(uint256 indexed assetId, uint256 indexed verifierOrgId, bool verified, address by);

    /// @notice Emitted when an asset's off-chain metadata reference changes.
    /// @param assetId The asset id.
    /// @param metadataHash The new metadata commitment.
    /// @param metadataURI The new off-chain metadata location.
    event AssetMetadataUpdated(uint256 indexed assetId, bytes32 metadataHash, string metadataURI);

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when an asset id does not exist.
    /// @param assetId The offending id.
    error AssetNotFound(uint256 assetId);

    /// @notice Thrown when a serial-number commitment is already registered.
    /// @param serialHash The commitment that is already taken.
    /// @param existingAssetId The asset already holding it.
    error SerialNumberTaken(bytes32 serialHash, uint256 existingAssetId);

    /// @notice Thrown when an operational status transition is not permitted.
    /// @param from The current status.
    /// @param to The attempted status.
    error InvalidAssetTransition(AssetStatus from, AssetStatus to);

    /// @notice Thrown when an action requires a non-terminal asset.
    /// @param assetId The asset id.
    /// @param status Its terminal status.
    error AssetTerminal(uint256 assetId, AssetStatus status);

    /// @notice Thrown when an asset is not of the required kind.
    /// @param assetId The asset id.
    /// @param expected The kind required.
    /// @param actual The asset's actual kind.
    error InvalidAssetKind(uint256 assetId, AssetKind expected, AssetKind actual);

    /// @notice Thrown when `UNSPECIFIED` is supplied as an asset kind.
    /// @param provided The offending value.
    error UnspecifiedAssetKind(AssetKind provided);

    /// @notice Thrown when verifying an already-verified asset.
    /// @param assetId The asset id.
    error AssetAlreadyVerified(uint256 assetId);

    /// @notice Thrown when withdrawing verification from an unverified asset.
    /// @param assetId The asset id.
    error AssetNotVerified(uint256 assetId);

    /// @notice Thrown when the caller may not act on an asset.
    /// @param assetId The asset id.
    /// @param caller The unauthorized caller.
    error NotAssetController(uint256 assetId, address caller);

    /*//////////////////////////////////////////////////////////////
                              REGISTRATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Registers a new asset on behalf of a verified organization.
    /// @dev The caller must be acting for `orgId`, which must be `VERIFIED`. The asset
    ///      lands in `REGISTERED` and is **never** verified by this call.
    /// @param orgId The registering organization.
    /// @param owner The initial owner. Must be non-zero.
    /// @param kind The category of asset. Must not be `UNSPECIFIED`.
    /// @param serialNumberHash Commitment to the serial number, or 0 if the asset has
    ///        none. Non-zero values are unique protocol-wide.
    /// @param metadataHash Commitment to off-chain metadata. May be 0.
    /// @param uri Off-chain metadata location. May be empty.
    /// @return assetId The newly minted asset id.
    function registerAsset(
        uint256 orgId,
        address owner,
        AssetKind kind,
        bytes32 serialNumberHash,
        bytes32 metadataHash,
        string calldata uri
    ) external returns (uint256 assetId);

    /// @notice Mints an asset id on behalf of a specialization registry.
    /// @dev Restricted to `ASSET_MINTER_ROLE`, held only by `AircraftRegistry` and
    ///      `ComponentRegistry`. Those registries perform their own organization
    ///      membership check on the original caller before delegating here; this
    ///      function re-checks only that `orgId` is `VERIFIED`. It exists because a
    ///      specialization registry cannot forward `msg.sender` through a call.
    /// @param orgId The registering organization.
    /// @param owner The initial owner. Must be non-zero.
    /// @param kind The category of asset. Must not be `UNSPECIFIED`.
    /// @param serialNumberHash Commitment to the serial number, or 0.
    /// @param metadataHash Commitment to off-chain metadata. May be 0.
    /// @param uri Off-chain metadata location. May be empty.
    /// @return assetId The newly minted asset id.
    function registerAssetFor(
        uint256 orgId,
        address owner,
        AssetKind kind,
        bytes32 serialNumberHash,
        bytes32 metadataHash,
        string calldata uri
    ) external returns (uint256 assetId);

    /*//////////////////////////////////////////////////////////////
                                MUTATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Updates an asset's off-chain metadata reference.
    /// @dev Callable by the current owner or by an address acting for the registrar
    ///      organization.
    /// @param assetId The asset id.
    /// @param metadataHash The new metadata commitment.
    /// @param uri The new off-chain metadata location.
    function updateAssetMetadata(uint256 assetId, bytes32 metadataHash, string calldata uri) external;

    /// @notice Moves an asset to a new operational status.
    /// @dev Callable by the current owner. Entering a terminal status freezes the
    ///      asset's transferability in `AssetOwnership`, atomically.
    /// @param assetId The asset id.
    /// @param newStatus The status to move to.
    function setAssetStatus(uint256 assetId, AssetStatus newStatus) external;

    /// @notice Records that an asset has been verified.
    /// @dev Restricted to `ASSET_VERIFIER_ROLE`. Deliberately separate from
    ///      registration: a registered asset must never become verified implicitly.
    /// @param assetId The asset id.
    /// @param verifierOrgId Organization to credit, or 0 for protocol verification.
    ///        If non-zero it must be `VERIFIED`.
    function verifyAsset(uint256 assetId, uint256 verifierOrgId) external;

    /// @notice Withdraws an asset's verification.
    /// @dev Restricted to `ASSET_VERIFIER_ROLE`.
    /// @param assetId The asset id.
    function unverifyAsset(uint256 assetId) external;

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the full record for an asset.
    /// @param assetId The asset id.
    /// @return The asset record.
    function getAsset(uint256 assetId) external view returns (Asset memory);

    /// @notice Reports whether an asset id exists.
    /// @param assetId The asset id.
    /// @return True if a record exists.
    function exists(uint256 assetId) external view returns (bool);

    /// @notice Reports whether an asset has been verified.
    /// @param assetId The asset id.
    /// @return True if `verifiedAt` is non-zero.
    function isVerified(uint256 assetId) external view returns (bool);

    /// @notice Reports whether an asset is in a terminal status.
    /// @param assetId The asset id.
    /// @return True if the asset is `RETIRED` or `DESTROYED`.
    function isTerminal(uint256 assetId) external view returns (bool);

    /// @notice Reverts unless an asset exists and is of the given kind.
    /// @dev Used by the specialization registries to refuse mismatched ids.
    /// @param assetId The asset id.
    /// @param kind The required kind.
    function requireKind(uint256 assetId, AssetKind kind) external view;

    /// @notice Returns the asset holding a given serial-number commitment.
    /// @param serialHash The commitment to look up.
    /// @return The asset id, or 0 if unused.
    function assetIdBySerialHash(bytes32 serialHash) external view returns (uint256);

    /// @notice Returns an asset's off-chain metadata location.
    /// @param assetId The asset id.
    /// @return The stored URI, which may be empty.
    function metadataURI(uint256 assetId) external view returns (string memory);

    /// @notice Returns the number of assets registered so far.
    /// @dev Ids are dense: every value in `1..assetCount()` exists.
    /// @return The highest minted asset id.
    function assetCount() external view returns (uint256);
}
