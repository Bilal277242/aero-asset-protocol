// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolCast} from "../../../src/libraries/ProtocolCast.sol";
import {ValueTooLarge} from "../../../src/libraries/ProtocolErrors.sol";
import {Test} from "forge-std/Test.sol";

/// @title ProtocolCastTest
/// @author AeroAsset Protocol
/// @notice Covers the checked narrowing casts that sit between the protocol's
///         `uint256` public API and its packed storage.
/// @dev These reverts are the reason the API/storage width split is safe at all. A
///      silently truncated identifier would alias an unrelated record — an id of
///      `2**64 + 1` would become `1` and write over the first record ever created —
///      so the overflow paths are tested directly rather than only through callers.
contract ProtocolCastTest is Test {
    /*//////////////////////////////////////////////////////////////
                                 UINT64
    //////////////////////////////////////////////////////////////*/

    /// @notice Values inside the range pass through unchanged.
    function test_ToUint64_PassesThroughInRange() public pure {
        assertEq(ProtocolCast.toUint64(0), 0, "zero");
        assertEq(ProtocolCast.toUint64(1), 1, "one");
        assertEq(ProtocolCast.toUint64(type(uint64).max), type(uint64).max, "boundary");
    }

    /// @notice One past the boundary reverts rather than wrapping to zero.
    function test_RevertWhen_ToUint64Overflows() public {
        uint256 overflow = uint256(type(uint64).max) + 1;

        vm.expectRevert(abi.encodeWithSelector(ValueTooLarge.selector, overflow, uint256(type(uint64).max)));
        this.callToUint64(overflow);
    }

    /// @notice Every in-range value round-trips; every out-of-range value reverts.
    function testFuzz_ToUint64(uint256 value) public {
        if (value <= type(uint64).max) {
            assertEq(uint256(ProtocolCast.toUint64(value)), value, "round-trip failed");
        } else {
            vm.expectRevert(abi.encodeWithSelector(ValueTooLarge.selector, value, uint256(type(uint64).max)));
            this.callToUint64(value);
        }
    }

    /*//////////////////////////////////////////////////////////////
                                UINT128
    //////////////////////////////////////////////////////////////*/

    /// @notice Values inside the range pass through unchanged.
    function test_ToUint128_PassesThroughInRange() public pure {
        assertEq(ProtocolCast.toUint128(0), 0, "zero");
        assertEq(ProtocolCast.toUint128(type(uint128).max), type(uint128).max, "boundary");
    }

    /// @notice One past the boundary reverts rather than wrapping.
    /// @dev Guards prices and fee amounts. A truncated price would settle a trade at a
    ///      fraction of what the parties agreed.
    function test_RevertWhen_ToUint128Overflows() public {
        uint256 overflow = uint256(type(uint128).max) + 1;

        vm.expectRevert(abi.encodeWithSelector(ValueTooLarge.selector, overflow, uint256(type(uint128).max)));
        this.callToUint128(overflow);
    }

    /// @notice Every in-range value round-trips; every out-of-range value reverts.
    function testFuzz_ToUint128(uint256 value) public {
        if (value <= type(uint128).max) {
            assertEq(uint256(ProtocolCast.toUint128(value)), value, "round-trip failed");
        } else {
            vm.expectRevert(abi.encodeWithSelector(ValueTooLarge.selector, value, uint256(type(uint128).max)));
            this.callToUint128(value);
        }
    }

    /// @notice External wrapper so `vm.expectRevert` observes a call boundary.
    /// @param value The value to narrow.
    /// @return The narrowed value.
    function callToUint128(uint256 value) external pure returns (uint128) {
        return ProtocolCast.toUint128(value);
    }

    /*//////////////////////////////////////////////////////////////
                                 UINT40
    //////////////////////////////////////////////////////////////*/

    /// @notice Values inside the range pass through unchanged.
    function test_ToUint40_PassesThroughInRange() public pure {
        assertEq(ProtocolCast.toUint40(0), 0, "zero");
        assertEq(ProtocolCast.toUint40(type(uint40).max), type(uint40).max, "boundary");
    }

    /// @notice One past the boundary reverts rather than wrapping.
    function test_RevertWhen_ToUint40Overflows() public {
        uint256 overflow = uint256(type(uint40).max) + 1;

        vm.expectRevert(abi.encodeWithSelector(ValueTooLarge.selector, overflow, uint256(type(uint40).max)));
        this.callToUint40(overflow);
    }

    /// @notice `uint40` comfortably covers every timestamp the protocol will see.
    /// @dev The packed-timestamp decision in `docs/asset-model.md` §0 rests on this.
    function test_ToUint40_CoversRealisticTimestamps() public pure {
        // 2500-01-01T00:00:00Z, far beyond any deadline the protocol will record.
        assertEq(ProtocolCast.toUint40(16_725_225_600), 16_725_225_600, "year 2500 not representable");
        assertGt(uint256(type(uint40).max), 16_725_225_600, "uint40 too narrow for the protocol horizon");
    }

    /// @notice Every in-range value round-trips; every out-of-range value reverts.
    function testFuzz_ToUint40(uint256 value) public {
        if (value <= type(uint40).max) {
            assertEq(uint256(ProtocolCast.toUint40(value)), value, "round-trip failed");
        } else {
            vm.expectRevert(abi.encodeWithSelector(ValueTooLarge.selector, value, uint256(type(uint40).max)));
            this.callToUint40(value);
        }
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice External wrapper so `vm.expectRevert` observes a call boundary.
    /// @param value The value to narrow.
    /// @return The narrowed value.
    function callToUint64(uint256 value) external pure returns (uint64) {
        return ProtocolCast.toUint64(value);
    }

    /// @notice External wrapper so `vm.expectRevert` observes a call boundary.
    /// @param value The value to narrow.
    /// @return The narrowed value.
    function callToUint40(uint256 value) external pure returns (uint40) {
        return ProtocolCast.toUint40(value);
    }
}
