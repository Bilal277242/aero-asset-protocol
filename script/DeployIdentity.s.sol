// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CredentialRegistry} from "../src/identity/CredentialRegistry.sol";
import {OrganizationRegistry} from "../src/identity/OrganizationRegistry.sol";
import {DeploymentBase} from "./DeploymentBase.s.sol";

/// @title DeployIdentity
/// @author AeroAsset Protocol
/// @notice Stage 2: the L1 identity registries, each behind a UUPS proxy.
contract DeployIdentity is DeploymentBase {
    /// @notice Deploys the identity layer.
    /// @param roleManager The protocol role manager.
    /// @param addressRegistry The protocol address registry.
    /// @return orgRegistry The organization registry proxy.
    /// @return orgImpl Its implementation.
    /// @return credentialRegistry The credential registry proxy.
    /// @return credentialImpl Its implementation.
    function deploy(address roleManager, address addressRegistry)
        public
        returns (address orgRegistry, address orgImpl, address credentialRegistry, address credentialImpl)
    {
        orgImpl = address(new OrganizationRegistry());
        orgRegistry = _proxy(orgImpl, abi.encodeCall(OrganizationRegistry.initialize, (roleManager, addressRegistry)));

        credentialImpl = address(new CredentialRegistry());
        credentialRegistry =
            _proxy(credentialImpl, abi.encodeCall(CredentialRegistry.initialize, (roleManager, addressRegistry)));
    }

    /// @notice Deploys and records stage 2.
    function run() external {
        address roleManager = _load("roleManager");
        address addressRegistry = _load("addressRegistry");

        _startBroadcast();
        (address orgRegistry, address orgImpl, address credentialRegistry, address credentialImpl) =
            deploy(roleManager, addressRegistry);
        vm.stopBroadcast();

        _save("organizationRegistry", orgRegistry);
        _save("organizationRegistryImpl", orgImpl);
        _save("credentialRegistry", credentialRegistry);
        _save("credentialRegistryImpl", credentialImpl);
    }
}
