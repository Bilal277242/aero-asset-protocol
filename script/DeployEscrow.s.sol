// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Escrow} from "../src/escrow/Escrow.sol";
import {EscrowFactory} from "../src/escrow/EscrowFactory.sol";
import {FeeManager} from "../src/fees/FeeManager.sol";
import {DeploymentBase} from "./DeploymentBase.s.sol";

/// @title DeployEscrow
/// @author AeroAsset Protocol
/// @notice Stage 6: the fee manager, the escrow implementation and the factory.
/// @dev All three are immutable and can never be upgraded. That is the point — the
///      contracts that hold funds and gate settlement are the ones where an admin key
///      should not be in the threat model at all (`docs/architecture.md` §D1).
///
///      This is the last stage that deploys anything. Everything after it is
///      configuration and verification.
contract DeployEscrow is DeploymentBase {
    /// @notice Deploys the escrow layer.
    /// @param roleManager The protocol role manager.
    /// @param addressRegistry The protocol address registry.
    /// @param treasury The initial fee recipient.
    /// @return feeManager The fee manager.
    /// @return escrowImpl The shared escrow implementation clones delegate to.
    /// @return escrowFactory The escrow factory.
    function deploy(address roleManager, address addressRegistry, address treasury)
        public
        returns (address feeManager, address escrowImpl, address escrowFactory)
    {
        feeManager = address(new FeeManager(roleManager, treasury));
        escrowImpl = address(new Escrow(roleManager, addressRegistry));
        escrowFactory = address(new EscrowFactory(roleManager, addressRegistry, escrowImpl));
    }

    /// @notice Deploys and records stage 6.
    function run() external {
        address roleManager = _load("roleManager");
        address addressRegistry = _load("addressRegistry");
        address treasury = vm.envAddress("FEE_TREASURY");

        _startBroadcast();
        (address feeManager, address escrowImpl, address escrowFactory) = deploy(roleManager, addressRegistry, treasury);
        vm.stopBroadcast();

        _save("feeManager", feeManager);
        _save("escrowImplementation", escrowImpl);
        _save("escrowFactory", escrowFactory);
    }
}
