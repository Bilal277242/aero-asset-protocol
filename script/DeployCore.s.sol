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
    /// @dev `docs/roles.md` §4. Overridable by `TIMELOCK_MIN_DELAY` for testnets,
    ///      where waiting two days between configuration steps helps nobody.
    uint256 internal constant PRODUCTION_MIN_DELAY = 48 hours;

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
        address deployer = msg.sender;
        address proposer = vm.envAddress("PROTOCOL_ADMIN");
        uint256 minDelay = vm.envOr("TIMELOCK_MIN_DELAY", PRODUCTION_MIN_DELAY);

        _startBroadcast();
        (address timelock, address roleManager, address addressRegistry) = deploy(deployer, proposer, minDelay);
        vm.stopBroadcast();

        _save("protocolTimelock", timelock);
        _save("roleManager", roleManager);
        _save("addressRegistry", addressRegistry);
    }
}
