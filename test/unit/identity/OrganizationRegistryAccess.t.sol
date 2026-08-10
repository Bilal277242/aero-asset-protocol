// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IOrganizationRegistry} from "../../../src/interfaces/IOrganizationRegistry.sol";
import {MissingRole} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../../../src/libraries/ProtocolRoles.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";

/// @title OrganizationRegistryAccessTest
/// @author AeroAsset Protocol
/// @notice Access-control coverage for {OrganizationRegistry}: every role-gated and
///         owner-gated entry point is exercised with an unauthorized caller.
/// @dev Implements the negative half of the matrix in `docs/permissions.md` §L1.
contract OrganizationRegistryAccessTest is ProtocolTestBase {
    /// @dev Fixture organization, verified and administered by `alice`.
    uint256 internal orgId;

    function setUp() public override {
        super.setUp();
        orgId = _defaultVerifiedOrg();
    }

    /*//////////////////////////////////////////////////////////////
                        ORGANIZATION-ADMIN GATES
    //////////////////////////////////////////////////////////////*/

    /// @notice Only the org admin may update the profile.
    function testFuzz_RevertWhen_NonAdminUpdates(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != alice);

        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.NotOrganizationAdmin.selector, orgId, caller));
        vm.prank(caller);
        orgRegistry.updateOrganization(orgId, keccak256("v2"), "ipfs://v2");
    }

    /// @notice Only the org admin may propose an admin transfer.
    function testFuzz_RevertWhen_NonAdminTransfersAdmin(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != alice);

        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.NotOrganizationAdmin.selector, orgId, caller));
        vm.prank(caller);
        orgRegistry.transferOrganizationAdmin(orgId, caller);
    }

    /// @notice Only the org admin may manage operators.
    function testFuzz_RevertWhen_NonAdminSetsOperator(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != alice);

        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.NotOrganizationAdmin.selector, orgId, caller));
        vm.prank(caller);
        orgRegistry.setOperator(orgId, caller, true);
    }

    /// @notice An operator can act for the organization but cannot administer it.
    /// @dev Operator authority is deliberately narrower than admin authority: an
    ///      operator that could add operators or hand over the admin seat would make
    ///      the distinction meaningless.
    function test_RevertWhen_OperatorEscalatesToAdminActions() public {
        vm.prank(alice);
        orgRegistry.setOperator(orgId, carol, true);
        assertTrue(orgRegistry.isActingFor(orgId, carol), "operator cannot act");

        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.NotOrganizationAdmin.selector, orgId, carol));
        vm.prank(carol);
        orgRegistry.setOperator(orgId, attacker, true);

        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.NotOrganizationAdmin.selector, orgId, carol));
        vm.prank(carol);
        orgRegistry.transferOrganizationAdmin(orgId, carol);

        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.NotOrganizationAdmin.selector, orgId, carol));
        vm.prank(carol);
        orgRegistry.updateOrganization(orgId, keccak256("v2"), "");
    }

    /// @notice A former admin loses all admin authority after handing over.
    function test_PreviousAdminLosesAuthorityAfterHandover() public {
        vm.prank(alice);
        orgRegistry.transferOrganizationAdmin(orgId, bob);
        vm.prank(bob);
        orgRegistry.acceptOrganizationAdmin(orgId);

        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.NotOrganizationAdmin.selector, orgId, alice));
        vm.prank(alice);
        orgRegistry.setOperator(orgId, attacker, true);
    }

    /*//////////////////////////////////////////////////////////////
                              ROLE GATES
    //////////////////////////////////////////////////////////////*/

    /// @notice Only `ORG_VERIFIER_ROLE` may verify.
    function testFuzz_RevertWhen_UnauthorizedVerify(address caller) public {
        _assumeUnprivileged(caller);
        uint256 pendingOrg = _registerOrg(bob, keccak256("pending"), IOrganizationRegistry.OrganizationType.MRO);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.ORG_VERIFIER_ROLE, caller));
        vm.prank(caller);
        orgRegistry.verifyOrganization(pendingOrg);
    }

    /// @notice Only `ORG_VERIFIER_ROLE` may reject.
    function testFuzz_RevertWhen_UnauthorizedReject(address caller) public {
        _assumeUnprivileged(caller);
        uint256 pendingOrg = _registerOrg(bob, keccak256("pending"), IOrganizationRegistry.OrganizationType.MRO);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.ORG_VERIFIER_ROLE, caller));
        vm.prank(caller);
        orgRegistry.rejectOrganization(pendingOrg);
    }

    /// @notice Only `ORG_VERIFIER_ROLE` may suspend.
    function testFuzz_RevertWhen_UnauthorizedSuspend(address caller) public {
        _assumeUnprivileged(caller);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.ORG_VERIFIER_ROLE, caller));
        vm.prank(caller);
        orgRegistry.suspendOrganization(orgId);
    }

    /// @notice Only `ORG_VERIFIER_ROLE` may reactivate.
    function testFuzz_RevertWhen_UnauthorizedReactivate(address caller) public {
        _assumeUnprivileged(caller);
        vm.prank(orgVerifier);
        orgRegistry.suspendOrganization(orgId);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.ORG_VERIFIER_ROLE, caller));
        vm.prank(caller);
        orgRegistry.reactivateOrganization(orgId);
    }

    /// @notice Revocation requires `PROTOCOL_ADMIN_ROLE`, not the verifier role.
    /// @dev Suspension is reversible and belongs to compliance; revocation is
    ///      irreversible and belongs to the timelock.
    function test_RevertWhen_VerifierRevokes() public {
        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PROTOCOL_ADMIN_ROLE, orgVerifier));
        vm.prank(orgVerifier);
        orgRegistry.revokeOrganization(orgId);
    }

    /// @notice Only `PROTOCOL_ADMIN_ROLE` may revoke.
    function testFuzz_RevertWhen_UnauthorizedRevoke(address caller) public {
        _assumeUnprivileged(caller);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PROTOCOL_ADMIN_ROLE, caller));
        vm.prank(caller);
        orgRegistry.revokeOrganization(orgId);
    }

    /*//////////////////////////////////////////////////////////////
                              PAUSE GATES
    //////////////////////////////////////////////////////////////*/

    /// @notice Only `PAUSER_ROLE` may pause.
    function testFuzz_RevertWhen_UnauthorizedPause(address caller) public {
        _assumeUnprivileged(caller);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PAUSER_ROLE, caller));
        vm.prank(caller);
        orgRegistry.pause();
    }

    /// @notice The pauser deliberately cannot unpause.
    /// @dev Fast to stop, slow to restart. A compromised pauser key can grief the
    ///      protocol but cannot restart it into a state of its choosing.
    function test_RevertWhen_PauserUnpauses() public {
        vm.prank(pauser);
        orgRegistry.pause();

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PROTOCOL_ADMIN_ROLE, pauser));
        vm.prank(pauser);
        orgRegistry.unpause();
    }

    /// @notice Only `PROTOCOL_ADMIN_ROLE` may unpause.
    function testFuzz_RevertWhen_UnauthorizedUnpause(address caller) public {
        _assumeUnprivileged(caller);
        vm.prank(pauser);
        orgRegistry.pause();

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PROTOCOL_ADMIN_ROLE, caller));
        vm.prank(caller);
        orgRegistry.unpause();
    }

    /*//////////////////////////////////////////////////////////////
                         ROLE-REVOCATION EFFECTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Revoking a role takes effect on the very next call.
    /// @dev Modules read the role manager live, so there is no cached-authority window
    ///      after a compromised key is revoked.
    function test_RoleRevocationIsImmediate() public {
        uint256 pendingOrg = _registerOrg(bob, keccak256("pending"), IOrganizationRegistry.OrganizationType.MRO);

        vm.prank(protocolAdmin);
        roleManager.revokeRole(ProtocolRoles.ORG_VERIFIER_ROLE, orgVerifier);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.ORG_VERIFIER_ROLE, orgVerifier));
        vm.prank(orgVerifier);
        orgRegistry.verifyOrganization(pendingOrg);
    }

    /// @notice Granting a role takes effect on the very next call.
    function test_RoleGrantIsImmediate() public {
        uint256 pendingOrg = _registerOrg(bob, keccak256("pending"), IOrganizationRegistry.OrganizationType.MRO);

        vm.prank(protocolAdmin);
        roleManager.grantRole(ProtocolRoles.ORG_VERIFIER_ROLE, carol);

        vm.prank(carol);
        orgRegistry.verifyOrganization(pendingOrg);
        assertTrue(orgRegistry.isVerified(pendingOrg), "newly granted role did not take effect");
    }
}
