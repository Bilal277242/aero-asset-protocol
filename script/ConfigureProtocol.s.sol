// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolAddressRegistry} from "../src/core/ProtocolAddressRegistry.sol";
import {RoleManager} from "../src/core/RoleManager.sol";
import {FeeManager} from "../src/fees/FeeManager.sol";
import {ProtocolAddressKeys} from "../src/libraries/ProtocolAddressKeys.sol";
import {ProtocolFeeTypes} from "../src/libraries/ProtocolFeeTypes.sol";
import {ProtocolRoles} from "../src/libraries/ProtocolRoles.sol";
import {DeploymentBase} from "./DeploymentBase.s.sol";

/// @title ConfigureProtocol
/// @author AeroAsset Protocol
/// @notice Stage 7: wires every address, grants every role, and hands the protocol to
///         the timelock.
/// @dev Nothing deployed in stages 1-6 works until this runs. A module that cannot
///      resolve its peers reverts on the first call, and the machine roles
///      (`ASSET_MINTER_ROLE`, `ESCROW_FACTORY_ROLE`) do not exist until granted here.
///
///      The final step — handing `DEFAULT_ADMIN_ROLE` to the timelock and renouncing
///      the deployer's — is the one that makes the deployment real. Everything before
///      it leaves an EOA in total control. `Verify.s.sol` fails until it has happened.
contract ConfigureProtocol is DeploymentBase {
    /// @notice Operational configuration for a deployment.
    /// @param orgVerifier Holds `ORG_VERIFIER_ROLE`.
    /// @param assetVerifier Holds `ASSET_VERIFIER_ROLE`. Separate from `orgVerifier` by
    ///        default: attesting to a corporate entity and attesting to an airframe are
    ///        different competencies, and `docs/roles.md` describes them as distinct
    ///        roles (audit AAP-25). May be set to the same address on a testnet.
    /// @param credentialIssuer Holds `CREDENTIAL_ISSUER_ROLE`.
    /// @param arbitrator Holds `ARBITRATOR_ROLE`. Must be a multisig — `Verify.s.sol`
    ///        asserts the holder has code.
    /// @param pauser Holds `PAUSER_ROLE`. Must be on keys separate from the admin.
    /// @param settlementToken The initial allowlisted settlement token.
    /// @param marketplaceFeeBps The initial marketplace fee rate.
    struct Config {
        address orgVerifier;
        address assetVerifier;
        address credentialIssuer;
        address arbitrator;
        address pauser;
        address settlementToken;
        uint16 marketplaceFeeBps;
    }

    /// @notice Publishes every module address into the registry.
    /// @param a The deployed protocol addresses.
    function wireAddresses(ProtocolAddresses memory a) public {
        ProtocolAddressRegistry registry = ProtocolAddressRegistry(a.addressRegistry);

        registry.setAddress(ProtocolAddressKeys.ROLE_MANAGER, a.roleManager);
        registry.setAddress(ProtocolAddressKeys.PROTOCOL_TIMELOCK, a.protocolTimelock);
        registry.setAddress(ProtocolAddressKeys.ORGANIZATION_REGISTRY, a.organizationRegistry);
        registry.setAddress(ProtocolAddressKeys.CREDENTIAL_REGISTRY, a.credentialRegistry);
        registry.setAddress(ProtocolAddressKeys.ASSET_OWNERSHIP, a.assetOwnership);
        registry.setAddress(ProtocolAddressKeys.ASSET_REGISTRY, a.assetRegistry);
        registry.setAddress(ProtocolAddressKeys.AIRCRAFT_REGISTRY, a.aircraftRegistry);
        registry.setAddress(ProtocolAddressKeys.COMPONENT_REGISTRY, a.componentRegistry);
        registry.setAddress(ProtocolAddressKeys.DOCUMENT_REGISTRY, a.documentRegistry);
        registry.setAddress(ProtocolAddressKeys.MAINTENANCE_REGISTRY, a.maintenanceRegistry);
        registry.setAddress(ProtocolAddressKeys.ASSET_PASSPORT, a.assetPassport);
        registry.setAddress(ProtocolAddressKeys.MARKETPLACE, a.marketplace);
        registry.setAddress(ProtocolAddressKeys.FEE_MANAGER, a.feeManager);
        registry.setAddress(ProtocolAddressKeys.ESCROW_FACTORY, a.escrowFactory);
    }

    /// @notice Grants the machine and operational roles.
    /// @param a The deployed protocol addresses.
    /// @param c The operational configuration.
    function wireRoles(ProtocolAddresses memory a, Config memory c) public {
        RoleManager roles = RoleManager(a.roleManager);

        // `SETTLEMENT_ROLE`'s admin is narrowed so the factory can grant it to clones
        // without holding blanket admin over the protocol. See `docs/roles.md` §1.1.
        roles.setRoleAdmin(ProtocolRoles.SETTLEMENT_ROLE, ProtocolRoles.ESCROW_FACTORY_ROLE);
        roles.grantRole(ProtocolRoles.ESCROW_FACTORY_ROLE, a.escrowFactory);

        // Machine roles: never granted to an EOA.
        roles.grantRole(ProtocolRoles.ASSET_MINTER_ROLE, a.aircraftRegistry);
        roles.grantRole(ProtocolRoles.ASSET_MINTER_ROLE, a.componentRegistry);

        // Operational roles.
        roles.grantRole(ProtocolRoles.ORG_VERIFIER_ROLE, c.orgVerifier);
        roles.grantRole(ProtocolRoles.ASSET_VERIFIER_ROLE, c.assetVerifier);
        roles.grantRole(ProtocolRoles.CREDENTIAL_ISSUER_ROLE, c.credentialIssuer);
        roles.grantRole(ProtocolRoles.ARBITRATOR_ROLE, c.arbitrator);
        roles.grantRole(ProtocolRoles.PAUSER_ROLE, c.pauser);
    }

    /// @notice Sets the initial fee parameters and settlement-token allowlist.
    /// @param a The deployed protocol addresses.
    /// @param c The operational configuration.
    function wireFees(ProtocolAddresses memory a, Config memory c) public {
        FeeManager(a.feeManager).setTokenAllowed(c.settlementToken, true);
        FeeManager(a.feeManager).setFeeBps(ProtocolFeeTypes.MARKETPLACE, c.marketplaceFeeBps);
    }

    /// @notice Hands the protocol to the timelock and renounces the deployer's admin.
    /// @dev **Irreversible, and the point of the whole exercise.** Until this runs a
    ///      single EOA can upgrade every registry. After it, every privileged action
    ///      is delayed and publicly queued.
    ///
    ///      `RoleManager` refuses to remove the last `DEFAULT_ADMIN_ROLE` holder, so
    ///      the grant must land before the renounce — get the order wrong and the call
    ///      reverts rather than bricking the protocol.
    /// @param a The deployed protocol addresses.
    /// @param deployer The account currently holding `DEFAULT_ADMIN_ROLE`.
    function handOverToTimelock(ProtocolAddresses memory a, address deployer) public {
        RoleManager roles = RoleManager(a.roleManager);

        roles.grantRole(roles.DEFAULT_ADMIN_ROLE(), a.protocolTimelock);
        roles.grantRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE, a.protocolTimelock);
        roles.grantRole(ProtocolRoles.FEE_MANAGER_ROLE, a.protocolTimelock);

        roles.renounceRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE, deployer);
        roles.renounceRole(ProtocolRoles.FEE_MANAGER_ROLE, deployer);
        roles.renounceRole(roles.DEFAULT_ADMIN_ROLE(), deployer);
    }

    /// @notice Runs the whole configuration in order.
    /// @dev The deployer needs `PROTOCOL_ADMIN_ROLE` and `FEE_MANAGER_ROLE` for the
    ///      middle steps, so it grants them to itself first and renounces them in
    ///      {handOverToTimelock}.
    /// @param a The deployed protocol addresses.
    /// @param c The operational configuration.
    /// @param deployer The configuring account.
    function configure(ProtocolAddresses memory a, Config memory c, address deployer) public {
        RoleManager roles = RoleManager(a.roleManager);
        roles.grantRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE, deployer);
        roles.grantRole(ProtocolRoles.FEE_MANAGER_ROLE, deployer);

        wireAddresses(a);
        wireRoles(a, c);
        wireFees(a, c);
        handOverToTimelock(a, deployer);
    }

    /// @notice Configures a recorded deployment.
    function run() external {
        ProtocolAddresses memory a = _loadAll();

        Config memory c = Config({
            orgVerifier: vm.envAddress("ORG_VERIFIER"),
            // Falls back to the organization verifier when unset, so an existing
            // testnet .env keeps working; production should set both.
            assetVerifier: vm.envOr("ASSET_VERIFIER", vm.envAddress("ORG_VERIFIER")),
            credentialIssuer: vm.envAddress("CREDENTIAL_ISSUER"),
            arbitrator: vm.envAddress("DISPUTE_ARBITRATOR"),
            pauser: vm.envAddress("PROTOCOL_PAUSER"),
            settlementToken: vm.envAddress("SETTLEMENT_TOKEN"),
            marketplaceFeeBps: uint16(vm.envOr("MARKETPLACE_FEE_BPS", uint256(200)))
        });

        _startBroadcast();
        configure(a, c, msg.sender);
        vm.stopBroadcast();
    }
}
