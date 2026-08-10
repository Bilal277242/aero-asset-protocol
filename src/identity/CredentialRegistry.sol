// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolModuleUpgradeable} from "../core/ProtocolModuleUpgradeable.sol";
import {ICredentialRegistry} from "../interfaces/ICredentialRegistry.sol";
import {IOrganizationRegistry} from "../interfaces/IOrganizationRegistry.sol";
import {ProtocolAddressKeys} from "../libraries/ProtocolAddressKeys.sol";
import {ProtocolCast} from "../libraries/ProtocolCast.sol";
import {DeadlineInPast, ZeroHash} from "../libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../libraries/ProtocolRoles.sol";

/// @title CredentialRegistry
/// @author AeroAsset Protocol
/// @notice Registry of aviation credentials held by organizations and individuals —
///         maintenance authority, inspection authority, manufacturing and operating
///         approvals.
/// @dev Layer L1 of the protocol. Built standalone behind {ICredentialRegistry} so an
///      external Aviation Credentials Network can replace it later by swapping one
///      `ProtocolAddressRegistry` entry, with no change to consuming modules.
///
///      This registry makes `view`-only calls into {OrganizationRegistry}, a peer in
///      the same layer, to validate subjects at issuance. It never calls a
///      state-changing function on a peer. See `docs/architecture.md` §2.
///
///      Two properties are load-bearing for later phases:
///
///      1. **Validity is computed, never stored.** {isValid} checks status *and*
///         expiry. A credential can sit at `ACTIVE` while already expired, because
///         recording the expiry costs gas nobody is obliged to pay. Consumers that
///         read `status` directly will authorize expired credentials.
///      2. **At most one valid credential per (organization, type).** This is what
///         lets {validCredentialOfType} answer in O(1), so Phase 5's maintenance
///         authorization needs no loop over an organization's credential history.
///
///      **Non-claim.** A credential records that an authorized protocol role attested
///      something at a point in time. It is not an approval, certificate or
///      authorization issued by any civil aviation authority.
contract CredentialRegistry is ProtocolModuleUpgradeable, ICredentialRegistry {
    using ProtocolCast for uint256;

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice ERC-7201 namespaced storage for this registry.
    /// @param credentialCount Highest minted credential id. Ids are dense from 1.
    /// @param credentials Credential records by id.
    /// @param activeOrgCredential The single valid credential per subject
    ///        organization and type. Maintained on every status write so it is never
    ///        stale; address-only subjects are not indexed here (see
    ///        {validCredentialOfType}).
    /// @custom:storage-location erc7201:aeroasset.storage.CredentialRegistry
    struct CredentialRegistryStorage {
        uint256 credentialCount;
        mapping(uint256 credentialId => Credential) credentials;
        mapping(uint256 subjectOrgId => mapping(CredentialType => uint256 credentialId)) activeOrgCredential;
    }

    /// @dev `keccak256(abi.encode(uint256(keccak256("aeroasset.storage.CredentialRegistry")) - 1))
    ///      & ~bytes32(uint256(0xff))`. Asserted against the formula in
    ///      `test/upgrade/Namespaces.t.sol`.
    bytes32 private constant _CREDENTIAL_REGISTRY_STORAGE =
        0x3002cbbe427fd1290686b5a4d7a023ca2ae38c7110b28936eac0b6a2023ac800;

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
                                ISSUANCE
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ICredentialRegistry
    function issueCredential(
        uint256 issuerOrgId,
        address subject,
        uint256 subjectOrgId,
        CredentialType credType,
        uint40 expiresAt,
        bytes32 credentialHash
    ) external whenNotPaused onlyRole(ProtocolRoles.CREDENTIAL_ISSUER_ROLE) returns (uint256 credentialId) {
        if (credType == CredentialType.UNSPECIFIED) {
            revert InvalidCredentialType(credType);
        }
        if (credentialHash == bytes32(0)) {
            revert ZeroHash();
        }
        if (subject == address(0) && subjectOrgId == 0) {
            revert InvalidCredentialSubject();
        }
        if (expiresAt != 0 && expiresAt <= block.timestamp) {
            revert DeadlineInPast(expiresAt, uint40(block.timestamp));
        }

        _validateOrganizations(issuerOrgId, subjectOrgId);
        _requireNoValidCredential(subjectOrgId, credType);

        CredentialRegistryStorage storage $ = _s();

        // Cannot realistically overflow: one increment per issuance transaction.
        unchecked {
            credentialId = ++$.credentialCount;
        }

        $.credentials[credentialId] = Credential({
            issuerOrgId: issuerOrgId.toUint64(),
            subjectOrgId: subjectOrgId.toUint64(),
            issuedAt: uint40(block.timestamp),
            expiresAt: expiresAt,
            credType: credType,
            status: CredentialStatus.ACTIVE,
            reserved: 0,
            subject: subject,
            credentialHash: credentialHash
        });

        if (subjectOrgId != 0) {
            $.activeOrgCredential[subjectOrgId][credType] = credentialId;
        }

        emit CredentialIssued(credentialId, issuerOrgId, subject, subjectOrgId, credType, expiresAt, credentialHash);
        // Emitted so an indexer sees one uniform lifecycle stream rather than having
        // to treat issuance as an implicit transition. See `docs/events.md`.
        emit CredentialStatusChanged(credentialId, CredentialStatus.NONE, CredentialStatus.ACTIVE, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                                LIFECYCLE
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ICredentialRegistry
    /// @dev Deliberately callable while paused: suspension strictly reduces authority,
    ///      so blocking it during an incident would be exactly backwards.
    function suspendCredential(uint256 credentialId) external onlyRole(ProtocolRoles.CREDENTIAL_ISSUER_ROLE) {
        Credential storage credential = _requireExists(credentialId);
        _writeStatus(credentialId, credential, credential.status, CredentialStatus.SUSPENDED);
    }

    /// @inheritdoc ICredentialRegistry
    function reinstateCredential(uint256 credentialId)
        external
        whenNotPaused
        onlyRole(ProtocolRoles.CREDENTIAL_ISSUER_ROLE)
    {
        Credential storage credential = _requireExists(credentialId);

        // Reinstatement must not resurrect authority that time has already ended;
        // the correct action for a lapsed credential is to issue a new one.
        if (credential.expiresAt != 0 && credential.expiresAt <= block.timestamp) {
            revert CredentialExpired(credentialId, credential.expiresAt);
        }
        // Another credential of this type may have taken the slot while this one was
        // suspended. Reinstating would otherwise create two simultaneously-valid
        // credentials and silently corrupt the O(1) index.
        _requireNoValidCredential(credential.subjectOrgId, credential.credType);

        _writeStatus(credentialId, credential, credential.status, CredentialStatus.ACTIVE);
    }

    /// @inheritdoc ICredentialRegistry
    /// @dev Deliberately callable while paused, for the same reason as suspension.
    function revokeCredential(uint256 credentialId) external onlyRole(ProtocolRoles.CREDENTIAL_ISSUER_ROLE) {
        Credential storage credential = _requireExists(credentialId);
        _writeStatus(credentialId, credential, credential.status, CredentialStatus.REVOKED);
    }

    /// @inheritdoc ICredentialRegistry
    /// @dev Permissionless and callable while paused: it only brings on-chain state
    ///      into agreement with time that has already passed.
    function expireCredential(uint256 credentialId) external {
        Credential storage credential = _requireExists(credentialId);

        if (credential.expiresAt == 0 || credential.expiresAt > block.timestamp) {
            revert CredentialNotExpired(credentialId, credential.expiresAt);
        }

        _writeStatus(credentialId, credential, credential.status, CredentialStatus.EXPIRED);
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ICredentialRegistry
    function getCredential(uint256 credentialId) external view returns (Credential memory) {
        return _requireExists(credentialId);
    }

    /// @inheritdoc ICredentialRegistry
    function isValid(uint256 credentialId) public view returns (bool) {
        Credential storage credential = _s().credentials[credentialId];

        if (credential.status != CredentialStatus.ACTIVE) {
            return false;
        }
        return credential.expiresAt == 0 || credential.expiresAt > block.timestamp;
    }

    /// @inheritdoc ICredentialRegistry
    function requireValid(uint256 credentialId) external view {
        Credential storage credential = _requireExists(credentialId);
        if (!isValid(credentialId)) {
            revert CredentialNotValid(credentialId, credential.status);
        }
    }

    /// @inheritdoc ICredentialRegistry
    function validCredentialOfType(uint256 subjectOrgId, CredentialType credType)
        public
        view
        returns (uint256 credentialId)
    {
        credentialId = _s().activeOrgCredential[subjectOrgId][credType];
        // The index is cleared on every status write, but a credential can lapse by
        // time alone with no transaction, so the freshness check is still required.
        if (credentialId != 0 && !isValid(credentialId)) {
            return 0;
        }
    }

    /// @inheritdoc ICredentialRegistry
    function hasValidCredentialOfType(uint256 subjectOrgId, CredentialType credType) external view returns (bool) {
        return validCredentialOfType(subjectOrgId, credType) != 0;
    }

    /// @inheritdoc ICredentialRegistry
    function credentialCount() external view returns (uint256) {
        return _s().credentialCount;
    }

    /// @notice Reports whether a lifecycle transition is permitted.
    /// @dev The legal transition set is expressed exactly once, here. Fuzz tests
    ///      assert the exhaustive negative. See `docs/state-machines.md` §2.
    /// @param from The current status.
    /// @param to The proposed status.
    /// @return True if the transition is legal.
    function isValidTransition(CredentialStatus from, CredentialStatus to) public pure returns (bool) {
        if (from == CredentialStatus.ACTIVE) {
            return to == CredentialStatus.SUSPENDED || to == CredentialStatus.REVOKED || to == CredentialStatus.EXPIRED;
        }
        if (from == CredentialStatus.SUSPENDED) {
            return to == CredentialStatus.ACTIVE || to == CredentialStatus.REVOKED || to == CredentialStatus.EXPIRED;
        }
        // NONE has no record to move; EXPIRED and REVOKED are terminal, which is what
        // makes INV-CRED-03 hold: reissuance mints a new id, never resurrects an old.
        return false;
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @notice Validates the issuing and subject organizations at issuance time.
    /// @dev A `view`-only read of the L1 peer registry. Point-in-time only: an
    ///      organization revoked later does not retroactively invalidate credentials
    ///      it was issued, because protocol history is append-only
    ///      (`docs/state-machines.md` §1). Consumers re-check organization status at
    ///      use time.
    /// @param issuerOrgId The issuing organization, or 0 for protocol-issued.
    /// @param subjectOrgId The subject organization, or 0 for an address-only subject.
    function _validateOrganizations(uint256 issuerOrgId, uint256 subjectOrgId) private view {
        if (issuerOrgId == 0 && subjectOrgId == 0) {
            return;
        }

        IOrganizationRegistry organizations = IOrganizationRegistry(_resolve(ProtocolAddressKeys.ORGANIZATION_REGISTRY));

        if (issuerOrgId != 0) {
            // Existence only: the `CREDENTIAL_ISSUER_ROLE` gate is the real
            // authorization, and the organization is recorded for provenance.
            IOrganizationRegistry.Organization memory issuer = organizations.getOrganization(issuerOrgId);
            if (issuer.status == IOrganizationRegistry.OrganizationStatus.NONE) {
                revert IssuerOrganizationNotFound(issuerOrgId);
            }
        }

        if (subjectOrgId != 0 && !organizations.isVerified(subjectOrgId)) {
            revert SubjectOrganizationNotVerified(subjectOrgId);
        }
    }

    /// @notice Reverts if the organization already holds a valid credential of a type.
    /// @dev No-op for address-only subjects, which are not indexed.
    /// @param subjectOrgId The subject organization, or 0.
    /// @param credType The credential category.
    function _requireNoValidCredential(uint256 subjectOrgId, CredentialType credType) private view {
        if (subjectOrgId == 0) {
            return;
        }

        uint256 existing = validCredentialOfType(subjectOrgId, credType);
        if (existing != 0) {
            revert DuplicateValidCredential(subjectOrgId, credType, existing);
        }
    }

    /// @notice Writes a validated status change, maintains the index, emits the event.
    /// @param credentialId The credential id.
    /// @param credential Storage pointer to the record.
    /// @param from The current status.
    /// @param to The status to move to.
    function _writeStatus(
        uint256 credentialId,
        Credential storage credential,
        CredentialStatus from,
        CredentialStatus to
    ) private {
        if (!isValidTransition(from, to)) {
            revert InvalidCredentialTransition(from, to);
        }

        credential.status = to;

        uint256 subjectOrgId = credential.subjectOrgId;
        if (subjectOrgId != 0) {
            CredentialRegistryStorage storage $ = _s();
            if (to == CredentialStatus.ACTIVE) {
                $.activeOrgCredential[subjectOrgId][credential.credType] = credentialId;
            } else if ($.activeOrgCredential[subjectOrgId][credential.credType] == credentialId) {
                // Only clear the pointer if it still refers to this credential; a newer
                // one may have legitimately replaced it after this one lapsed by time.
                delete $.activeOrgCredential[subjectOrgId][credential.credType];
            }
        }

        emit CredentialStatusChanged(credentialId, from, to, msg.sender);
    }

    /// @notice Returns a storage pointer to an existing credential, or reverts.
    /// @param credentialId The credential id.
    /// @return credential Storage pointer to the record.
    function _requireExists(uint256 credentialId) private view returns (Credential storage credential) {
        credential = _s().credentials[credentialId];
        if (credential.status == CredentialStatus.NONE) {
            revert CredentialNotFound(credentialId);
        }
    }

    /// @notice Returns a pointer to this contract's ERC-7201 storage struct.
    /// @return $ The registry storage.
    function _s() private pure returns (CredentialRegistryStorage storage $) {
        assembly ("memory-safe") {
            $.slot := _CREDENTIAL_REGISTRY_STORAGE
        }
    }
}
