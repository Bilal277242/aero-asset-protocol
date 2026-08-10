// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IOrganizationRegistry} from "../../../src/interfaces/IOrganizationRegistry.sol";
import {ZeroAddress, ZeroHash} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";

/// @title OrganizationRegistryTest
/// @author AeroAsset Protocol
/// @notice Functional, lifecycle, event, negative and fuzz coverage for
///         {OrganizationRegistry}. Access control lives in the sibling
///         `OrganizationRegistryAccess.t.sol`.
contract OrganizationRegistryTest is ProtocolTestBase {
    /// @dev Local aliases keep the assertions readable.
    IOrganizationRegistry.OrganizationType internal constant AIRLINE = IOrganizationRegistry.OrganizationType.AIRLINE;
    IOrganizationRegistry.OrganizationType internal constant MRO_TYPE = IOrganizationRegistry.OrganizationType.MRO;

    /*//////////////////////////////////////////////////////////////
                              REGISTRATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Registration mints a dense id and lands in `PENDING`, never `VERIFIED`.
    function test_Register_LandsInPending() public {
        vm.expectEmit(true, true, true, true, address(orgRegistry));
        emit IOrganizationRegistry.OrganizationRegistered(1, alice, AIRLINE, ORG_NAME_HASH);
        vm.expectEmit(true, true, true, true, address(orgRegistry));
        emit IOrganizationRegistry.OrganizationUpdated(1, ORG_METADATA_HASH, ORG_METADATA_URI);

        uint256 orgId = _registerOrg(alice, ORG_NAME_HASH, AIRLINE);

        assertEq(orgId, 1, "ids do not start at 1");
        assertEq(orgRegistry.organizationCount(), 1, "count not incremented");

        IOrganizationRegistry.Organization memory org = orgRegistry.getOrganization(orgId);
        assertEq(org.admin, alice, "wrong admin");
        assertEq(uint8(org.status), uint8(IOrganizationRegistry.OrganizationStatus.PENDING), "not PENDING");
        assertEq(uint8(org.orgType), uint8(AIRLINE), "wrong type");
        assertEq(org.nameHash, ORG_NAME_HASH, "wrong name hash");
        assertEq(org.metadataHash, ORG_METADATA_HASH, "wrong metadata hash");
        assertEq(org.registeredAt, uint40(block.timestamp), "wrong registeredAt");
        assertEq(org.verifiedAt, 0, "registration must not verify");
        assertEq(orgRegistry.metadataURI(orgId), ORG_METADATA_URI, "wrong uri");
    }

    /// @notice Registration is permissionless — verification is the trust boundary.
    function testFuzz_Register_IsPermissionless(address caller, bytes32 nameHash) public {
        _assumeSafeRecipient(caller);
        vm.assume(nameHash != bytes32(0));

        vm.prank(caller);
        uint256 orgId = orgRegistry.registerOrganization(AIRLINE, nameHash, bytes32(0), "");

        assertEq(orgRegistry.getOrganization(orgId).admin, caller, "caller is not admin");
        assertFalse(orgRegistry.isVerified(orgId), "permissionless registration granted privilege");
    }

    /// @notice Ids are dense and monotonic across many registrations.
    function test_Register_IdsAreDenseAndMonotonic() public {
        for (uint256 i = 1; i <= 5; ++i) {
            uint256 orgId = _registerOrg(alice, keccak256(abi.encode("org", i)), AIRLINE);
            assertEq(orgId, i, "id not monotonic");
        }
        assertEq(orgRegistry.organizationCount(), 5, "wrong count");
    }

    /// @notice A legal-name commitment can only be claimed once.
    /// @dev Blocks the duplicate-identity attack of `docs/threat-model.md` T-03.
    function test_RevertWhen_NameHashAlreadyTaken() public {
        uint256 first = _registerOrg(alice, ORG_NAME_HASH, AIRLINE);

        vm.expectRevert(
            abi.encodeWithSelector(IOrganizationRegistry.OrganizationNameTaken.selector, ORG_NAME_HASH, first)
        );
        _registerOrg(bob, ORG_NAME_HASH, MRO_TYPE);
    }

    /// @notice The name-hash index and the stored record always agree.
    function test_NameHashIndexMatchesRecord() public {
        uint256 orgId = _registerOrg(alice, ORG_NAME_HASH, AIRLINE);

        assertEq(orgRegistry.organizationIdByNameHash(ORG_NAME_HASH), orgId, "index mismatch");
        assertEq(orgRegistry.getOrganization(orgId).nameHash, ORG_NAME_HASH, "record mismatch");
        assertEq(orgRegistry.organizationIdByNameHash(keccak256("never registered")), 0, "phantom index entry");
    }

    /// @notice A zero name hash is rejected.
    /// @dev A zero hash is indistinguishable from an unset slot, so it can never be a
    ///      valid commitment.
    function test_RevertWhen_NameHashIsZero() public {
        vm.expectRevert(ZeroHash.selector);
        _registerOrg(alice, bytes32(0), AIRLINE);
    }

    /// @notice The `UNSPECIFIED` sentinel is rejected as an organization type.
    function test_RevertWhen_OrganizationTypeUnspecified() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IOrganizationRegistry.InvalidOrganizationType.selector,
                IOrganizationRegistry.OrganizationType.UNSPECIFIED
            )
        );
        _registerOrg(alice, ORG_NAME_HASH, IOrganizationRegistry.OrganizationType.UNSPECIFIED);
    }

    /// @notice Reading an unregistered id reverts rather than returning a zero struct.
    function testFuzz_RevertWhen_GettingUnknownOrganization(uint256 orgId) public {
        vm.assume(orgId != 0);
        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.OrganizationNotFound.selector, orgId));
        orgRegistry.getOrganization(orgId);
    }

    /*//////////////////////////////////////////////////////////////
                                 UPDATE
    //////////////////////////////////////////////////////////////*/

    /// @notice The admin can update the off-chain profile reference.
    function test_Update_ChangesProfile() public {
        uint256 orgId = _registerOrg(alice, ORG_NAME_HASH, AIRLINE);
        bytes32 newHash = keccak256("profile-v2");

        vm.expectEmit(true, true, true, true, address(orgRegistry));
        emit IOrganizationRegistry.OrganizationUpdated(orgId, newHash, "ipfs://v2");

        vm.prank(alice);
        orgRegistry.updateOrganization(orgId, newHash, "ipfs://v2");

        assertEq(orgRegistry.getOrganization(orgId).metadataHash, newHash, "hash not updated");
        assertEq(orgRegistry.metadataURI(orgId), "ipfs://v2", "uri not updated");
    }

    /// @notice Updates cannot change type, status or name.
    function test_Update_LeavesIdentityFieldsIntact() public {
        uint256 orgId = _defaultVerifiedOrg();

        vm.prank(alice);
        orgRegistry.updateOrganization(orgId, keccak256("v2"), "ipfs://v2");

        IOrganizationRegistry.Organization memory org = orgRegistry.getOrganization(orgId);
        assertEq(uint8(org.orgType), uint8(AIRLINE), "type changed");
        assertEq(uint8(org.status), uint8(IOrganizationRegistry.OrganizationStatus.VERIFIED), "status changed");
        assertEq(org.nameHash, ORG_NAME_HASH, "name changed");
    }

    /// @notice A revoked organization's record stops changing.
    function test_RevertWhen_UpdatingRevokedOrganization() public {
        uint256 orgId = _defaultVerifiedOrg();
        vm.prank(protocolAdmin);
        orgRegistry.revokeOrganization(orgId);

        vm.expectRevert(
            abi.encodeWithSelector(
                IOrganizationRegistry.InvalidOrganizationTransition.selector,
                IOrganizationRegistry.OrganizationStatus.REVOKED,
                IOrganizationRegistry.OrganizationStatus.REVOKED
            )
        );
        vm.prank(alice);
        orgRegistry.updateOrganization(orgId, keccak256("v2"), "ipfs://v2");
    }

    /*//////////////////////////////////////////////////////////////
                             ADMIN TRANSFER
    //////////////////////////////////////////////////////////////*/

    /// @notice Admin transfer requires both a proposal and an acceptance.
    /// @dev A one-step transfer to a mistyped address would orphan the organization's
    ///      entire asset portfolio with no recovery path.
    function test_AdminTransfer_IsTwoStep() public {
        uint256 orgId = _defaultVerifiedOrg();

        vm.expectEmit(true, true, true, true, address(orgRegistry));
        emit IOrganizationRegistry.OrganizationAdminTransferStarted(orgId, alice, bob);
        vm.prank(alice);
        orgRegistry.transferOrganizationAdmin(orgId, bob);

        // Proposal alone changes nothing.
        assertEq(orgRegistry.getOrganization(orgId).admin, alice, "admin changed on proposal");
        assertEq(orgRegistry.pendingAdmin(orgId), bob, "pending admin not recorded");
        assertTrue(orgRegistry.isActingFor(orgId, alice), "outgoing admin lost authority early");
        assertFalse(orgRegistry.isActingFor(orgId, bob), "incoming admin gained authority early");

        vm.expectEmit(true, true, true, true, address(orgRegistry));
        emit IOrganizationRegistry.OrganizationAdminTransferred(orgId, alice, bob);
        vm.prank(bob);
        orgRegistry.acceptOrganizationAdmin(orgId);

        assertEq(orgRegistry.getOrganization(orgId).admin, bob, "admin not transferred");
        assertEq(orgRegistry.pendingAdmin(orgId), address(0), "pending admin not cleared");
        assertFalse(orgRegistry.isActingFor(orgId, alice), "previous admin retained authority");
        assertTrue(orgRegistry.isActingFor(orgId, bob), "new admin lacks authority");
    }

    /// @notice Either party may cancel a pending transfer.
    function test_AdminTransfer_CancellableByEitherParty() public {
        uint256 orgId = _defaultVerifiedOrg();

        vm.prank(alice);
        orgRegistry.transferOrganizationAdmin(orgId, bob);

        vm.expectEmit(true, true, true, true, address(orgRegistry));
        emit IOrganizationRegistry.OrganizationAdminTransferCancelled(orgId, bob);
        vm.prank(bob);
        orgRegistry.cancelOrganizationAdminTransfer(orgId);
        assertEq(orgRegistry.pendingAdmin(orgId), address(0), "not cancelled by incoming admin");

        vm.prank(alice);
        orgRegistry.transferOrganizationAdmin(orgId, bob);
        vm.prank(alice);
        orgRegistry.cancelOrganizationAdminTransfer(orgId);
        assertEq(orgRegistry.pendingAdmin(orgId), address(0), "not cancelled by current admin");
    }

    /// @notice Only the proposed incoming admin may accept.
    function test_RevertWhen_NonPendingAdminAccepts() public {
        uint256 orgId = _defaultVerifiedOrg();
        vm.prank(alice);
        orgRegistry.transferOrganizationAdmin(orgId, bob);

        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.NotPendingAdmin.selector, orgId, attacker, bob));
        vm.prank(attacker);
        orgRegistry.acceptOrganizationAdmin(orgId);
    }

    /// @notice Accepting without a proposal reverts.
    function test_RevertWhen_AcceptingWithoutProposal() public {
        uint256 orgId = _defaultVerifiedOrg();

        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.NoPendingAdminTransfer.selector, orgId));
        vm.prank(bob);
        orgRegistry.acceptOrganizationAdmin(orgId);
    }

    /// @notice Cancelling without a proposal reverts.
    function test_RevertWhen_CancellingWithoutProposal() public {
        uint256 orgId = _defaultVerifiedOrg();

        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.NoPendingAdminTransfer.selector, orgId));
        vm.prank(alice);
        orgRegistry.cancelOrganizationAdminTransfer(orgId);
    }

    /// @notice An unrelated account cannot cancel someone else's pending transfer.
    function test_RevertWhen_StrangerCancelsTransfer() public {
        uint256 orgId = _defaultVerifiedOrg();
        vm.prank(alice);
        orgRegistry.transferOrganizationAdmin(orgId, bob);

        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.NotOrganizationAdmin.selector, orgId, attacker));
        vm.prank(attacker);
        orgRegistry.cancelOrganizationAdminTransfer(orgId);
    }

    /// @notice The zero address cannot be proposed as admin.
    function test_RevertWhen_TransferringAdminToZero() public {
        uint256 orgId = _defaultVerifiedOrg();

        vm.expectRevert(ZeroAddress.selector);
        vm.prank(alice);
        orgRegistry.transferOrganizationAdmin(orgId, address(0));
    }

    /// @notice Proposing the incumbent as the new admin is rejected as a no-op.
    function test_RevertWhen_TransferringAdminToSelf() public {
        uint256 orgId = _defaultVerifiedOrg();

        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.AdminTransferToCurrentAdmin.selector, orgId));
        vm.prank(alice);
        orgRegistry.transferOrganizationAdmin(orgId, alice);
    }

    /*//////////////////////////////////////////////////////////////
                                OPERATORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Operators can act for a verified organization; removal is immediate.
    function test_Operator_GrantAndRevoke() public {
        uint256 orgId = _defaultVerifiedOrg();

        vm.expectEmit(true, true, true, true, address(orgRegistry));
        emit IOrganizationRegistry.OrganizationOperatorSet(orgId, carol, true);
        vm.prank(alice);
        orgRegistry.setOperator(orgId, carol, true);

        assertTrue(orgRegistry.isOperator(orgId, carol), "operator not recorded");
        assertTrue(orgRegistry.isActingFor(orgId, carol), "operator cannot act");

        vm.prank(alice);
        orgRegistry.setOperator(orgId, carol, false);

        assertFalse(orgRegistry.isOperator(orgId, carol), "operator not removed");
        assertFalse(orgRegistry.isActingFor(orgId, carol), "removed operator can still act");
    }

    /// @notice The zero address cannot be an operator.
    function test_RevertWhen_SettingZeroOperator() public {
        uint256 orgId = _defaultVerifiedOrg();

        vm.expectRevert(ZeroAddress.selector);
        vm.prank(alice);
        orgRegistry.setOperator(orgId, address(0), true);
    }

    /// @notice Operator membership is scoped to one organization.
    function test_Operator_IsScopedToOneOrganization() public {
        uint256 orgA = _registerVerifiedOrg(alice, keccak256("A"), AIRLINE);
        uint256 orgB = _registerVerifiedOrg(bob, keccak256("B"), MRO_TYPE);

        vm.prank(alice);
        orgRegistry.setOperator(orgA, carol, true);

        assertTrue(orgRegistry.isActingFor(orgA, carol), "operator cannot act for own org");
        assertFalse(orgRegistry.isActingFor(orgB, carol), "operator leaked across organizations");
    }

    /*//////////////////////////////////////////////////////////////
                                LIFECYCLE
    //////////////////////////////////////////////////////////////*/

    /// @notice Verification records the timestamp and grants authority.
    function test_Verify_GrantsAuthority() public {
        uint256 orgId = _registerOrg(alice, ORG_NAME_HASH, AIRLINE);
        assertFalse(orgRegistry.isActingFor(orgId, alice), "pending org can already act");

        vm.expectEmit(true, true, true, true, address(orgRegistry));
        emit IOrganizationRegistry.OrganizationStatusChanged(
            orgId,
            IOrganizationRegistry.OrganizationStatus.PENDING,
            IOrganizationRegistry.OrganizationStatus.VERIFIED,
            orgVerifier
        );
        vm.prank(orgVerifier);
        orgRegistry.verifyOrganization(orgId);

        IOrganizationRegistry.Organization memory org = orgRegistry.getOrganization(orgId);
        assertEq(uint8(org.status), uint8(IOrganizationRegistry.OrganizationStatus.VERIFIED), "not VERIFIED");
        assertEq(org.verifiedAt, uint40(block.timestamp), "verifiedAt not recorded");
        assertTrue(orgRegistry.isActingFor(orgId, alice), "verified admin cannot act");
    }

    /// @notice Suspension removes authority; reactivation restores it.
    function test_SuspendAndReactivate() public {
        uint256 orgId = _defaultVerifiedOrg();
        uint40 verifiedAt = orgRegistry.getOrganization(orgId).verifiedAt;

        vm.prank(orgVerifier);
        orgRegistry.suspendOrganization(orgId);
        assertFalse(orgRegistry.isActingFor(orgId, alice), "suspended org can still act");
        assertFalse(orgRegistry.isVerified(orgId), "suspended org reports verified");

        vm.warp(block.timestamp + 30 days);
        vm.prank(orgVerifier);
        orgRegistry.reactivateOrganization(orgId);

        assertTrue(orgRegistry.isActingFor(orgId, alice), "reactivated org cannot act");
        assertEq(
            orgRegistry.getOrganization(orgId).verifiedAt, verifiedAt, "reactivation rewrote first-verification time"
        );
    }

    /// @notice Rejection sends a pending organization to the terminal state.
    function test_Reject_IsTerminal() public {
        uint256 orgId = _registerOrg(alice, ORG_NAME_HASH, AIRLINE);

        vm.prank(orgVerifier);
        orgRegistry.rejectOrganization(orgId);

        assertEq(
            uint8(orgRegistry.getOrganization(orgId).status),
            uint8(IOrganizationRegistry.OrganizationStatus.REVOKED),
            "not REVOKED"
        );

        // No path leaves REVOKED.
        vm.expectRevert(
            abi.encodeWithSelector(
                IOrganizationRegistry.InvalidOrganizationTransition.selector,
                IOrganizationRegistry.OrganizationStatus.REVOKED,
                IOrganizationRegistry.OrganizationStatus.VERIFIED
            )
        );
        vm.prank(orgVerifier);
        orgRegistry.verifyOrganization(orgId);
    }

    /// @notice Revocation is reachable from both active states and is absorbing.
    function test_Revoke_FromVerifiedAndSuspended() public {
        uint256 orgA = _registerVerifiedOrg(alice, keccak256("A"), AIRLINE);
        vm.prank(protocolAdmin);
        orgRegistry.revokeOrganization(orgA);
        assertEq(
            uint8(orgRegistry.getOrganization(orgA).status),
            uint8(IOrganizationRegistry.OrganizationStatus.REVOKED),
            "verified org not revoked"
        );

        uint256 orgB = _registerVerifiedOrg(bob, keccak256("B"), MRO_TYPE);
        vm.prank(orgVerifier);
        orgRegistry.suspendOrganization(orgB);
        vm.prank(protocolAdmin);
        orgRegistry.revokeOrganization(orgB);
        assertEq(
            uint8(orgRegistry.getOrganization(orgB).status),
            uint8(IOrganizationRegistry.OrganizationStatus.REVOKED),
            "suspended org not revoked"
        );
    }

    /// @notice A `PENDING` organization is rejected, not revoked.
    /// @dev The two paths differ in required role, so they must not be interchangeable.
    function test_RevertWhen_RevokingPendingOrganization() public {
        uint256 orgId = _registerOrg(alice, ORG_NAME_HASH, AIRLINE);

        vm.expectRevert(
            abi.encodeWithSelector(
                IOrganizationRegistry.InvalidOrganizationTransition.selector,
                IOrganizationRegistry.OrganizationStatus.PENDING,
                IOrganizationRegistry.OrganizationStatus.REVOKED
            )
        );
        vm.prank(protocolAdmin);
        orgRegistry.revokeOrganization(orgId);
    }

    /// @notice `verifyOrganization` cannot double as reactivation.
    /// @dev Same role and same effect, but distinct meanings in the audit trail.
    function test_RevertWhen_VerifyingSuspendedOrganization() public {
        uint256 orgId = _defaultVerifiedOrg();
        vm.prank(orgVerifier);
        orgRegistry.suspendOrganization(orgId);

        vm.expectRevert(
            abi.encodeWithSelector(
                IOrganizationRegistry.InvalidOrganizationTransition.selector,
                IOrganizationRegistry.OrganizationStatus.SUSPENDED,
                IOrganizationRegistry.OrganizationStatus.VERIFIED
            )
        );
        vm.prank(orgVerifier);
        orgRegistry.verifyOrganization(orgId);
    }

    /// @notice `reactivateOrganization` cannot double as verification.
    function test_RevertWhen_ReactivatingPendingOrganization() public {
        uint256 orgId = _registerOrg(alice, ORG_NAME_HASH, AIRLINE);

        vm.expectRevert(
            abi.encodeWithSelector(
                IOrganizationRegistry.InvalidOrganizationTransition.selector,
                IOrganizationRegistry.OrganizationStatus.PENDING,
                IOrganizationRegistry.OrganizationStatus.VERIFIED
            )
        );
        vm.prank(orgVerifier);
        orgRegistry.reactivateOrganization(orgId);
    }

    /// @notice Suspending a non-verified organization reverts.
    function test_RevertWhen_SuspendingPendingOrganization() public {
        uint256 orgId = _registerOrg(alice, ORG_NAME_HASH, AIRLINE);

        vm.expectRevert(
            abi.encodeWithSelector(
                IOrganizationRegistry.InvalidOrganizationTransition.selector,
                IOrganizationRegistry.OrganizationStatus.PENDING,
                IOrganizationRegistry.OrganizationStatus.SUSPENDED
            )
        );
        vm.prank(orgVerifier);
        orgRegistry.suspendOrganization(orgId);
    }

    /*//////////////////////////////////////////////////////////////
                            TRANSITION TABLE
    //////////////////////////////////////////////////////////////*/

    /// @notice The legal transition set matches `docs/state-machines.md` §1 exactly.
    /// @dev Enumerates all 25 `(from, to)` pairs. Any table drift fails here rather
    ///      than surfacing as a reachable illegal state deep in a later phase.
    function test_TransitionTable_MatchesSpecification() public view {
        uint8 none = uint8(IOrganizationRegistry.OrganizationStatus.NONE);
        uint8 pending = uint8(IOrganizationRegistry.OrganizationStatus.PENDING);
        uint8 verified = uint8(IOrganizationRegistry.OrganizationStatus.VERIFIED);
        uint8 suspended = uint8(IOrganizationRegistry.OrganizationStatus.SUSPENDED);
        uint8 revoked = uint8(IOrganizationRegistry.OrganizationStatus.REVOKED);

        for (uint8 from; from <= revoked; ++from) {
            for (uint8 to; to <= revoked; ++to) {
                bool expected = (from == pending && (to == verified || to == revoked))
                    || (from == verified && (to == suspended || to == revoked))
                    || (from == suspended && (to == verified || to == revoked));

                assertEq(
                    orgRegistry.isValidTransition(
                        IOrganizationRegistry.OrganizationStatus(from), IOrganizationRegistry.OrganizationStatus(to)
                    ),
                    expected,
                    "transition table drifted from specification"
                );
            }
        }

        // Sentinel and terminal states have no outgoing transitions at all.
        for (uint8 to; to <= revoked; ++to) {
            assertFalse(
                orgRegistry.isValidTransition(
                    IOrganizationRegistry.OrganizationStatus(none), IOrganizationRegistry.OrganizationStatus(to)
                ),
                "NONE has an outgoing transition"
            );
            assertFalse(
                orgRegistry.isValidTransition(
                    IOrganizationRegistry.OrganizationStatus(revoked), IOrganizationRegistry.OrganizationStatus(to)
                ),
                "REVOKED is not absorbing"
            );
        }
    }

    /*//////////////////////////////////////////////////////////////
                                  PAUSE
    //////////////////////////////////////////////////////////////*/

    /// @notice Pausing blocks registration.
    function test_Pause_BlocksRegistration() public {
        vm.prank(pauser);
        orgRegistry.pause();

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        _registerOrg(alice, ORG_NAME_HASH, AIRLINE);
    }

    /// @notice Privilege-reducing actions stay available while paused.
    /// @dev Blocking suspension or revocation during an incident would be exactly
    ///      backwards — those are the tools an operator needs most at that moment.
    function test_Pause_AllowsPrivilegeReducingActions() public {
        uint256 orgId = _defaultVerifiedOrg();
        uint256 pendingOrg = _registerOrg(bob, keccak256("pending"), MRO_TYPE);

        vm.prank(pauser);
        orgRegistry.pause();

        vm.prank(orgVerifier);
        orgRegistry.suspendOrganization(orgId);
        assertFalse(orgRegistry.isVerified(orgId), "suspend blocked while paused");

        vm.prank(protocolAdmin);
        orgRegistry.revokeOrganization(orgId);
        assertEq(
            uint8(orgRegistry.getOrganization(orgId).status),
            uint8(IOrganizationRegistry.OrganizationStatus.REVOKED),
            "revoke blocked while paused"
        );

        vm.prank(orgVerifier);
        orgRegistry.rejectOrganization(pendingOrg);
        assertEq(
            uint8(orgRegistry.getOrganization(pendingOrg).status),
            uint8(IOrganizationRegistry.OrganizationStatus.REVOKED),
            "reject blocked while paused"
        );
    }

    /// @notice Privilege-granting actions are blocked while paused.
    function test_Pause_BlocksVerification() public {
        uint256 orgId = _registerOrg(alice, ORG_NAME_HASH, AIRLINE);

        vm.prank(pauser);
        orgRegistry.pause();

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(orgVerifier);
        orgRegistry.verifyOrganization(orgId);
    }

    /// @notice Unpausing restores normal operation.
    function test_Unpause_RestoresOperation() public {
        vm.prank(pauser);
        orgRegistry.pause();
        vm.prank(protocolAdmin);
        orgRegistry.unpause();

        uint256 orgId = _registerOrg(alice, ORG_NAME_HASH, AIRLINE);
        assertEq(orgId, 1, "registration still blocked after unpause");
    }

    /*//////////////////////////////////////////////////////////////
                              ACTING-FOR
    //////////////////////////////////////////////////////////////*/

    /// @notice `isActingFor` is false for every status other than `VERIFIED`.
    function test_IsActingFor_RequiresVerifiedStatus() public {
        uint256 orgId = _registerOrg(alice, ORG_NAME_HASH, AIRLINE);
        assertFalse(orgRegistry.isActingFor(orgId, alice), "PENDING org can act");

        vm.prank(orgVerifier);
        orgRegistry.verifyOrganization(orgId);
        assertTrue(orgRegistry.isActingFor(orgId, alice), "VERIFIED org cannot act");

        vm.prank(orgVerifier);
        orgRegistry.suspendOrganization(orgId);
        assertFalse(orgRegistry.isActingFor(orgId, alice), "SUSPENDED org can act");

        vm.prank(protocolAdmin);
        orgRegistry.revokeOrganization(orgId);
        assertFalse(orgRegistry.isActingFor(orgId, alice), "REVOKED org can act");
    }

    /// @notice `isActingFor` returns false for unknown ids rather than reverting.
    function testFuzz_IsActingFor_UnknownIdIsFalse(uint256 orgId, address account) public view {
        assertFalse(orgRegistry.isActingFor(orgId, account), "unknown org grants authority");
    }

    /// @notice `requireActingFor` reverts with the precise reason it failed.
    function test_RequireActingFor_RevertReasons() public {
        uint256 unknownId = 999;
        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.OrganizationNotFound.selector, unknownId));
        orgRegistry.requireActingFor(unknownId, alice);

        uint256 orgId = _registerOrg(alice, ORG_NAME_HASH, AIRLINE);
        vm.expectRevert(
            abi.encodeWithSelector(
                IOrganizationRegistry.OrganizationNotVerified.selector,
                orgId,
                IOrganizationRegistry.OrganizationStatus.PENDING
            )
        );
        orgRegistry.requireActingFor(orgId, alice);

        vm.prank(orgVerifier);
        orgRegistry.verifyOrganization(orgId);
        vm.expectRevert(
            abi.encodeWithSelector(IOrganizationRegistry.NotActingForOrganization.selector, orgId, attacker)
        );
        orgRegistry.requireActingFor(orgId, attacker);

        // Succeeds for the admin.
        orgRegistry.requireActingFor(orgId, alice);
    }

    /// @notice `isActingFor` and `requireActingFor` never disagree.
    function testFuzz_ActingForAccessorsAgree(address account) public {
        uint256 orgId = _defaultVerifiedOrg();

        if (orgRegistry.isActingFor(orgId, account)) {
            orgRegistry.requireActingFor(orgId, account);
        } else {
            vm.expectRevert();
            orgRegistry.requireActingFor(orgId, account);
        }
    }
}
