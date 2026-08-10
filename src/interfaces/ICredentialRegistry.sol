// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ICredentialRegistry
/// @author AeroAsset Protocol
/// @notice Interface, types, events and errors for the aviation credential registry.
/// @dev Field-level semantics are specified in `docs/asset-model.md` §1.4-1.5 and the
///      lifecycle in `docs/state-machines.md` §2.
///
///      **Non-claim.** A credential here records that an authorized protocol role
///      attested something about a subject at a point in time. It is not an approval,
///      certificate, or authorization issued by any civil aviation authority, and the
///      protocol makes no representation about the underlying real-world document.
interface ICredentialRegistry {
    /*//////////////////////////////////////////////////////////////
                                  TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Category of authority a credential attests to.
    enum CredentialType {
        /// @notice Reserved sentinel. Never valid as an argument.
        UNSPECIFIED,
        /// @notice Required to write to `MaintenanceRegistry` (Phase 5).
        MAINTENANCE_AUTHORITY,
        /// @notice Authority to perform and record inspections.
        INSPECTION_AUTHORITY,
        /// @notice Approval to manufacture assets or components.
        MANUFACTURING_APPROVAL,
        /// @notice Approval to operate aircraft.
        OPERATING_APPROVAL,
        /// @notice Approval to distribute parts.
        DISTRIBUTION_APPROVAL,
        /// @notice Any credential outside the enumerated categories.
        OTHER
    }

    /// @notice Lifecycle state of a credential record.
    enum CredentialStatus {
        /// @notice Reserved sentinel, and the value of any unissued id.
        NONE,
        /// @notice Issued and in force, subject to the expiry check.
        ACTIVE,
        /// @notice Reversibly held. Not valid while suspended.
        SUSPENDED,
        /// @notice Terminal. Recorded once real time has passed `expiresAt`.
        EXPIRED,
        /// @notice Terminal. Withdrawn by the issuer.
        REVOKED
    }

    /// @notice An issued aviation credential.
    /// @dev Packed to three slots; slot 0 is exactly full. See
    ///      `docs/storage-model.md` §2.
    /// @param issuerOrgId Organization that issued it, or 0 if protocol-issued.
    /// @param subjectOrgId Organization the credential is about, or 0 for an
    ///        address-only subject.
    /// @param issuedAt Unix time of issuance.
    /// @param expiresAt Unix time of expiry, or 0 for a credential that never expires.
    /// @param credType Category of authority attested.
    /// @param status Current lifecycle state.
    /// @param reserved Reserved for a future packed field. Always 0.
    /// @param subject Address form of the subject, or `address(0)`.
    /// @param credentialHash Commitment to the off-chain credential document.
    struct Credential {
        uint64 issuerOrgId;
        uint64 subjectOrgId;
        uint40 issuedAt;
        uint40 expiresAt;
        CredentialType credType;
        CredentialStatus status;
        uint32 reserved;
        address subject;
        bytes32 credentialHash;
    }

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a credential is issued.
    /// @param credentialId The newly minted credential id.
    /// @param issuerOrgId The issuing organization, or 0 if protocol-issued.
    /// @param subject The address subject, or `address(0)`.
    /// @param subjectOrgId The subject organization, or 0.
    /// @param credType The category of authority attested.
    /// @param expiresAt Expiry time, or 0 for no expiry.
    /// @param credentialHash Commitment to the off-chain credential document.
    event CredentialIssued(
        uint256 indexed credentialId,
        uint256 indexed issuerOrgId,
        address indexed subject,
        uint256 subjectOrgId,
        CredentialType credType,
        uint40 expiresAt,
        bytes32 credentialHash
    );

    /// @notice Emitted on every credential lifecycle transition.
    /// @param credentialId The credential id.
    /// @param oldStatus The status before the transition.
    /// @param newStatus The status after the transition.
    /// @param by The account that performed the transition.
    event CredentialStatusChanged(
        uint256 indexed credentialId, CredentialStatus indexed oldStatus, CredentialStatus indexed newStatus, address by
    );

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when a credential id does not exist.
    /// @param credentialId The offending id.
    error CredentialNotFound(uint256 credentialId);

    /// @notice Thrown when an action requires a currently-valid credential.
    /// @param credentialId The credential id.
    /// @param status Its stored status, which may be `ACTIVE` while expired by time.
    error CredentialNotValid(uint256 credentialId, CredentialStatus status);

    /// @notice Thrown when recording an expiry that has not yet occurred.
    /// @param credentialId The credential id.
    /// @param expiresAt Its expiry time, or 0 if it never expires.
    error CredentialNotExpired(uint256 credentialId, uint40 expiresAt);

    /// @notice Thrown when reinstating a credential whose expiry has already passed.
    /// @dev Reinstatement must not resurrect authority that time has already ended.
    /// @param credentialId The credential id.
    /// @param expiresAt Its expiry time.
    error CredentialExpired(uint256 credentialId, uint40 expiresAt);

    /// @notice Thrown when a lifecycle transition is not permitted.
    /// @param from The current status.
    /// @param to The attempted status.
    error InvalidCredentialTransition(CredentialStatus from, CredentialStatus to);

    /// @notice Thrown when both subject forms are empty.
    /// @dev A credential must be about someone: either an address, an organization,
    ///      or both.
    error InvalidCredentialSubject();

    /// @notice Thrown when `UNSPECIFIED` is supplied as a credential type.
    /// @param provided The offending value.
    error InvalidCredentialType(CredentialType provided);

    /// @notice Thrown when the subject organization is not `VERIFIED` at issuance.
    /// @param orgId The offending organization id.
    error SubjectOrganizationNotVerified(uint256 orgId);

    /// @notice Thrown when the issuing organization does not exist.
    /// @param orgId The offending organization id.
    error IssuerOrganizationNotFound(uint256 orgId);

    /// @notice Thrown when an organization already holds a valid credential of a type.
    /// @dev At most one valid credential per `(subjectOrgId, credType)` pair. This is
    ///      what lets {validCredentialOfType} answer in O(1) with no loop and no
    ///      possibility of a stale answer. Renew by revoking the incumbent first, or
    ///      simply let it lapse — a credential past `expiresAt` no longer blocks
    ///      issuance even if nobody has paid to record the expiry.
    /// @param subjectOrgId The subject organization.
    /// @param credType The credential category.
    /// @param existingCredentialId The valid credential already held.
    error DuplicateValidCredential(uint256 subjectOrgId, CredentialType credType, uint256 existingCredentialId);

    /*//////////////////////////////////////////////////////////////
                            STATE-CHANGING
    //////////////////////////////////////////////////////////////*/

