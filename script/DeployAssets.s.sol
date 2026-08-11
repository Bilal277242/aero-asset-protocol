// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AircraftRegistry} from "../src/assets/AircraftRegistry.sol";
import {AssetRegistry} from "../src/assets/AssetRegistry.sol";
import {ComponentRegistry} from "../src/assets/ComponentRegistry.sol";
import {AssetOwnership} from "../src/ownership/AssetOwnership.sol";
import {DeploymentBase} from "./DeploymentBase.s.sol";

/// @title DeployAssets
/// @author AeroAsset Protocol
/// @notice Stage 3: the L2 asset layer, in sub-layer order.
/// @dev Deployed bottom-up — ownership, then the generic registry, then the
///      specializations — mirroring the call direction described in
///      `docs/architecture.md` §5.0. Nothing here works until `ConfigureProtocol`
///      publishes the addresses and grants `ASSET_MINTER_ROLE`.
contract DeployAssets is DeploymentBase {
    /// @notice Addresses produced by this stage.
    /// @param assetOwnership The ownership ledger proxy.
    /// @param assetOwnershipImpl Its implementation.
    /// @param assetRegistry The generic asset registry proxy.
    /// @param assetRegistryImpl Its implementation.
    /// @param aircraftRegistry The aircraft registry proxy.
    /// @param aircraftRegistryImpl Its implementation.
    /// @param componentRegistry The component registry proxy.
    /// @param componentRegistryImpl Its implementation.
    struct AssetDeployment {
        address assetOwnership;
        address assetOwnershipImpl;
        address assetRegistry;
        address assetRegistryImpl;
        address aircraftRegistry;
        address aircraftRegistryImpl;
        address componentRegistry;
        address componentRegistryImpl;
    }

    /// @notice Deploys the asset layer.
    /// @param roleManager The protocol role manager.
    /// @param addressRegistry The protocol address registry.
    /// @return d The deployed addresses.
    function deploy(address roleManager, address addressRegistry) public returns (AssetDeployment memory d) {
        d.assetOwnershipImpl = address(new AssetOwnership());
        d.assetOwnership =
            _proxy(d.assetOwnershipImpl, abi.encodeCall(AssetOwnership.initialize, (roleManager, addressRegistry)));

        d.assetRegistryImpl = address(new AssetRegistry());
        d.assetRegistry =
            _proxy(d.assetRegistryImpl, abi.encodeCall(AssetRegistry.initialize, (roleManager, addressRegistry)));

        d.aircraftRegistryImpl = address(new AircraftRegistry());
        d.aircraftRegistry =
            _proxy(d.aircraftRegistryImpl, abi.encodeCall(AircraftRegistry.initialize, (roleManager, addressRegistry)));

        d.componentRegistryImpl = address(new ComponentRegistry());
        d.componentRegistry = _proxy(
            d.componentRegistryImpl, abi.encodeCall(ComponentRegistry.initialize, (roleManager, addressRegistry))
        );
    }

    /// @notice Deploys and records stage 3.
    function run() external {
        address roleManager = _load("roleManager");
        address addressRegistry = _load("addressRegistry");

        _startBroadcast();
        AssetDeployment memory d = deploy(roleManager, addressRegistry);
        vm.stopBroadcast();

        _save("assetOwnership", d.assetOwnership);
        _save("assetOwnershipImpl", d.assetOwnershipImpl);
        _save("assetRegistry", d.assetRegistry);
        _save("assetRegistryImpl", d.assetRegistryImpl);
        _save("aircraftRegistry", d.aircraftRegistry);
        _save("aircraftRegistryImpl", d.aircraftRegistryImpl);
        _save("componentRegistry", d.componentRegistry);
        _save("componentRegistryImpl", d.componentRegistryImpl);
    }
}
