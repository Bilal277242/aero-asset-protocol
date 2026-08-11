// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAssetOwnership} from "../../../src/interfaces/IAssetOwnership.sol";
import {IAssetRegistry} from "../../../src/interfaces/IAssetRegistry.sol";
import {DeadlineInPast, MissingRole, UnexpectedCaller, ZeroAddress} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../../../src/libraries/ProtocolRoles.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";

/// @title AssetOwnershipTest
/// @author AeroAsset Protocol
/// @notice Coverage for the ownership ledger: two-step direct transfers, settlement
///         locks, and the settlement path that Phase 7's escrow will drive.
/// @dev `escrow` stands in for an `Escrow` clone holding `SETTLEMENT_ROLE`. Phase 7
///      replaces the stand-in with a real clone; the authorization surface under test
///      is identical.
contract AssetOwnershipTest is ProtocolTestBase {
    /// @dev Stand-in settlement contract holding `SETTLEMENT_ROLE`.
    address internal escrow;
    /// @dev A second settlement contract, used to prove locks are not fungible.
    address internal rogueEscrow;

    /// @dev Aircraft owned by `alice`.
    uint256 internal assetId;

    /// @dev Transfer-reason discriminators, mirroring the values the ledger emits.
    bytes32 internal constant REASON_DIRECT = "DIRECT";
    bytes32 internal constant REASON_SETTLEMENT = "SETTLEMENT";

    function setUp() public override {
        super.setUp();

        escrow = makeAddr("escrow");
        rogueEscrow = makeAddr("rogueEscrow");
        _grantSettlementRole(escrow);
        _grantSettlementRole(rogueEscrow);

        (, assetId) = _defaultAircraft();
    }

    /*//////////////////////////////////////////////////////////////
                             INITIALIZATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Only `AssetRegistry` may create ownership records.
    /// @dev Otherwise anyone could mint ownership of an id the registry never issued.
    function testFuzz_RevertWhen_UnauthorizedInitializeOwnership(address caller) public {
        vm.assume(caller != address(assetRegistry));

        vm.expectRevert(abi.encodeWithSelector(UnexpectedCaller.selector, address(assetRegistry), caller));
        vm.prank(caller);
        assetOwnership.initializeOwnership(999, caller);
    }

    /// @notice Only `AssetRegistry` may freeze transferability.
    /// @dev If anyone could freeze, anyone could permanently immobilize an aircraft.
    function testFuzz_RevertWhen_UnauthorizedFreeze(address caller) public {
        vm.assume(caller != address(assetRegistry));

        vm.expectRevert(abi.encodeWithSelector(UnexpectedCaller.selector, address(assetRegistry), caller));
        vm.prank(caller);
        assetOwnership.freezeTransfers(assetId);
    }

    /// @notice Freezing emits and is safely repeatable.
    function test_Freeze_IsIdempotent() public {
        vm.expectEmit(true, true, true, true, address(assetOwnership));
        emit IAssetOwnership.TransferFrozen(assetId);
        vm.prank(address(assetRegistry));
        assetOwnership.freezeTransfers(assetId);

        vm.prank(address(assetRegistry));
        assetOwnership.freezeTransfers(assetId);

        assertTrue(assetOwnership.getOwnership(assetId).transferFrozen, "not frozen");
        assertFalse(assetOwnership.isTransferable(assetId), "frozen asset transferable");
    }

    /// @notice An ownership record cannot be created twice for one id.
    function test_RevertWhen_InitializingTwice() public {
        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.OwnershipAlreadyInitialized.selector, assetId));
        vm.prank(address(assetRegistry));
        assetOwnership.initializeOwnership(assetId, bob);
    }

    /// @notice Reading an unknown asset reverts; `ownerOf` returns zero instead.
    function testFuzz_UnknownAssetReads(uint256 unknownId) public {
        vm.assume(unknownId != assetId);

        assertEq(assetOwnership.ownerOf(unknownId), address(0), "phantom owner");
        assertFalse(assetOwnership.isTransferable(unknownId), "phantom asset transferable");

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.OwnershipNotFound.selector, unknownId));
        assetOwnership.getOwnership(unknownId);
    }

    /*//////////////////////////////////////////////////////////////
                             DIRECT TRANSFER
    //////////////////////////////////////////////////////////////*/

    /// @notice Direct transfer requires both a proposal and an acceptance.
    function test_DirectTransfer_IsTwoStep() public {
        uint40 deadline = uint40(block.timestamp + 7 days);

        vm.expectEmit(true, true, true, true, address(assetOwnership));
        emit IAssetOwnership.OwnershipTransferStarted(assetId, alice, bob, deadline);
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, bob, deadline);

        // The proposal alone moves nothing.
        assertEq(assetOwnership.ownerOf(assetId), alice, "owner changed on proposal");
        assertEq(assetOwnership.getOwnership(assetId).pendingOwner, bob, "pending owner not recorded");

        vm.expectEmit(true, true, true, true, address(assetOwnership));
        emit IAssetOwnership.OwnershipTransferred(assetId, alice, bob, REASON_DIRECT);
        vm.prank(bob);
        assetOwnership.acceptTransfer(assetId);

        IAssetOwnership.OwnershipRecord memory record = assetOwnership.getOwnership(assetId);
        assertEq(record.owner, bob, "owner not transferred");
        assertEq(record.pendingOwner, address(0), "pending owner not cleared");
        assertEq(record.offerExpiresAt, 0, "deadline not cleared");
        assertEq(record.since, uint40(block.timestamp), "since not updated");
    }

    /// @notice Either party may cancel a pending transfer.
    function test_DirectTransfer_CancellableByEitherParty() public {
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, bob, 0);

        vm.expectEmit(true, true, true, true, address(assetOwnership));
        emit IAssetOwnership.OwnershipTransferCancelled(assetId, bob);
        vm.prank(bob);
        assetOwnership.cancelTransfer(assetId);
        assertEq(assetOwnership.getOwnership(assetId).pendingOwner, address(0), "not cancelled by recipient");

        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, bob, 0);
        vm.prank(alice);
        assetOwnership.cancelTransfer(assetId);
        assertEq(assetOwnership.getOwnership(assetId).pendingOwner, address(0), "not cancelled by owner");
    }

    /// @notice An expired transfer offer cannot be accepted.
    function test_RevertWhen_AcceptingExpiredOffer() public {
        uint40 deadline = uint40(block.timestamp + 1 days);
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, bob, deadline);

        vm.warp(block.timestamp + 1 days);

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.TransferOfferExpired.selector, assetId, deadline));
        vm.prank(bob);
        assetOwnership.acceptTransfer(assetId);
    }

    /// @notice A zero deadline means the offer does not expire.
    function test_DirectTransfer_ZeroDeadlineNeverExpires() public {
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, bob, 0);

        vm.warp(block.timestamp + 3650 days);
        vm.prank(bob);
        assetOwnership.acceptTransfer(assetId);

        assertEq(assetOwnership.ownerOf(assetId), bob, "open-ended offer expired");
    }

    /// @notice A proposal replaces any earlier one rather than accumulating.
    function test_DirectTransfer_ProposalIsReplaced() public {
        vm.startPrank(alice);
        assetOwnership.initiateTransfer(assetId, bob, 0);
        assetOwnership.initiateTransfer(assetId, carol, 0);
        vm.stopPrank();

        assertEq(assetOwnership.getOwnership(assetId).pendingOwner, carol, "proposal not replaced");

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.NotPendingOwner.selector, assetId, bob, carol));
        vm.prank(bob);
        assetOwnership.acceptTransfer(assetId);
    }

    /// @notice Only the owner may propose a transfer.
    function testFuzz_RevertWhen_NonOwnerInitiatesTransfer(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != alice);

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.NotAssetOwner.selector, assetId, caller, alice));
        vm.prank(caller);
        assetOwnership.initiateTransfer(assetId, caller, 0);
    }

    /// @notice Only the named recipient may accept.
    function test_RevertWhen_StrangerAccepts() public {
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, bob, 0);

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.NotPendingOwner.selector, assetId, attacker, bob));
        vm.prank(attacker);
        assetOwnership.acceptTransfer(assetId);
    }

    /// @notice A stranger cannot cancel someone else's pending transfer.
    function testFuzz_RevertWhen_StrangerCancelsTransfer(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != alice && caller != bob);
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, bob, 0);

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.NotAssetOwner.selector, assetId, caller, alice));
        vm.prank(caller);
        assetOwnership.cancelTransfer(assetId);
    }

    /// @notice Accepting or cancelling with no proposal reverts.
    function test_RevertWhen_NoPendingTransfer() public {
        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.NoPendingTransfer.selector, assetId));
        vm.prank(bob);
        assetOwnership.acceptTransfer(assetId);

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.NoPendingTransfer.selector, assetId));
        vm.prank(alice);
        assetOwnership.cancelTransfer(assetId);
    }

    /// @notice A transfer cannot target the zero address or the incumbent.
    function test_RevertWhen_TransferTargetInvalid() public {
        vm.expectRevert(ZeroAddress.selector);
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, address(0), 0);

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.TransferToCurrentOwner.selector, assetId));
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, alice, 0);
    }

    /// @notice A deadline in the past is rejected.
    function test_RevertWhen_TransferDeadlineInPast() public {
        uint40 past = uint40(block.timestamp - 1);

        vm.expectRevert(abi.encodeWithSelector(DeadlineInPast.selector, past, uint40(block.timestamp)));
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, bob, past);
    }

    /*//////////////////////////////////////////////////////////////
                              FROZEN ASSETS
    //////////////////////////////////////////////////////////////*/

    /// @notice A terminal asset cannot begin or complete a transfer.
    function test_RevertWhen_TransferringFrozenAsset() public {
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.DESTROYED);

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.AssetTransferFrozen.selector, assetId));
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, bob, 0);
    }

    /// @notice An in-flight offer cannot be accepted once the asset is frozen.
    /// @dev The freeze must beat a pending offer, or destroying an aircraft would not
    ///      actually stop it changing hands.
    function test_RevertWhen_AcceptingAfterFreeze() public {
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, bob, 0);

        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.RETIRED);

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.AssetTransferFrozen.selector, assetId));
        vm.prank(bob);
        assetOwnership.acceptTransfer(assetId);
    }

    /// @notice A frozen asset cannot be locked for settlement.
    function test_RevertWhen_LockingFrozenAsset() public {
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.DESTROYED);

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.AssetTransferFrozen.selector, assetId));
        vm.prank(escrow);
        assetOwnership.setTransferLock(assetId, true);
    }

    /*//////////////////////////////////////////////////////////////
                             SETTLEMENT LOCK
    //////////////////////////////////////////////////////////////*/

    /// @notice Locking records the holder and blocks direct transfers.
    /// @dev This is what stops a seller moving an aircraft out from under a buyer who
    ///      has already funded escrow. See `docs/threat-model.md` T-05.
    function test_Lock_BlocksDirectTransfer() public {
        vm.expectEmit(true, true, true, true, address(assetOwnership));
        emit IAssetOwnership.TransferLockChanged(assetId, escrow, escrow);
        vm.prank(escrow);
        assetOwnership.setTransferLock(assetId, true);

        assertEq(assetOwnership.lockHolderOf(assetId), escrow, "lock holder not recorded");
        assertFalse(assetOwnership.isTransferable(assetId), "locked asset reported transferable");

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.AssetTransferLocked.selector, assetId, escrow));
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, bob, 0);
    }

    /// @notice Locking clears any pending direct transfer.
    /// @dev Leaving an offer armed would let the seller's transfer fire the instant
    ///      settlement releases the lock.
    function test_Lock_ClearsPendingTransfer() public {
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, carol, 0);

        vm.prank(escrow);
        assetOwnership.setTransferLock(assetId, true);

        assertEq(assetOwnership.getOwnership(assetId).pendingOwner, address(0), "pending offer survived the lock");
    }

    /// @notice An asset cannot be locked twice.
    function test_RevertWhen_LockingAlreadyLockedAsset() public {
        vm.prank(escrow);
        assetOwnership.setTransferLock(assetId, true);

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.AssetAlreadyLocked.selector, assetId, escrow));
        vm.prank(rogueEscrow);
        assetOwnership.setTransferLock(assetId, true);
    }

    /// @notice Only the lock holder may release the lock.
    function test_RevertWhen_NonHolderReleasesLock() public {
        vm.prank(escrow);
        assetOwnership.setTransferLock(assetId, true);

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.NotLockHolder.selector, assetId, rogueEscrow, escrow));
        vm.prank(rogueEscrow);
        assetOwnership.setTransferLock(assetId, false);
    }

    /// @notice Releasing the lock restores transferability.
    function test_Lock_ReleaseRestoresTransferability() public {
        vm.startPrank(escrow);
        assetOwnership.setTransferLock(assetId, true);
        assetOwnership.setTransferLock(assetId, false);
        vm.stopPrank();

        assertEq(assetOwnership.lockHolderOf(assetId), address(0), "lock not released");
        assertTrue(assetOwnership.isTransferable(assetId), "asset still locked");

        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, bob, 0);
    }

    /// @notice Only `SETTLEMENT_ROLE` may lock.
    function testFuzz_RevertWhen_UnauthorizedLock(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != escrow && caller != rogueEscrow);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.SETTLEMENT_ROLE, caller));
        vm.prank(caller);
        assetOwnership.setTransferLock(assetId, true);
    }

    /*//////////////////////////////////////////////////////////////
                               SETTLEMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice Settlement moves the asset and releases the lock atomically.
    function test_Settle_MovesAssetAndReleasesLock() public {
        vm.startPrank(escrow);
        assetOwnership.setTransferLock(assetId, true);

        vm.expectEmit(true, true, true, true, address(assetOwnership));
        emit IAssetOwnership.OwnershipTransferred(assetId, alice, bob, REASON_SETTLEMENT);
        assetOwnership.settleTransfer(assetId, alice, bob);
        vm.stopPrank();

        assertEq(assetOwnership.ownerOf(assetId), bob, "asset not settled to buyer");
        assertEq(assetOwnership.lockHolderOf(assetId), address(0), "lock not released");
        assertTrue(assetOwnership.isTransferable(assetId), "asset still locked after settlement");
    }

    /// @notice Holding `SETTLEMENT_ROLE` is not sufficient to move an asset.
    /// @dev The core T-04 mitigation: a settlement contract may only settle an asset
    ///      it itself locked, so a rogue role holder cannot touch an unlocked or
    ///      someone else's locked asset.
    function test_RevertWhen_SettlingWithoutHoldingLock() public {
        // Unlocked asset — role alone must not be enough.
        vm.expectRevert(
            abi.encodeWithSelector(IAssetOwnership.NotLockHolder.selector, assetId, rogueEscrow, address(0))
        );
        vm.prank(rogueEscrow);
        assetOwnership.settleTransfer(assetId, alice, attacker);

        // Locked by someone else — still not enough.
        vm.prank(escrow);
        assetOwnership.setTransferLock(assetId, true);

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.NotLockHolder.selector, assetId, rogueEscrow, escrow));
        vm.prank(rogueEscrow);
        assetOwnership.settleTransfer(assetId, alice, attacker);

        assertEq(assetOwnership.ownerOf(assetId), alice, "asset moved despite failed settlement");
    }

    /// @notice Settlement fails if the named owner is no longer current.
    /// @dev Closes the "sell it twice" race (T-05): the escrow asserts who it believes
    ///      owns the asset, and a mismatch reverts rather than moving the wrong party's
    ///      property.
    function test_RevertWhen_SettlingWithStaleOwner() public {
        // Ownership changes before any lock is taken.
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, carol, 0);
        vm.prank(carol);
        assetOwnership.acceptTransfer(assetId);

        vm.startPrank(escrow);
        assetOwnership.setTransferLock(assetId, true);

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.UnexpectedOwner.selector, assetId, alice, carol));
        assetOwnership.settleTransfer(assetId, alice, bob);
        vm.stopPrank();

        assertEq(assetOwnership.ownerOf(assetId), carol, "asset moved despite stale owner");
    }

    /// @notice An owner cannot freeze an asset out from under a live settlement.
    /// @dev Audit AAP-02. Previously the owner could destroy an aircraft mid-trade,
    ///      permanently freezing it and leaving the funded buyer to wait out the
    ///      settlement window for a refund. The freeze is now refused while a lock is
    ///      held, so the settlement it would have blocked still completes.
    function test_RevertWhen_FreezingLockedAsset() public {
        vm.prank(escrow);
        assetOwnership.setTransferLock(assetId, true);

        vm.expectRevert(abi.encodeWithSelector(IAssetRegistry.AssetLockedBySettlement.selector, assetId, escrow));
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.DESTROYED);

        // The trade the freeze would have stranded settles normally.
        vm.prank(escrow);
        assetOwnership.settleTransfer(assetId, alice, bob);
        assertEq(assetOwnership.ownerOf(assetId), bob, "settlement did not complete");
    }

    /// @notice Lock and freeze are mutually exclusive in both directions.
    /// @dev The other half of AAP-02. `test_RevertWhen_LockingFrozenAsset` already
    ///      covers freeze-then-lock; together with the test above, no escrow can ever
    ///      hold a lock on an asset that has become unsettleable.
    function test_LockAndFreezeAreMutuallyExclusive() public {
        vm.prank(escrow);
        assetOwnership.setTransferLock(assetId, true);
        assertFalse(assetOwnership.getOwnership(assetId).transferFrozen, "locked asset is frozen");

        vm.prank(escrow);
        assetOwnership.setTransferLock(assetId, false);

        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.DESTROYED);
        assertEq(assetOwnership.lockHolderOf(assetId), address(0), "frozen asset is locked");
    }

    /// @notice Settlement rejects a zero or no-op recipient.
    function test_RevertWhen_SettlementTargetInvalid() public {
        vm.startPrank(escrow);
        assetOwnership.setTransferLock(assetId, true);

        vm.expectRevert(ZeroAddress.selector);
        assetOwnership.settleTransfer(assetId, alice, address(0));

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.TransferToCurrentOwner.selector, assetId));
        assetOwnership.settleTransfer(assetId, alice, alice);
        vm.stopPrank();
    }

    /// @notice Only `SETTLEMENT_ROLE` may settle.
    function testFuzz_RevertWhen_UnauthorizedSettle(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != escrow && caller != rogueEscrow);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.SETTLEMENT_ROLE, caller));
        vm.prank(caller);
        assetOwnership.settleTransfer(assetId, alice, caller);
    }

    /// @notice Revoking `SETTLEMENT_ROLE` immediately disarms a live escrow.
    /// @dev Phase 7 revokes the role when an escrow reaches a terminal state; this
    ///      proves the revocation is effective even while the escrow holds a lock.
    function test_RoleRevocationDisarmsLockHolder() public {
        vm.prank(escrow);
        assetOwnership.setTransferLock(assetId, true);

        vm.prank(protocolAdmin);
        roleManager.revokeRole(ProtocolRoles.SETTLEMENT_ROLE, escrow);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.SETTLEMENT_ROLE, escrow));
        vm.prank(escrow);
        assetOwnership.settleTransfer(assetId, alice, bob);
    }

    /*//////////////////////////////////////////////////////////////
                                  PAUSE
    //////////////////////////////////////////////////////////////*/

    /// @notice Pausing blocks transfers and settlement.
    function test_Pause_BlocksTransfers() public {
        vm.prank(pauser);
        assetOwnership.pause();

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, bob, 0);

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(escrow);
        assetOwnership.settleTransfer(assetId, alice, bob);
    }

    /// @notice Lock release stays available while paused.
    /// @dev Otherwise a pause would strand an asset under a cancelled escrow's lock.
    function test_Pause_AllowsLockRelease() public {
        vm.prank(escrow);
        assetOwnership.setTransferLock(assetId, true);

        vm.prank(pauser);
        assetOwnership.pause();

        vm.prank(escrow);
        assetOwnership.setTransferLock(assetId, false);
        assertEq(assetOwnership.lockHolderOf(assetId), address(0), "lock release blocked while paused");
    }

    /*//////////////////////////////////////////////////////////////
                             OWNERSHIP FUZZ
    //////////////////////////////////////////////////////////////*/

    /// @notice Every asset always has exactly one non-zero owner. INV-OWN-01.
    function testFuzz_OwnerIsAlwaysNonZero(address to) public {
        _assumeSafeRecipient(to);
        vm.assume(to != alice);

        assertTrue(assetOwnership.ownerOf(assetId) != address(0), "owner zero at rest");

        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, to, 0);
        assertTrue(assetOwnership.ownerOf(assetId) != address(0), "owner zero mid-transfer");

        vm.prank(to);
        assetOwnership.acceptTransfer(assetId);
        assertEq(assetOwnership.ownerOf(assetId), to, "owner not updated");
    }

    /// @notice `ownerOf` and `requireOwner` never disagree.
    function testFuzz_OwnerAccessorsAgree(address account) public {
        if (assetOwnership.ownerOf(assetId) == account) {
            assetOwnership.requireOwner(assetId, account);
        } else {
            vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.NotAssetOwner.selector, assetId, account, alice));
            assetOwnership.requireOwner(assetId, account);
        }
    }
}
