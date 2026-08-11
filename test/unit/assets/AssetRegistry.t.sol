// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAssetRegistry} from "../../../src/interfaces/IAssetRegistry.sol";
import {IOrganizationRegistry} from "../../../src/interfaces/IOrganizationRegistry.sol";
import {ZeroAddress} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../../../src/libraries/ProtocolRoles.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";

/// @title AssetRegistryTest
/// @author AeroAsset Protocol
/// @notice Functional, lifecycle, verification, event, negative and fuzz coverage for
///         {AssetRegistry}.
contract AssetRegistryTest is ProtocolTestBase {
    IAssetRegistry.AssetKind internal constant AIRCRAFT = IAssetRegistry.AssetKind.AIRCRAFT;
    IAssetRegistry.AssetKind internal constant ENGINE = IAssetRegistry.AssetKind.ENGINE;

    bytes32 internal constant SERIAL = keccak256("MSN-12345");
    bytes32 internal constant META = keccak256("asset-meta");

    /// @dev Verified organization administered by `alice`.
    uint256 internal orgId;

    function setUp() public override {
        super.setUp();
        orgId = _defaultVerifiedOrg();
    }

    /*//////////////////////////////////////////////////////////////
                              REGISTRATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Registration mints a dense id, lands in `REGISTERED`, and creates
    ///         ownership atomically.
    function test_Register_CreatesAssetAndOwnership() public {
        vm.expectEmit(true, true, true, true, address(assetRegistry));
        emit IAssetRegistry.AssetRegistered(1, orgId, alice, AIRCRAFT, SERIAL);

        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);

        assertEq(assetId, 1, "ids do not start at 1");
        assertEq(assetRegistry.assetCount(), 1, "count not incremented");

        IAssetRegistry.Asset memory asset = assetRegistry.getAsset(assetId);
        assertEq(asset.registrarOrgId, orgId, "wrong registrar");
        assertEq(asset.verifierOrgId, 0, "verifier set at registration");
        assertEq(asset.registeredAt, uint40(block.timestamp), "wrong registeredAt");
        assertEq(uint8(asset.kind), uint8(AIRCRAFT), "wrong kind");
        assertEq(uint8(asset.status), uint8(IAssetRegistry.AssetStatus.REGISTERED), "not REGISTERED");
        assertEq(asset.serialNumberHash, SERIAL, "wrong serial hash");
        assertEq(asset.metadataHash, META, "wrong metadata hash");

        // Ownership exists in the very same transaction — INV-OWN-01 has no window.
        assertEq(assetOwnership.ownerOf(assetId), alice, "ownership not initialized");
        assertTrue(assetOwnership.isTransferable(assetId), "asset not transferable");
    }

    /// @notice Registration never verifies. Roadmap §7 / INV-ASSET-03.
    /// @dev The single most important property of this registry: a registered asset
    ///      must not be mistakable for a verified one.
    function testFuzz_Register_NeverVerifies(bytes32 serialHash, uint8 rawKind) public {
        vm.assume(serialHash != bytes32(0));
        IAssetRegistry.AssetKind kind = IAssetRegistry.AssetKind(bound(rawKind, 1, 6));

        uint256 assetId = _registerAsset(orgId, alice, alice, kind, serialHash);

        assertEq(assetRegistry.getAsset(assetId).verifiedAt, 0, "registration verified the asset");
        assertFalse(assetRegistry.isVerified(assetId), "registration reported as verified");
    }

    /// @notice Ids are dense and monotonic across the global id space.
    function test_Register_IdsAreDenseAndMonotonic() public {
        for (uint256 i = 1; i <= 4; ++i) {
            assertEq(
                _registerAsset(orgId, alice, alice, ENGINE, keccak256(abi.encode("esn", i))), i, "id not monotonic"
            );
        }
        assertEq(assetRegistry.assetCount(), 4, "wrong count");
    }

    /// @notice A serial-number commitment can only be claimed once.
    function test_RevertWhen_SerialNumberTaken() public {
        uint256 first = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);

        vm.expectRevert(abi.encodeWithSelector(IAssetRegistry.SerialNumberTaken.selector, SERIAL, first));
        _registerAsset(orgId, alice, alice, ENGINE, SERIAL);
    }

    /// @notice A zero serial hash means "no serial recorded" and is not deduplicated.
    /// @dev Parts and equipment legitimately lack a serial; indexing zero would make
    ///      every such asset collide with every other.
    function test_Register_ZeroSerialIsNotIndexed() public {
        uint256 a = _registerAsset(orgId, alice, alice, IAssetRegistry.AssetKind.PART, bytes32(0));
        uint256 b = _registerAsset(orgId, alice, alice, IAssetRegistry.AssetKind.PART, bytes32(0));

        assertTrue(a != b, "ids collided");
        assertEq(assetRegistry.assetIdBySerialHash(bytes32(0)), 0, "zero serial was indexed");
    }

    /// @notice The serial index and the stored record always agree.
    function test_SerialIndexMatchesRecord() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);

        assertEq(assetRegistry.assetIdBySerialHash(SERIAL), assetId, "index mismatch");
        assertEq(assetRegistry.getAsset(assetId).serialNumberHash, SERIAL, "record mismatch");
    }

    /// @notice The `UNSPECIFIED` sentinel is rejected as an asset kind.
    function test_RevertWhen_KindUnspecified() public {
        vm.expectRevert(
            abi.encodeWithSelector(IAssetRegistry.UnspecifiedAssetKind.selector, IAssetRegistry.AssetKind.UNSPECIFIED)
        );
        _registerAsset(orgId, alice, alice, IAssetRegistry.AssetKind.UNSPECIFIED, SERIAL);
    }

    /// @notice The zero address cannot own an asset.
    function test_RevertWhen_OwnerIsZero() public {
        vm.expectRevert(ZeroAddress.selector);
        _registerAsset(orgId, alice, address(0), AIRCRAFT, SERIAL);
    }

    /// @notice Only an address acting for a verified organization may register.
    function test_RevertWhen_RegistrarNotVerified() public {
        uint256 pendingOrg = _registerOrg(bob, keccak256("Pending"), IOrganizationRegistry.OrganizationType.LESSOR);

        vm.expectRevert(
            abi.encodeWithSelector(
                IOrganizationRegistry.OrganizationNotVerified.selector,
                pendingOrg,
                IOrganizationRegistry.OrganizationStatus.PENDING
            )
        );
        _registerAsset(pendingOrg, bob, bob, AIRCRAFT, SERIAL);
    }

    /// @notice A stranger cannot register under someone else's organization.
    function testFuzz_RevertWhen_RegistrarNotActingForOrg(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != alice);

        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.NotActingForOrganization.selector, orgId, caller));
        _registerAsset(orgId, caller, caller, AIRCRAFT, SERIAL);
    }

    /// @notice An organization operator may register on the organization's behalf.
    function test_Register_ByOperator() public {
        vm.prank(alice);
        orgRegistry.setOperator(orgId, carol, true);

        uint256 assetId = _registerAsset(orgId, carol, bob, AIRCRAFT, SERIAL);

        assertEq(assetOwnership.ownerOf(assetId), bob, "owner not applied");
        assertEq(assetRegistry.getAsset(assetId).registrarOrgId, orgId, "registrar not recorded");
    }

    /*//////////////////////////////////////////////////////////////
                          DELEGATED REGISTRATION
    //////////////////////////////////////////////////////////////*/

    /// @notice `registerAssetFor` is closed until a specialization registry holds the role.
    /// @dev Phase 4 grants `ASSET_MINTER_ROLE` to `AircraftRegistry` and
    ///      `ComponentRegistry`; until then nothing can reach this path.
    function testFuzz_RevertWhen_UnauthorizedRegisterAssetFor(address caller) public {
        _assumeUnprivileged(caller);

        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("MissingRole(bytes32,address)")), ProtocolRoles.ASSET_MINTER_ROLE, caller
            )
        );
        vm.prank(caller);
        assetRegistry.registerAssetFor(orgId, caller, AIRCRAFT, SERIAL, META, "");
    }

    /// @notice A minter can register on behalf of a verified organization.
    function test_RegisterAssetFor_ByMinter() public {
        vm.prank(protocolAdmin);
        roleManager.grantRole(ProtocolRoles.ASSET_MINTER_ROLE, carol);

        vm.prank(carol);
        uint256 assetId = assetRegistry.registerAssetFor(orgId, bob, AIRCRAFT, SERIAL, META, "ipfs://x");

        assertEq(assetOwnership.ownerOf(assetId), bob, "owner not applied");
        assertEq(assetRegistry.getAsset(assetId).verifiedAt, 0, "delegated registration verified the asset");
    }

    /// @notice A minter still cannot register for an unverified organization.
    /// @dev Defence in depth against a specialization registry upgraded incorrectly.
    function test_RevertWhen_MinterRegistersForUnverifiedOrg() public {
        vm.prank(protocolAdmin);
        roleManager.grantRole(ProtocolRoles.ASSET_MINTER_ROLE, carol);
        uint256 pendingOrg = _registerOrg(bob, keccak256("Pending"), IOrganizationRegistry.OrganizationType.LESSOR);

        vm.expectRevert(
            abi.encodeWithSelector(
                IOrganizationRegistry.OrganizationNotVerified.selector,
                pendingOrg,
                IOrganizationRegistry.OrganizationStatus.PENDING
            )
        );
        vm.prank(carol);
        assetRegistry.registerAssetFor(pendingOrg, bob, AIRCRAFT, SERIAL, META, "");
    }

    /*//////////////////////////////////////////////////////////////
                               VERIFICATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Verification is an orthogonal axis recorded as a timestamp.
    function test_Verify_RecordsTimestampAndVerifier() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);

        vm.expectEmit(true, true, true, true, address(assetRegistry));
        emit IAssetRegistry.AssetVerificationChanged(assetId, orgId, true, orgVerifier);
        vm.prank(orgVerifier);
        assetRegistry.verifyAsset(assetId, orgId);

        IAssetRegistry.Asset memory asset = assetRegistry.getAsset(assetId);
        assertEq(asset.verifiedAt, uint40(block.timestamp), "verifiedAt not recorded");
        assertEq(asset.verifierOrgId, orgId, "verifier not recorded");
        assertTrue(assetRegistry.isVerified(assetId), "not reported verified");
        // Status is untouched: verification is not a status.
        assertEq(uint8(asset.status), uint8(IAssetRegistry.AssetStatus.REGISTERED), "status changed");
    }

    /// @notice Verification may be credited to the protocol rather than an organization.
    function test_Verify_WithZeroVerifierOrg() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);

        vm.prank(orgVerifier);
        assetRegistry.verifyAsset(assetId, 0);

        assertTrue(assetRegistry.isVerified(assetId), "not verified");
        assertEq(assetRegistry.getAsset(assetId).verifierOrgId, 0, "verifier should be unset");
    }

    /// @notice Double verification is rejected.
    function test_RevertWhen_VerifyingTwice() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);
        vm.prank(orgVerifier);
        assetRegistry.verifyAsset(assetId, 0);

        vm.expectRevert(abi.encodeWithSelector(IAssetRegistry.AssetAlreadyVerified.selector, assetId));
        vm.prank(orgVerifier);
        assetRegistry.verifyAsset(assetId, 0);
    }

    /// @notice Verification can be withdrawn and re-applied.
    function test_Unverify_ThenReverify() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);
        vm.startPrank(orgVerifier);
        assetRegistry.verifyAsset(assetId, orgId);

        vm.expectEmit(true, true, true, true, address(assetRegistry));
        emit IAssetRegistry.AssetVerificationChanged(assetId, orgId, false, orgVerifier);
        assetRegistry.unverifyAsset(assetId);
        assertFalse(assetRegistry.isVerified(assetId), "still verified");
        assertEq(assetRegistry.getAsset(assetId).verifierOrgId, 0, "verifier not cleared");

        assetRegistry.verifyAsset(assetId, orgId);
        vm.stopPrank();
        assertTrue(assetRegistry.isVerified(assetId), "re-verification failed");
    }

    /// @notice Withdrawing verification from an unverified asset reverts.
    function test_RevertWhen_UnverifyingUnverifiedAsset() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);

        vm.expectRevert(abi.encodeWithSelector(IAssetRegistry.AssetNotVerified.selector, assetId));
        vm.prank(orgVerifier);
        assetRegistry.unverifyAsset(assetId);
    }

    /// @notice A terminal asset cannot be verified.
    function test_RevertWhen_VerifyingTerminalAsset() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.DESTROYED);

        vm.expectRevert(
            abi.encodeWithSelector(IAssetRegistry.AssetTerminal.selector, assetId, IAssetRegistry.AssetStatus.DESTROYED)
        );
        vm.prank(orgVerifier);
        assetRegistry.verifyAsset(assetId, 0);
    }

    /// @notice The crediting organization must itself be verified.
    function test_RevertWhen_VerifierOrgNotVerified() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);
        uint256 pendingOrg = _registerOrg(bob, keccak256("Pending"), IOrganizationRegistry.OrganizationType.INSPECTOR);

        vm.expectRevert(
            abi.encodeWithSelector(
                IOrganizationRegistry.OrganizationNotVerified.selector,
                pendingOrg,
                IOrganizationRegistry.OrganizationStatus.PENDING
            )
        );
        vm.prank(orgVerifier);
        assetRegistry.verifyAsset(assetId, pendingOrg);
    }

    /*//////////////////////////////////////////////////////////////
                                 STATUS
    //////////////////////////////////////////////////////////////*/

    /// @notice The owner can move an asset between operational statuses.
    function test_SetStatus_OperationalTransitions() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);

        vm.expectEmit(true, true, true, true, address(assetRegistry));
        emit IAssetRegistry.AssetStatusChanged(
            assetId, IAssetRegistry.AssetStatus.REGISTERED, IAssetRegistry.AssetStatus.IN_SERVICE
        );
        vm.startPrank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.IN_SERVICE);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.UNDER_MAINTENANCE);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.STORED);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.REGISTERED);
        vm.stopPrank();

        assertEq(
            uint8(assetRegistry.getAsset(assetId).status),
            uint8(IAssetRegistry.AssetStatus.REGISTERED),
            "status round-trip failed"
        );
        assertTrue(assetOwnership.isTransferable(assetId), "operational asset frozen");
    }

    /// @notice Entering a terminal status freezes transferability atomically.
    /// @dev The freeze is mirrored into `AssetOwnership` in the same transaction, so
    ///      the two modules can never disagree about whether an asset can move.
    function test_SetStatus_TerminalFreezesOwnership() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);

        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.RETIRED);

        assertTrue(assetRegistry.isTerminal(assetId), "not terminal");
        assertFalse(assetOwnership.isTransferable(assetId), "terminal asset still transferable");
        assertTrue(assetOwnership.getOwnership(assetId).transferFrozen, "freeze not mirrored");
    }

    /// @notice Terminal statuses are absorbing.
    function test_RevertWhen_LeavingTerminalStatus() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.DESTROYED);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAssetRegistry.InvalidAssetTransition.selector,
                IAssetRegistry.AssetStatus.DESTROYED,
                IAssetRegistry.AssetStatus.IN_SERVICE
            )
        );
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.IN_SERVICE);
    }

    /// @notice A no-op transition is rejected rather than emitting a misleading event.
    function test_RevertWhen_TransitionToSameStatus() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAssetRegistry.InvalidAssetTransition.selector,
                IAssetRegistry.AssetStatus.REGISTERED,
                IAssetRegistry.AssetStatus.REGISTERED
            )
        );
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.REGISTERED);
    }

    /// @notice Only the owner may change status — not the registrar organization.
    function test_RevertWhen_NonOwnerSetsStatus() public {
        uint256 assetId = _registerAsset(orgId, alice, bob, AIRCRAFT, SERIAL);

        vm.expectRevert(
            abi.encodeWithSelector(bytes4(keccak256("NotAssetOwner(uint256,address,address)")), assetId, alice, bob)
        );
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.IN_SERVICE);
    }

    /// @notice The transition table matches `docs/state-machines.md` §3 exactly.
    /// @dev `RETIRED` is reversible into any operational status but must not reach
    ///      `DESTROYED` directly; `DESTROYED` is absorbing for every owner-initiated
    ///      transition. Correcting an erroneous `DESTROYED` is `recoverTerminalAsset`,
    ///      which is timelocked and bypasses this table.
    function test_TransitionTable_MatchesSpecification() public view {
        uint8 destroyed = uint8(IAssetRegistry.AssetStatus.DESTROYED);
        uint8 registered = uint8(IAssetRegistry.AssetStatus.REGISTERED);
        uint8 retired = uint8(IAssetRegistry.AssetStatus.RETIRED);

        for (uint8 from; from <= destroyed; ++from) {
            for (uint8 to; to <= destroyed; ++to) {
                bool fromOperational = from >= registered && from < retired;
                bool toValid = to != 0;

                bool expected;
                if (fromOperational) {
                    expected = toValid && from != to;
                } else if (from == retired) {
                    expected = toValid && to != retired && to != destroyed;
                }

                assertEq(
                    assetRegistry.isValidTransition(IAssetRegistry.AssetStatus(from), IAssetRegistry.AssetStatus(to)),
                    expected,
                    "transition table drifted from specification"
                );
            }
        }
    }

    /*//////////////////////////////////////////////////////////////
                                METADATA
    //////////////////////////////////////////////////////////////*/

    /// @notice The owner can update metadata.
    function test_UpdateMetadata_ByOwner() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);
        bytes32 newHash = keccak256("meta-v2");

        vm.expectEmit(true, true, true, true, address(assetRegistry));
        emit IAssetRegistry.AssetMetadataUpdated(assetId, newHash, "ipfs://v2");
        vm.prank(alice);
        assetRegistry.updateAssetMetadata(assetId, newHash, "ipfs://v2");

        assertEq(assetRegistry.getAsset(assetId).metadataHash, newHash, "hash not updated");
        assertEq(assetRegistry.metadataURI(assetId), "ipfs://v2", "uri not updated");
    }

    /// @notice The registrar organization retains metadata write access.
    /// @dev So it can correct its own submissions for an asset it registered for a
    ///      third party.
    function test_UpdateMetadata_ByRegistrarOrg() public {
        uint256 assetId = _registerAsset(orgId, alice, bob, AIRCRAFT, SERIAL);

        vm.prank(alice);
        assetRegistry.updateAssetMetadata(assetId, keccak256("corrected"), "ipfs://corrected");

        assertEq(assetRegistry.getAsset(assetId).metadataHash, keccak256("corrected"), "hash not updated");
    }

    /// @notice A stranger cannot update metadata.
    function testFuzz_RevertWhen_StrangerUpdatesMetadata(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != alice);
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);

        vm.expectRevert(abi.encodeWithSelector(IAssetRegistry.NotAssetController.selector, assetId, caller));
        vm.prank(caller);
        assetRegistry.updateAssetMetadata(assetId, keccak256("x"), "");
    }

    /// @notice A terminal asset's metadata stops changing.
    function test_RevertWhen_UpdatingTerminalAssetMetadata() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.RETIRED);

        vm.expectRevert(
            abi.encodeWithSelector(IAssetRegistry.AssetTerminal.selector, assetId, IAssetRegistry.AssetStatus.RETIRED)
        );
        vm.prank(alice);
        assetRegistry.updateAssetMetadata(assetId, keccak256("x"), "");
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Reading an unregistered id reverts rather than returning a zero struct.
    function testFuzz_RevertWhen_GettingUnknownAsset(uint256 assetId) public {
        vm.assume(assetId != 0);
        vm.expectRevert(abi.encodeWithSelector(IAssetRegistry.AssetNotFound.selector, assetId));
        assetRegistry.getAsset(assetId);
    }

    /// @notice `requireKind` gates the specialization registries.
    function test_RequireKind() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);

        assetRegistry.requireKind(assetId, AIRCRAFT);

        vm.expectRevert(abi.encodeWithSelector(IAssetRegistry.InvalidAssetKind.selector, assetId, ENGINE, AIRCRAFT));
        assetRegistry.requireKind(assetId, ENGINE);
    }

    /// @notice `exists` is false for unknown ids and true for registered ones.
    function test_Exists() public {
        assertFalse(assetRegistry.exists(1), "phantom asset");
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);
        assertTrue(assetRegistry.exists(assetId), "registered asset missing");
        assertFalse(assetRegistry.exists(assetId + 1), "phantom asset beyond count");
    }

    /*//////////////////////////////////////////////////////////////
                                  PAUSE
    //////////////////////////////////////////////////////////////*/

    /// @notice Pausing blocks registration, status changes and verification.
    function test_Pause_BlocksWrites() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);

        vm.prank(pauser);
        assetRegistry.pause();

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        _registerAsset(orgId, alice, alice, ENGINE, keccak256("ESN-1"));

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.IN_SERVICE);

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(orgVerifier);
        assetRegistry.verifyAsset(assetId, 0);
    }

    /// @notice Withdrawing verification stays available while paused.
    /// @dev It strictly reduces the claims attached to an asset.
    function test_Pause_AllowsUnverify() public {
        uint256 assetId = _registerAsset(orgId, alice, alice, AIRCRAFT, SERIAL);
        vm.prank(orgVerifier);
        assetRegistry.verifyAsset(assetId, 0);

        vm.prank(pauser);
        assetRegistry.pause();

        vm.prank(orgVerifier);
        assetRegistry.unverifyAsset(assetId);
        assertFalse(assetRegistry.isVerified(assetId), "unverify blocked while paused");
    }
}
