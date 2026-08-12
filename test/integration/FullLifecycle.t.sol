// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ConfigureProtocol} from "../../script/ConfigureProtocol.s.sol";
import {DeployAssets} from "../../script/DeployAssets.s.sol";
import {DeployCore} from "../../script/DeployCore.s.sol";
import {DeployEscrow} from "../../script/DeployEscrow.s.sol";
import {DeployIdentity} from "../../script/DeployIdentity.s.sol";
import {DeployMarketplace} from "../../script/DeployMarketplace.s.sol";
import {DeployProvenance} from "../../script/DeployProvenance.s.sol";
import {DeploymentBase} from "../../script/DeploymentBase.s.sol";
import {Verify} from "../../script/Verify.s.sol";
import {AircraftRegistry} from "../../src/assets/AircraftRegistry.sol";
import {AssetRegistry} from "../../src/assets/AssetRegistry.sol";
import {ComponentRegistry} from "../../src/assets/ComponentRegistry.sol";
import {RoleManager} from "../../src/core/RoleManager.sol";
import {DocumentRegistry} from "../../src/documents/DocumentRegistry.sol";
import {CredentialRegistry} from "../../src/identity/CredentialRegistry.sol";
import {OrganizationRegistry} from "../../src/identity/OrganizationRegistry.sol";
import {IAircraftRegistry} from "../../src/interfaces/IAircraftRegistry.sol";
import {IComponentRegistry} from "../../src/interfaces/IComponentRegistry.sol";
import {ICredentialRegistry} from "../../src/interfaces/ICredentialRegistry.sol";
import {IDocumentRegistry} from "../../src/interfaces/IDocumentRegistry.sol";
import {IEscrow} from "../../src/interfaces/IEscrow.sol";
import {IMaintenanceRegistry} from "../../src/interfaces/IMaintenanceRegistry.sol";
import {IMarketplace} from "../../src/interfaces/IMarketplace.sol";
import {IOrganizationRegistry} from "../../src/interfaces/IOrganizationRegistry.sol";
import {ProtocolRoles} from "../../src/libraries/ProtocolRoles.sol";
import {MaintenanceRegistry} from "../../src/maintenance/MaintenanceRegistry.sol";
import {Marketplace} from "../../src/marketplace/Marketplace.sol";
import {AssetOwnership} from "../../src/ownership/AssetOwnership.sol";
import {AssetPassport} from "../../src/passport/AssetPassport.sol";
import {BaseTest} from "../utils/BaseTest.sol";
import {MockERC20} from "../utils/mocks/MockERC20.sol";

