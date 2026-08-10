// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolAddressKeys} from "../../../src/libraries/ProtocolAddressKeys.sol";
import {AddressNotRegistered, MissingRole, ZeroAddress} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../../../src/libraries/ProtocolRoles.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";
import {MockProtocolModule} from "../../utils/mocks/MockProtocolModule.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title ProtocolModuleTest
/// @author AeroAsset Protocol
/// @notice Covers the shared {ProtocolModuleUpgradeable} base directly: peer
///         resolution, role gating, the asymmetric pause and initialization guards.
contract ProtocolModuleTest is ProtocolTestBase {
    /// @notice The module under test, behind its own proxy.
    MockProtocolModule internal module;

    /// @dev A key that is never registered, used for negative resolution tests.
    bytes32 internal constant UNSET_KEY = keccak256("aeroasset.address.NEVER_SET");

    function setUp() public override {
        super.setUp();

        address impl = address(new MockProtocolModule());
        module = MockProtocolModule(
            address(
                new ERC1967Proxy(
                    impl,
                    abi.encodeCall(MockProtocolModule.initialize, (address(roleManager), address(addressRegistry)))
                )
            )
        );
        vm.label(address(module), "MockProtocolModule");
    }

    /*//////////////////////////////////////////////////////////////
                             INITIALIZATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Initialization records both protocol dependencies.
    function test_Initialize_StoresDependencies() public view {
        assertEq(address(module.roleManager()), address(roleManager), "role manager not stored");
        assertEq(address(module.addressRegistry()), address(addressRegistry), "address registry not stored");
        assertFalse(module.paused(), "module starts paused");
    }

    /// @notice Initialization rejects a zero role manager.
    function test_RevertWhen_InitializedWithZeroRoleManager() public {
        address impl = address(new MockProtocolModule());

        vm.expectRevert(ZeroAddress.selector);
        new ERC1967Proxy(impl, abi.encodeCall(MockProtocolModule.initialize, (address(0), address(addressRegistry))));
    }

    /// @notice Initialization rejects a zero address registry.
    function test_RevertWhen_InitializedWithZeroAddressRegistry() public {
        address impl = address(new MockProtocolModule());

        vm.expectRevert(ZeroAddress.selector);
        new ERC1967Proxy(impl, abi.encodeCall(MockProtocolModule.initialize, (address(roleManager), address(0))));
    }

    /*//////////////////////////////////////////////////////////////
                            PEER RESOLUTION
    //////////////////////////////////////////////////////////////*/

    /// @notice A registered peer resolves to its current address.
    function test_Resolve_ReturnsRegisteredPeer() public view {
        assertEq(module.resolve(ProtocolAddressKeys.ORGANIZATION_REGISTRY), address(orgRegistry), "peer not resolved");
    }

    /// @notice Resolution reads through to the registry rather than caching.
    /// @dev A rotated-out module must not retain privileges it should have lost, so
    ///      peer addresses are re-read on every call. See `docs/security-model.md` §4.
    function test_Resolve_ReflectsRotationImmediately() public {
        vm.prank(protocolAdmin);
        addressRegistry.setAddress(ProtocolAddressKeys.ORGANIZATION_REGISTRY, carol);

        assertEq(module.resolve(ProtocolAddressKeys.ORGANIZATION_REGISTRY), carol, "stale peer address cached");
    }

    /// @notice Resolving an unregistered key names the missing key.
    function test_RevertWhen_ResolvingUnsetKey() public {
        vm.expectRevert(abi.encodeWithSelector(AddressNotRegistered.selector, UNSET_KEY));
        module.resolve(UNSET_KEY);
    }

    /*//////////////////////////////////////////////////////////////
                              ROLE GATING
    //////////////////////////////////////////////////////////////*/

    /// @notice `hasRole` on the module agrees with the central role manager.
    function testFuzz_HasRole_MatchesRoleManager(bytes32 role, address account) public view {
        assertEq(module.hasRole(role, account), roleManager.hasRole(role, account), "module and manager disagree");
    }

    /// @notice A role holder passes the `onlyRole` gate.
    function test_Guarded_AllowsRoleHolder() public {
        vm.prank(orgVerifier);
        assertTrue(module.guarded(ProtocolRoles.ORG_VERIFIER_ROLE), "role holder rejected");
    }

    /// @notice A non-holder is rejected by the `onlyRole` gate.
    function testFuzz_RevertWhen_GuardedCalledByNonHolder(address caller) public {
        _assumeUnprivileged(caller);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.ORG_VERIFIER_ROLE, caller));
        vm.prank(caller);
        module.guarded(ProtocolRoles.ORG_VERIFIER_ROLE);
    }

    /// @notice Role changes propagate to the module with no cached-authority window.
    function test_RoleChangesPropagateImmediately() public {
        vm.prank(protocolAdmin);
        roleManager.grantRole(ProtocolRoles.ARBITRATOR_ROLE, carol);
        vm.prank(carol);
        assertTrue(module.guarded(ProtocolRoles.ARBITRATOR_ROLE), "grant did not propagate");

        vm.prank(protocolAdmin);
        roleManager.revokeRole(ProtocolRoles.ARBITRATOR_ROLE, carol);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.ARBITRATOR_ROLE, carol));
        vm.prank(carol);
        module.guarded(ProtocolRoles.ARBITRATOR_ROLE);
    }

    /*//////////////////////////////////////////////////////////////
                                  PAUSE
    //////////////////////////////////////////////////////////////*/

    /// @notice The pause is asymmetric: pauser stops it, only admin restarts it.
    function test_Pause_IsAsymmetric() public {
        assertTrue(module.guardedByPause(), "guard blocked while unpaused");

        vm.prank(pauser);
        module.pause();
        assertTrue(module.paused(), "pause not applied");

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        module.guardedByPause();

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PROTOCOL_ADMIN_ROLE, pauser));
        vm.prank(pauser);
        module.unpause();

        vm.prank(protocolAdmin);
        module.unpause();
        assertTrue(module.guardedByPause(), "unpause did not restore operation");
    }

    /// @notice Only `PAUSER_ROLE` may pause the base module.
    function testFuzz_RevertWhen_UnauthorizedPause(address caller) public {
        _assumeUnprivileged(caller);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PAUSER_ROLE, caller));
        vm.prank(caller);
        module.pause();
    }
}
