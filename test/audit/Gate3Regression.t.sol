// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAssetRegistry} from "../../src/interfaces/IAssetRegistry.sol";
import {IComponentRegistry} from "../../src/interfaces/IComponentRegistry.sol";
import {IEscrow} from "../../src/interfaces/IEscrow.sol";
import {ProtocolTestBase} from "../utils/ProtocolTestBase.sol";
import {Vm} from "forge-std/Vm.sol";

/// @title Gate3Regression
/// @author AeroAsset Protocol
/// @notice Regression tests for the Gate 3 audit remediations.
/// @dev Gate 3 is housekeeping, and most of it is not testable: AAP-16, AAP-19 and
///      AAP-21 correct or state documentation, which no assertion can pin down. This
///      suite covers the two items that changed observable behaviour (AAP-23 event
///      ordering) and the one where a gas fix risked changing an API contract (AAP-22),
///      plus a boundary check that removing the dead `expiresAt == 0` branches (AAP-20)
///      did not shift expiry semantics.
///
///      Four tests rather than six is deliberate. Padding this file with assertions
///      about comment text would make the suite look more thorough than it is.
contract Gate3Regression is ProtocolTestBase {
    uint128 internal constant PRICE = 1_000_000e6;

    bytes32 internal constant OWNERSHIP_TRANSFERRED =
        keccak256("OwnershipTransferred(uint256,address,address,bytes32)");
    bytes32 internal constant TRANSFER_LOCK_CHANGED = keccak256("TransferLockChanged(uint256,address,address)");
    bytes32 internal constant DISPUTE_RESOLVED = keccak256("DisputeResolved(uint256,address,bool)");
    bytes32 internal constant ESCROW_STATUS_CHANGED = keccak256("EscrowStatusChanged(uint256,uint8,uint8)");

    /// @dev Index of the first log with `topic0`, or `type(uint256).max` if absent.
    function _indexOf(Vm.Log[] memory logs, bytes32 topic0) internal pure returns (uint256) {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics.length != 0 && logs[i].topics[0] == topic0) {
                return i;
            }
        }
        return type(uint256).max;
    }

    /*//////////////////////////////////////////////////////////////
                       AAP-23 — CAUSAL EVENT ORDER
    //////////////////////////////////////////////////////////////*/

    /// @notice Settlement releases the lock in the log before it moves ownership.
    /// @dev Previously reversed, so replaying logs in order reported a transfer while
    ///      the asset was still locked — a state that never existed on-chain.
    function test_AAP23_LockReleasePrecedesTransferInLogs() public {
        (uint256 assetId,, address escrowAddr) = _openTrade(PRICE);
        IEscrow escrow = IEscrow(escrowAddr);

        _fundBuyer(bob, escrowAddr, PRICE);
        vm.prank(bob);
        escrow.fund();

        vm.recordLogs();
        vm.prank(bob);
        escrow.release();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        uint256 unlockAt = _indexOf(logs, TRANSFER_LOCK_CHANGED);
        uint256 transferAt = _indexOf(logs, OWNERSHIP_TRANSFERRED);

        assertTrue(unlockAt != type(uint256).max, "no TransferLockChanged emitted");
        assertTrue(transferAt != type(uint256).max, "no OwnershipTransferred emitted");
        assertLt(unlockAt, transferAt, "transfer logged before the unlock that preceded it");

        // The settlement itself still works.
        assertEq(assetOwnership.ownerOf(assetId), bob, "asset not delivered");
    }

    /// @notice An arbitrator's ruling is logged after the settlement it authorized.
    function test_AAP23_DisputeResolvedFollowsItsSettlement() public {
        (,, address escrowAddr) = _openTrade(PRICE);
        IEscrow escrow = IEscrow(escrowAddr);

        _fundBuyer(bob, escrowAddr, PRICE);
        vm.prank(bob);
        escrow.fund();
        vm.prank(alice);
        escrow.raiseDispute();

        vm.recordLogs();
        vm.prank(arbitrator);
        escrow.resolveDispute(true);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        uint256 statusAt = _indexOf(logs, ESCROW_STATUS_CHANGED);
        uint256 resolvedAt = _indexOf(logs, DISPUTE_RESOLVED);

        assertTrue(statusAt != type(uint256).max, "no EscrowStatusChanged emitted");
        assertTrue(resolvedAt != type(uint256).max, "no DisputeResolved emitted");
        assertLt(statusAt, resolvedAt, "outcome announced before the state change producing it");
    }

    /*//////////////////////////////////////////////////////////////
                AAP-22 — GAS FIX PRESERVED THE ERROR CONTRACT
    //////////////////////////////////////////////////////////////*/

    /// @notice An unregistered parent still reverts `ParentNotAircraft`.
    /// @dev Coalescing four cross-contract reads into two (audit AAP-22) tempted a
    ///      shortcut: dropping the `exists` probe and letting `getAsset` revert. That
    ///      would have changed the error to `AssetNotFound`. Callers depend on the
    ///      original, so the probe stayed — this pins that decision.
    function test_AAP22_UnknownParentStillRevertsParentNotAircraft() public {
        (uint256 orgId,) = _defaultAircraft();
        uint256 engineId =
            _registerComponent(orgId, alice, alice, IComponentRegistry.ComponentKind.ENGINE, keccak256("ESN-G3"));

        uint256 unregistered = 999_999;

        vm.expectRevert(abi.encodeWithSelector(IComponentRegistry.ParentNotAircraft.selector, unregistered));
        vm.prank(alice);
        componentRegistry.installComponent(engineId, unregistered, 1);
    }

    /// @notice A terminal parent still reverts `AssetTerminal` with its real status.
    /// @dev The revert argument used to come from a second `getAsset` call; it now
    ///      comes from the struct already in memory, and must still be the true status.
    function test_AAP22_TerminalParentRevertsWithItsStatus() public {
        (uint256 orgId, uint256 aircraftId) = _defaultAircraft();
        uint256 engineId =
            _registerComponent(orgId, alice, alice, IComponentRegistry.ComponentKind.ENGINE, keccak256("ESN-G4"));

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

    /*//////////////////////////////////////////////////////////////
              AAP-20 — REMOVING DEAD BRANCHES CHANGED NOTHING
    //////////////////////////////////////////////////////////////*/

    /// @notice Expiry is exact at the boundary for both listings and offers.
    /// @dev The removed `expiresAt == 0` disjuncts were unreachable, so semantics must
    ///      be unchanged: active strictly before the deadline, expired at it and after.
    function test_AAP20_ExpiryBoundaryIsUnchanged() public {
        (,, uint256 listingId) = _listedAircraft(PRICE);

        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 7 days));

        uint40 offerExpiry = marketplace.getOffer(offerId).expiresAt;
        uint40 listingExpiry = marketplace.getListing(listingId).expiresAt;

        // One second before: both live.
        vm.warp(uint256(offerExpiry) - 1);
        assertTrue(marketplace.isOfferActive(offerId), "offer dead before its deadline");
        assertTrue(marketplace.isListingActive(listingId), "listing dead before its deadline");

        // Exactly at the deadline: the offer has lapsed.
        vm.warp(offerExpiry);
        assertFalse(marketplace.isOfferActive(offerId), "offer live at its deadline");
        marketplace.expireOffer(offerId);

        // And the listing lapses at its own, later deadline.
        vm.warp(uint256(listingExpiry) - 1);
        assertTrue(marketplace.isListingActive(listingId), "listing dead before its deadline");
        vm.warp(listingExpiry);
        assertFalse(marketplace.isListingActive(listingId), "listing live at its deadline");
        marketplace.expireListing(listingId);
    }
}
