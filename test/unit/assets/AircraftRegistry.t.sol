// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAircraftRegistry} from "../../../src/interfaces/IAircraftRegistry.sol";
import {IAssetOwnership} from "../../../src/interfaces/IAssetOwnership.sol";
import {IAssetRegistry} from "../../../src/interfaces/IAssetRegistry.sol";
import {IOrganizationRegistry} from "../../../src/interfaces/IOrganizationRegistry.sol";
import {ProtocolCast} from "../../../src/libraries/ProtocolCast.sol";
import {ZeroHash} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../../../src/libraries/ProtocolRoles.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";

/// @title AircraftRegistryTest
/// @author AeroAsset Protocol
/// @notice Functional, validation, access-control and fuzz coverage for
///         {AircraftRegistry}, including the `ASSET_MINTER_ROLE` delegation.
contract AircraftRegistryTest is ProtocolTestBase {
    IAircraftRegistry.AircraftCategory internal constant TRANSPORT =
    IAircraftRegistry.AircraftCategory.COMMERCIAL_TRANSPORT;
    IAircraftRegistry.AircraftCategory internal constant FREIGHTER = IAircraftRegistry.AircraftCategory.FREIGHTER;

    bytes32 internal constant MSN = keccak256("MSN-5678");
    bytes32 internal constant MODEL_A320 = "A320-214";
    bytes32 internal constant MODEL_FREIGHTER = "A320-200P2F";
    bytes32 internal constant MANUFACTURER_NAME = "Airbus";

    /// @dev Verified organization administered by `alice`.
    uint256 internal orgId;

    function setUp() public override {
        super.setUp();
        orgId = _defaultVerifiedOrg();
    }

    /// @notice Builds a valid parameter set for `orgId`, owned by `alice`.
    /// @return params The registration arguments.
    function _params() internal view returns (IAircraftRegistry.AircraftParams memory params) {
        params = IAircraftRegistry.AircraftParams({
            orgId: orgId,
            owner: alice,
            serialNumberHash: MSN,
            metadataHash: keccak256("meta"),
            uri: "ipfs://a",
            manufacturerOrgId: 0,
            manufacturerName: "Airbus",
            model: "A320-214",
            manufactureYear: 2015,
            category: TRANSPORT,
            registrationMarkHash: keccak256("D-AIZA")
        });
    }

    /*//////////////////////////////////////////////////////////////
                              REGISTRATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Registration mints a generic asset and attaches airframe data.
    /// @dev Proves the shared id space: the aircraft record and the asset record are
    ///      the same id, not two parallel numbering schemes.
    function test_Register_MintsAssetAndAttachesData() public {
        vm.expectEmit(true, true, true, true, address(aircraftRegistry));
        emit IAircraftRegistry.AircraftRegistered(1, 0, "A320-214", 2015, TRANSPORT);

        uint256 assetId = _registerAircraft(orgId, alice, alice, MSN);

        assertEq(assetId, 1, "ids do not share the asset space");
        assertEq(assetRegistry.assetCount(), 1, "asset not minted");

        IAssetRegistry.Asset memory asset = assetRegistry.getAsset(assetId);
        assertEq(uint8(asset.kind), uint8(IAssetRegistry.AssetKind.AIRCRAFT), "wrong asset kind");
        assertEq(asset.registrarOrgId, orgId, "wrong registrar");
        assertEq(asset.serialNumberHash, MSN, "serial not recorded on the asset");
        assertEq(asset.verifiedAt, 0, "aircraft registration verified the asset");
        assertEq(assetOwnership.ownerOf(assetId), alice, "ownership not initialized");

        IAircraftRegistry.Aircraft memory aircraft = aircraftRegistry.getAircraft(assetId);
        assertEq(aircraft.model, MODEL_A320, "wrong model");
        assertEq(aircraft.manufacturerName, MANUFACTURER_NAME, "wrong manufacturer");
        assertEq(aircraft.manufactureYear, 2015, "wrong year");
        assertEq(uint8(aircraft.category), uint8(TRANSPORT), "wrong category");
        assertTrue(aircraftRegistry.isAircraft(assetId), "not reported as aircraft");
    }

    /// @notice An aircraft may name a registered OEM organization instead of a string.
    function test_Register_WithManufacturerOrg() public {
        uint256 oemOrg =
            _registerVerifiedOrg(bob, keccak256("Airbus SAS"), IOrganizationRegistry.OrganizationType.MANUFACTURER);

        IAircraftRegistry.AircraftParams memory params = _params();
        params.manufacturerOrgId = ProtocolCast.toUint64(oemOrg);
        params.manufacturerName = bytes32(0);

        vm.prank(alice);
        uint256 assetId = aircraftRegistry.registerAircraft(params);

        assertEq(aircraftRegistry.getAircraft(assetId).manufacturerOrgId, oemOrg, "OEM org not recorded");
    }

    /// @notice A manufacturer must be identified one way or the other.
    function test_RevertWhen_NoManufacturerGiven() public {
        IAircraftRegistry.AircraftParams memory params = _params();
        params.manufacturerOrgId = 0;
        params.manufacturerName = bytes32(0);

        vm.expectRevert(IAircraftRegistry.MissingManufacturer.selector);
        vm.prank(alice);
        aircraftRegistry.registerAircraft(params);
    }

    /// @notice The caller must be acting for the registering organization.
    function testFuzz_RevertWhen_NotActingForOrg(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != alice);

        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.NotActingForOrganization.selector, orgId, caller));
        vm.prank(caller);
        aircraftRegistry.registerAircraft(_params());
    }

    /// @notice An unverified organization cannot register an aircraft.
    function test_RevertWhen_OrgNotVerified() public {
        uint256 pendingOrg = _registerOrg(bob, keccak256("Pending"), IOrganizationRegistry.OrganizationType.AIRLINE);

        IAircraftRegistry.AircraftParams memory params = _params();
        params.orgId = pendingOrg;
        params.owner = bob;

        vm.expectRevert(
            abi.encodeWithSelector(
                IOrganizationRegistry.OrganizationNotVerified.selector,
                pendingOrg,
                IOrganizationRegistry.OrganizationStatus.PENDING
            )
        );
        vm.prank(bob);
        aircraftRegistry.registerAircraft(params);
    }

    /// @notice Serial-number uniqueness is enforced by the shared asset registry.
    function test_RevertWhen_SerialAlreadyRegistered() public {
        uint256 first = _registerAircraft(orgId, alice, alice, MSN);

        vm.expectRevert(abi.encodeWithSelector(IAssetRegistry.SerialNumberTaken.selector, MSN, first));
        _registerAircraft(orgId, alice, alice, MSN);
    }

    /*//////////////////////////////////////////////////////////////
                                VALIDATION
    //////////////////////////////////////////////////////////////*/

    /// @notice A model designation is required.
    function test_RevertWhen_ModelIsZero() public {
        IAircraftRegistry.AircraftParams memory params = _params();
        params.model = bytes32(0);

        vm.expectRevert(ZeroHash.selector);
        vm.prank(alice);
        aircraftRegistry.registerAircraft(params);
    }

    /// @notice The `UNSPECIFIED` sentinel is rejected as a category.
    function test_RevertWhen_CategoryUnspecified() public {
        IAircraftRegistry.AircraftParams memory params = _params();
        params.category = IAircraftRegistry.AircraftCategory.UNSPECIFIED;

        vm.expectRevert(
            abi.encodeWithSelector(
                IAircraftRegistry.InvalidAircraftCategory.selector, IAircraftRegistry.AircraftCategory.UNSPECIFIED
            )
        );
        vm.prank(alice);
        aircraftRegistry.registerAircraft(params);
    }

    /// @notice Manufacture year is range-checked at both bounds.
    /// @dev A sanity bound only: it catches transposed digits and zero values, and
    ///      makes no claim about the aircraft itself.
    function testFuzz_ManufactureYearBounds(uint16 year) public {
        IAircraftRegistry.AircraftParams memory params = _params();
        params.manufactureYear = year;

        if (year < 1903 || year > 2200) {
            vm.expectRevert(abi.encodeWithSelector(IAircraftRegistry.InvalidManufactureYear.selector, year));
            vm.prank(alice);
            aircraftRegistry.registerAircraft(params);
        } else {
            vm.prank(alice);
            uint256 assetId = aircraftRegistry.registerAircraft(params);
            assertEq(aircraftRegistry.getAircraft(assetId).manufactureYear, year, "year not stored");
        }
    }

    /*//////////////////////////////////////////////////////////////
                                  UPDATE
    //////////////////////////////////////////////////////////////*/

    /// @notice The owner can update model, category and tail number.
    /// @dev Category is mutable because a passenger-to-freighter conversion genuinely
    ///      changes it; build facts such as the manufacture year are not.
    function test_Update_ByOwner() public {
        uint256 assetId = _registerAircraft(orgId, alice, alice, MSN);

        vm.expectEmit(true, true, true, true, address(aircraftRegistry));
        emit IAircraftRegistry.AircraftUpdated(assetId, "A320-200P2F", FREIGHTER, keccak256("N123AA"));
        vm.prank(alice);
        aircraftRegistry.updateAircraft(assetId, "A320-200P2F", FREIGHTER, keccak256("N123AA"));

        IAircraftRegistry.Aircraft memory aircraft = aircraftRegistry.getAircraft(assetId);
        assertEq(aircraft.model, MODEL_FREIGHTER, "model not updated");
        assertEq(uint8(aircraft.category), uint8(FREIGHTER), "category not updated");
        assertEq(aircraft.registrationMarkHash, keccak256("N123AA"), "tail number not updated");
        assertEq(aircraft.manufactureYear, 2015, "build fact was mutated");
        assertEq(aircraft.manufacturerName, MANUFACTURER_NAME, "build fact was mutated");
    }

    /// @notice A tail number may be cleared, since re-registration is a real event.
    function test_Update_MayClearRegistrationMark() public {
        uint256 assetId = _registerAircraft(orgId, alice, alice, MSN);

        vm.prank(alice);
        aircraftRegistry.updateAircraft(assetId, "A320-214", TRANSPORT, bytes32(0));

        assertEq(aircraftRegistry.getAircraft(assetId).registrationMarkHash, bytes32(0), "mark not cleared");
    }

    /// @notice Only the owner may update, not the registrar organization.
    function test_RevertWhen_NonOwnerUpdates() public {
        uint256 assetId = _registerAircraft(orgId, alice, bob, MSN);

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.NotAssetOwner.selector, assetId, alice, bob));
        vm.prank(alice);
        aircraftRegistry.updateAircraft(assetId, "A321", TRANSPORT, bytes32(0));
    }

    /// @notice A terminal aircraft's data stops changing.
    function test_RevertWhen_UpdatingTerminalAircraft() public {
        uint256 assetId = _registerAircraft(orgId, alice, alice, MSN);
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.DESTROYED);

        vm.expectRevert(
            abi.encodeWithSelector(IAssetRegistry.AssetTerminal.selector, assetId, IAssetRegistry.AssetStatus.DESTROYED)
        );
        vm.prank(alice);
        aircraftRegistry.updateAircraft(assetId, "A321", TRANSPORT, bytes32(0));
    }

    /// @notice Updates are validated the same way registration is.
    function test_RevertWhen_UpdateInvalid() public {
        uint256 assetId = _registerAircraft(orgId, alice, alice, MSN);

        vm.expectRevert(ZeroHash.selector);
        vm.prank(alice);
        aircraftRegistry.updateAircraft(assetId, bytes32(0), TRANSPORT, bytes32(0));
    }

    /*//////////////////////////////////////////////////////////////
                            MINTER DELEGATION
    //////////////////////////////////////////////////////////////*/

    /// @notice The registry mints through `ASSET_MINTER_ROLE`, not as the caller.
    function test_RegistryHoldsMinterRole() public view {
        assertTrue(
            roleManager.hasRole(ProtocolRoles.ASSET_MINTER_ROLE, address(aircraftRegistry)),
            "registry lacks minter role"
        );
    }

    /// @notice Revoking the minter role stops registration entirely.
    /// @dev Confirms the delegation is the real authorization path, not decoration.
    function test_RevertWhen_MinterRoleRevoked() public {
        vm.prank(protocolAdmin);
        roleManager.revokeRole(ProtocolRoles.ASSET_MINTER_ROLE, address(aircraftRegistry));

        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("MissingRole(bytes32,address)")),
                ProtocolRoles.ASSET_MINTER_ROLE,
                address(aircraftRegistry)
            )
        );
        vm.prank(alice);
        aircraftRegistry.registerAircraft(_params());
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Reading an unknown aircraft reverts; `isAircraft` returns false.
    function testFuzz_UnknownAircraftReads(uint256 assetId) public {
        vm.assume(assetId != 0);

        assertFalse(aircraftRegistry.isAircraft(assetId), "phantom aircraft");

        vm.expectRevert(abi.encodeWithSelector(IAircraftRegistry.AircraftNotFound.selector, assetId));
        aircraftRegistry.getAircraft(assetId);
    }

    /// @notice A generic asset registered directly is not an aircraft record.
    /// @dev The two registries share an id space but not their data.
    function test_GenericAssetIsNotAircraft() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, IAssetRegistry.AssetKind.AIRCRAFT, keccak256("direct"));

        assertFalse(aircraftRegistry.isAircraft(assetId), "generic asset reported as aircraft");
    }

    /*//////////////////////////////////////////////////////////////
                                  PAUSE
    //////////////////////////////////////////////////////////////*/

    /// @notice Pausing blocks registration and updates.
    function test_Pause_BlocksWrites() public {
        uint256 assetId = _registerAircraft(orgId, alice, alice, MSN);

        vm.prank(pauser);
        aircraftRegistry.pause();

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(alice);
        aircraftRegistry.registerAircraft(_params());

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(alice);
        aircraftRegistry.updateAircraft(assetId, "A321", TRANSPORT, bytes32(0));
    }
}
