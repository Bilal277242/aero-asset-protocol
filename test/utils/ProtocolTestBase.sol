// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AircraftRegistry} from "../../src/assets/AircraftRegistry.sol";
import {AssetRegistry} from "../../src/assets/AssetRegistry.sol";
import {ComponentRegistry} from "../../src/assets/ComponentRegistry.sol";
import {ProtocolAddressRegistry} from "../../src/core/ProtocolAddressRegistry.sol";
import {RoleManager} from "../../src/core/RoleManager.sol";
import {CredentialRegistry} from "../../src/identity/CredentialRegistry.sol";
import {OrganizationRegistry} from "../../src/identity/OrganizationRegistry.sol";
import {IAircraftRegistry} from "../../src/interfaces/IAircraftRegistry.sol";
import {IAssetRegistry} from "../../src/interfaces/IAssetRegistry.sol";
import {IComponentRegistry} from "../../src/interfaces/IComponentRegistry.sol";
import {ICredentialRegistry} from "../../src/interfaces/ICredentialRegistry.sol";
import {IOrganizationRegistry} from "../../src/interfaces/IOrganizationRegistry.sol";
import {ProtocolAddressKeys} from "../../src/libraries/ProtocolAddressKeys.sol";
import {ProtocolRoles} from "../../src/libraries/ProtocolRoles.sol";
import {AssetOwnership} from "../../src/ownership/AssetOwnership.sol";
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
    /// @notice `AssetOwnership` accessed through its proxy.
    AssetOwnership internal assetOwnership;
    /// @notice The `AssetOwnership` implementation behind the proxy.
    address internal assetOwnershipImpl;
    /// @notice `AssetRegistry` accessed through its proxy.
    AssetRegistry internal assetRegistry;
    /// @notice The `AssetRegistry` implementation behind the proxy.
    address internal assetRegistryImpl;
    /// @notice `AircraftRegistry` accessed through its proxy.
    AircraftRegistry internal aircraftRegistry;
    /// @notice The `AircraftRegistry` implementation behind the proxy.
    address internal aircraftRegistryImpl;
    /// @notice `ComponentRegistry` accessed through its proxy.
    ComponentRegistry internal componentRegistry;
    /// @notice The `ComponentRegistry` implementation behind the proxy.
    address internal componentRegistryImpl;

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

        assetOwnershipImpl = address(new AssetOwnership());
        assetOwnership = AssetOwnership(
            address(
                new ERC1967Proxy(
                    assetOwnershipImpl,
                    abi.encodeCall(AssetOwnership.initialize, (address(roleManager), address(addressRegistry)))
                )
            )
        );

        assetRegistryImpl = address(new AssetRegistry());
        assetRegistry = AssetRegistry(
            address(
                new ERC1967Proxy(
                    assetRegistryImpl,
                    abi.encodeCall(AssetRegistry.initialize, (address(roleManager), address(addressRegistry)))
                )
            )
        );

        aircraftRegistryImpl = address(new AircraftRegistry());
        aircraftRegistry = AircraftRegistry(
            address(
                new ERC1967Proxy(
                    aircraftRegistryImpl,
                    abi.encodeCall(AircraftRegistry.initialize, (address(roleManager), address(addressRegistry)))
                )
            )
        );

        componentRegistryImpl = address(new ComponentRegistry());
        componentRegistry = ComponentRegistry(
            address(
                new ERC1967Proxy(
                    componentRegistryImpl,
                    abi.encodeCall(ComponentRegistry.initialize, (address(roleManager), address(addressRegistry)))
                )
            )
        );

        // The specialization registries mint asset ids on behalf of organizations
        // after checking membership themselves. Never granted to an EOA.
        roleManager.grantRole(ProtocolRoles.ASSET_MINTER_ROLE, address(aircraftRegistry));
        roleManager.grantRole(ProtocolRoles.ASSET_MINTER_ROLE, address(componentRegistry));

        addressRegistry.setAddress(ProtocolAddressKeys.ROLE_MANAGER, address(roleManager));
        addressRegistry.setAddress(ProtocolAddressKeys.ORGANIZATION_REGISTRY, address(orgRegistry));
        addressRegistry.setAddress(ProtocolAddressKeys.CREDENTIAL_REGISTRY, address(credentialRegistry));
        addressRegistry.setAddress(ProtocolAddressKeys.ASSET_OWNERSHIP, address(assetOwnership));
        addressRegistry.setAddress(ProtocolAddressKeys.ASSET_REGISTRY, address(assetRegistry));
        addressRegistry.setAddress(ProtocolAddressKeys.AIRCRAFT_REGISTRY, address(aircraftRegistry));
        addressRegistry.setAddress(ProtocolAddressKeys.COMPONENT_REGISTRY, address(componentRegistry));

        vm.stopPrank();

        vm.label(address(roleManager), "RoleManager");
        vm.label(address(addressRegistry), "ProtocolAddressRegistry");
        vm.label(address(orgRegistry), "OrganizationRegistry");
        vm.label(orgRegistryImpl, "OrganizationRegistryImpl");
        vm.label(address(credentialRegistry), "CredentialRegistry");
        vm.label(credentialRegistryImpl, "CredentialRegistryImpl");
        vm.label(address(assetOwnership), "AssetOwnership");
        vm.label(assetOwnershipImpl, "AssetOwnershipImpl");
        vm.label(address(assetRegistry), "AssetRegistry");
        vm.label(assetRegistryImpl, "AssetRegistryImpl");
        vm.label(address(aircraftRegistry), "AircraftRegistry");
        vm.label(aircraftRegistryImpl, "AircraftRegistryImpl");
        vm.label(address(componentRegistry), "ComponentRegistry");
        vm.label(componentRegistryImpl, "ComponentRegistryImpl");
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

    /// @notice Registers an asset owned by `owner` under a verified organization.
    /// @param orgId The registering organization. Caller must be able to act for it.
    /// @param actor An address that may act for `orgId`.
    /// @param owner The initial owner.
    /// @param kind The category of asset.
    /// @param serialHash Serial-number commitment, or 0 for none.
    /// @return assetId The newly minted asset id.
    function _registerAsset(
        uint256 orgId,
        address actor,
        address owner,
        IAssetRegistry.AssetKind kind,
        bytes32 serialHash
    ) internal returns (uint256 assetId) {
        vm.prank(actor);
        assetId = assetRegistry.registerAsset(orgId, owner, kind, serialHash, keccak256("asset-meta"), "ipfs://asset");
    }

    /// @notice Registers a default aircraft owned by `alice` under her verified org.
    /// @return orgId The registering organization.
    /// @return assetId The newly minted aircraft asset id.
    function _defaultAircraft() internal returns (uint256 orgId, uint256 assetId) {
        orgId = _defaultVerifiedOrg();
        assetId = _registerAsset(orgId, alice, alice, IAssetRegistry.AssetKind.AIRCRAFT, keccak256("MSN-12345"));
    }

    /// @notice Registers an aircraft through `AircraftRegistry`.
    /// @param orgId The registering organization.
    /// @param actor An address that may act for `orgId`.
    /// @param owner The initial owner.
    /// @param serialHash Manufacturer serial-number commitment.
    /// @return assetId The newly minted aircraft asset id.
    function _registerAircraft(uint256 orgId, address actor, address owner, bytes32 serialHash)
        internal
        returns (uint256 assetId)
    {
        IAircraftRegistry.AircraftParams memory params = IAircraftRegistry.AircraftParams({
            orgId: orgId,
            owner: owner,
            serialNumberHash: serialHash,
            metadataHash: keccak256("aircraft-meta"),
            uri: "ipfs://aircraft",
            manufacturerOrgId: 0,
            manufacturerName: "Airbus",
            model: "A320-214",
            manufactureYear: 2015,
            category: IAircraftRegistry.AircraftCategory.COMMERCIAL_TRANSPORT,
            registrationMarkHash: keccak256("D-AIZA")
        });

        vm.prank(actor);
        assetId = aircraftRegistry.registerAircraft(params);
    }

    /// @notice Registers a component through `ComponentRegistry`.
    /// @param orgId The registering organization.
    /// @param actor An address that may act for `orgId`.
    /// @param owner The initial owner.
    /// @param kind The component category.
    /// @param serialHash Component serial-number commitment.
    /// @return assetId The newly minted component asset id.
    function _registerComponent(
        uint256 orgId,
        address actor,
        address owner,
        IComponentRegistry.ComponentKind kind,
        bytes32 serialHash
    ) internal returns (uint256 assetId) {
        IComponentRegistry.ComponentParams memory params =
            IComponentRegistry.ComponentParams({
                orgId: orgId,
                owner: owner,
                serialNumberHash: serialHash,
                metadataHash: keccak256("component-meta"),
                uri: "ipfs://component",
                kind: kind,
                partNumber: "CFM56-5B4"
            });

        vm.prank(actor);
        assetId = componentRegistry.registerComponent(params);
    }

    /// @notice Grants `SETTLEMENT_ROLE` to an address so it can act as an escrow.
    /// @dev Phase 7 grants this to escrow clones from `EscrowFactory`; until then the
    ///      settlement path is exercised with a stand-in holder.
    /// @param account The address to grant.
    function _grantSettlementRole(address account) internal {
        vm.prank(protocolAdmin);
        roleManager.grantRole(ProtocolRoles.SETTLEMENT_ROLE, account);
    }

    /// @notice Registers a verified MRO holding a valid maintenance-authority credential.
    /// @return orgId The MRO organization id.
    /// @return credentialId The maintenance-authority credential id.
    function _credentialedMro() internal returns (uint256 orgId, uint256 credentialId) {
        orgId = _verifiedMro();
        credentialId = _issueOrgCredential(orgId, ICredentialRegistry.CredentialType.MAINTENANCE_AUTHORITY);
    }
}
