// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IOrganizationRegistry} from "./IOrganizationRegistry.sol";

/// @title IMaintenanceRegistry
/// @author AeroAsset Protocol
/// @notice Interface, types, events and errors for the maintenance event registry.
/// @dev Layer L3. Records are **append-only and immutable**: there is no edit and no
///      delete. A correction is a new record referencing the prior one off-chain.
///
///      Writing requires three independent conditions, all checked on-chain at record
///      time (roadmap §13): the caller acts for a `VERIFIED` organization, that
///      organization is of type `MRO`, and it holds a currently-valid
///      `MAINTENANCE_AUTHORITY` credential.
///
///      **Non-claim.** Recording maintenance is a protocol permission. It is **not** a
///      regulatory approval, **not** a certificate of release to service, and **not**
///      a determination of airworthiness by any civil aviation authority.
interface IMaintenanceRegistry {
    /*//////////////////////////////////////////////////////////////
                                  TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Category of maintenance event.
    enum MaintenanceType {
        /// @notice Reserved sentinel. Never valid as an argument.
        UNSPECIFIED,
        /// @notice Routine line maintenance check.
        LINE_CHECK,
        /// @notice A-check.
        A_CHECK,
        /// @notice B-check.
        B_CHECK,
        /// @notice C-check.
        C_CHECK,
        /// @notice Heavy D-check.
        D_CHECK,
        /// @notice Engine shop visit or overhaul.
        ENGINE_OVERHAUL,
        /// @notice Component replacement.
        COMPONENT_REPLACEMENT,
        /// @notice Airworthiness directive compliance.
        AD_COMPLIANCE,
        /// @notice Service bulletin compliance.
        SB_COMPLIANCE,
        /// @notice Unscheduled repair.
        REPAIR,
        /// @notice Inspection.
        INSPECTION,
        /// @notice Any event outside the enumerated categories.
        OTHER
    }

    /// @notice An immutable maintenance event record.
    /// @dev Packed to two slots. The credential relied upon is deliberately **not**
    ///      stored: it is emitted for audit, and no later on-chain logic reads it, so
    ///      storing it would cost a field for nothing.
    /// @param assetId The asset the work was performed on.
    /// @param performedByOrgId The MRO organization that performed it.
    /// @param documentId Supporting document, or 0 if none was registered.
    /// @param performedAt Real-world date the work was **claimed** to be performed. A
    ///        caller-supplied assertion, bounded only by not being in the future.
    /// @param recordedAt Block timestamp when the record was written on-chain. The
    ///        protocol's own observation, and the only date here it can vouch for.
    /// @param mType Category of maintenance event.
    /// @param recordHash Commitment to the full off-chain work package.
    struct MaintenanceRecord {
        uint64 assetId;
        uint64 performedByOrgId;
        uint64 documentId;
        uint40 performedAt;
        MaintenanceType mType;
        uint40 recordedAt;
        bytes32 recordHash;
    }

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a maintenance event is recorded.
    /// @dev `credentialId` is the credential that authorized this write at the time it
    ///      happened. It is the audit trail that lets a later reviewer pin each record
    ///      to a specific credential, even after that credential is revoked.
    /// @param recordId The newly minted record id.
    /// @param assetId The asset the work was performed on.
    /// @param performedByOrgId The MRO organization.
    /// @param mType Category of maintenance event.
    /// @param performedAt Real-world date of the work, as claimed by the MRO.
    /// @param recordedAt Block timestamp at which it was written on-chain. Emitted
    ///        explicitly, rather than left implicit in the log, so the gap between the
    ///        claimed and observed dates is a first-class field an indexer can filter on.
    /// @param credentialId The `MAINTENANCE_AUTHORITY` credential relied upon.
    /// @param documentId Supporting document, or 0.
    /// @param recordHash Commitment to the off-chain work package.
    event MaintenanceRecorded(
        uint256 indexed recordId,
        uint256 indexed assetId,
        uint256 indexed performedByOrgId,
        MaintenanceType mType,
        uint40 performedAt,
        uint40 recordedAt,
        uint256 credentialId,
        uint256 documentId,
        bytes32 recordHash
    );

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when a maintenance record id does not exist.
    /// @param recordId The offending id.
    error MaintenanceRecordNotFound(uint256 recordId);

    /// @notice Thrown when the organization is not of type `MRO`.
    /// @param orgId The organization id.
    /// @param orgType Its actual type.
    error NotAuthorizedMro(uint256 orgId, IOrganizationRegistry.OrganizationType orgType);

    /// @notice Thrown when the organization holds no valid maintenance credential.
    /// @dev Uses the O(1) `validCredentialOfType` lookup, which is why
    ///      `CredentialRegistry` enforces at most one valid credential per
    ///      `(organization, type)`.
    /// @param orgId The organization id.
    error NoValidMaintenanceCredential(uint256 orgId);

    /// @notice Thrown when a caller-supplied work date is in the future.
    /// @param performedAt The offending date.
    /// @param nowTs The block timestamp it was compared against.
    error PerformedAtInFuture(uint40 performedAt, uint40 nowTs);

    /// @notice Thrown when `UNSPECIFIED` is supplied as a maintenance type.
    /// @param provided The offending value.
    error InvalidMaintenanceType(MaintenanceType provided);

    /*//////////////////////////////////////////////////////////////
                                FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Records a maintenance event against an asset.
    /// @dev Requires the caller to act for `performedByOrgId`, that organization to be
    ///      `VERIFIED` and of type `MRO`, and to hold a valid `MAINTENANCE_AUTHORITY`
    ///      credential. All three are checked here, on-chain.
    /// @param assetId The asset worked on. Must exist and be non-terminal.
    /// @param performedByOrgId The MRO organization performing the work.
    /// @param mType Category of maintenance event. Must not be `UNSPECIFIED`.
    /// @param performedAt Real-world work date. Non-zero and not in the future.
    /// @param documentId Supporting document, or 0. If non-zero it must be `ACTIVE`
    ///        and describe the same asset.
    /// @param recordHash Commitment to the off-chain work package. Must be non-zero.
    /// @return recordId The newly minted record id.
    function recordMaintenance(
        uint256 assetId,
        uint256 performedByOrgId,
        MaintenanceType mType,
        uint40 performedAt,
        uint256 documentId,
        bytes32 recordHash
    ) external returns (uint256 recordId);

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the full record for a maintenance event.
    /// @param recordId The record id.
    /// @return The maintenance record.
    function getMaintenanceRecord(uint256 recordId) external view returns (MaintenanceRecord memory);

    /// @notice Returns the number of maintenance records against an asset.
    /// @param assetId The asset id.
    /// @return The count.
    function maintenanceCountOf(uint256 assetId) external view returns (uint256);

    /// @notice Returns a page of the maintenance records against an asset.
    /// @dev Paginated: the per-asset history is unbounded and no state-changing path
    ///      ever iterates it.
    /// @param assetId The asset id.
    /// @param offset Index to start from.
    /// @param limit Maximum number of ids to return.
    /// @return ids The record ids in the requested page.
    function maintenanceOf(uint256 assetId, uint256 offset, uint256 limit) external view returns (uint256[] memory ids);

    /// @notice Returns the number of maintenance records written so far.
    /// @return The highest minted record id.
    function maintenanceCount() external view returns (uint256);
}
