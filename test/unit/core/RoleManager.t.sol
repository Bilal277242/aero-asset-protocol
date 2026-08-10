// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RoleManager} from "../../../src/core/RoleManager.sol";
import {MissingRole, ZeroAddress} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../../../src/libraries/ProtocolRoles.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

/// @title RoleManagerTest
/// @author AeroAsset Protocol
/// @notice Unit, access-control, negative and fuzz coverage for {RoleManager}.
/// @dev Covers the protocol's central authorization authority, including the
///      last-admin protection that OpenZeppelin does not provide.
contract RoleManagerTest is ProtocolTestBase {
    /// @dev Mirrors `AccessControlEnumerable`'s inherited event for expectation tests.
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
    /// @dev Mirrors `AccessControlEnumerable`'s inherited event for expectation tests.
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTION
    //////////////////////////////////////////////////////////////*/

    /// @notice The constructor seeds exactly one `DEFAULT_ADMIN_ROLE` holder.
    function test_Constructor_SeedsSingleAdmin() public view {
        assertTrue(roleManager.hasRole(roleManager.DEFAULT_ADMIN_ROLE(), protocolAdmin), "admin not seeded");
        assertEq(roleManager.getRoleMemberCount(roleManager.DEFAULT_ADMIN_ROLE()), 1, "unexpected admin count");
        assertEq(roleManager.getRoleMember(roleManager.DEFAULT_ADMIN_ROLE(), 0), protocolAdmin, "wrong admin");
    }

    /// @notice The constructor rejects the zero address.
    function test_RevertWhen_ConstructedWithZeroAdmin() public {
        vm.expectRevert(ZeroAddress.selector);
        new RoleManager(address(0));
    }

    /// @notice `DEFAULT_ADMIN_ROLE` administers every protocol role.
    /// @dev This is what makes the timelock the single revocation path for a
    ///      compromised operational key. See `docs/roles.md` §1.1.
    function test_DefaultAdminIsAdminOfEveryProtocolRole() public view {
        bytes32 defaultAdmin = roleManager.DEFAULT_ADMIN_ROLE();
        bytes32[8] memory roles = [
            ProtocolRoles.PROTOCOL_ADMIN_ROLE,
            ProtocolRoles.PAUSER_ROLE,
            ProtocolRoles.ORG_VERIFIER_ROLE,
            ProtocolRoles.ASSET_VERIFIER_ROLE,
            ProtocolRoles.CREDENTIAL_ISSUER_ROLE,
            ProtocolRoles.ARBITRATOR_ROLE,
            ProtocolRoles.FEE_MANAGER_ROLE,
            ProtocolRoles.SETTLEMENT_ROLE
        ];
        for (uint256 i; i < roles.length; ++i) {
            assertEq(roleManager.getRoleAdmin(roles[i]), defaultAdmin, "role not administered by default admin");
        }
    }

    /// @notice Role identifiers are namespaced and mutually distinct.
    /// @dev A collision would silently merge two authorization domains.
    function test_RoleIdentifiersAreDistinctAndNamespaced() public pure {
        bytes32[8] memory roles = [
            ProtocolRoles.PROTOCOL_ADMIN_ROLE,
            ProtocolRoles.PAUSER_ROLE,
            ProtocolRoles.ORG_VERIFIER_ROLE,
            ProtocolRoles.ASSET_VERIFIER_ROLE,
            ProtocolRoles.CREDENTIAL_ISSUER_ROLE,
            ProtocolRoles.ARBITRATOR_ROLE,
            ProtocolRoles.FEE_MANAGER_ROLE,
            ProtocolRoles.SETTLEMENT_ROLE
        ];
        for (uint256 i; i < roles.length; ++i) {
            assertTrue(roles[i] != bytes32(0), "role is DEFAULT_ADMIN_ROLE");
            for (uint256 j = i + 1; j < roles.length; ++j) {
                assertTrue(roles[i] != roles[j], "role identifiers collide");
            }
        }
        assertEq(ProtocolRoles.PROTOCOL_ADMIN_ROLE, keccak256("aeroasset.role.PROTOCOL_ADMIN"), "not namespaced");
        assertEq(ProtocolRoles.SETTLEMENT_ROLE, keccak256("aeroasset.role.SETTLEMENT"), "not namespaced");
    }

    /*//////////////////////////////////////////////////////////////
                                CHECKROLE
    //////////////////////////////////////////////////////////////*/

    /// @notice `checkRole` returns silently for a holder.
    function test_CheckRole_PassesForHolder() public view {
        roleManager.checkRole(ProtocolRoles.ORG_VERIFIER_ROLE, orgVerifier);
    }

    /// @notice `checkRole` reverts with the protocol's own error, not OZ's.
    /// @dev Uniform revert shape across the protocol is what lets an operator decode
    ///      any authorization failure the same way. See `docs/errors.md`, convention 4.
    function test_RevertWhen_CheckRoleForNonHolder() public {
        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.ORG_VERIFIER_ROLE, attacker));
        roleManager.checkRole(ProtocolRoles.ORG_VERIFIER_ROLE, attacker);
    }

    /*//////////////////////////////////////////////////////////////
                             GRANT & REVOKE
    //////////////////////////////////////////////////////////////*/

    /// @notice The admin can grant a role, and the event reports the granter.
    function test_GrantRole_ByAdmin() public {
        vm.expectEmit(true, true, true, true, address(roleManager));
        emit RoleGranted(ProtocolRoles.FEE_MANAGER_ROLE, bob, protocolAdmin);

        vm.prank(protocolAdmin);
        roleManager.grantRole(ProtocolRoles.FEE_MANAGER_ROLE, bob);

        assertTrue(roleManager.hasRole(ProtocolRoles.FEE_MANAGER_ROLE, bob), "role not granted");
    }

    /// @notice The admin can revoke a previously granted role.
    function test_RevokeRole_ByAdmin() public {
        vm.startPrank(protocolAdmin);
        roleManager.grantRole(ProtocolRoles.FEE_MANAGER_ROLE, bob);

        vm.expectEmit(true, true, true, true, address(roleManager));
        emit RoleRevoked(ProtocolRoles.FEE_MANAGER_ROLE, bob, protocolAdmin);
        roleManager.revokeRole(ProtocolRoles.FEE_MANAGER_ROLE, bob);
        vm.stopPrank();

        assertFalse(roleManager.hasRole(ProtocolRoles.FEE_MANAGER_ROLE, bob), "role not revoked");
    }

    /// @notice A non-admin cannot grant any role.
    function testFuzz_RevertWhen_UnauthorizedGrant(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(!roleManager.hasRole(roleManager.DEFAULT_ADMIN_ROLE(), caller));

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, caller, roleManager.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(caller);
        roleManager.grantRole(ProtocolRoles.ORG_VERIFIER_ROLE, caller);
    }

    /// @notice A non-admin cannot revoke an existing role holder.
    function testFuzz_RevertWhen_UnauthorizedRevoke(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(!roleManager.hasRole(roleManager.DEFAULT_ADMIN_ROLE(), caller));

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, caller, roleManager.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(caller);
        roleManager.revokeRole(ProtocolRoles.ORG_VERIFIER_ROLE, orgVerifier);
    }

    /*//////////////////////////////////////////////////////////////
                          LAST-ADMIN PROTECTION
    //////////////////////////////////////////////////////////////*/

    /// @notice The final `DEFAULT_ADMIN_ROLE` holder cannot be revoked.
    /// @dev Losing the last admin would permanently freeze every upgrade, role change
    ///      and unpause with no recovery path. OpenZeppelin allows it; this protocol
    ///      does not.
    function test_RevertWhen_RevokingLastAdmin() public {
        // Cached deliberately: an inline `roleManager.DEFAULT_ADMIN_ROLE()` would be
        // the "next call" that `expectRevert` and `prank` bind to, not `revokeRole`.
        bytes32 defaultAdmin = roleManager.DEFAULT_ADMIN_ROLE();

        vm.expectRevert(RoleManager.LastProtocolAdmin.selector);
        vm.prank(protocolAdmin);
        roleManager.revokeRole(defaultAdmin, protocolAdmin);
    }

    /// @notice The final admin cannot renounce either.
    /// @dev The guard lives in `_revokeRole`, so it covers `renounceRole` too —
    ///      guarding only the external `revokeRole` would leave this path open to
    ///      exactly the same unrecoverable state.
    function test_RevertWhen_RenouncingLastAdmin() public {
        bytes32 defaultAdmin = roleManager.DEFAULT_ADMIN_ROLE();

        vm.expectRevert(RoleManager.LastProtocolAdmin.selector);
        vm.prank(protocolAdmin);
        roleManager.renounceRole(defaultAdmin, protocolAdmin);
    }

    /// @notice A non-final admin can be revoked, leaving the survivor in place.
    function test_RevokeAdmin_SucceedsWhenNotLast() public {
        bytes32 defaultAdmin = roleManager.DEFAULT_ADMIN_ROLE();

        vm.startPrank(protocolAdmin);
        roleManager.grantRole(defaultAdmin, bob);
        assertEq(roleManager.getRoleMemberCount(defaultAdmin), 2, "second admin not added");

        roleManager.revokeRole(defaultAdmin, protocolAdmin);
        vm.stopPrank();

        assertEq(roleManager.getRoleMemberCount(defaultAdmin), 1, "admin not revoked");
        assertTrue(roleManager.hasRole(defaultAdmin, bob), "survivor lost the role");
    }

    /// @notice The last-admin guard applies only to `DEFAULT_ADMIN_ROLE`.
    /// @dev A sole `ARBITRATOR_ROLE` holder must remain revocable — the protection
    ///      exists to prevent an unrecoverable protocol, not to pin operational keys.
    function test_LastHolderOfOtherRoleIsRevocable() public {
        assertEq(roleManager.getRoleMemberCount(ProtocolRoles.ARBITRATOR_ROLE), 1, "fixture changed");

        vm.prank(protocolAdmin);
        roleManager.revokeRole(ProtocolRoles.ARBITRATOR_ROLE, arbitrator);

        assertEq(roleManager.getRoleMemberCount(ProtocolRoles.ARBITRATOR_ROLE), 0, "role not revoked");
    }

    /// @notice Revoking a role from an account that never held it is a no-op.
    /// @dev Confirms the last-admin guard does not fire on a phantom revoke, which
    ///      would otherwise make the no-op path revert.
    function test_RevokeRole_NoOpForNonHolder() public {
        bytes32 defaultAdmin = roleManager.DEFAULT_ADMIN_ROLE();

        vm.prank(protocolAdmin);
        roleManager.revokeRole(defaultAdmin, attacker);

        assertEq(roleManager.getRoleMemberCount(defaultAdmin), 1, "admin set changed");
    }

    /*//////////////////////////////////////////////////////////////
                                  FUZZ
    //////////////////////////////////////////////////////////////*/

    /// @notice Granting then revoking any role for any account round-trips exactly.
    function testFuzz_GrantRevokeRoundTrip(bytes32 role, address account) public {
        vm.assume(role != roleManager.DEFAULT_ADMIN_ROLE());
        vm.assume(account != address(0));
        bool heldBefore = roleManager.hasRole(role, account);

        vm.startPrank(protocolAdmin);
        roleManager.grantRole(role, account);
        assertTrue(roleManager.hasRole(role, account), "grant failed");

        roleManager.revokeRole(role, account);
        vm.stopPrank();

        assertFalse(roleManager.hasRole(role, account), "revoke failed");
        assertFalse(heldBefore && roleManager.hasRole(role, account), "state leaked");
    }

    /// @notice `hasRole` and `checkRole` never disagree, for any role and account.
    function testFuzz_CheckRoleAgreesWithHasRole(bytes32 role, address account) public {
        if (roleManager.hasRole(role, account)) {
            roleManager.checkRole(role, account);
        } else {
            vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, role, account));
            roleManager.checkRole(role, account);
        }
    }
}
