// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolAddressRegistry} from "../src/core/ProtocolAddressRegistry.sol";
import {RoleManager} from "../src/core/RoleManager.sol";
import {EscrowFactory} from "../src/escrow/EscrowFactory.sol";
import {FeeManager} from "../src/fees/FeeManager.sol";
import {ProtocolAddressKeys} from "../src/libraries/ProtocolAddressKeys.sol";
import {ProtocolRoles} from "../src/libraries/ProtocolRoles.sol";
import {DeploymentBase} from "./DeploymentBase.s.sol";

/// @title Verify
/// @author AeroAsset Protocol
/// @notice Stage 8: asserts every wiring invariant on-chain, post-deployment.
/// @dev **Not optional.** A misconfigured `ProtocolAddressRegistry` entry or a
///      forgotten role grant is indistinguishable from a working deployment until the
///      first settlement fails — by which point real funds are in an escrow that
///      cannot settle. Deployment ends with an assertion pass, not with the last
///      contract being mined.
///
///      Every check here corresponds to a named invariant in `docs/invariants.md`.
///      A failure is a deployment defect, not a test failure.
contract Verify is DeploymentBase {
    /// @notice Thrown when a wiring invariant does not hold.
    /// @param what Which check failed.
    error VerificationFailed(string what);

    /// @notice Asserts the full post-deployment configuration.
    /// @param a The deployed protocol addresses.
    /// @param expectedSettlementToken The token that must be allowlisted.
    function verify(ProtocolAddresses memory a, address expectedSettlementToken) public view {
        _verifyAddressBook(a);
        _verifyAdminHandover(a);
        _verifyMachineRoles(a);
        _verifyFees(a, expectedSettlementToken);
    }

    /// @notice Every module a peer resolves must be published and correct.
    /// @param a The deployed protocol addresses.
    function _verifyAddressBook(ProtocolAddresses memory a) private view {
        ProtocolAddressRegistry registry = ProtocolAddressRegistry(a.addressRegistry);

        _expect(registry.getAddress(ProtocolAddressKeys.ROLE_MANAGER) == a.roleManager, "roleManager entry");
        _expect(
            registry.getAddress(ProtocolAddressKeys.ORGANIZATION_REGISTRY) == a.organizationRegistry,
            "organizationRegistry entry"
        );
        _expect(
            registry.getAddress(ProtocolAddressKeys.CREDENTIAL_REGISTRY) == a.credentialRegistry,
            "credentialRegistry entry"
        );
        _expect(registry.getAddress(ProtocolAddressKeys.ASSET_OWNERSHIP) == a.assetOwnership, "assetOwnership entry");
        _expect(registry.getAddress(ProtocolAddressKeys.ASSET_REGISTRY) == a.assetRegistry, "assetRegistry entry");
        _expect(
            registry.getAddress(ProtocolAddressKeys.AIRCRAFT_REGISTRY) == a.aircraftRegistry, "aircraftRegistry entry"
        );
        _expect(
            registry.getAddress(ProtocolAddressKeys.COMPONENT_REGISTRY) == a.componentRegistry,
            "componentRegistry entry"
        );
        _expect(
            registry.getAddress(ProtocolAddressKeys.DOCUMENT_REGISTRY) == a.documentRegistry, "documentRegistry entry"
        );
        _expect(
            registry.getAddress(ProtocolAddressKeys.MAINTENANCE_REGISTRY) == a.maintenanceRegistry,
            "maintenanceRegistry entry"
        );
        _expect(registry.getAddress(ProtocolAddressKeys.ASSET_PASSPORT) == a.assetPassport, "assetPassport entry");
        _expect(registry.getAddress(ProtocolAddressKeys.MARKETPLACE) == a.marketplace, "marketplace entry");
        _expect(registry.getAddress(ProtocolAddressKeys.FEE_MANAGER) == a.feeManager, "feeManager entry");
        _expect(registry.getAddress(ProtocolAddressKeys.ESCROW_FACTORY) == a.escrowFactory, "escrowFactory entry");
    }

    /// @notice INV-SYS-01: the timelock, and only the timelock, is the protocol admin.
    /// @dev The single most important post-deployment check. If a deployer EOA still
    ///      holds `DEFAULT_ADMIN_ROLE`, the timelock is decorative.
    /// @param a The deployed protocol addresses.
    function _verifyAdminHandover(ProtocolAddresses memory a) private view {
        RoleManager roles = RoleManager(a.roleManager);
        bytes32 defaultAdmin = roles.DEFAULT_ADMIN_ROLE();

        _expect(roles.getRoleMemberCount(defaultAdmin) == 1, "more than one protocol admin");
        _expect(roles.getRoleMember(defaultAdmin, 0) == a.protocolTimelock, "admin is not the timelock");
        _expect(roles.hasRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE, a.protocolTimelock), "timelock lacks protocol admin");

        // `docs/roles.md` §4: no single key may hold both the pause and the admin.
        uint256 pausers = roles.getRoleMemberCount(ProtocolRoles.PAUSER_ROLE);
        for (uint256 i; i < pausers; ++i) {
            _expect(
                roles.getRoleMember(ProtocolRoles.PAUSER_ROLE, i) != a.protocolTimelock,
                "pauser and admin are the same account"
            );
        }
    }

    /// @notice Machine roles are held by the right contracts, and by no EOA.
    /// @param a The deployed protocol addresses.
    function _verifyMachineRoles(ProtocolAddresses memory a) private view {
        RoleManager roles = RoleManager(a.roleManager);

        _expect(
            roles.getRoleAdmin(ProtocolRoles.SETTLEMENT_ROLE) == ProtocolRoles.ESCROW_FACTORY_ROLE,
            "settlement role admin not narrowed"
        );
        _expect(
            roles.hasRole(ProtocolRoles.ESCROW_FACTORY_ROLE, a.escrowFactory), "factory cannot grant settlement role"
        );
        _expect(
            roles.getRoleMemberCount(ProtocolRoles.ESCROW_FACTORY_ROLE) == 1, "escrow factory role has extra holders"
        );

        _expect(roles.hasRole(ProtocolRoles.ASSET_MINTER_ROLE, a.aircraftRegistry), "aircraft registry cannot mint");
        _expect(roles.hasRole(ProtocolRoles.ASSET_MINTER_ROLE, a.componentRegistry), "component registry cannot mint");
        _expect(roles.getRoleMemberCount(ProtocolRoles.ASSET_MINTER_ROLE) == 2, "asset minter role has extra holders");

        // No escrow should be armed before any trade has been opened.
        _expect(EscrowFactory(a.escrowFactory).escrowCount() == 0, "escrows exist before launch");
        _expect(roles.getRoleMemberCount(ProtocolRoles.SETTLEMENT_ROLE) == 0, "settlement role granted pre-launch");

        _expect(
            EscrowFactory(a.escrowFactory).ESCROW_IMPLEMENTATION() == a.escrowImplementation,
            "factory points at the wrong escrow implementation"
        );
    }

    /// @notice Fee parameters are within bounds and the treasury is set.
    /// @param a The deployed protocol addresses.
    /// @param expectedSettlementToken The token that must be allowlisted.
    function _verifyFees(ProtocolAddresses memory a, address expectedSettlementToken) private view {
        FeeManager fees = FeeManager(a.feeManager);

        _expect(fees.treasury() != address(0), "treasury unset");
        _expect(fees.isTokenAllowed(expectedSettlementToken), "settlement token not allowlisted");
        _expect(fees.feeBps(fees.FEE_TYPE_MARKETPLACE()) <= fees.MAX_FEE_BPS(), "marketplace fee exceeds the hard cap");
    }

    /// @notice Reverts with a named reason when a check fails.
    /// @param condition The condition that must hold.
    /// @param what A short description of the check.
    function _expect(bool condition, string memory what) private pure {
        if (!condition) {
            revert VerificationFailed(what);
        }
    }

    /// @notice Verifies a recorded deployment.
    function run() external view {
        verify(_loadAll(), vm.envAddress("SETTLEMENT_TOKEN"));
    }
}
