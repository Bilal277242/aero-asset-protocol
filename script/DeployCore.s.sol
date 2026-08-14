// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolAddressRegistry} from "../src/core/ProtocolAddressRegistry.sol";
import {RoleManager} from "../src/core/RoleManager.sol";
import {ProtocolTimelock} from "../src/governance/ProtocolTimelock.sol";
import {DeploymentBase} from "./DeploymentBase.s.sol";

/// @title DeployCore
/// @author AeroAsset Protocol
/// @notice Stage 1: the timelock, the role manager and the address registry.
/// @dev These three are immutable and are the anchor everything else resolves through,
///      so they deploy first and never again.
///
///      The deployer keeps `DEFAULT_ADMIN_ROLE` at this stage because later stages
///      still need to write address-registry entries and grant roles.
///      `ConfigureProtocol` hands it to the timelock and renounces, and `Verify`
///      refuses to pass until that has happened.
contract DeployCore is DeploymentBase {
    /// @notice Minimum timelock delay on a production network.
    /// @dev `docs/roles.md` §4.
    uint256 internal constant PRODUCTION_MIN_DELAY = 48 hours;

    /// @notice Thrown when the configured delay is below {PRODUCTION_MIN_DELAY}.
    /// @param configured The delay that was requested.
    /// @param floor The minimum permitted without an explicit opt-out.
    error TimelockDelayTooShort(uint256 configured, uint256 floor);

    /// @notice Deploys the protocol core.
    /// @param deployer The account that temporarily holds `DEFAULT_ADMIN_ROLE`.
    /// @param timelockProposer The multisig permitted to queue timelock operations.
    /// @param minDelay Timelock delay in seconds.
    /// @return timelock The deployed timelock.
    /// @return roleManager The deployed role manager.
    /// @return addressRegistry The deployed address registry.
    function deploy(address deployer, address timelockProposer, uint256 minDelay)
        public
        returns (address timelock, address roleManager, address addressRegistry)
    {
        address[] memory proposers = new address[](1);
        proposers[0] = timelockProposer;

        // A single zero executor makes execution permissionless: once an operation has
        // survived the delay in public, restricting who submits it adds nothing.
        address[] memory executors = new address[](1);
        executors[0] = address(0);

        // No standing admin on the timelock itself — it is governed by its proposers.
        timelock = address(new ProtocolTimelock(minDelay, proposers, executors, address(0)));

        roleManager = address(new RoleManager(deployer));
        addressRegistry = address(new ProtocolAddressRegistry(roleManager));
    }

    /// @notice Deploys and records stage 1.
    function run() external {
        address proposer = vm.envAddress("PROTOCOL_ADMIN");
        uint256 minDelay = vm.envOr("TIMELOCK_MIN_DELAY", PRODUCTION_MIN_DELAY);

        // Audit AAP-27. `PRODUCTION_MIN_DELAY` was previously only the `envOr` default,
        // so `TIMELOCK_MIN_DELAY=0` deployed a zero-delay timelock — on any network,
        // silently, with every document still claiming a 48-hour delay protected the
        // protocol. The timelock is the whole mitigation for admin-key compromise; a
        // delay nobody waits for is not a weaker mitigation, it is none.
        //
        // The opt-out is deliberately awkward and deliberately not chain-gated: a
        // shorter delay is legitimate for local rehearsal, and an operator who needs one
        // elsewhere should have to say so in as many words rather than discover it by
        // setting a number.
        if (minDelay < PRODUCTION_MIN_DELAY && !vm.envOr("ALLOW_SHORT_TIMELOCK_DELAY", false)) {
            revert TimelockDelayTooShort(minDelay, PRODUCTION_MIN_DELAY);
        }

        // The broadcaster, never `msg.sender` — see `DeploymentBase._startBroadcast`.
        // This address becomes `RoleManager`'s sole admin until the handover, so
        // getting it wrong bricks the protocol with every transaction succeeding.
        address deployer = _startBroadcast();
        (address timelock, address roleManager, address addressRegistry) = deploy(deployer, proposer, minDelay);
        vm.stopBroadcast();

        _save("protocolTimelock", timelock);
        _save("roleManager", roleManager);
        _save("addressRegistry", addressRegistry);
    }
}
