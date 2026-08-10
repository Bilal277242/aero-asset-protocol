// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolAddressRegistry} from "../../src/core/ProtocolAddressRegistry.sol";
import {RoleManager} from "../../src/core/RoleManager.sol";
import {CredentialRegistry} from "../../src/identity/CredentialRegistry.sol";
import {OrganizationRegistry} from "../../src/identity/OrganizationRegistry.sol";
import {ICredentialRegistry} from "../../src/interfaces/ICredentialRegistry.sol";
import {IOrganizationRegistry} from "../../src/interfaces/IOrganizationRegistry.sol";
import {ProtocolAddressKeys} from "../../src/libraries/ProtocolAddressKeys.sol";
import {ProtocolRoles} from "../../src/libraries/ProtocolRoles.sol";
import {BaseTest} from "./BaseTest.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title ProtocolTestBase
/// @author AeroAsset Protocol
/// @notice Deploys and wires the Phase 1 protocol core so suites can start from a
///         realistic, fully configured system rather than a bare contract.
/// @dev Mirrors what `DeployCore.s.sol` and `ConfigureProtocol.s.sol` will do in
///      Phase 9: deploy the role manager and address registry, grant the operational
///      roles, deploy each registry behind an ERC-1967 proxy, and publish every
///      address into the registry. Suites that need a verified organization call
///      {_registerVerifiedOrg} instead of repeating the two-step flow.
abstract contract ProtocolTestBase is BaseTest {
    /*//////////////////////////////////////////////////////////////
                                 SYSTEM
    //////////////////////////////////////////////////////////////*/

    /// @notice The protocol's single authorization authority.
    RoleManager internal roleManager;
    /// @notice The protocol's central address book.
    ProtocolAddressRegistry internal addressRegistry;
    /// @notice `OrganizationRegistry` accessed through its proxy.
    OrganizationRegistry internal orgRegistry;
    /// @notice The `OrganizationRegistry` implementation behind the proxy.
    address internal orgRegistryImpl;
    /// @notice `CredentialRegistry` accessed through its proxy.
    CredentialRegistry internal credentialRegistry;
    /// @notice The `CredentialRegistry` implementation behind the proxy.
    address internal credentialRegistryImpl;

    /*//////////////////////////////////////////////////////////////
                                FIXTURES
    //////////////////////////////////////////////////////////////*/

    /// @notice Legal-name commitment used by the default fixture organization.
    bytes32 internal constant ORG_NAME_HASH = keccak256("Fixture Aviation GmbH");
    /// @notice Profile commitment used by the default fixture organization.
    bytes32 internal constant ORG_METADATA_HASH = keccak256("fixture-profile-v1");
    /// @notice Profile location used by the default fixture organization.
    string internal constant ORG_METADATA_URI = "ipfs://QmFixtureOrgProfile";

    /*//////////////////////////////////////////////////////////////
                                  SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys, wires and role-grants the Phase 1 protocol core.
    function setUp() public virtual override {
        super.setUp();

        vm.startPrank(protocolAdmin);

        roleManager = new RoleManager(protocolAdmin);
        addressRegistry = new ProtocolAddressRegistry(address(roleManager));

        // `protocolAdmin` receives DEFAULT_ADMIN_ROLE in the constructor; the
        // operational roles are explicit grants, exactly as in production.
        roleManager.grantRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE, protocolAdmin);
        roleManager.grantRole(ProtocolRoles.PAUSER_ROLE, pauser);
        roleManager.grantRole(ProtocolRoles.ORG_VERIFIER_ROLE, orgVerifier);
        roleManager.grantRole(ProtocolRoles.ASSET_VERIFIER_ROLE, orgVerifier);
        roleManager.grantRole(ProtocolRoles.CREDENTIAL_ISSUER_ROLE, credentialIssuer);
        roleManager.grantRole(ProtocolRoles.ARBITRATOR_ROLE, arbitrator);

        orgRegistryImpl = address(new OrganizationRegistry());
        orgRegistry = OrganizationRegistry(
            address(
                new ERC1967Proxy(
                    orgRegistryImpl,
                    abi.encodeCall(OrganizationRegistry.initialize, (address(roleManager), address(addressRegistry)))
                )
            )
        );

        credentialRegistryImpl = address(new CredentialRegistry());
        credentialRegistry = CredentialRegistry(
            address(
                new ERC1967Proxy(
                    credentialRegistryImpl,
                    abi.encodeCall(CredentialRegistry.initialize, (address(roleManager), address(addressRegistry)))
                )
            )
        );

        addressRegistry.setAddress(ProtocolAddressKeys.ROLE_MANAGER, address(roleManager));
        addressRegistry.setAddress(ProtocolAddressKeys.ORGANIZATION_REGISTRY, address(orgRegistry));
        addressRegistry.setAddress(ProtocolAddressKeys.CREDENTIAL_REGISTRY, address(credentialRegistry));

        vm.stopPrank();

        vm.label(address(roleManager), "RoleManager");
        vm.label(address(addressRegistry), "ProtocolAddressRegistry");
        vm.label(address(orgRegistry), "OrganizationRegistry");
        vm.label(orgRegistryImpl, "OrganizationRegistryImpl");
        vm.label(address(credentialRegistry), "CredentialRegistry");
        vm.label(credentialRegistryImpl, "CredentialRegistryImpl");
    }

    /*//////////////////////////////////////////////////////////////
                                 HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Registers an organization in `PENDING` under `admin`.
    /// @param admin The address that registers and therefore administers the org.
    /// @param nameHash Legal-name commitment. Must be unused.
    /// @param orgType The category of aviation business.
    /// @return orgId The newly minted organization id.
    function _registerOrg(address admin, bytes32 nameHash, IOrganizationRegistry.OrganizationType orgType)
        internal
        returns (uint256 orgId)
    {
        vm.prank(admin);
        orgId = orgRegistry.registerOrganization(orgType, nameHash, ORG_METADATA_HASH, ORG_METADATA_URI);
    }

    /// @notice Registers an organization and verifies it in one step.
    /// @param admin The address that registers and therefore administers the org.
    /// @param nameHash Legal-name commitment. Must be unused.
    /// @param orgType The category of aviation business.
    /// @return orgId The newly minted, `VERIFIED` organization id.
    function _registerVerifiedOrg(address admin, bytes32 nameHash, IOrganizationRegistry.OrganizationType orgType)
        internal
        returns (uint256 orgId)
    {
        orgId = _registerOrg(admin, nameHash, orgType);
        vm.prank(orgVerifier);
        orgRegistry.verifyOrganization(orgId);
    }

    /// @notice Registers and verifies the default fixture organization under `alice`.
    /// @return orgId The fixture organization id.
    function _defaultVerifiedOrg() internal returns (uint256 orgId) {
        orgId = _registerVerifiedOrg(alice, ORG_NAME_HASH, IOrganizationRegistry.OrganizationType.AIRLINE);
    }

    /// @notice Registers a verified MRO organization under `mro`.
    /// @return orgId The MRO organization id.
    function _verifiedMro() internal returns (uint256 orgId) {
        orgId = _registerVerifiedOrg(mro, keccak256("Fixture MRO Ltd"), IOrganizationRegistry.OrganizationType.MRO);
    }

    /// @notice Issues a credential to an organization with a one-year expiry.
    /// @param subjectOrgId The subject organization.
    /// @param credType The credential category.
    /// @return credentialId The newly issued credential id.
    function _issueOrgCredential(uint256 subjectOrgId, ICredentialRegistry.CredentialType credType)
        internal
        returns (uint256 credentialId)
    {
        vm.prank(credentialIssuer);
        credentialId = credentialRegistry.issueCredential(
            0, address(0), subjectOrgId, credType, uint40(block.timestamp + 365 days), keccak256("credential-doc")
        );
    }

    /// @notice Registers a verified MRO holding a valid maintenance-authority credential.
    /// @return orgId The MRO organization id.
    /// @return credentialId The maintenance-authority credential id.
    function _credentialedMro() internal returns (uint256 orgId, uint256 credentialId) {
        orgId = _verifiedMro();
        credentialId = _issueOrgCredential(orgId, ICredentialRegistry.CredentialType.MAINTENANCE_AUTHORITY);
    }
}
