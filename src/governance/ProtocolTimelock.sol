// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title ProtocolTimelock
/// @author AeroAsset Protocol
/// @notice The delayed executor that holds `DEFAULT_ADMIN_ROLE` in {RoleManager}.
/// @dev Layer L0, immutable. A thin wrapper over OpenZeppelin's `TimelockController`
///      with no added behaviour — the value is in what holds it, not in what it does.
///
///      Every privileged protocol action routes through here: UUPS upgrades, address
///      registry writes, unpausing, terminal organization revocation and every role
///      grant or revoke. That makes each of them delayed and publicly visible in the
///      queue before it can execute, which is the whole of the mitigation for
///      `docs/threat-model.md` T-01 (admin key compromise). The delay does not prevent
///      a compromise; it buys the time in which `PAUSER_ROLE` — deliberately held on
///      separate keys, and deliberately not timelocked — can halt the protocol.
///
///      **Monitoring the queue is a launch-blocking operational requirement, not a
///      nice-to-have.** A delay nobody watches is a delay that only inconveniences the
///      attacker.
///
///      `ProtocolGovernor` is deferred past V1 per roadmap §30's "no DAO governance"
///      gate. A `Governor` can later be added as an additional proposer on this same
///      timelock without touching any other module.
contract ProtocolTimelock is TimelockController {
    /// @notice Deploys the timelock.
    /// @dev Pass `address(0)` as the sole admin to renounce the optional self-admin
    ///      role at construction, which is what `DeployCore.s.sol` does: the timelock
    ///      should be governed by its proposers, not by a standing admin key.
    /// @param minDelay Minimum seconds between queueing and execution. Production
    ///        requires at least 48 hours (`docs/roles.md` §4).
    /// @param proposers Accounts that may queue operations — the admin multisig.
    /// @param executors Accounts that may execute a matured operation. Pass a single
    ///        `address(0)` to make execution permissionless, which is usually right:
    ///        once an operation has survived the delay in public, anyone executing it
    ///        changes nothing about its content.
    /// @param admin Optional initial admin, or `address(0)` for none.
    constructor(uint256 minDelay, address[] memory proposers, address[] memory executors, address admin)
        TimelockController(minDelay, proposers, executors, admin)
    {}
}
