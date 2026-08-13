// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {DeployCore} from "../../script/DeployCore.s.sol";
import {DeploymentBase} from "../../script/DeploymentBase.s.sol";
import {Verify} from "../../script/Verify.s.sol";
import {ProtocolTimelock} from "../../src/governance/ProtocolTimelock.sol";
import {BaseTest} from "../utils/BaseTest.sol";

/// @title Gate4Regression
/// @author AeroAsset Protocol
/// @notice Regression tests for AAP-27 — the timelock was never verified.
/// @dev Every other assertion in `Verify.s.sol` checks that power was handed *to* the
///      timelock. None checked that the timelock was worth handing power to. A
///      zero-delay timelock proposed by a single EOA passed the entire gate while
///      providing none of the protection `docs/threat-model.md` T-01 credits it with.
///
///      These tests deploy deliberately broken timelocks and assert the gate now
///      rejects them. A verifier that passes on a broken deployment is worse than no
///      verifier, because it manufactures confidence.
contract Gate4Regression is BaseTest {
    Verify internal verifier;
    DeployCore internal core;

    /// @dev A stand-in multisig: any address with code satisfies the contract check.
    address internal multisigProposer;

    function setUp() public override {
        super.setUp();
        verifier = new Verify();
        core = new DeployCore();

        multisigProposer = makeAddr("proposerMultisig");
        vm.etch(multisigProposer, hex"00");
    }

    /*//////////////////////////////////////////////////////////////
                  THE DEPLOY SCRIPT REFUSES A SHORT DELAY
    //////////////////////////////////////////////////////////////*/

    /// @notice `DeployCore.run` rejects a sub-48h delay unless explicitly opted out.
    /// @dev The original defect: `PRODUCTION_MIN_DELAY` was only the `envOr` default, so
    ///      `TIMELOCK_MIN_DELAY=0` silently produced a zero-delay timelock on any chain.
    function test_AAP27_DeployRejectsShortDelay() public {
        vm.setEnv("PROTOCOL_ADMIN", vm.toString(multisigProposer));
        vm.setEnv("TIMELOCK_MIN_DELAY", "0");
        vm.setEnv("ALLOW_SHORT_TIMELOCK_DELAY", "false");

        vm.expectRevert(abi.encodeWithSelector(DeployCore.TimelockDelayTooShort.selector, 0, 48 hours));
        core.run();
    }

    /// @notice One second under the floor is still under the floor.
    function test_AAP27_DeployRejectsJustUnderTheFloor() public {
        vm.setEnv("PROTOCOL_ADMIN", vm.toString(multisigProposer));
        vm.setEnv("TIMELOCK_MIN_DELAY", vm.toString(uint256(48 hours) - 1));
        vm.setEnv("ALLOW_SHORT_TIMELOCK_DELAY", "false");

        vm.expectRevert(
            abi.encodeWithSelector(DeployCore.TimelockDelayTooShort.selector, uint256(48 hours) - 1, 48 hours)
        );
        core.run();
    }

    /*//////////////////////////////////////////////////////////////
                     THE GATE REJECTS A WEAK TIMELOCK
    //////////////////////////////////////////////////////////////*/

    /// @notice Verification fails on a zero-delay timelock.
    function test_AAP27_VerifyRejectsZeroDelay() public {
        DeploymentBase.ProtocolAddresses memory a = _addressesWithTimelock(0, multisigProposer);

        vm.expectRevert(
            abi.encodeWithSelector(Verify.VerificationFailed.selector, "timelock delay below the production floor")
        );
        verifier.verify(a, address(0), multisigProposer);
    }

    /// @notice Verification fails when the proposer is a single key.
    /// @dev A 48-hour delay proposed by one EOA reduces the whole control to that key.
    function test_AAP27_VerifyRejectsEoaProposer() public {
        address eoaProposer = makeAddr("lonelyKey");
        DeploymentBase.ProtocolAddresses memory a = _addressesWithTimelock(48 hours, eoaProposer);

        vm.expectRevert(abi.encodeWithSelector(Verify.VerificationFailed.selector, "timelock proposer is an EOA"));
        verifier.verify(a, address(0), eoaProposer);
    }

    /// @notice Verification fails when the named proposer cannot actually propose.
    function test_AAP27_VerifyRejectsWrongProposer() public {
        DeploymentBase.ProtocolAddresses memory a = _addressesWithTimelock(48 hours, multisigProposer);

        address impostor = makeAddr("impostor");
        vm.etch(impostor, hex"00");

        vm.expectRevert(abi.encodeWithSelector(Verify.VerificationFailed.selector, "proposer lacks PROPOSER_ROLE"));
        verifier.verify(a, address(0), impostor);
    }

    /// @notice Verification fails when no proposer is configured at all.
    function test_AAP27_VerifyRejectsZeroProposer() public {
        DeploymentBase.ProtocolAddresses memory a = _addressesWithTimelock(48 hours, multisigProposer);

        vm.expectRevert(abi.encodeWithSelector(Verify.VerificationFailed.selector, "no timelock proposer configured"));
        verifier.verify(a, address(0), address(0));
    }

    /// @notice A standing admin on the timelock routes around the delay entirely.
    /// @dev It could re-grant `PROPOSER_ROLE` with no delay at all. `DeployCore` passes
    ///      `address(0)` as admin precisely so this cannot happen.
    function test_AAP27_VerifyRejectsProposerHoldingTimelockAdmin() public {
        address[] memory proposers = new address[](1);
        proposers[0] = multisigProposer;
        address[] memory executors = new address[](1);
        executors[0] = address(0);

        // Deployed with the proposer *also* as standing admin — the shape DeployCore
        // deliberately avoids.
        ProtocolTimelock weak = new ProtocolTimelock(48 hours, proposers, executors, multisigProposer);

        DeploymentBase.ProtocolAddresses memory a;
        a.protocolTimelock = address(weak);

        vm.expectRevert(
            abi.encodeWithSelector(Verify.VerificationFailed.selector, "proposer also holds timelock admin")
        );
        verifier.verify(a, address(0), multisigProposer);
    }

    /// @notice A correctly configured timelock is not rejected.
    /// @dev Proved by `FullLifecycleTest.test_DeploymentPassesVerification`, which runs
    ///      the real deployment scripts end to end and passes the whole gate — including
    ///      these checks — rather than by a synthetic fixture here. A gate that rejects
    ///      good configurations is as useless as one that accepts bad ones, and the
    ///      integration test is the stronger evidence for that direction.
    ///
    ///      Left as a pointer rather than a duplicate assertion.

    /*//////////////////////////////////////////////////////////////
                                 HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @dev Builds an address struct carrying only a freshly deployed timelock.
    /// @param delay The timelock's minimum delay.
    /// @param proposer The account granted `PROPOSER_ROLE`.
    /// @return a The partially populated addresses.
    function _addressesWithTimelock(uint256 delay, address proposer)
        internal
        returns (DeploymentBase.ProtocolAddresses memory a)
    {
        address[] memory proposers = new address[](1);
        proposers[0] = proposer;
        address[] memory executors = new address[](1);
        executors[0] = address(0);

        a.protocolTimelock = address(new ProtocolTimelock(delay, proposers, executors, address(0)));
    }
}