    /// @notice Issues a new credential in the `ACTIVE` state.
    /// @dev Restricted to `CREDENTIAL_ISSUER_ROLE`.
    /// @param issuerOrgId Issuing organization, or 0 for a protocol-issued credential.
    ///        If non-zero it must exist.
    /// @param subject Address subject, or `address(0)`. At least one subject form
    ///        must be non-zero.
    /// @param subjectOrgId Subject organization, or 0. If non-zero it must be `VERIFIED`.
    /// @param credType Category of authority. Must not be `UNSPECIFIED`.
    /// @param expiresAt Expiry time, or 0 for none. If non-zero it must be in the future.
    /// @param credentialHash Commitment to the off-chain document. Must be non-zero.
    /// @return credentialId The newly minted credential id.
    function issueCredential(
        uint256 issuerOrgId,
        address subject,
        uint256 subjectOrgId,
        CredentialType credType,
        uint40 expiresAt,
        bytes32 credentialHash
    ) external returns (uint256 credentialId);

    /// @notice Places an active credential on reversible hold.
    /// @dev Restricted to `CREDENTIAL_ISSUER_ROLE`.
    /// @param credentialId The credential id.
    function suspendCredential(uint256 credentialId) external;

    /// @notice Returns a suspended credential to `ACTIVE`.
    /// @dev Restricted to `CREDENTIAL_ISSUER_ROLE`. Reverts if the credential's expiry
    ///      has already passed, or if another valid credential of the same type has
    ///      since been issued to the same organization.
    /// @param credentialId The credential id.
    function reinstateCredential(uint256 credentialId) external;

    /// @notice Permanently withdraws a credential.
    /// @dev Restricted to `CREDENTIAL_ISSUER_ROLE`. Terminal: a revoked credential can
    ///      never become valid again. Reissuance mints a new id
    ///      (`docs/invariants.md` INV-CRED-03).
    /// @param credentialId The credential id.
    function revokeCredential(uint256 credentialId) external;

    /// @notice Records that a credential's expiry has passed.
    /// @dev **Permissionless by design.** It only makes on-chain state agree with time
    ///      that has already elapsed, and reverts for any credential that has not
    ///      genuinely expired, so it cannot be abused. Consumers must not rely on this
    ///      having been called — use {isValid}, which checks expiry directly.
    /// @param credentialId The credential id.
    function expireCredential(uint256 credentialId) external;

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the full record for a credential.
    /// @param credentialId The credential id.
    /// @return The credential record.
    function getCredential(uint256 credentialId) external view returns (Credential memory);

    /// @notice Reports whether a credential is currently valid.
    /// @dev **Consumers must call this rather than reading `status` directly.** A
    ///      credential can be past `expiresAt` while its stored status still reads
    ///      `ACTIVE`, because nobody has yet paid the gas to record the expiry
    ///      (`docs/invariants.md` INV-CRED-02).
    /// @param credentialId The credential id.
    /// @return True if the credential is `ACTIVE` and unexpired.
    function isValid(uint256 credentialId) external view returns (bool);

    /// @notice Reverts unless a credential is currently valid.
    /// @param credentialId The credential id.
    function requireValid(uint256 credentialId) external view;

    /// @notice Returns the valid credential of a given type held by an organization.
    /// @dev O(1): the protocol permits at most one valid credential per
    ///      `(subjectOrgId, credType)` pair, so no search is required and no
    ///      state-changing path ever needs a loop over credentials.
    /// @param subjectOrgId The subject organization.
    /// @param credType The credential category.
    /// @return credentialId The valid credential id, or 0 if the organization holds none.
    function validCredentialOfType(uint256 subjectOrgId, CredentialType credType)
        external
        view
        returns (uint256 credentialId);

    /// @notice Reports whether an organization holds a valid credential of a type.
    /// @param subjectOrgId The subject organization.
    /// @param credType The credential category.
    /// @return True if a valid credential of that type is held.
    function hasValidCredentialOfType(uint256 subjectOrgId, CredentialType credType) external view returns (bool);

    /// @notice Returns the number of credentials issued so far.
    /// @dev Ids are dense: every value in `1..credentialCount()` exists.
    /// @return The highest minted credential id.
    function credentialCount() external view returns (uint256);
}
