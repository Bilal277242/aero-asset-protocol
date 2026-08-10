// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAssetOwnership} from "../../../src/interfaces/IAssetOwnership.sol";
import {IAssetRegistry} from "../../../src/interfaces/IAssetRegistry.sol";
import {IComponentRegistry} from "../../../src/interfaces/IComponentRegistry.sol";
import {IOrganizationRegistry} from "../../../src/interfaces/IOrganizationRegistry.sol";
import {ZeroHash} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";

/// @title ComponentRegistryTest
/// @author AeroAsset Protocol
/// @notice Coverage for component registration and the installation graph, centred on
///         `INV-COMP-01`: a component belongs to at most one airframe, always.
contract ComponentRegistryTest is ProtocolTestBase {
    IComponentRegistry.ComponentKind internal constant ENGINE = IComponentRegistry.ComponentKind.ENGINE;
    IComponentRegistry.ComponentKind internal constant APU = IComponentRegistry.ComponentKind.APU;
    IComponentRegistry.ComponentKind internal constant AVIONICS = IComponentRegistry.ComponentKind.AVIONICS;

    IComponentRegistry.ComponentStatus internal constant UNINSTALLED = IComponentRegistry.ComponentStatus.UNINSTALLED;
    IComponentRegistry.ComponentStatus internal constant INSTALLED = IComponentRegistry.ComponentStatus.INSTALLED;
    IComponentRegistry.ComponentStatus internal constant IN_REPAIR = IComponentRegistry.ComponentStatus.IN_REPAIR;
    IComponentRegistry.ComponentStatus internal constant QUARANTINED = IComponentRegistry.ComponentStatus.QUARANTINED;
    IComponentRegistry.ComponentStatus internal constant SCRAPPED = IComponentRegistry.ComponentStatus.SCRAPPED;

    /// @dev Verified organization administered by `alice`.
    bytes32 internal constant PART_NUMBER = "CFM56-5B4";

    uint256 internal orgId;
    /// @dev Aircraft owned by `alice`.
    uint256 internal aircraftId;

    function setUp() public override {
        super.setUp();
        orgId = _defaultVerifiedOrg();
        aircraftId = _registerAircraft(orgId, alice, alice, keccak256("MSN-1"));
    }

    /// @notice Registers an engine owned by `alice`.
    /// @param serial Serial-number commitment.
    /// @return The component asset id.
    function _engine(bytes32 serial) internal returns (uint256) {
        return _registerComponent(orgId, alice, alice, ENGINE, serial);
    }

    /*//////////////////////////////////////////////////////////////
                              REGISTRATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Registration mints a generic asset and lands `UNINSTALLED`.
    function test_Register_LandsUninstalled() public {
        vm.expectEmit(true, true, true, true, address(componentRegistry));
        emit IComponentRegistry.ComponentRegistered(2, ENGINE, "CFM56-5B4");

        uint256 componentId = _engine(keccak256("ESN-1"));

        IComponentRegistry.Component memory component = componentRegistry.getComponent(componentId);
        assertEq(uint8(component.status), uint8(UNINSTALLED), "not UNINSTALLED");
        assertEq(component.parentAssetId, 0, "parent set at registration");
        assertEq(uint8(component.kind), uint8(ENGINE), "wrong kind");
        assertEq(component.partNumber, PART_NUMBER, "wrong part number");
        assertEq(assetOwnership.ownerOf(componentId), alice, "ownership not initialized");
    }

    /// @notice The generic asset kind is derived from the component kind.
    /// @dev Derived rather than caller-supplied, so the two can never disagree about
    ///      what the asset is.
    function test_Register_DerivesAssetKind() public {
        uint256 engineId = _registerComponent(orgId, alice, alice, ENGINE, keccak256("E"));
        uint256 apuId = _registerComponent(orgId, alice, alice, APU, keccak256("A"));
        uint256 avionicsId = _registerComponent(orgId, alice, alice, AVIONICS, keccak256("V"));

        assertEq(uint8(assetRegistry.getAsset(engineId).kind), uint8(IAssetRegistry.AssetKind.ENGINE), "engine kind");
        assertEq(uint8(assetRegistry.getAsset(apuId).kind), uint8(IAssetRegistry.AssetKind.APU), "apu kind");
        assertEq(
            uint8(assetRegistry.getAsset(avionicsId).kind), uint8(IAssetRegistry.AssetKind.COMPONENT), "avionics kind"
        );
    }

    /// @notice The `UNSPECIFIED` sentinel and a zero part number are rejected.
    function test_RevertWhen_RegistrationInvalid() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IComponentRegistry.InvalidComponentKind.selector, IComponentRegistry.ComponentKind.UNSPECIFIED
            )
        );
        _registerComponent(orgId, alice, alice, IComponentRegistry.ComponentKind.UNSPECIFIED, keccak256("X"));

        IComponentRegistry.ComponentParams memory params = IComponentRegistry.ComponentParams({
            orgId: orgId,
            owner: alice,
            serialNumberHash: keccak256("Y"),
            metadataHash: bytes32(0),
            uri: "",
            kind: ENGINE,
            partNumber: bytes32(0)
        });
        vm.expectRevert(ZeroHash.selector);
        vm.prank(alice);
        componentRegistry.registerComponent(params);
    }

    /// @notice The caller must act for the registering organization.
    function testFuzz_RevertWhen_NotActingForOrg(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != alice);

        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.NotActingForOrganization.selector, orgId, caller));
        _registerComponent(orgId, caller, caller, ENGINE, keccak256("E"));
    }

    /*//////////////////////////////////////////////////////////////
                              INSTALLATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Installing binds the component to exactly one airframe.
    function test_Install_BindsToParent() public {
        uint256 engineId = _engine(keccak256("ESN-1"));

        vm.expectEmit(true, true, true, true, address(componentRegistry));
        emit IComponentRegistry.ComponentInstalled(engineId, aircraftId, 1);
        vm.prank(alice);
        componentRegistry.installComponent(engineId, aircraftId, 1);

        IComponentRegistry.Component memory component = componentRegistry.getComponent(engineId);
        assertEq(uint8(component.status), uint8(INSTALLED), "not INSTALLED");
        assertEq(component.parentAssetId, aircraftId, "parent not set");
        assertEq(component.position, 1, "position not set");
        assertEq(component.installedAt, uint40(block.timestamp), "installedAt not set");

        assertEq(componentRegistry.componentCountOf(aircraftId), 1, "not indexed");
        assertEq(componentRegistry.positionOccupant(aircraftId, ENGINE, 1), engineId, "position not occupied");
    }

    /// @notice A component already fitted cannot be fitted again.
    /// @dev This is the direct expression of `INV-COMP-01`: there is no path by which
    ///      one component ends up on two airframes.
    function test_RevertWhen_InstallingAlreadyInstalledComponent() public {
        uint256 engineId = _engine(keccak256("ESN-1"));
        uint256 secondAircraft = _registerAircraft(orgId, alice, alice, keccak256("MSN-2"));

        vm.startPrank(alice);
        componentRegistry.installComponent(engineId, aircraftId, 1);

        vm.expectRevert(
            abi.encodeWithSelector(IComponentRegistry.ComponentAlreadyInstalled.selector, engineId, aircraftId)
        );
        componentRegistry.installComponent(engineId, secondAircraft, 1);
        vm.stopPrank();

        assertEq(componentRegistry.getComponent(engineId).parentAssetId, aircraftId, "parent changed");
        assertEq(componentRegistry.componentCountOf(secondAircraft), 0, "leaked into second airframe");
    }

    /// @notice Two components of the same kind cannot share a position.
    function test_RevertWhen_PositionOccupied() public {
        uint256 engineA = _engine(keccak256("ESN-1"));
        uint256 engineB = _engine(keccak256("ESN-2"));

        vm.startPrank(alice);
        componentRegistry.installComponent(engineA, aircraftId, 1);

        vm.expectRevert(
            abi.encodeWithSelector(IComponentRegistry.PositionOccupied.selector, aircraftId, ENGINE, 1, engineA)
        );
        componentRegistry.installComponent(engineB, aircraftId, 1);

        // A different position on the same airframe is free.
        componentRegistry.installComponent(engineB, aircraftId, 2);
        vm.stopPrank();

        assertEq(componentRegistry.componentCountOf(aircraftId), 2, "second engine not installed");
    }

    /// @notice Positions are scoped per component kind.
    /// @dev Engine 1 and APU 1 are different physical locations.
    function test_Install_PositionsAreScopedByKind() public {
        uint256 engineId = _engine(keccak256("ESN-1"));
        uint256 apuId = _registerComponent(orgId, alice, alice, APU, keccak256("APU-1"));

        vm.startPrank(alice);
        componentRegistry.installComponent(engineId, aircraftId, 1);
        componentRegistry.installComponent(apuId, aircraftId, 1);
        vm.stopPrank();

        assertEq(componentRegistry.positionOccupant(aircraftId, ENGINE, 1), engineId, "engine position");
        assertEq(componentRegistry.positionOccupant(aircraftId, APU, 1), apuId, "apu position");
    }

    /// @notice The parent must be an aircraft, not another component.
    function test_RevertWhen_ParentIsNotAircraft() public {
        uint256 engineId = _engine(keccak256("ESN-1"));
        uint256 otherEngine = _engine(keccak256("ESN-2"));

        vm.expectRevert(abi.encodeWithSelector(IComponentRegistry.ParentNotAircraft.selector, otherEngine));
        vm.prank(alice);
        componentRegistry.installComponent(engineId, otherEngine, 1);
    }

    /// @notice A nonexistent parent is rejected.
    function test_RevertWhen_ParentDoesNotExist() public {
        uint256 engineId = _engine(keccak256("ESN-1"));

        vm.expectRevert(abi.encodeWithSelector(IComponentRegistry.ParentNotAircraft.selector, uint256(999)));
        vm.prank(alice);
        componentRegistry.installComponent(engineId, 999, 1);
    }

    /// @notice A component cannot be installed into itself.
    function test_RevertWhen_SelfInstallation() public {
        uint256 engineId = _engine(keccak256("ESN-1"));

        vm.expectRevert(abi.encodeWithSelector(IComponentRegistry.SelfInstallation.selector, engineId));
        vm.prank(alice);
        componentRegistry.installComponent(engineId, engineId, 1);
    }

    /// @notice A destroyed airframe cannot receive components.
    function test_RevertWhen_ParentIsTerminal() public {
        uint256 engineId = _engine(keccak256("ESN-1"));
        vm.prank(alice);
        assetRegistry.setAssetStatus(aircraftId, IAssetRegistry.AssetStatus.DESTROYED);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAssetRegistry.AssetTerminal.selector, aircraftId, IAssetRegistry.AssetStatus.DESTROYED
            )
        );
        vm.prank(alice);
        componentRegistry.installComponent(engineId, aircraftId, 1);
    }

    /// @notice The caller must own both the component and the airframe.
    /// @dev A lessor must not be able to bolt their engine onto someone else's
    ///      aircraft, nor an operator to claim someone else's engine.
    function test_RevertWhen_CallerDoesNotOwnBoth() public {
        uint256 bobEngine = _registerComponent(orgId, alice, bob, ENGINE, keccak256("ESN-BOB"));

        // Alice owns the aircraft but not the engine.
        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.NotAssetOwner.selector, bobEngine, alice, bob));
        vm.prank(alice);
        componentRegistry.installComponent(bobEngine, aircraftId, 1);

        // Bob owns the engine but not the aircraft.
        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.NotAssetOwner.selector, aircraftId, bob, alice));
        vm.prank(bob);
        componentRegistry.installComponent(bobEngine, aircraftId, 1);
    }

    /*//////////////////////////////////////////////////////////////
                                 REMOVAL
    //////////////////////////////////////////////////////////////*/

    /// @notice Removal detaches the component and frees its position.
    function test_Remove_DetachesAndFreesPosition() public {
        uint256 engineId = _engine(keccak256("ESN-1"));
        vm.startPrank(alice);
        componentRegistry.installComponent(engineId, aircraftId, 1);

        vm.expectEmit(true, true, true, true, address(componentRegistry));
        emit IComponentRegistry.ComponentRemoved(engineId, aircraftId);
        componentRegistry.removeComponent(engineId);
        vm.stopPrank();

        IComponentRegistry.Component memory component = componentRegistry.getComponent(engineId);
        assertEq(uint8(component.status), uint8(UNINSTALLED), "not UNINSTALLED");
        assertEq(component.parentAssetId, 0, "parent not cleared");
        assertEq(component.position, 0, "position not cleared");
        assertEq(component.installedAt, 0, "installedAt not cleared");
        assertEq(component.removedAt, uint40(block.timestamp), "removedAt not recorded");

        assertEq(componentRegistry.componentCountOf(aircraftId), 0, "index not cleaned");
        assertEq(componentRegistry.positionOccupant(aircraftId, ENGINE, 1), 0, "position not freed");
    }

    /// @notice A removed component can be refitted, including to another airframe.
    function test_Remove_ThenReinstallElsewhere() public {
        uint256 engineId = _engine(keccak256("ESN-1"));
        uint256 secondAircraft = _registerAircraft(orgId, alice, alice, keccak256("MSN-2"));

        vm.startPrank(alice);
        componentRegistry.installComponent(engineId, aircraftId, 1);
        componentRegistry.removeComponent(engineId);
        componentRegistry.installComponent(engineId, secondAircraft, 1);
        vm.stopPrank();

        assertEq(componentRegistry.getComponent(engineId).parentAssetId, secondAircraft, "not refitted");
        assertEq(componentRegistry.componentCountOf(aircraftId), 0, "old parent still indexed");
        assertEq(componentRegistry.componentCountOf(secondAircraft), 1, "new parent not indexed");
    }

    /// @notice Removing an uninstalled component reverts.
    function test_RevertWhen_RemovingUninstalledComponent() public {
        uint256 engineId = _engine(keccak256("ESN-1"));

        vm.expectRevert(abi.encodeWithSelector(IComponentRegistry.ComponentNotInstalled.selector, engineId));
        vm.prank(alice);
        componentRegistry.removeComponent(engineId);
    }

    /// @notice Only the component's owner may remove it.
    function testFuzz_RevertWhen_NonOwnerRemoves(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != alice);
        uint256 engineId = _engine(keccak256("ESN-1"));
        vm.prank(alice);
        componentRegistry.installComponent(engineId, aircraftId, 1);

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.NotAssetOwner.selector, engineId, caller, alice));
        vm.prank(caller);
        componentRegistry.removeComponent(engineId);
    }

    /*//////////////////////////////////////////////////////////////
                             INDEX INTEGRITY
    //////////////////////////////////////////////////////////////*/

    /// @notice Swap-and-pop keeps the installed index consistent.
    /// @dev Removing from the middle is the case that a naive `delete` would corrupt.
    function test_Index_SwapAndPopFromMiddle() public {
        uint256[] memory engines = new uint256[](3);
        vm.startPrank(alice);
        for (uint16 i; i < 3; ++i) {
            engines[i] = _registerComponentAs(alice, ENGINE, keccak256(abi.encode("ESN", i)));
            componentRegistry.installComponent(engines[i], aircraftId, i + 1);
        }

        componentRegistry.removeComponent(engines[1]);
        vm.stopPrank();

        assertEq(componentRegistry.componentCountOf(aircraftId), 2, "wrong count");

        uint256[] memory remaining = componentRegistry.componentsOf(aircraftId, 0, 10);
        assertEq(remaining.length, 2, "wrong page length");

        bool sawZero;
        bool sawTwo;
        for (uint256 i; i < remaining.length; ++i) {
            assertTrue(remaining[i] != engines[1], "removed component still indexed");
            if (remaining[i] == engines[0]) {
                sawZero = true;
            }
            if (remaining[i] == engines[2]) {
                sawTwo = true;
            }
            assertEq(componentRegistry.getComponent(remaining[i]).parentAssetId, aircraftId, "stale parent");
        }
        assertTrue(sawZero && sawTwo, "surviving components missing from index");
    }

    /// @notice Pagination clamps to the available range.
    function test_ComponentsOf_Pagination() public {
        vm.startPrank(alice);
        for (uint16 i; i < 4; ++i) {
            uint256 id = _registerComponentAs(alice, ENGINE, keccak256(abi.encode("P", i)));
            componentRegistry.installComponent(id, aircraftId, i + 1);
        }
        vm.stopPrank();

        assertEq(componentRegistry.componentsOf(aircraftId, 0, 2).length, 2, "first page");
        assertEq(componentRegistry.componentsOf(aircraftId, 2, 10).length, 2, "clamped tail");
        assertEq(componentRegistry.componentsOf(aircraftId, 4, 10).length, 0, "past the end");
        assertEq(componentRegistry.componentsOf(aircraftId, 0, 0).length, 0, "zero limit");
    }

    /*//////////////////////////////////////////////////////////////
                                LIFECYCLE
    //////////////////////////////////////////////////////////////*/

    /// @notice Leaving `INSTALLED` by any path detaches the component.
    /// @dev The whole point of funnelling every exit through one detach path: sending
    ///      an installed engine for repair must not leave it recorded as fitted.
    function test_LeavingInstalledAlwaysDetaches() public {
        uint256 engineId = _engine(keccak256("ESN-1"));
        vm.startPrank(alice);
        componentRegistry.installComponent(engineId, aircraftId, 1);

        vm.expectEmit(true, true, true, true, address(componentRegistry));
        emit IComponentRegistry.ComponentRemoved(engineId, aircraftId);
        componentRegistry.setComponentStatus(engineId, IN_REPAIR);
        vm.stopPrank();

        IComponentRegistry.Component memory component = componentRegistry.getComponent(engineId);
        assertEq(uint8(component.status), uint8(IN_REPAIR), "not IN_REPAIR");
        assertEq(component.parentAssetId, 0, "parent survived the transition");
        assertEq(componentRegistry.componentCountOf(aircraftId), 0, "index survived the transition");
        assertEq(componentRegistry.positionOccupant(aircraftId, ENGINE, 1), 0, "position survived");
    }

    /// @notice Repair and quarantine round-trip back to the uninstalled pool.
    function test_Lifecycle_RepairAndQuarantine() public {
        uint256 engineId = _engine(keccak256("ESN-1"));

        vm.startPrank(alice);
        componentRegistry.setComponentStatus(engineId, IN_REPAIR);
        componentRegistry.setComponentStatus(engineId, UNINSTALLED);
        componentRegistry.setComponentStatus(engineId, QUARANTINED);
        componentRegistry.setComponentStatus(engineId, UNINSTALLED);
        vm.stopPrank();

        assertEq(uint8(componentRegistry.getComponent(engineId).status), uint8(UNINSTALLED), "round-trip failed");
    }

    /// @notice A quarantined part cannot go straight back into service.
    /// @dev It must pass through the uninstalled pool, where it can be inspected.
    function test_RevertWhen_InstallingQuarantinedComponent() public {
        uint256 engineId = _engine(keccak256("ESN-1"));
        vm.prank(alice);
        componentRegistry.setComponentStatus(engineId, QUARANTINED);

        vm.expectRevert(
            abi.encodeWithSelector(IComponentRegistry.InvalidComponentTransition.selector, QUARANTINED, INSTALLED)
        );
        vm.prank(alice);
        componentRegistry.installComponent(engineId, aircraftId, 1);
    }

    /// @notice Scrapping is terminal.
    function test_Scrap_IsTerminal() public {
        uint256 engineId = _engine(keccak256("ESN-1"));

        vm.startPrank(alice);
        componentRegistry.setComponentStatus(engineId, SCRAPPED);

        vm.expectRevert(
            abi.encodeWithSelector(IComponentRegistry.InvalidComponentTransition.selector, SCRAPPED, UNINSTALLED)
        );
        componentRegistry.setComponentStatus(engineId, UNINSTALLED);
        vm.stopPrank();
    }

    /// @notice Scrapping an installed component detaches it first.
    function test_Scrap_FromInstalledDetaches() public {
        uint256 engineId = _engine(keccak256("ESN-1"));
        vm.startPrank(alice);
        componentRegistry.installComponent(engineId, aircraftId, 1);
        componentRegistry.setComponentStatus(engineId, SCRAPPED);
        vm.stopPrank();

        assertEq(componentRegistry.getComponent(engineId).parentAssetId, 0, "scrapped part still fitted");
        assertEq(componentRegistry.componentCountOf(aircraftId), 0, "index not cleaned");
    }

    /// @notice `INSTALLED` cannot be reached through the generic status setter.
    function test_RevertWhen_SettingStatusToInstalled() public {
        uint256 engineId = _engine(keccak256("ESN-1"));

        vm.expectRevert(IComponentRegistry.UseInstallComponent.selector);
        vm.prank(alice);
        componentRegistry.setComponentStatus(engineId, INSTALLED);
    }

    /// @notice The transition table matches `docs/state-machines.md` §4.
    function test_TransitionTable_MatchesSpecification() public view {
        uint8 scrapped = uint8(SCRAPPED);

        for (uint8 from; from <= scrapped; ++from) {
            for (uint8 to; to <= scrapped; ++to) {
                bool expected;
                if (from == 0 || to == 0 || from == to || from == scrapped) {
                    expected = false;
                } else if (from == uint8(UNINSTALLED) || from == uint8(INSTALLED)) {
                    expected = true;
                } else if (from == uint8(IN_REPAIR)) {
                    expected = to == uint8(UNINSTALLED) || to == uint8(QUARANTINED) || to == scrapped;
                } else {
                    expected = to == uint8(UNINSTALLED) || to == scrapped;
                }

                assertEq(
                    componentRegistry.isValidTransition(
                        IComponentRegistry.ComponentStatus(from), IComponentRegistry.ComponentStatus(to)
                    ),
                    expected,
                    "transition table drifted from specification"
                );
            }
        }
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Reading an unknown component reverts; `isComponent` returns false.
    function testFuzz_UnknownComponentReads(uint256 assetId) public {
        vm.assume(assetId != 0);
        vm.assume(!componentRegistry.isComponent(assetId));

        vm.expectRevert(abi.encodeWithSelector(IComponentRegistry.ComponentNotFound.selector, assetId));
        componentRegistry.getComponent(assetId);
    }

    /// @notice An aircraft is not a component, despite sharing the id space.
    /// @dev The two specialization registries key off the same ids but hold disjoint
    ///      records, so neither should ever claim the other's assets.
    function test_IsComponent_DiscriminatesFromAircraft() public {
        uint256 engineId = _engine(keccak256("ESN-1"));

        assertTrue(componentRegistry.isComponent(engineId), "engine not reported as component");
        assertFalse(componentRegistry.isComponent(aircraftId), "aircraft reported as component");
        assertFalse(aircraftRegistry.isAircraft(engineId), "engine reported as aircraft");
        assertTrue(aircraftRegistry.isAircraft(aircraftId), "aircraft not reported as aircraft");
    }

    /*//////////////////////////////////////////////////////////////
                                  FUZZ
    //////////////////////////////////////////////////////////////*/

    /// @notice `parentAssetId != 0` if and only if `status == INSTALLED`. INV-COMP-01.
    /// @dev Drives the component through a random legal action sequence and asserts
    ///      the structural invariant after every step.
    function testFuzz_ParentSetIffInstalled(uint8[8] calldata actions) public {
        uint256 engineId = _engine(keccak256("ESN-FUZZ"));

        for (uint256 i; i < actions.length; ++i) {
            uint8 action = actions[i] % 5;
            vm.prank(alice);
            if (action == 0) {
                try componentRegistry.installComponent(engineId, aircraftId, 1) {} catch {}
            } else if (action == 1) {
                try componentRegistry.removeComponent(engineId) {} catch {}
            } else {
                IComponentRegistry.ComponentStatus target =
                    action == 2 ? IN_REPAIR : (action == 3 ? QUARANTINED : UNINSTALLED);
                try componentRegistry.setComponentStatus(engineId, target) {} catch {}
            }

            IComponentRegistry.Component memory component = componentRegistry.getComponent(engineId);
            bool installed = component.status == INSTALLED;
            assertEq(component.parentAssetId != 0, installed, "INV-COMP-01 violated");
            assertEq(componentRegistry.componentCountOf(aircraftId), installed ? 1 : 0, "index disagrees with status");
            assertEq(
                componentRegistry.positionOccupant(aircraftId, ENGINE, 1),
                installed ? engineId : 0,
                "position index disagrees with status"
            );
        }
    }

    /*//////////////////////////////////////////////////////////////
                                 HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Registers a component while an outer `startPrank` is active.
    /// @param owner The initial owner.
    /// @param kind The component category.
    /// @param serial Serial-number commitment.
    /// @return The component asset id.
    function _registerComponentAs(address owner, IComponentRegistry.ComponentKind kind, bytes32 serial)
        internal
        returns (uint256)
    {
        return componentRegistry.registerComponent(
            IComponentRegistry.ComponentParams({
                orgId: orgId,
                owner: owner,
                serialNumberHash: serial,
                metadataHash: bytes32(0),
                uri: "",
                kind: kind,
                partNumber: "PN-1"
            })
        );
    }
}
