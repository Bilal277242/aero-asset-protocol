// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Marketplace} from "../src/marketplace/Marketplace.sol";
import {DeploymentBase} from "./DeploymentBase.s.sol";

/// @title DeployMarketplace
/// @author AeroAsset Protocol
/// @notice Stage 5: the marketplace half of L4.
/// @dev Deployed before the escrow factory because the factory binds to the
///      marketplace address, while the marketplace resolves the factory dynamically
///      through the address registry. Reversing the order would mean deploying the
///      factory against an address that does not exist yet.
contract DeployMarketplace is DeploymentBase {
    /// @notice Deploys the marketplace.
    /// @param roleManager The protocol role manager.
    /// @param addressRegistry The protocol address registry.
    /// @return marketplace The marketplace proxy.
    /// @return marketplaceImpl Its implementation.
    function deploy(address roleManager, address addressRegistry)
        public
        returns (address marketplace, address marketplaceImpl)
    {
        marketplaceImpl = address(new Marketplace());
        marketplace = _proxy(marketplaceImpl, abi.encodeCall(Marketplace.initialize, (roleManager, addressRegistry)));
    }

    /// @notice Deploys and records stage 5.
    function run() external {
        address roleManager = _load("roleManager");
        address addressRegistry = _load("addressRegistry");

        _startBroadcast();
        (address marketplace, address marketplaceImpl) = deploy(roleManager, addressRegistry);
        vm.stopBroadcast();

        _save("marketplace", marketplace);
        _save("marketplaceImpl", marketplaceImpl);
    }
}
