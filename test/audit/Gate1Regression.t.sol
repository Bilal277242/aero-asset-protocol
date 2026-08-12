// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAssetRegistry} from "../../src/interfaces/IAssetRegistry.sol";
import {IComponentRegistry} from "../../src/interfaces/IComponentRegistry.sol";
import {IDocumentRegistry} from "../../src/interfaces/IDocumentRegistry.sol";
import {IOrganizationRegistry} from "../../src/interfaces/IOrganizationRegistry.sol";
import {ProtocolRoles} from "../../src/libraries/ProtocolRoles.sol";
import {ListingManager} from "../../src/marketplace/ListingManager.sol";
import {ProtocolTestBase} from "../utils/ProtocolTestBase.sol";

/// @title Gate1Regression
/// @author AeroAsset Protocol
/// @notice Regression tests for the Gate 1 audit remediations.
/// @dev Companion to `Gate0Regression`. AAP-05 and AAP-06 invert proof-of-concepts in
///      `audit/poc/` that demonstrated working attacks at commit `b31b6d2`.
contract Gate1Regression is ProtocolTestBase {
    uint128 internal constant PRICE = 1_000_000e6;

    /*//////////////////////////////////////////////////////////////
                     AAP-05 — REVOCATION FREES THE NAME
    //////////////////////////////////////////////////////////////*/

    /// @notice Rejecting a squatted organization now releases its name.
    /// @dev The documented mitigation used to make the burn permanent instead of
    ///      undoing it, which turned a nuisance into an unrecoverable denial of service.
    function test_AAP05_RejectionFreesTheName() public {
        bytes32 nameHash = keccak256("Lufthansa Technik AG");

        vm.prank(bob);
        uint256 squatId = orgRegistry.registerOrganization(
            IOrganizationRegistry.OrganizationType.MRO, nameHash, keccak256("junk"), "ipfs://junk"
        );

        vm.expectEmit(true, true, true, true, address(orgRegistry));
        emit IOrganizationRegistry.OrganizationNameReleased(squatId, nameHash);
        vm.prank(orgVerifier);
        orgRegistry.rejectOrganization(squatId);

        assertEq(orgRegistry.organizationIdByNameHash(nameHash), 0, "index not cleared");

        // The legitimate holder can now register.
        vm.prank(alice);
        uint256 realId = orgRegistry.registerOrganization(
            IOrganizationRegistry.OrganizationType.MRO, nameHash, keccak256("real"), "ipfs://real"
        );

        assertEq(orgRegistry.organizationIdByNameHash(nameHash), realId, "index not reassigned");
        // The squat survives as an audit trail; it simply no longer owns the name.
        assertEq(
            uint8(orgRegistry.getOrganization(squatId).status),
            uint8(IOrganizationRegistry.OrganizationStatus.REVOKED),
            "squat record lost"
        );
    }

    /// @notice Revoking an established organization also frees its name.
    function test_AAP05_RevocationFreesTheName() public {
        bytes32 nameHash = keccak256("Acme Aviation");
        uint256 orgId = _registerVerifiedOrg(alice, nameHash, IOrganizationRegistry.OrganizationType.AIRLINE);

        vm.prank(protocolAdmin);
        orgRegistry.revokeOrganization(orgId);

        assertEq(orgRegistry.organizationIdByNameHash(nameHash), 0, "index not cleared on revocation");

        vm.prank(bob);
        orgRegistry.registerOrganization(
            IOrganizationRegistry.OrganizationType.AIRLINE, nameHash, keccak256("new"), "ipfs://new"
        );
    }

    /// @notice A live organization still holds its name against all comers.
    function test_AAP05_ActiveNameStillProtected() public {
        bytes32 nameHash = keccak256("Still Trading Ltd");
        uint256 orgId = _registerVerifiedOrg(alice, nameHash, IOrganizationRegistry.OrganizationType.AIRLINE);

        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.OrganizationNameTaken.selector, nameHash, orgId));
        vm.prank(bob);
        orgRegistry.registerOrganization(
            IOrganizationRegistry.OrganizationType.MRO, nameHash, keccak256("x"), "ipfs://x"
        );
    }

    /*//////////////////////////////////////////////////////////////
                AAP-06 — INSTALLED COMPONENTS ARE NOT SELLABLE
    //////////////////////////////////////////////////////////////*/

    /// @notice An installed engine can no longer be sold off its airframe.
    function test_AAP06_InstalledComponentCannotBeListed() public {
        (uint256 orgId, uint256 aircraftId) = _defaultAircraft();
        uint256 engineId =
            _registerComponent(orgId, alice, alice, IComponentRegistry.ComponentKind.ENGINE, keccak256("ESN-1"));

        vm.prank(alice);
        componentRegistry.installComponent(engineId, aircraftId, 1);

        vm.prank(orgVerifier);
        assetRegistry.verifyAsset(engineId, orgId);

        vm.expectRevert(abi.encodeWithSelector(ListingManager.ComponentIsInstalled.selector, engineId, aircraftId));
        vm.prank(alice);
        marketplace.createListing(engineId, address(settlementToken), PRICE, uint40(block.timestamp + 30 days));
    }

    /// @notice Removing the component first makes it sellable again.
    function test_AAP06_RemovedComponentIsSellable() public {
        (uint256 orgId, uint256 aircraftId) = _defaultAircraft();
        uint256 engineId =
            _registerComponent(orgId, alice, alice, IComponentRegistry.ComponentKind.ENGINE, keccak256("ESN-2"));

        vm.prank(alice);
        componentRegistry.installComponent(engineId, aircraftId, 1);
        vm.prank(alice);
        componentRegistry.removeComponent(engineId);

        vm.prank(orgVerifier);
        assetRegistry.verifyAsset(engineId, orgId);

        vm.prank(alice);
        uint256 listingId =
            marketplace.createListing(engineId, address(settlementToken), PRICE, uint40(block.timestamp + 30 days));

        assertTrue(marketplace.isListingActive(listingId), "removed component not listable");
        assertEq(componentRegistry.componentCountOf(aircraftId), 0, "still indexed on the airframe");
    }

    /// @notice Aircraft and bare assets are unaffected by the component guard.
    /// @dev The check must not accidentally block anything that is not a component.
    function test_AAP06_NonComponentsAreUnaffected() public {
        (,, uint256 listingId) = _listedAircraft(PRICE);
        assertTrue(marketplace.isListingActive(listingId), "aircraft listing blocked");
    }

    /*//////////////////////////////////////////////////////////////
                 AAP-07 — DOCUMENT HASHES ARE SCOPED PER ASSET
    //////////////////////////////////////////////////////////////*/

    /// @notice The same document can be recorded against several aircraft.
    /// @dev An Airworthiness Directive covers a fleet; global uniqueness could record
    ///      it against exactly one aircraft in the entire protocol.
    function test_AAP07_SameDocumentAcrossFleet() public {
        uint256 orgId = _defaultVerifiedOrg();
        uint256 first = _registerAircraft(orgId, alice, alice, keccak256("MSN-A"));
        uint256 second = _registerAircraft(orgId, alice, alice, keccak256("MSN-B"));

        bytes32 adHash = keccak256("AD-2026-04-12");

        vm.prank(alice);
        uint256 docA = documentRegistry.registerDocument(
            first, orgId, IDocumentRegistry.DocumentType.AD_COMPLIANCE, adHash, uint40(block.timestamp), "ipfs://ad"
        );
        vm.prank(alice);
        uint256 docB = documentRegistry.registerDocument(
            second, orgId, IDocumentRegistry.DocumentType.AD_COMPLIANCE, adHash, uint40(block.timestamp), "ipfs://ad"
        );

        assertTrue(docA != docB, "same document id reused");
        assertEq(documentRegistry.documentIdOf(first, adHash), docA, "first index wrong");
        assertEq(documentRegistry.documentIdOf(second, adHash), docB, "second index wrong");
    }

    /// @notice A squatter can no longer burn a hash for someone else's aircraft.
    function test_AAP07_SquattingOnAJunkAssetDoesNotBlockTheRealOne() public {
        uint256 orgId = _defaultVerifiedOrg();
        uint256 realAircraft = _registerAircraft(orgId, alice, alice, keccak256("MSN-REAL"));

        // Mallory registers the hash against a worthless asset she controls.
        uint256 malloryOrg =
            _registerVerifiedOrg(bob, keccak256("Mallory Ltd"), IOrganizationRegistry.OrganizationType.BROKER);
        uint256 junk = _registerAircraft(malloryOrg, bob, bob, keccak256("MSN-JUNK"));

        bytes32 docHash = keccak256("type-certificate.pdf");
        vm.prank(bob);
        documentRegistry.registerDocument(
            junk,
            malloryOrg,
            IDocumentRegistry.DocumentType.AIRWORTHINESS_CERTIFICATE,
            docHash,
            uint40(block.timestamp),
            "ipfs://junk"
        );

        // The real owner is unaffected.
        vm.prank(alice);
        uint256 realDoc = documentRegistry.registerDocument(
            realAircraft,
            orgId,
            IDocumentRegistry.DocumentType.AIRWORTHINESS_CERTIFICATE,
            docHash,
            uint40(block.timestamp),
            "ipfs://real"
        );

        assertEq(documentRegistry.documentIdOf(realAircraft, docHash), realDoc, "real registration blocked");
    }

    /// @notice Duplicates on the *same* asset are still refused.
    function test_AAP07_DuplicateOnSameAssetStillRefused() public {
        uint256 orgId = _defaultVerifiedOrg();
        uint256 assetId = _registerAircraft(orgId, alice, alice, keccak256("MSN-DUP"));
        bytes32 docHash = keccak256("logbook.pdf");

        vm.prank(alice);
        uint256 docId = documentRegistry.registerDocument(
            assetId, orgId, IDocumentRegistry.DocumentType.LOGBOOK, docHash, uint40(block.timestamp), "ipfs://a"
        );

        vm.expectRevert(abi.encodeWithSelector(IDocumentRegistry.DocumentHashTaken.selector, docHash, docId));
        vm.prank(alice);
        documentRegistry.registerDocument(
            assetId, orgId, IDocumentRegistry.DocumentType.LOGBOOK, docHash, uint40(block.timestamp), "ipfs://b"
        );
    }

    /*//////////////////////////////////////////////////////////////
                  AAP-08 — SQUATTED SERIALS ARE ADJUDICABLE
    //////////////////////////////////////////////////////////////*/

    /// @notice A squatted serial can be released by the timelocked admin.
    function test_AAP08_AdminCanReleaseASquattedSerial() public {
        bytes32 serial = keccak256("MSN 12345");

        uint256 squatterOrg =
            _registerVerifiedOrg(bob, keccak256("Squatter Ltd"), IOrganizationRegistry.OrganizationType.BROKER);
        uint256 squatAsset = _registerAircraft(squatterOrg, bob, bob, serial);

        // The real owner is blocked while the squat holds the index.
        uint256 realOrg = _defaultVerifiedOrg();
        vm.expectRevert(abi.encodeWithSelector(IAssetRegistry.SerialNumberTaken.selector, serial, squatAsset));
        _registerAircraft(realOrg, alice, alice, serial);

        vm.expectEmit(true, true, true, true, address(assetRegistry));
        emit IAssetRegistry.SerialNumberHashReleased(squatAsset, serial, protocolAdmin);
        vm.prank(protocolAdmin);
        assetRegistry.releaseSerialNumberHash(squatAsset);

        assertEq(assetRegistry.assetIdBySerialHash(serial), 0, "index not freed");
        assertEq(assetRegistry.getAsset(squatAsset).serialNumberHash, bytes32(0), "squat still claims the serial");

        // The real aircraft registers under its true serial.
        uint256 realAsset = _registerAircraft(realOrg, alice, alice, serial);
        assertEq(assetRegistry.assetIdBySerialHash(serial), realAsset, "index not reassigned");
    }

    /// @notice Release is admin-only and rejects assets with nothing to release.
    function test_AAP08_ReleaseIsConstrained() public {
        (, uint256 assetId) = _defaultAircraft();

        vm.expectRevert();
        vm.prank(alice);
        assetRegistry.releaseSerialNumberHash(assetId);

        vm.prank(protocolAdmin);
        assetRegistry.releaseSerialNumberHash(assetId);

        // Second release has nothing left to free.
        vm.expectRevert(abi.encodeWithSelector(IAssetRegistry.NoSerialNumberRecorded.selector, assetId));
        vm.prank(protocolAdmin);
        assetRegistry.releaseSerialNumberHash(assetId);
    }

    /*//////////////////////////////////////////////////////////////
                   AAP-25 — VERIFIER ROLES ARE SEPARABLE
    //////////////////////////////////////////////////////////////*/

    /// @notice The two verifier roles are independent grants.
    function test_AAP25_VerifierRolesAreDistinct() public view {
        assertTrue(
            ProtocolRoles.ORG_VERIFIER_ROLE != ProtocolRoles.ASSET_VERIFIER_ROLE, "verifier roles are the same id"
        );
        assertFalse(
            roleManager.hasRole(ProtocolRoles.ORG_VERIFIER_ROLE, address(this)), "role leaked to the test contract"
        );
    }
}
