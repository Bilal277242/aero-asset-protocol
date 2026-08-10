// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BaseTest} from "../utils/BaseTest.sol";
import {stdError} from "forge-std/StdError.sol";

/// @title FoundationTest
/// @author AeroAsset Protocol
/// @notice Phase 0 baseline: proves the Foundry toolchain, compiler pin, EVM
///         target and shared test harness are wired correctly before any
///         protocol logic exists.
/// @dev This suite intentionally exercises no protocol code. It exists so that
///      "clean build, zero failing tests" is an asserted property rather than an
///      assumption, and so a broken toolchain fails loudly in CI.
contract FoundationTest is BaseTest {
    /// @notice The harness must produce distinct, non-zero, funded actors.
    function test_Harness_ActorsAreDistinctAndFunded() public view {
        assertTrue(protocolAdmin != address(0), "admin unset");
        assertTrue(alice != bob, "actors collide");
        assertTrue(bob != carol, "actors collide");
        assertTrue(attacker != protocolAdmin, "attacker is privileged");
        assertEq(alice.balance, 100 ether, "actor not funded");
    }

    /// @notice The harness must start at the configured epoch, not at block 1.
    function test_Harness_WarpsToRealisticEpoch() public view {
        assertEq(block.timestamp, GENESIS_TIMESTAMP, "timestamp not warped");
        assertEq(block.number, GENESIS_BLOCK, "block not rolled");
    }

    /// @notice Confirms the build targets an EVM version that supports transient
    ///         storage, which the Phase 7 escrow reentrancy guard relies on.
    /// @dev `TSTORE`/`TLOAD` were introduced in Cancun (EIP-1153). If the profile
    ///      is downgraded to shanghai or earlier this assembly block reverts.
    function test_Toolchain_SupportsCancunTransientStorage() public {
        bytes32 slot = keccak256("aeroasset.foundation.probe");
        assembly ("memory-safe") {
            tstore(slot, 1)
        }

        uint256 observed;
        assembly ("memory-safe") {
            observed := tload(slot)
        }
        assertEq(observed, 1, "transient storage unavailable");
    }

    /// @notice Confirms checked arithmetic is active, i.e. the 0.8.x compiler pin
    ///         holds and no global `unchecked` has been introduced.
    function testFuzz_Toolchain_ArithmeticIsChecked(uint256 value) public {
        value = bound(value, 1, type(uint256).max);
        vm.expectRevert(stdError.arithmeticError);
        this.overflow(value);
    }

    /// @notice External helper so `vm.expectRevert` observes a call boundary.
    /// @param value Addend that is guaranteed to overflow `type(uint256).max`.
    /// @return The unreachable sum.
    function overflow(uint256 value) external pure returns (uint256) {
        return type(uint256).max + value;
    }
}
