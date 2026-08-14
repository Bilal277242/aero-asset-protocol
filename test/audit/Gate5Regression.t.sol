// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ConfigureProtocol} from "../../script/ConfigureProtocol.s.sol";
import {DeployCore} from "../../script/DeployCore.s.sol";

import {RoleManager} from "../../src/core/RoleManager.sol";
import {BaseTest} from "../utils/BaseTest.sol";

/// @title Gate5Regression
/// @author AeroAsset Protocol
/// @notice Regression tests for AAP-28 — the script `run()` entry points were untested.
/// @dev Found by deploying to Sepolia, not by any test. `DeployCore.run()` took the
///      deployer from `msg.sender`, which inside a forge script is the *script-frame*
///      sender — `FOUNDRY_DEFAULT_SENDER` unless `--sender` is passed — and not the
///      account that signs the broadcast. The live run therefore deployed a
///      `RoleManager` whose sole `DEFAULT_ADMIN_ROLE` holder was an address with no
///      known private key, while every transaction succeeded and every log looked
///      healthy. The protocol was unconfigurable and unrecoverable.
///
///      `FullLifecycle.t.sol` could not catch it: it calls each stage's `deploy(...)`
///      directly with an explicit deployer argument, so `run()` — where the broadcast
///      wiring, the `msg.sender` read and all the artifact I/O live — was never
///      executed by any test.
contract Gate5Regression is BaseTest {
    DeployCore internal core;

    function setUp() public override {
        super.setUp();
        core = new DeployCore();
    }

    /*//////////////////////////////////////////////////////////////
                       THE BROADCASTER IS IDENTIFIED
    //////////////////////////////////////////////////////////////*/

    /// @notice `run()` seeds admin from the broadcasting key, not from `msg.sender`.
    /// @dev The exact defect. `PRIVATE_KEY` is set to a known key whose address differs
    ///      from this test contract (which is `msg.sender` for the `run()` call), and
    ///      the resulting `RoleManager` must be admin'd by the key's address.
    function test_AAP28_AdminIsTheBroadcasterNotMsgSender() public {
        uint256 pk = 0xA11CE;
        address expected = vm.addr(pk);

        vm.setEnv("PRIVATE_KEY", vm.toString(bytes32(pk)));
        vm.setEnv("PROTOCOL_ADMIN", vm.toString(_asContract("proposer")));
        vm.setEnv("TIMELOCK_MIN_DELAY", "172800");

        core.run();

        RoleManager roles = RoleManager(_lastRoleManager());

        assertTrue(roles.hasRole(roles.DEFAULT_ADMIN_ROLE(), expected), "admin is not the broadcaster");
        assertFalse(roles.hasRole(roles.DEFAULT_ADMIN_ROLE(), address(this)), "admin leaked to msg.sender");
        assertFalse(
            roles.hasRole(roles.DEFAULT_ADMIN_ROLE(), 0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38),
            "admin is Foundry's default sender: the original AAP-28 failure"
        );
    }

    /// @notice The `NoBroadcasterConfigured` guard is **not** covered by a test, and
    ///         this note exists so that gap is visible rather than assumed away.
    /// @dev Triggering it requires `run()` to execute with Foundry's default sender as
    ///      `msg.sender`, and the only way to impose a `msg.sender` in a test is
    ///      `vm.prank` — which Foundry refuses to combine with broadcasting
    ///      ("you have an active prank; broadcasting and pranks are not compatible").
    ///      There is no supported way to reach the branch from inside a test.
    ///
    ///      The guard is therefore CLI-level: it fires when a real `forge script` runs
    ///      with neither `PRIVATE_KEY` nor `--sender`. Verified once by hand against
    ///      this commit; not re-verified automatically.
    ///
    ///      Writing a test that passes without exercising the branch would be worse
    ///      than this comment — it is exactly the shape of the `forge test` run that
    ///      reported 502 passing tests while silently skipping a whole suite.

    /*//////////////////////////////////////////////////////////////
                                 HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @dev An address with code, as `Verify` requires of the timelock proposer.
    /// @param label Distinguishes the fixture address.
    /// @return The address.
    function _asContract(string memory label) internal returns (address) {
        address a = makeAddr(label);
        vm.etch(a, hex"00");
        return a;
    }

    /// @dev Reads the `RoleManager` recorded by the run just performed.
    /// @return The recorded address.
    function _lastRoleManager() internal view returns (address) {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        return vm.parseJsonAddress(vm.readFile(path), ".roleManager");
    }
}
