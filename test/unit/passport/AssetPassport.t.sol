// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAircraftRegistry} from "../../../src/interfaces/IAircraftRegistry.sol";
import {IAssetRegistry} from "../../../src/interfaces/IAssetRegistry.sol";
import {IComponentRegistry} from "../../../src/interfaces/IComponentRegistry.sol";
import {IDocumentRegistry} from "../../../src/interfaces/IDocumentRegistry.sol";
import {ProtocolAddressKeys} from "../../../src/libraries/ProtocolAddressKeys.sol";
import {ZeroAddress} from "../../../src/libraries/ProtocolErrors.sol";
import {AssetPassport} from "../../../src/passport/AssetPassport.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";

/// @title AssetPassportTest
/// @author AeroAsset Protocol
/// @notice Coverage for the read-only aggregator, including the property that makes
///         it safe: it owns no state and cannot write anything.
contract AssetPassportTest is ProtocolTestBase {
    /// @dev Verified organization administered by `alice`, owner of `assetId`.
    bytes32 internal constant MODEL_A320 = "A320-214";

    uint256 internal ownerOrg;
    /// @dev Aircraft owned by `alice`.
    uint256 internal assetId;
    /// @dev Credentialed MRO used to populate maintenance history.
    uint256 internal mroOrg;

    function setUp() public override {
        super.setUp();
        (ownerOrg, assetId) = _defaultAircraft();
        (mroOrg,) = _credentialedMro();
    }

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTION
    //////////////////////////////////////////////////////////////*/

    /// @notice The aggregator binds to the address registry immutably.
    function test_Constructor_BindsAddressRegistry() public view {
        assertEq(address(assetPassport.ADDRESS_REGISTRY()), address(addressRegistry), "registry not bound");
    }

    /// @notice The constructor rejects a zero address registry.
    function test_RevertWhen_ConstructedWithZeroRegistry() public {
        vm.expectRevert(ZeroAddress.selector);
        new AssetPassport(address(0));
    }

    /// @notice The aggregator holds no storage beyond its immutable.
    /// @dev Reads the first sixteen storage slots directly. An `immutable` lives in
    ///      bytecode, not storage, so every slot must be zero. This is the property
    ///      that makes the passport incapable of diverging from the registries.
    function test_OwnsNoStorage() public {
        _populatePassport();

        for (uint256 slot; slot < 16; ++slot) {
            assertEq(vm.load(address(assetPassport), bytes32(slot)), bytes32(0), "aggregator wrote to storage");
        }
    }

    /*//////////////////////////////////////////////////////////////
                                AGGREGATION
    //////////////////////////////////////////////////////////////*/

    /// @notice A fresh asset aggregates with empty collections.
    function test_Passport_FreshAsset() public view {
        AssetPassport.Passport memory passport = assetPassport.getPassport(assetId);

        assertEq(passport.assetId, assetId, "wrong id");
        assertEq(uint8(passport.kind), uint8(IAssetRegistry.AssetKind.AIRCRAFT), "wrong kind");
        assertEq(uint8(passport.status), uint8(IAssetRegistry.AssetStatus.REGISTERED), "wrong status");
        assertFalse(passport.verified, "fresh asset reported verified");
        assertEq(passport.registrarOrgId, ownerOrg, "wrong registrar");
        assertEq(passport.owner, alice, "wrong owner");
        assertFalse(passport.transferFrozen, "fresh asset frozen");
        assertEq(passport.lockedBy, address(0), "fresh asset locked");
        assertEq(passport.componentCount, 0, "phantom components");
        assertEq(passport.documentCount, 0, "phantom documents");
        assertEq(passport.maintenanceCount, 0, "phantom maintenance");
    }

    /// @notice The passport reflects every layer in one call.
    /// @dev This is the whole point of the aggregator: one read instead of six.
    function test_Passport_FullyPopulated() public {
        _populatePassport();

        AssetPassport.Passport memory passport = assetPassport.getPassport(assetId);

        assertTrue(passport.verified, "verification not reflected");
        assertEq(passport.verifierOrgId, ownerOrg, "verifier not reflected");
        assertEq(uint8(passport.status), uint8(IAssetRegistry.AssetStatus.IN_SERVICE), "status not reflected");
        assertEq(passport.componentCount, 2, "components not reflected");
        assertEq(passport.documentCount, 1, "documents not reflected");
        assertEq(passport.maintenanceCount, 1, "maintenance not reflected");
        assertEq(passport.serialNumberHash, keccak256("MSN-12345"), "serial not reflected");
        assertEq(assetPassport.metadataURI(assetId), "ipfs://aircraft", "uri not reflected");
    }

    /// @notice The passport tracks ownership changes.
    function test_Passport_ReflectsOwnershipTransfer() public {
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, bob, 0);
        vm.prank(bob);
        assetOwnership.acceptTransfer(assetId);

        AssetPassport.Passport memory passport = assetPassport.getPassport(assetId);
        assertEq(passport.owner, bob, "owner not reflected");
        assertEq(passport.ownedSince, uint40(block.timestamp), "ownedSince not reflected");
    }

    /// @notice The passport reflects a terminal asset's frozen transferability.
    function test_Passport_ReflectsFreeze() public {
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.DESTROYED);

        AssetPassport.Passport memory passport = assetPassport.getPassport(assetId);
        assertEq(uint8(passport.status), uint8(IAssetRegistry.AssetStatus.DESTROYED), "status not reflected");
        assertTrue(passport.transferFrozen, "freeze not reflected");
    }

    /// @notice The passport reflects a settlement lock.
    function test_Passport_ReflectsSettlementLock() public {
        address escrow = makeAddr("escrow");
        _grantSettlementRole(escrow);

        vm.prank(escrow);
        assetOwnership.setTransferLock(assetId, true);

        assertEq(assetPassport.getPassport(assetId).lockedBy, escrow, "lock not reflected");
    }

    /// @notice Reading an unknown asset reverts through the underlying registry.
    function testFuzz_RevertWhen_UnknownAsset(uint256 unknownId) public {
        vm.assume(unknownId != assetId);
        vm.assume(!assetRegistry.exists(unknownId));

        vm.expectRevert(abi.encodeWithSelector(IAssetRegistry.AssetNotFound.selector, unknownId));
        assetPassport.getPassport(unknownId);
    }

    /*//////////////////////////////////////////////////////////////
                              SPECIALIZATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Airframe and component detail pass through to their registries.
    function test_SpecializationPassthrough() public {
        uint256 engineId =
            _registerComponent(ownerOrg, alice, alice, IComponentRegistry.ComponentKind.ENGINE, keccak256("ESN-1"));

        IAircraftRegistry.Aircraft memory aircraft = assetPassport.getAircraft(assetId);
        assertEq(aircraft.model, MODEL_A320, "aircraft detail wrong");

        IComponentRegistry.Component memory component = assetPassport.getComponent(engineId);
        assertEq(uint8(component.kind), uint8(IComponentRegistry.ComponentKind.ENGINE), "component detail wrong");
    }

    /*//////////////////////////////////////////////////////////////
                              PAGINATED LISTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Every list accessor is paginated and clamps correctly.
    /// @dev A passport is unbounded in principle — an airframe accumulates records for
    ///      decades — so no accessor returns a whole collection.
    function test_ListsArePaginated() public {
        _populatePassport();

        assertEq(assetPassport.components(assetId, 0, 1).length, 1, "component page");
        assertEq(assetPassport.components(assetId, 0, 10).length, 2, "component clamp");
        assertEq(assetPassport.components(assetId, 5, 10).length, 0, "component past end");

        assertEq(assetPassport.documents(assetId, 0, 10).length, 1, "document page");
        assertEq(assetPassport.documents(assetId, 5, 10).length, 0, "document past end");

        assertEq(assetPassport.maintenance(assetId, 0, 10).length, 1, "maintenance page");
        assertEq(assetPassport.maintenance(assetId, 5, 10).length, 0, "maintenance past end");
    }

    /*//////////////////////////////////////////////////////////////
                             ADDRESS ROTATION
    //////////////////////////////////////////////////////////////*/

    /// @notice The aggregator resolves modules live, with no cached addresses.
    /// @dev Rotating a module in the address registry must be reflected immediately;
    ///      a passport serving stale data from a retired registry would be worse than
    ///      one that reverts.
    function test_ResolvesModulesLive() public {
        assertEq(assetPassport.getPassport(assetId).documentCount, 0, "unexpected documents");

        // Point the passport at an address with no document registry behind it.
        vm.prank(protocolAdmin);
        addressRegistry.setAddress(ProtocolAddressKeys.DOCUMENT_REGISTRY, address(0xdead));

        vm.expectRevert();
        assetPassport.getPassport(assetId);
    }

    /*//////////////////////////////////////////////////////////////
                                 HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Builds a realistic passport: verified, in service, with components,
    ///         a document and a maintenance record.
    function _populatePassport() internal {
        vm.prank(orgVerifier);
        assetRegistry.verifyAsset(assetId, ownerOrg);
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.IN_SERVICE);

        uint256 engineA =
            _registerComponent(ownerOrg, alice, alice, IComponentRegistry.ComponentKind.ENGINE, keccak256("ESN-A"));
        uint256 engineB =
            _registerComponent(ownerOrg, alice, alice, IComponentRegistry.ComponentKind.ENGINE, keccak256("ESN-B"));
        vm.startPrank(alice);
        componentRegistry.installComponent(engineA, assetId, 1);
        componentRegistry.installComponent(engineB, assetId, 2);
        vm.stopPrank();

        uint256 documentId =
            _registerDocument(assetId, alice, IDocumentRegistry.DocumentType.MAINTENANCE_RECORD, keccak256("wp-1"));
        _recordMaintenance(assetId, mroOrg, mro, documentId);
    }
}
