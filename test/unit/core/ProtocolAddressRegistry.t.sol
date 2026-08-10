// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolAddressRegistry} from "../../../src/core/ProtocolAddressRegistry.sol";
import {IProtocolAddressRegistry} from "../../../src/interfaces/IProtocolAddressRegistry.sol";
import {ProtocolAddressKeys} from "../../../src/libraries/ProtocolAddressKeys.sol";
import {AddressNotRegistered, MissingRole, ZeroAddress} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../../../src/libraries/ProtocolRoles.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";

/// @title ProtocolAddressRegistryTest
/// @author AeroAsset Protocol
/// @notice Unit, access-control, negative and fuzz coverage for the address book.
contract ProtocolAddressRegistryTest is ProtocolTestBase {
    /// @dev An arbitrary key with no protocol meaning, used for isolation tests.
    bytes32 internal constant UNUSED_KEY = keccak256("aeroasset.address.UNUSED_FOR_TESTS");

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTION
    //////////////////////////////////////////////////////////////*/

    /// @notice The role manager is bound immutably at construction.
    function test_Constructor_BindsRoleManager() public view {
        assertEq(address(addressRegistry.ROLE_MANAGER()), address(roleManager), "role manager not bound");
    }

    /// @notice The constructor rejects a zero role manager.
    function test_RevertWhen_ConstructedWithZeroRoleManager() public {
        vm.expectRevert(ZeroAddress.selector);
        new ProtocolAddressRegistry(address(0));
    }

    /*//////////////////////////////////////////////////////////////
                                  WRITES
    //////////////////////////////////////////////////////////////*/

    /// @notice The admin can register a new address, and the event reports both sides.
    function test_SetAddress_RegistersNewEntry() public {
        vm.expectEmit(true, true, true, true, address(addressRegistry));
        emit IProtocolAddressRegistry.ProtocolAddressSet(UNUSED_KEY, address(0), bob);

        vm.prank(protocolAdmin);
        addressRegistry.setAddress(UNUSED_KEY, bob);

        assertEq(addressRegistry.getAddress(UNUSED_KEY), bob, "entry not stored");
        assertTrue(addressRegistry.isRegistered(UNUSED_KEY), "not reported as registered");
    }

    /// @notice Rotating an entry emits the previous address alongside the new one.
    /// @dev A monitoring system must be able to detect an unexpected rotation without
    ///      holding prior state. See `docs/events.md`, convention 4.
    function test_SetAddress_RotationEmitsBothSides() public {
        vm.startPrank(protocolAdmin);
        addressRegistry.setAddress(UNUSED_KEY, bob);

        vm.expectEmit(true, true, true, true, address(addressRegistry));
        emit IProtocolAddressRegistry.ProtocolAddressSet(UNUSED_KEY, bob, carol);
        addressRegistry.setAddress(UNUSED_KEY, carol);
        vm.stopPrank();

        assertEq(addressRegistry.getAddress(UNUSED_KEY), carol, "rotation not applied");
    }

    /// @notice Entries cannot be cleared to the zero address.
    /// @dev Clearing an entry would silently brick every module that resolves it, so
    ///      rotation is supported and deletion is not.
    function test_RevertWhen_SettingZeroAddress() public {
        vm.expectRevert(ZeroAddress.selector);
        vm.prank(protocolAdmin);
        addressRegistry.setAddress(UNUSED_KEY, address(0));
    }

    /// @notice Writing one key never disturbs another.
    function test_SetAddress_KeysAreIndependent() public {
        vm.startPrank(protocolAdmin);
        addressRegistry.setAddress(UNUSED_KEY, bob);
        vm.stopPrank();

        assertEq(
            addressRegistry.getAddress(ProtocolAddressKeys.ORGANIZATION_REGISTRY),
            address(orgRegistry),
            "unrelated key changed"
        );
    }

    /*//////////////////////////////////////////////////////////////
                             ACCESS CONTROL
    //////////////////////////////////////////////////////////////*/

    /// @notice Only `PROTOCOL_ADMIN_ROLE` may write.
    function testFuzz_RevertWhen_UnauthorizedSetAddress(address caller) public {
        _assumeUnprivileged(caller);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PROTOCOL_ADMIN_ROLE, caller));
        vm.prank(caller);
        addressRegistry.setAddress(UNUSED_KEY, caller);
    }

    /// @notice Holding an unrelated protocol role does not confer write access.
    function test_RevertWhen_NonAdminRoleHolderSetsAddress() public {
        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PROTOCOL_ADMIN_ROLE, orgVerifier));
        vm.prank(orgVerifier);
        addressRegistry.setAddress(UNUSED_KEY, orgVerifier);
    }

    /// @notice Revoking `PROTOCOL_ADMIN_ROLE` immediately removes write access.
    /// @dev The registry reads the role manager live rather than caching, so a
    ///      revocation takes effect on the very next call.
    function test_RevokedAdminLosesWriteAccessImmediately() public {
        vm.prank(protocolAdmin);
        roleManager.revokeRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE, protocolAdmin);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PROTOCOL_ADMIN_ROLE, protocolAdmin));
        vm.prank(protocolAdmin);
        addressRegistry.setAddress(UNUSED_KEY, bob);
    }

    /*//////////////////////////////////////////////////////////////
                                  READS
    //////////////////////////////////////////////////////////////*/

    /// @notice `getAddress` names the missing key rather than returning zero.
    /// @dev Turns a misconfigured deployment into a diagnosable failure instead of an
    ///      inscrutable call to `address(0)`.
    function test_RevertWhen_GettingUnsetKey() public {
        vm.expectRevert(abi.encodeWithSelector(AddressNotRegistered.selector, UNUSED_KEY));
        addressRegistry.getAddress(UNUSED_KEY);
    }

    /// @notice `tryGetAddress` returns zero for an unset key instead of reverting.
    function test_TryGetAddress_ReturnsZeroForUnsetKey() public view {
        assertEq(addressRegistry.tryGetAddress(UNUSED_KEY), address(0), "expected zero");
        assertFalse(addressRegistry.isRegistered(UNUSED_KEY), "unset key reported registered");
    }

    /// @notice The Phase 1 wiring is complete after `setUp`.
    function test_ProtocolWiringIsResolvable() public view {
        assertEq(
            addressRegistry.getAddress(ProtocolAddressKeys.ROLE_MANAGER), address(roleManager), "role manager unset"
        );
        assertEq(
            addressRegistry.getAddress(ProtocolAddressKeys.ORGANIZATION_REGISTRY),
            address(orgRegistry),
            "org registry unset"
        );
    }

    /// @notice Address-registry keys are namespaced and mutually distinct.
    function test_AddressKeysAreDistinct() public pure {
        bytes32[6] memory keys = [
            ProtocolAddressKeys.ROLE_MANAGER,
            ProtocolAddressKeys.ORGANIZATION_REGISTRY,
            ProtocolAddressKeys.CREDENTIAL_REGISTRY,
            ProtocolAddressKeys.ASSET_REGISTRY,
            ProtocolAddressKeys.MARKETPLACE,
            ProtocolAddressKeys.ESCROW_FACTORY
        ];
        for (uint256 i; i < keys.length; ++i) {
            for (uint256 j = i + 1; j < keys.length; ++j) {
                assertTrue(keys[i] != keys[j], "address keys collide");
            }
        }
    }

    /*//////////////////////////////////////////////////////////////
                                  FUZZ
    //////////////////////////////////////////////////////////////*/

    /// @notice Any non-zero address round-trips through any key.
    function testFuzz_SetAndGet(bytes32 key, address value) public {
        vm.assume(value != address(0));

        vm.prank(protocolAdmin);
        addressRegistry.setAddress(key, value);

        assertEq(addressRegistry.getAddress(key), value, "round-trip failed");
        assertEq(addressRegistry.tryGetAddress(key), value, "try round-trip failed");
        assertTrue(addressRegistry.isRegistered(key), "not registered");
    }

    /// @notice `getAddress` and `tryGetAddress` agree for every key.
    function testFuzz_GetAndTryGetAgree(bytes32 key) public {
        address viaTry = addressRegistry.tryGetAddress(key);

        if (viaTry == address(0)) {
            vm.expectRevert(abi.encodeWithSelector(AddressNotRegistered.selector, key));
            addressRegistry.getAddress(key);
        } else {
            assertEq(addressRegistry.getAddress(key), viaTry, "accessors disagree");
        }
    }
}
