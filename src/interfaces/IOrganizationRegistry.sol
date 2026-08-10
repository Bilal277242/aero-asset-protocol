// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IOrganizationRegistry
/// @author AeroAsset Protocol
/// @notice Interface, types, events and errors for the aviation organization registry.
/// @dev Types live on the interface so that every downstream consumer imports one file.
///      Field-level semantics are specified in `docs/asset-model.md` §1 and the
///      lifecycle in `docs/state-machines.md` §1.
///
///      Non-claim: a record here reflects what an authorized protocol role attested,
///      and is **not** the position of any civil aviation authority.
interface IOrganizationRegistry {
    /*//////////////////////////////////////////////////////////////
                                  TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Category of aviation business an organization represents.
    enum OrganizationType {
        /// @notice Reserved sentinel. Never valid as an argument.
        UNSPECIFIED,
        /// @notice Scheduled or charter air carrier.
        AIRLINE,
        /// @notice Aircraft operator that is not itself a carrier.
        OPERATOR,
        /// @notice Maintenance, repair and overhaul provider.
        MRO,
        /// @notice Original equipment manufacturer.
        MANUFACTURER,
        /// @notice Aircraft or engine lessor.
        LESSOR,
        /// @notice Transaction intermediary.
        BROKER,
        /// @notice Parts distributor or supplier.
        SUPPLIER,
        /// @notice Independent inspection body.
        INSPECTOR
    }

    /// @notice Lifecycle state of an organization record.
    enum OrganizationStatus {
        /// @notice Reserved sentinel, and the value of any unregistered id.
        NONE,
        /// @notice Self-registered and unverified. May not register assets.
        PENDING,
        /// @notice Verified by `ORG_VERIFIER_ROLE`. May act within the protocol.
        VERIFIED,
        /// @notice Reversibly suspended. May not act until reactivated.
        SUSPENDED,
        /// @notice Terminal. No transition leaves this state.
        REVOKED
    }

    /// @notice A registered aviation organization.
    /// @dev Packed to exactly three slots; see `docs/storage-model.md` §2. Slot 0 is
    ///      exactly full at 32 bytes, so no field may be added to it without widening
    ///      the struct.
    /// @param admin Controlling address. Transferred in two steps.
    /// @param registeredAt Unix time of registration.
    /// @param verifiedAt Unix time of first verification, or 0 while unverified.
    /// @param orgType Category of aviation business.
    /// @param status Current lifecycle state.
    /// @param nameHash `keccak256` commitment to the legal name. Unique protocol-wide.
    /// @param metadataHash Commitment to the off-chain organization profile. May be 0.
    struct Organization {
        address admin;
        uint40 registeredAt;
        uint40 verifiedAt;
        OrganizationType orgType;
        OrganizationStatus status;
        bytes32 nameHash;
        bytes32 metadataHash;
    }

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a new organization is self-registered into `PENDING`.
    /// @param orgId The newly minted organization id.
    /// @param admin The registering address, which becomes the organization admin.
    /// @param orgType The declared category of aviation business.
    /// @param nameHash The commitment to the organization's legal name.
    event OrganizationRegistered(
        uint256 indexed orgId, address indexed admin, OrganizationType orgType, bytes32 nameHash
    );

    /// @notice Emitted when an organization's off-chain profile reference changes.
    /// @param orgId The organization id.
    /// @param metadataHash The new profile commitment.
    /// @param metadataURI The new off-chain profile location.
    event OrganizationUpdated(uint256 indexed orgId, bytes32 metadataHash, string metadataURI);

    /// @notice Emitted on every organization lifecycle transition.
    /// @param orgId The organization id.
    /// @param oldStatus The status before the transition.
    /// @param newStatus The status after the transition.
    /// @param by The account that performed the transition.
    event OrganizationStatusChanged(
        uint256 indexed orgId, OrganizationStatus indexed oldStatus, OrganizationStatus indexed newStatus, address by
    );

    /// @notice Emitted when an admin transfer is proposed.
    /// @param orgId The organization id.
    /// @param from The current admin.
    /// @param to The proposed admin, who must accept before it takes effect.
    event OrganizationAdminTransferStarted(uint256 indexed orgId, address indexed from, address indexed to);

    /// @notice Emitted when a proposed admin transfer is cancelled before acceptance.
    /// @param orgId The organization id.
    /// @param cancelledBy The account that cancelled it.
    event OrganizationAdminTransferCancelled(uint256 indexed orgId, address indexed cancelledBy);

    /// @notice Emitted when an admin transfer is accepted and takes effect.
    /// @param orgId The organization id.
    /// @param from The previous admin.
    /// @param to The new admin.
    event OrganizationAdminTransferred(uint256 indexed orgId, address indexed from, address indexed to);

    /// @notice Emitted when an operator is granted or removed.
    /// @param orgId The organization id.
    /// @param operator The operator address.
    /// @param allowed True if granted, false if removed.
    event OrganizationOperatorSet(uint256 indexed orgId, address indexed operator, bool allowed);

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when an organization id does not exist.
    /// @param orgId The offending id.
    error OrganizationNotFound(uint256 orgId);

    /// @notice Thrown when a legal-name commitment is already registered.
    /// @dev Blocks the duplicate-identity attack in which an attacker registers a copy
    ///      of a real organization. See `docs/threat-model.md` T-03.
    /// @param nameHash The commitment that is already taken.
    /// @param existingOrgId The organization already holding it.
    error OrganizationNameTaken(bytes32 nameHash, uint256 existingOrgId);

    /// @notice Thrown when an action requires a `VERIFIED` organization.
    /// @param orgId The organization id.
    /// @param status Its actual status.
    error OrganizationNotVerified(uint256 orgId, OrganizationStatus status);

    /// @notice Thrown when a lifecycle transition is not permitted.
    /// @param from The current status.
    /// @param to The attempted status.
    error InvalidOrganizationTransition(OrganizationStatus from, OrganizationStatus to);

    /// @notice Thrown when a caller is not the organization's admin.
    /// @param orgId The organization id.
    /// @param caller The unauthorized caller.
    error NotOrganizationAdmin(uint256 orgId, address caller);

    /// @notice Thrown when a caller is neither the admin nor an operator of an
    ///         organization that is otherwise eligible to act.
    /// @param orgId The organization id.
    /// @param caller The unauthorized caller.
    error NotActingForOrganization(uint256 orgId, address caller);

    /// @notice Thrown when accepting an admin transfer that was never proposed.
    /// @param orgId The organization id.
    error NoPendingAdminTransfer(uint256 orgId);

    /// @notice Thrown when a caller is not the proposed incoming admin.
    /// @param orgId The organization id.
    /// @param caller The unauthorized caller.
    /// @param pendingAdmin The address that may accept.
    error NotPendingAdmin(uint256 orgId, address caller, address pendingAdmin);

    /// @notice Thrown when `UNSPECIFIED` is supplied as an organization type.
    /// @param provided The offending value.
    error InvalidOrganizationType(OrganizationType provided);

    /// @notice Thrown when an admin transfer targets the current admin.
    /// @param orgId The organization id.
    error AdminTransferToCurrentAdmin(uint256 orgId);

    /*//////////////////////////////////////////////////////////////
                            STATE-CHANGING
    //////////////////////////////////////////////////////////////*/

