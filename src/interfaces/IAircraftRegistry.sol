// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IAircraftRegistry
/// @author AeroAsset Protocol
/// @notice Interface, types, events and errors for aircraft-specific asset data.
/// @dev Sub-layer L2c. Aircraft do not have their own id space — this registry
///      attaches airframe data to an `assetId` minted by `AssetRegistry`
///      (`docs/architecture.md` §D2), so an aircraft is always also a generic asset
///      with an owner, a status and a verification state.
///
///      **Non-claim.** Records here describe what a registering organization
///      asserted. They are not a statement of airworthiness, not a certificate of
///      registration, and not the position of any civil aviation authority.
interface IAircraftRegistry {
    /*//////////////////////////////////////////////////////////////
                                  TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Broad operational category of an airframe.
    enum AircraftCategory {
        /// @notice Reserved sentinel. Never valid as an argument.
        UNSPECIFIED,
        /// @notice Large transport-category passenger aircraft.
        COMMERCIAL_TRANSPORT,
        /// @notice Business or corporate jet.
        BUSINESS_JET,
        /// @notice Turboprop-powered aircraft.
        TURBOPROP,
        /// @notice Helicopter or other rotary-wing aircraft.
        ROTORCRAFT,
        /// @notice Light general-aviation aircraft.
        GENERAL_AVIATION,
        /// @notice Dedicated or converted cargo aircraft.
        FREIGHTER,
        /// @notice Uncrewed aircraft system.
        UAS
    }

    /// @notice Airframe data attached to an asset id.
    /// @dev Packed to four slots; see `docs/storage-model.md` §2.
    /// @param manufacturerOrgId Registered OEM organization, or 0 if the OEM is not a
    ///        protocol participant.
    /// @param manufactureYear Year of manufacture.
    /// @param category Broad operational category.
    /// @param model Short-string model designation, e.g. `"A320-214"`.
    /// @param manufacturerName Short-string OEM name, used when `manufacturerOrgId`
    ///        is 0.
    /// @param registrationMarkHash Commitment to the registration mark (tail number).
    struct Aircraft {
        uint64 manufacturerOrgId;
        uint16 manufactureYear;
        AircraftCategory category;
        bytes32 model;
        bytes32 manufacturerName;
        bytes32 registrationMarkHash;
    }

    /// @notice Arguments for {registerAircraft}.
    /// @dev Grouped into a struct because the flat parameter list would exceed the
    ///      EVM's practical stack depth.
    /// @param orgId The registering organization. The caller must act for it.
    /// @param owner The initial owner. Must be non-zero.
    /// @param serialNumberHash Commitment to the manufacturer serial number (MSN).
    /// @param metadataHash Commitment to off-chain asset metadata. May be 0.
    /// @param uri Off-chain metadata location. May be empty.
    /// @param manufacturerOrgId Registered OEM organization, or 0.
    /// @param manufacturerName Short-string OEM name, required when
    ///        `manufacturerOrgId` is 0.
    /// @param model Short-string model designation. Must be non-zero.
    /// @param manufactureYear Year of manufacture. Must be within the sanity bounds.
    /// @param category Broad operational category. Must not be `UNSPECIFIED`.
    /// @param registrationMarkHash Commitment to the tail number. May be 0.
    struct AircraftParams {
        uint256 orgId;
        address owner;
        bytes32 serialNumberHash;
        bytes32 metadataHash;
        string uri;
        uint64 manufacturerOrgId;
        bytes32 manufacturerName;
        bytes32 model;
        uint16 manufactureYear;
        AircraftCategory category;
        bytes32 registrationMarkHash;
    }

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when aircraft data is attached to a newly minted asset id.
    /// @param assetId The asset id minted by `AssetRegistry`.
    /// @param manufacturerOrgId The OEM organization, or 0.
    /// @param model The model designation.
    /// @param manufactureYear The year of manufacture.
    /// @param category The operational category.
    event AircraftRegistered(
        uint256 indexed assetId,
        uint256 indexed manufacturerOrgId,
        bytes32 model,
        uint16 manufactureYear,
        AircraftCategory category
    );

    /// @notice Emitted when mutable airframe data changes.
    /// @dev `manufactureYear` and the manufacturer fields are immutable build facts
    ///      and are deliberately absent. `category` is mutable because conversions
    ///      (for example passenger to freighter) genuinely change it.
    /// @param assetId The asset id.
    /// @param model The new model designation.
    /// @param category The new operational category.
    /// @param registrationMarkHash The new tail-number commitment.
    event AircraftUpdated(
        uint256 indexed assetId, bytes32 model, AircraftCategory category, bytes32 registrationMarkHash
    );

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when no aircraft data exists for an asset id.
    /// @param assetId The offending id.
    error AircraftNotFound(uint256 assetId);

    /// @notice Thrown when a manufacture year is outside the sanity bounds.
    /// @dev A range check, not a correctness guarantee — it catches transposed digits
    ///      and uninitialized values, nothing more.
    /// @param year The offending value.
    error InvalidManufactureYear(uint16 year);

    /// @notice Thrown when `UNSPECIFIED` is supplied as an aircraft category.
    /// @param provided The offending value.
    error InvalidAircraftCategory(AircraftCategory provided);

    /// @notice Thrown when neither a manufacturer organization nor a name is given.
    error MissingManufacturer();

    /*//////////////////////////////////////////////////////////////
                                FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Registers an aircraft, minting an asset id and attaching airframe data.
    /// @dev The caller must be acting for `params.orgId`, which must be `VERIFIED`.
    ///      This registry holds `ASSET_MINTER_ROLE` so it can mint on the
    ///      organization's behalf after performing that check itself.
    /// @param params The registration arguments.
    /// @return assetId The newly minted asset id.
    function registerAircraft(AircraftParams calldata params) external returns (uint256 assetId);

    /// @notice Updates the mutable airframe fields.
    /// @dev Callable by the current owner. Reverts if the asset is terminal.
    /// @param assetId The asset id.
    /// @param model The new model designation. Must be non-zero.
    /// @param category The new operational category. Must not be `UNSPECIFIED`.
    /// @param registrationMarkHash The new tail-number commitment. May be 0.
    function updateAircraft(uint256 assetId, bytes32 model, AircraftCategory category, bytes32 registrationMarkHash)
        external;

    /// @notice Returns the airframe data for an asset.
    /// @param assetId The asset id.
    /// @return The aircraft record.
    function getAircraft(uint256 assetId) external view returns (Aircraft memory);

    /// @notice Reports whether airframe data exists for an asset id.
    /// @param assetId The asset id.
    /// @return True if a record exists.
    function isAircraft(uint256 assetId) external view returns (bool);
}
