// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolModuleUpgradeable} from "../core/ProtocolModuleUpgradeable.sol";
import {IOrganizationRegistry} from "../interfaces/IOrganizationRegistry.sol";
import {ZeroAddress, ZeroHash} from "../libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../libraries/ProtocolRoles.sol";

/// @title OrganizationRegistry
/// @author AeroAsset Protocol
/// @notice Registry of aviation organizations — airlines, operators, MROs,
///         manufacturers, lessors, brokers, suppliers and inspectors.
/// @dev Layer L1 of the protocol (`docs/architecture.md` §2). This registry is the
///      source of the protocol's data-driven authorization primitive
///      ({isActingFor}), used wherever a role grant would not scale to thousands of
///      participants.
///
///      Registration is permissionless and lands in `PENDING`; verification by
///      `ORG_VERIFIER_ROLE` is the trust boundary. A `PENDING` organization can
///      perform no protocol action, so open registration creates no privilege.
///
///      Suspension and revocation block *future* actions only. They deliberately do
///      not invalidate assets an organization registered or maintenance it recorded:
///      retroactively voiding provenance would make the registry useless as an audit
///      trail. See `docs/state-machines.md` §1.
///
///      **Non-claim.** A record here reflects what an authorized protocol role
///      attested and when. It is not a verification of real-world corporate identity,
///      not an airworthiness or organizational approval, and not the position of any
///      civil aviation authority.
contract OrganizationRegistry is ProtocolModuleUpgradeable, IOrganizationRegistry {
    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice ERC-7201 namespaced storage for this registry.
    /// @param organizationCount Highest minted organization id. Ids are dense from 1.
    /// @param organizations Organization records by id.
    /// @param metadataURI Off-chain profile locations by id, kept out of the packed
    ///        struct so a long string never disturbs slot packing.
    /// @param operators Operator membership by organization id and account.
    /// @param organizationIdByNameHash Reverse index enforcing legal-name uniqueness.
    /// @param pendingAdmin Proposed incoming admin by organization id.
    /// @custom:storage-location erc7201:aeroasset.storage.OrganizationRegistry
    struct OrganizationRegistryStorage {
        uint256 organizationCount;
        mapping(uint256 orgId => Organization) organizations;
        mapping(uint256 orgId => string) metadataURI;
        mapping(uint256 orgId => mapping(address account => bool)) operators;
        mapping(bytes32 nameHash => uint256 orgId) organizationIdByNameHash;
        mapping(uint256 orgId => address) pendingAdmin;
    }

    /// @dev `keccak256(abi.encode(uint256(keccak256("aeroasset.storage.OrganizationRegistry")) - 1))
    ///      & ~bytes32(uint256(0xff))`. Asserted against the formula in
    ///      `test/upgrade/Namespaces.t.sol`.
    bytes32 private constant _ORGANIZATION_REGISTRY_STORAGE =
        0xed7b930dfdbcd4442766fb62f9201f17312b2a60e1da474d4d195b9761c15d00;

    /*//////////////////////////////////////////////////////////////
                                MODIFIERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Restricts a function to an organization's admin.
    /// @param orgId The organization id.
    modifier onlyOrganizationAdmin(uint256 orgId) {
        _onlyOrganizationAdmin(orgId);
        _;
    }

    /*//////////////////////////////////////////////////////////////
                              INITIALIZATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Initializes the registry behind its ERC-1967 proxy.
    /// @dev The implementation's constructor calls `_disableInitializers()` via
    ///      {ProtocolModuleUpgradeable}, so this can only ever run on a proxy.
    /// @param roleManager_ The protocol `RoleManager`. Must be non-zero.
    /// @param addressRegistry_ The protocol `ProtocolAddressRegistry`. Must be non-zero.
    function initialize(address roleManager_, address addressRegistry_) external initializer {
        __ProtocolModule_init(roleManager_, addressRegistry_);
    }

    /*//////////////////////////////////////////////////////////////
                              REGISTRATION
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IOrganizationRegistry
    function registerOrganization(OrganizationType orgType, bytes32 nameHash, bytes32 metadataHash, string calldata uri)
        external
        whenNotPaused
        returns (uint256 orgId)
    {
        if (orgType == OrganizationType.UNSPECIFIED) {
            revert InvalidOrganizationType(orgType);
        }
        if (nameHash == bytes32(0)) {
            revert ZeroHash();
        }

        OrganizationRegistryStorage storage $ = _s();

        uint256 existing = $.organizationIdByNameHash[nameHash];
        if (existing != 0) {
            revert OrganizationNameTaken(nameHash, existing);
        }

        // Cannot realistically overflow: one increment per registration transaction.
        unchecked {
            orgId = ++$.organizationCount;
        }

        // `block.timestamp` is representable in uint40 until year 36812; a checked
        // cast here would only ever add gas. Caller-supplied times are validated.
        $.organizations[orgId] = Organization({
            admin: msg.sender,
            registeredAt: uint40(block.timestamp),
            verifiedAt: 0,
            orgType: orgType,
            status: OrganizationStatus.PENDING,
            nameHash: nameHash,
            metadataHash: metadataHash
        });
        $.organizationIdByNameHash[nameHash] = orgId;
        $.metadataURI[orgId] = uri;

        emit OrganizationRegistered(orgId, msg.sender, orgType, nameHash);
        // Emitted unconditionally so an indexer never has to infer the profile from
        // the absence of an event. See `docs/events.md`, convention 5.
        emit OrganizationUpdated(orgId, metadataHash, uri);
    }

    /// @inheritdoc IOrganizationRegistry
    function updateOrganization(uint256 orgId, bytes32 metadataHash, string calldata uri)
        external
        whenNotPaused
        onlyOrganizationAdmin(orgId)
    {
        OrganizationRegistryStorage storage $ = _s();
        Organization storage org = $.organizations[orgId];

        // A revoked organization is terminal; its record must stop changing.
        if (org.status == OrganizationStatus.REVOKED) {
            revert InvalidOrganizationTransition(OrganizationStatus.REVOKED, OrganizationStatus.REVOKED);
        }

        org.metadataHash = metadataHash;
        $.metadataURI[orgId] = uri;

        emit OrganizationUpdated(orgId, metadataHash, uri);
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN & OPERATORS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IOrganizationRegistry
    function transferOrganizationAdmin(uint256 orgId, address newAdmin)
        external
        whenNotPaused
        onlyOrganizationAdmin(orgId)
    {
        if (newAdmin == address(0)) {
            revert ZeroAddress();
        }
        if (newAdmin == msg.sender) {
            revert AdminTransferToCurrentAdmin(orgId);
        }

        _s().pendingAdmin[orgId] = newAdmin;

        emit OrganizationAdminTransferStarted(orgId, msg.sender, newAdmin);
    }

    /// @inheritdoc IOrganizationRegistry
    function cancelOrganizationAdminTransfer(uint256 orgId) external whenNotPaused {
        OrganizationRegistryStorage storage $ = _s();
        Organization storage org = _requireExists(orgId);

        address pending = $.pendingAdmin[orgId];
        if (pending == address(0)) {
            revert NoPendingAdminTransfer(orgId);
        }
        // Either side of the proposed transfer may abandon it.
        if (msg.sender != org.admin && msg.sender != pending) {
            revert NotOrganizationAdmin(orgId, msg.sender);
        }

        delete $.pendingAdmin[orgId];

        emit OrganizationAdminTransferCancelled(orgId, msg.sender);
    }

    /// @inheritdoc IOrganizationRegistry
    function acceptOrganizationAdmin(uint256 orgId) external whenNotPaused {
        OrganizationRegistryStorage storage $ = _s();
        Organization storage org = _requireExists(orgId);

        address pending = $.pendingAdmin[orgId];
        if (pending == address(0)) {
            revert NoPendingAdminTransfer(orgId);
        }
        if (msg.sender != pending) {
            revert NotPendingAdmin(orgId, msg.sender, pending);
        }

        address previous = org.admin;
        org.admin = pending;
        delete $.pendingAdmin[orgId];

        emit OrganizationAdminTransferred(orgId, previous, pending);
    }

    /// @inheritdoc IOrganizationRegistry
    function setOperator(uint256 orgId, address operator, bool allowed)
        external
        whenNotPaused
        onlyOrganizationAdmin(orgId)
    {
        if (operator == address(0)) {
            revert ZeroAddress();
        }

        _s().operators[orgId][operator] = allowed;

        emit OrganizationOperatorSet(orgId, operator, allowed);
    }

    /*//////////////////////////////////////////////////////////////
                            LIFECYCLE (ROLES)
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IOrganizationRegistry
    function verifyOrganization(uint256 orgId) external whenNotPaused onlyRole(ProtocolRoles.ORG_VERIFIER_ROLE) {
        _transitionFrom(orgId, OrganizationStatus.PENDING, OrganizationStatus.VERIFIED);
    }

    /// @inheritdoc IOrganizationRegistry
    /// @dev Deliberately callable while paused: rejection only removes a candidate
    ///      from the verification queue, and a paused protocol should still be able to
    ///      turn away a bad actor.
    function rejectOrganization(uint256 orgId) external onlyRole(ProtocolRoles.ORG_VERIFIER_ROLE) {
        _transitionFrom(orgId, OrganizationStatus.PENDING, OrganizationStatus.REVOKED);
    }

    /// @inheritdoc IOrganizationRegistry
    /// @dev Deliberately callable while paused. Suspension strictly reduces privilege,
    ///      so blocking it during an incident would be exactly backwards.
    function suspendOrganization(uint256 orgId) external onlyRole(ProtocolRoles.ORG_VERIFIER_ROLE) {
        _transitionFrom(orgId, OrganizationStatus.VERIFIED, OrganizationStatus.SUSPENDED);
    }

    /// @inheritdoc IOrganizationRegistry
    function reactivateOrganization(uint256 orgId) external whenNotPaused onlyRole(ProtocolRoles.ORG_VERIFIER_ROLE) {
        _transitionFrom(orgId, OrganizationStatus.SUSPENDED, OrganizationStatus.VERIFIED);
    }

    /// @inheritdoc IOrganizationRegistry
    /// @dev Deliberately callable while paused, for the same reason as suspension.
    ///      Restricted to `PROTOCOL_ADMIN_ROLE` because the effect is irreversible.
    function revokeOrganization(uint256 orgId) external onlyRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE) {
        Organization storage org = _requireExists(orgId);
        OrganizationStatus from = org.status;

        // Reachable from either active state; `PENDING` is rejected instead.
        if (from != OrganizationStatus.VERIFIED && from != OrganizationStatus.SUSPENDED) {
            revert InvalidOrganizationTransition(from, OrganizationStatus.REVOKED);
        }

        _writeStatus(orgId, org, from, OrganizationStatus.REVOKED);
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IOrganizationRegistry
    function getOrganization(uint256 orgId) external view returns (Organization memory) {
        return _requireExists(orgId);
    }

    /// @inheritdoc IOrganizationRegistry
    function isActingFor(uint256 orgId, address account) public view returns (bool) {
        OrganizationRegistryStorage storage $ = _s();
        Organization storage org = $.organizations[orgId];

        if (org.status != OrganizationStatus.VERIFIED) {
            return false;
        }
        return account == org.admin || $.operators[orgId][account];
    }

    /// @inheritdoc IOrganizationRegistry
    function requireActingFor(uint256 orgId, address account) external view {
        OrganizationRegistryStorage storage $ = _s();
        Organization storage org = _requireExists(orgId);

        if (org.status != OrganizationStatus.VERIFIED) {
            revert OrganizationNotVerified(orgId, org.status);
        }
        if (account != org.admin && !$.operators[orgId][account]) {
            revert NotActingForOrganization(orgId, account);
        }
    }

    /// @inheritdoc IOrganizationRegistry
    function isVerified(uint256 orgId) external view returns (bool) {
        return _s().organizations[orgId].status == OrganizationStatus.VERIFIED;
    }

    /// @inheritdoc IOrganizationRegistry
    function isOperator(uint256 orgId, address account) external view returns (bool) {
        return _s().operators[orgId][account];
    }

    /// @inheritdoc IOrganizationRegistry
    function organizationIdByNameHash(bytes32 nameHash) external view returns (uint256) {
        return _s().organizationIdByNameHash[nameHash];
    }

    /// @inheritdoc IOrganizationRegistry
    function pendingAdmin(uint256 orgId) external view returns (address) {
        return _s().pendingAdmin[orgId];
    }

    /// @inheritdoc IOrganizationRegistry
    function metadataURI(uint256 orgId) external view returns (string memory) {
        return _s().metadataURI[orgId];
    }

    /// @inheritdoc IOrganizationRegistry
    function organizationCount() external view returns (uint256) {
        return _s().organizationCount;
    }

    /// @notice Reports whether a lifecycle transition is permitted.
    /// @dev The legal transition set is expressed exactly once, here, rather than
    ///      being scattered across guards. Fuzz tests assert the exhaustive negative:
    ///      every `(from, to)` pair outside this set reverts. See
    ///      `docs/state-machines.md` §1.
    /// @param from The current status.
    /// @param to The proposed status.
    /// @return True if the transition is legal.
    function isValidTransition(OrganizationStatus from, OrganizationStatus to) public pure returns (bool) {
        if (from == OrganizationStatus.PENDING) {
            return to == OrganizationStatus.VERIFIED || to == OrganizationStatus.REVOKED;
        }
        if (from == OrganizationStatus.VERIFIED) {
            return to == OrganizationStatus.SUSPENDED || to == OrganizationStatus.REVOKED;
        }
        if (from == OrganizationStatus.SUSPENDED) {
            return to == OrganizationStatus.VERIFIED || to == OrganizationStatus.REVOKED;
        }
        // NONE has no record to move; REVOKED is terminal.
        return false;
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @notice Applies a transition, requiring a specific starting status.
    /// @dev Each caller names the state it expects, so `verifyOrganization` cannot
    ///      silently double as `reactivateOrganization` — they have the same effect
    ///      and the same role, but distinct meanings in the audit trail.
    /// @param orgId The organization id.
    /// @param expectedFrom The status the organization must currently be in.
    /// @param to The status to move to.
    function _transitionFrom(uint256 orgId, OrganizationStatus expectedFrom, OrganizationStatus to) private {
        Organization storage org = _requireExists(orgId);
        OrganizationStatus from = org.status;

        if (from != expectedFrom) {
            revert InvalidOrganizationTransition(from, to);
        }

        _writeStatus(orgId, org, from, to);
    }

    /// @notice Writes a validated status change and emits its event.
    /// @dev Re-checks {isValidTransition} as defence in depth: callers already
    ///      constrain the starting state, so a failure here means the guard table and
    ///      a call site have diverged.
    /// @param orgId The organization id.
    /// @param org Storage pointer to the organization record.
    /// @param from The current status.
    /// @param to The status to move to.
    function _writeStatus(uint256 orgId, Organization storage org, OrganizationStatus from, OrganizationStatus to)
        private
    {
        if (!isValidTransition(from, to)) {
            revert InvalidOrganizationTransition(from, to);
        }

        org.status = to;

        // Records first verification only, so reactivation does not rewrite history
        // and `INV-ORG-02` (VERIFIED implies verifiedAt != 0) holds in both directions.
        if (to == OrganizationStatus.VERIFIED && org.verifiedAt == 0) {
            org.verifiedAt = uint40(block.timestamp);
        }

        emit OrganizationStatusChanged(orgId, from, to, msg.sender);
    }

    /// @notice Reverts unless the caller is the organization's admin.
    /// @dev Held in a function rather than inline in the modifier so the check is
    ///      emitted once in bytecode instead of at each of its five call sites.
    /// @param orgId The organization id.
    function _onlyOrganizationAdmin(uint256 orgId) private view {
        Organization storage org = _requireExists(orgId);
        if (msg.sender != org.admin) {
            revert NotOrganizationAdmin(orgId, msg.sender);
        }
    }

    /// @notice Returns a storage pointer to an existing organization, or reverts.
    /// @param orgId The organization id.
    /// @return org Storage pointer to the record.
    function _requireExists(uint256 orgId) private view returns (Organization storage org) {
        org = _s().organizations[orgId];
        if (org.status == OrganizationStatus.NONE) {
            revert OrganizationNotFound(orgId);
        }
    }

    /// @notice Returns a pointer to this contract's ERC-7201 storage struct.
    /// @return $ The registry storage.
    function _s() private pure returns (OrganizationRegistryStorage storage $) {
        assembly ("memory-safe") {
            $.slot := _ORGANIZATION_REGISTRY_STORAGE
        }
    }
}