    /// @notice Self-registers a new organization in the `PENDING` state.
    /// @dev Permissionless by design: verification, not registration, is the trust
    ///      boundary. A `PENDING` organization can perform no protocol action, so
    ///      open registration creates no privilege — only a queue for verifiers.
    /// @param orgType The category of aviation business. Must not be `UNSPECIFIED`.
    /// @param nameHash Commitment to the legal name. Must be non-zero and unused.
    /// @param metadataHash Commitment to the off-chain profile. May be zero.
    /// @param uri Off-chain profile location. May be empty.
    /// @return orgId The newly minted organization id.
    function registerOrganization(OrganizationType orgType, bytes32 nameHash, bytes32 metadataHash, string calldata uri)
        external
        returns (uint256 orgId);

    /// @notice Updates an organization's off-chain profile reference.
    /// @dev Restricted to the organization admin. Cannot change type, status or name.
    /// @param orgId The organization id.
    /// @param metadataHash The new profile commitment.
    /// @param uri The new off-chain profile location.
    function updateOrganization(uint256 orgId, bytes32 metadataHash, string calldata uri) external;

    /// @notice Proposes a new admin for an organization.
    /// @dev Step one of two. A one-step transfer to a mistyped address would orphan the
    ///      organization's entire asset portfolio with no recovery path.
    /// @param orgId The organization id.
    /// @param newAdmin The proposed admin. Must be non-zero and not the current admin.
    function transferOrganizationAdmin(uint256 orgId, address newAdmin) external;

