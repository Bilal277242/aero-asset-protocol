// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Script} from "forge-std/Script.sol";

/// @title DeploymentBase
/// @author AeroAsset Protocol
/// @notice Shared plumbing for the staged deployment scripts.
/// @dev Every stage follows the same shape: a pure `deploy(...)` function taking its
///      dependencies explicitly and returning what it created, plus a `run()` that
///      wires that to the on-disk artifact. The split matters — `deploy(...)` is
///      callable from tests with no file I/O, so `test/integration/FullLifecycle.t.sol`
///      exercises the *real* deployment path rather than a parallel one that can drift
///      from it.
///
///      Staging is deliberate (roadmap §20). One monolithic script that half-succeeds
///      leaves a protocol in a state nobody has a name for; staged scripts leave a
///      recorded artifact and a known resume point.
abstract contract DeploymentBase is Script {
    /// @notice Every deployed protocol address, in one struct.
    /// @dev Passed around by `ConfigureProtocol` and `Verify` so neither needs a
    ///      dozen parameters, and so a test can construct one directly.
    /// @param protocolTimelock The delayed executor holding `DEFAULT_ADMIN_ROLE`.
    /// @param roleManager The authorization authority.
    /// @param addressRegistry The address book.
    /// @param organizationRegistry The L1 organization registry.
    /// @param credentialRegistry The L1 credential registry.
    /// @param assetOwnership The L2a ownership ledger.
    /// @param assetRegistry The L2b generic asset registry.
    /// @param aircraftRegistry The L2c aircraft registry.
    /// @param componentRegistry The L2c component registry.
    /// @param documentRegistry The L3 document registry.
    /// @param maintenanceRegistry The L3 maintenance registry.
    /// @param assetPassport The L3 read-only aggregator.
    /// @param marketplace The L4 marketplace.
    /// @param feeManager The L4 fee manager.
    /// @param escrowFactory The L4 escrow factory.
    /// @param escrowImplementation The shared escrow implementation.
    struct ProtocolAddresses {
        address protocolTimelock;
        address roleManager;
        address addressRegistry;
        address organizationRegistry;
        address credentialRegistry;
        address assetOwnership;
        address assetRegistry;
        address aircraftRegistry;
        address componentRegistry;
        address documentRegistry;
        address maintenanceRegistry;
        address assetPassport;
        address marketplace;
        address feeManager;
        address escrowFactory;
        address escrowImplementation;
    }

    /// @notice Directory holding per-chain deployment artifacts.
    string internal constant ARTIFACT_DIR = "deployments";

    /// @notice Thrown when a required artifact entry has not been recorded yet.
    /// @param key The missing key.
    error MissingArtifact(string key);

    /// @notice Returns the artifact path for the current chain.
    /// @return The relative file path.
    function _artifactPath() internal view returns (string memory) {
        return string.concat(ARTIFACT_DIR, "/", vm.toString(block.chainid), ".json");
    }

    /// @notice Records a deployed address under `key`.
    /// @dev Creates the artifact on first use. Written as it goes rather than at the
    ///      end, so a stage that reverts halfway still leaves a truthful record of
    ///      what actually got deployed.
    /// @param key The artifact key.
    /// @param value The deployed address.
    function _save(string memory key, address value) internal {
        string memory path = _artifactPath();
        if (!vm.exists(path)) {
            vm.writeFile(path, "{}");
        }
        vm.writeJson(vm.toString(value), path, string.concat(".", key));
    }

    /// @notice Reads a previously recorded address.
    /// @param key The artifact key.
    /// @return The recorded address.
    function _load(string memory key) internal view returns (address) {
        string memory path = _artifactPath();
        if (!vm.exists(path)) {
            revert MissingArtifact(key);
        }

        string memory json = vm.readFile(path);
        if (!vm.keyExists(json, string.concat(".", key))) {
            revert MissingArtifact(key);
        }

        return vm.parseJsonAddress(json, string.concat(".", key));
    }

    /// @notice Deploys an ERC-1967 proxy over an implementation and initializes it.
    /// @param implementation The implementation address.
    /// @param initData The encoded initializer call.
    /// @return The proxy address.
    function _proxy(address implementation, bytes memory initData) internal returns (address) {
        return address(new ERC1967Proxy(implementation, initData));
    }

    /// @notice Reads every recorded address into one struct.
    /// @return a The recorded protocol addresses.
    function _loadAll() internal view returns (ProtocolAddresses memory a) {
        a.protocolTimelock = _load("protocolTimelock");
        a.roleManager = _load("roleManager");
        a.addressRegistry = _load("addressRegistry");
        a.organizationRegistry = _load("organizationRegistry");
        a.credentialRegistry = _load("credentialRegistry");
        a.assetOwnership = _load("assetOwnership");
        a.assetRegistry = _load("assetRegistry");
        a.aircraftRegistry = _load("aircraftRegistry");
        a.componentRegistry = _load("componentRegistry");
        a.documentRegistry = _load("documentRegistry");
        a.maintenanceRegistry = _load("maintenanceRegistry");
        a.assetPassport = _load("assetPassport");
        a.marketplace = _load("marketplace");
        a.feeManager = _load("feeManager");
        a.escrowFactory = _load("escrowFactory");
        a.escrowImplementation = _load("escrowImplementation");
    }

    /// @notice Begins broadcasting from the configured deployer.
    /// @dev Prefers `--account` (a keystore entry) when `PRIVATE_KEY` is unset, so a
    ///      raw key never has to touch the environment on a real network.
    function _startBroadcast() internal {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        if (pk != 0) {
            vm.startBroadcast(pk);
        } else {
            vm.startBroadcast();
        }
    }
}