/// @title FullLifecycleTest
/// @author AeroAsset Protocol
/// @notice Deploys the protocol through the **real deployment scripts**, configures
///         it, verifies the wiring, and then runs the canonical end-to-end lifecycle
///         from `docs/architecture.md` §6 in one go.
/// @dev This is the test that would have caught a deployment defect before Sepolia.
///      Every other suite builds its own fixture; this one uses the same
///      `deploy(...)` functions the scripts call on a real network, so a script that
///      forgets a role grant or an address entry fails here rather than in production.
///
///      It also runs after the admin handover, which means every step below executes
///      against a protocol whose `DEFAULT_ADMIN_ROLE` is held by the timelock and
///      whose deployer has renounced everything — the same authorization posture a
///      live deployment has.
contract FullLifecycleTest is BaseTest {
    /*//////////////////////////////////////////////////////////////
                                 SYSTEM
    //////////////////////////////////////////////////////////////*/

    DeploymentBase.ProtocolAddresses internal a;
    MockERC20 internal token;

    /// @dev The configuring account, which holds admin only until the handover.
    ConfigureProtocol internal configureScript;

    uint128 internal constant PRICE = 2_500_000e6;
    uint16 internal constant FEE_BPS = 200;

    function setUp() public override {
        super.setUp();

        token = new MockERC20("Mock USD Coin", "mUSDC");

        DeployCore core = new DeployCore();
        DeployIdentity identity = new DeployIdentity();
        DeployAssets assets = new DeployAssets();
        DeployProvenance provenance = new DeployProvenance();
        DeployMarketplace market = new DeployMarketplace();
        DeployEscrow escrowStage = new DeployEscrow();
        configureScript = new ConfigureProtocol();

        // Stage 1. The configuring script holds admin until it hands over, exactly as
        // a deployer EOA does on a real network.
        (a.protocolTimelock, a.roleManager, a.addressRegistry) =
            core.deploy(address(configureScript), protocolAdmin, 48 hours);

        // Stage 2-6.
        (a.organizationRegistry,, a.credentialRegistry,) = identity.deploy(a.roleManager, a.addressRegistry);

        DeployAssets.AssetDeployment memory assetAddrs = assets.deploy(a.roleManager, a.addressRegistry);
        a.assetOwnership = assetAddrs.assetOwnership;
        a.assetRegistry = assetAddrs.assetRegistry;
        a.aircraftRegistry = assetAddrs.aircraftRegistry;
        a.componentRegistry = assetAddrs.componentRegistry;

        (a.documentRegistry,, a.maintenanceRegistry,, a.assetPassport) =
            provenance.deploy(a.roleManager, a.addressRegistry);
        (a.marketplace,) = market.deploy(a.roleManager, a.addressRegistry);
        (a.feeManager, a.escrowImplementation, a.escrowFactory) =
            escrowStage.deploy(a.roleManager, a.addressRegistry, treasury);

        // Stage 7.
        configureScript.configure(
            a,
            ConfigureProtocol.Config({
                orgVerifier: orgVerifier,
                assetVerifier: assetVerifier,
                credentialIssuer: credentialIssuer,
                arbitrator: arbitrator,
                pauser: pauser,
                settlementToken: address(token),
                marketplaceFeeBps: FEE_BPS
            }),
            address(configureScript)
        );
    }

    /*//////////////////////////////////////////////////////////////
                              VERIFICATION
    //////////////////////////////////////////////////////////////*/

    /// @notice The deployment passes its own post-deployment verification.
    /// @dev `Verify.s.sol` is the gate that turns "the last contract was mined" into
    ///      "the protocol is actually wired". If this fails, the deployment is
    ///      defective regardless of what else passes.
    function test_DeploymentPassesVerification() public {
        new Verify().verify(a, address(token));
    }

    /// @notice The deployer has no residual power after the handover.
    /// @dev The single most important property of a finished deployment.
    function test_DeployerRetainsNoPower() public view {
        RoleManager roles = RoleManager(a.roleManager);
        bytes32 defaultAdmin = roles.DEFAULT_ADMIN_ROLE();

        assertEq(roles.getRoleMemberCount(defaultAdmin), 1, "more than one admin remains");
        assertEq(roles.getRoleMember(defaultAdmin, 0), a.protocolTimelock, "admin is not the timelock");

        assertFalse(roles.hasRole(defaultAdmin, address(configureScript)), "deployer kept default admin");
        assertFalse(
            roles.hasRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE, address(configureScript)), "deployer kept protocol admin"
        );
        assertFalse(
            roles.hasRole(ProtocolRoles.FEE_MANAGER_ROLE, address(configureScript)), "deployer kept fee manager"
        );
    }

    /// @notice Verification fails loudly when a single address entry is wrong.
    /// @dev Proves the gate has teeth. A verifier that passes on a broken deployment
    ///      is worse than none, because it manufactures confidence.
    function test_VerificationCatchesMisconfiguration() public {
        // Deployed before `expectRevert`: contract creation would otherwise be the
        // "next call" the cheatcode binds to, not `verify`.
        Verify verifier = new Verify();

        DeploymentBase.ProtocolAddresses memory broken = a;
        broken.marketplace = address(0xdead);

        vm.expectRevert(abi.encodeWithSelector(Verify.VerificationFailed.selector, "marketplace entry"));
        verifier.verify(broken, address(token));

        // A forgotten role grant is caught just as loudly as a wrong address.
        broken = a;
        broken.aircraftRegistry = address(0xbeef);
        vm.expectRevert(abi.encodeWithSelector(Verify.VerificationFailed.selector, "aircraftRegistry entry"));
        verifier.verify(broken, address(token));

        // So is an unlisted settlement token.
        vm.expectRevert(abi.encodeWithSelector(Verify.VerificationFailed.selector, "settlement token not allowlisted"));
        verifier.verify(a, address(0xcafe));
    }

    /*//////////////////////////////////////////////////////////////
                           CANONICAL LIFECYCLE
    //////////////////////////////////////////////////////////////*/

    /// @notice The complete flow: organization to fee collection, in one test.
    /// @dev Mirrors `docs/architecture.md` §6 step for step. Roadmap §21 requires this
    ///      exact sequence to run against a live testnet before mainnet.
    function test_CanonicalLifecycle() public {
        // 1-2. An airline self-registers and is verified.
        vm.prank(alice);
        uint256 airline = OrganizationRegistry(a.organizationRegistry)
            .registerOrganization(
                IOrganizationRegistry.OrganizationType.AIRLINE, keccak256("Fixture Air"), bytes32(0), ""
            );
        vm.prank(orgVerifier);
        OrganizationRegistry(a.organizationRegistry).verifyOrganization(airline);

        // An MRO is registered, verified and credentialed.
        vm.prank(mro);
        uint256 mroOrg = OrganizationRegistry(a.organizationRegistry)
            .registerOrganization(IOrganizationRegistry.OrganizationType.MRO, keccak256("Fixture MRO"), bytes32(0), "");
        vm.prank(orgVerifier);
        OrganizationRegistry(a.organizationRegistry).verifyOrganization(mroOrg);

        // 3. A maintenance-authority credential is issued.
        vm.prank(credentialIssuer);
        CredentialRegistry(a.credentialRegistry)
            .issueCredential(
                0,
                address(0),
                mroOrg,
                ICredentialRegistry.CredentialType.MAINTENANCE_AUTHORITY,
                uint40(block.timestamp + 365 days),
                keccak256("part-145")
            );

        // 4. The airline registers an aircraft, which is then verified.
        vm.prank(alice);
        uint256 aircraftId = AircraftRegistry(a.aircraftRegistry)
            .registerAircraft(
                IAircraftRegistry.AircraftParams({
                    orgId: airline,
                    owner: alice,
                    serialNumberHash: keccak256("MSN-9001"),
                    metadataHash: keccak256("meta"),
                    uri: "ipfs://aircraft",
                    manufacturerOrgId: 0,
                    manufacturerName: "Airbus",
                    model: "A320-214",
                    manufactureYear: 2015,
                    category: IAircraftRegistry.AircraftCategory.COMMERCIAL_TRANSPORT,
                    registrationMarkHash: keccak256("D-AIZA")
                })
            );
        assertEq(AssetOwnership(a.assetOwnership).ownerOf(aircraftId), alice, "ownership not created at registration");

        // A distinct key from the organization verifier: attesting to a corporate
        // entity and attesting to an airframe are different competencies (AAP-25).
        vm.prank(assetVerifier);
        AssetRegistry(a.assetRegistry).verifyAsset(aircraftId, airline);

        // 5. An engine is registered and installed.
        vm.prank(alice);
        uint256 engineId = ComponentRegistry(a.componentRegistry)
            .registerComponent(
                IComponentRegistry.ComponentParams({
                    orgId: airline,
                    owner: alice,
                    serialNumberHash: keccak256("ESN-4001"),
                    metadataHash: bytes32(0),
                    uri: "",
                    kind: IComponentRegistry.ComponentKind.ENGINE,
                    partNumber: "CFM56-5B4"
                })
            );
        vm.prank(alice);
        ComponentRegistry(a.componentRegistry).installComponent(engineId, aircraftId, 1);

        // 6-7. A document is registered, then maintenance is recorded against it.
        vm.prank(alice);
        uint256 docId = DocumentRegistry(a.documentRegistry)
            .registerDocument(
                aircraftId,
                0,
                IDocumentRegistry.DocumentType.MAINTENANCE_RECORD,
                keccak256("c-check-package"),
                uint40(block.timestamp),
                "ipfs://wp"
            );
        vm.prank(mro);
        MaintenanceRegistry(a.maintenanceRegistry)
            .recordMaintenance(
                aircraftId,
                mroOrg,
                IMaintenanceRegistry.MaintenanceType.C_CHECK,
                uint40(block.timestamp),
                docId,
                keccak256("work-package")
            );

        // 8. The aggregate passport reflects every layer in one read.
        AssetPassport.Passport memory passport = AssetPassport(a.assetPassport).getPassport(aircraftId);
        assertTrue(passport.verified, "passport does not show verification");
        assertEq(passport.owner, alice, "passport owner wrong");
        assertEq(passport.componentCount, 1, "passport component count wrong");
        assertEq(passport.documentCount, 1, "passport document count wrong");
        assertEq(passport.maintenanceCount, 1, "passport maintenance count wrong");

        // 9-10. The aircraft is listed; a buyer offers and the seller accepts.
        vm.prank(alice);
        uint256 listingId = Marketplace(a.marketplace)
            .createListing(aircraftId, address(token), PRICE, uint40(block.timestamp + 60 days));
        vm.prank(bob);
        uint256 offerId = Marketplace(a.marketplace).makeOffer(listingId, PRICE, uint40(block.timestamp + 7 days));
        vm.prank(alice);
        (, address escrow) = Marketplace(a.marketplace).acceptOffer(offerId);

        // 11. The buyer funds the escrow, locking the aircraft.
        token.mint(bob, PRICE);
        vm.prank(bob);
        token.approve(escrow, PRICE);
        vm.prank(bob);
        IEscrow(escrow).fund();
        assertEq(AssetOwnership(a.assetOwnership).lockHolderOf(aircraftId), escrow, "aircraft not locked");

        // 12-13. Release settles everything atomically.
        uint256 expectedFee = (uint256(PRICE) * FEE_BPS) / 10_000;
        vm.prank(bob);
        IEscrow(escrow).release();

        assertEq(AssetOwnership(a.assetOwnership).ownerOf(aircraftId), bob, "aircraft did not change hands");
        assertEq(token.balanceOf(alice), PRICE - expectedFee, "seller proceeds wrong");
        assertEq(token.balanceOf(treasury), expectedFee, "fee not collected");
        assertEq(token.balanceOf(escrow), 0, "escrow retained funds");
        assertEq(
            uint8(Marketplace(a.marketplace).getListing(listingId).status),
            uint8(IMarketplace.ListingStatus.SOLD),
            "listing not marked sold"
        );

        // The provenance survives the sale — that is the entire point of the registry.
        AssetPassport.Passport memory afterSale = AssetPassport(a.assetPassport).getPassport(aircraftId);
        assertEq(afterSale.owner, bob, "passport owner not updated");
        assertEq(afterSale.componentCount, 1, "components lost on sale");
        assertEq(afterSale.maintenanceCount, 1, "maintenance history lost on sale");
        assertEq(afterSale.documentCount, 1, "documents lost on sale");
    }

    /// @notice The lifecycle runs with the deployer already powerless.
    /// @dev Proves nothing above depended on residual deployer privileges — a failure
    ///      mode that a fixture granting itself every role would hide completely.
    function test_LifecycleNeedsNoDeployerPrivilege() public {
        vm.prank(alice);
        uint256 orgId = OrganizationRegistry(a.organizationRegistry)
            .registerOrganization(
                IOrganizationRegistry.OrganizationType.LESSOR, keccak256("Post-handover Lessor"), bytes32(0), ""
            );

        // The configuring account renounced everything, so it cannot verify.
        vm.expectRevert();
        vm.prank(address(configureScript));
        OrganizationRegistry(a.organizationRegistry).verifyOrganization(orgId);

        // The configured verifier can.
        vm.prank(orgVerifier);
        OrganizationRegistry(a.organizationRegistry).verifyOrganization(orgId);
        assertTrue(OrganizationRegistry(a.organizationRegistry).isVerified(orgId), "verifier role not wired");
    }
}