    /// @notice Cancels a pending admin transfer.
    /// @dev Callable by the current admin or by the proposed incoming admin.
    /// @param orgId The organization id.
    function cancelOrganizationAdminTransfer(uint256 orgId) external;

    /// @notice Accepts a pending admin transfer.
    /// @dev Step two of two. Callable only by the proposed incoming admin.
    /// @param orgId The organization id.
    function acceptOrganizationAdmin(uint256 orgId) external;

    /// @notice Grants or removes an operator for an organization.
    /// @dev Operators may act for the organization but cannot manage admins or operators.
    /// @param orgId The organization id.
    /// @param operator The operator address. Must be non-zero.
    /// @param allowed True to grant, false to remove.
    function setOperator(uint256 orgId, address operator, bool allowed) external;

    /// @notice Promotes a `PENDING` organization to `VERIFIED`.
    /// @dev Restricted to `ORG_VERIFIER_ROLE`.
    /// @param orgId The organization id.
    function verifyOrganization(uint256 orgId) external;

    /// @notice Rejects a `PENDING` organization, moving it to the terminal `REVOKED` state.
    /// @dev Restricted to `ORG_VERIFIER_ROLE`.
    /// @param orgId The organization id.
    function rejectOrganization(uint256 orgId) external;

    /// @notice Reversibly suspends a `VERIFIED` organization.
    /// @dev Restricted to `ORG_VERIFIER_ROLE`. Does not invalidate records the
    ///      organization previously created — history is append-only.
    /// @param orgId The organization id.
    function suspendOrganization(uint256 orgId) external;

    /// @notice Returns a `SUSPENDED` organization to `VERIFIED`.
    /// @dev Restricted to `ORG_VERIFIER_ROLE`.
    /// @param orgId The organization id.
    function reactivateOrganization(uint256 orgId) external;

    /// @notice Permanently revokes an organization.
    /// @dev Restricted to `PROTOCOL_ADMIN_ROLE` because the effect is irreversible;
    ///      suspension is the reversible tool for routine compliance action.
    /// @param orgId The organization id.
    function revokeOrganization(uint256 orgId) external;

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the full record for an organization.
    /// @param orgId The organization id.
    /// @return The organization record.
    function getOrganization(uint256 orgId) external view returns (Organization memory);

    /// @notice Reports whether `account` may act for `orgId`.
    /// @dev True only when the organization is `VERIFIED` **and** `account` is its
    ///      admin or a registered operator. This is the protocol's data-driven
    ///      authorization primitive, used wherever a role grant would not scale.
    /// @param orgId The organization id.
    /// @param account The account to test.
    /// @return True if `account` may act for the organization.
    function isActingFor(uint256 orgId, address account) external view returns (bool);

    /// @notice Reverts unless `account` may act for `orgId`.
    /// @dev Convenience for consuming modules, so the `VERIFIED` check and its revert
    ///      shape are written once rather than repeated per call site.
    /// @param orgId The organization id.
    /// @param account The account to check.
    function requireActingFor(uint256 orgId, address account) external view;

    /// @notice Reports whether an organization is currently `VERIFIED`.
    /// @param orgId The organization id.
    /// @return True if the organization exists and is `VERIFIED`.
    function isVerified(uint256 orgId) external view returns (bool);

    /// @notice Reports whether `account` is a registered operator of `orgId`.
    /// @dev Ignores organization status; use {isActingFor} for authorization.
    /// @param orgId The organization id.
    /// @param account The account to test.
    /// @return True if `account` is an operator.
    function isOperator(uint256 orgId, address account) external view returns (bool);

    /// @notice Returns the organization holding a given legal-name commitment.
    /// @param nameHash The commitment to look up.
    /// @return The organization id, or 0 if unused.
    function organizationIdByNameHash(bytes32 nameHash) external view returns (uint256);

    /// @notice Returns the address that may accept an organization's admin transfer.
    /// @param orgId The organization id.
    /// @return The proposed incoming admin, or `address(0)` if none is pending.
    function pendingAdmin(uint256 orgId) external view returns (address);

    /// @notice Returns an organization's off-chain profile location.
    /// @param orgId The organization id.
    /// @return The stored URI, which may be empty.
    function metadataURI(uint256 orgId) external view returns (string memory);

    /// @notice Returns the number of organizations registered so far.
    /// @dev Ids are dense: every value in `1..organizationCount()` exists.
    /// @return The highest minted organization id.
    function organizationCount() external view returns (uint256);
}
