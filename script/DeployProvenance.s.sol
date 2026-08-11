// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {DocumentRegistry} from "../src/documents/DocumentRegistry.sol";
import {MaintenanceRegistry} from "../src/maintenance/MaintenanceRegistry.sol";
import {AssetPassport} from "../src/passport/AssetPassport.sol";
import {DeploymentBase} from "./DeploymentBase.s.sol";

/// @title DeployProvenance
/// @author AeroAsset Protocol
/// @notice Stage 4: the L3 provenance layer.
/// @dev `AssetPassport` deploys without a proxy — it holds no storage, so a new
///      version is a fresh deployment plus one address-registry write rather than an
///      upgrade (`docs/architecture.md` §D6).
contract DeployProvenance is DeploymentBase {
    /// @notice Deploys the provenance layer.
    /// @param roleManager The protocol role manager.
    /// @param addressRegistry The protocol address registry.
    /// @return documentRegistry The document registry proxy.
    /// @return documentImpl Its implementation.
    /// @return maintenanceRegistry The maintenance registry proxy.
    /// @return maintenanceImpl Its implementation.
    /// @return assetPassport The read-only aggregator.
    function deploy(address roleManager, address addressRegistry)
        public
        returns (
            address documentRegistry,
            address documentImpl,
            address maintenanceRegistry,
            address maintenanceImpl,
            address assetPassport
        )
    {
        documentImpl = address(new DocumentRegistry());
        documentRegistry =
            _proxy(documentImpl, abi.encodeCall(DocumentRegistry.initialize, (roleManager, addressRegistry)));

        maintenanceImpl = address(new MaintenanceRegistry());
        maintenanceRegistry =
            _proxy(maintenanceImpl, abi.encodeCall(MaintenanceRegistry.initialize, (roleManager, addressRegistry)));

        assetPassport = address(new AssetPassport(addressRegistry));
    }

    /// @notice Deploys and records stage 4.
    function run() external {
        address roleManager = _load("roleManager");
        address addressRegistry = _load("addressRegistry");

        _startBroadcast();
        (
            address documentRegistry,
            address documentImpl,
            address maintenanceRegistry,
            address maintenanceImpl,
            address assetPassport
        ) = deploy(roleManager, addressRegistry);
        vm.stopBroadcast();

        _save("documentRegistry", documentRegistry);
        _save("documentRegistryImpl", documentImpl);
        _save("maintenanceRegistry", maintenanceRegistry);
        _save("maintenanceRegistryImpl", maintenanceImpl);
        _save("assetPassport", assetPassport);
    }
}
