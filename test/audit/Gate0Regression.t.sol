// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAssetOwnership} from "../../src/interfaces/IAssetOwnership.sol";
import {IAssetRegistry} from "../../src/interfaces/IAssetRegistry.sol";
import {IEscrow} from "../../src/interfaces/IEscrow.sol";
import {ProtocolRoles} from "../../src/libraries/ProtocolRoles.sol";
import {ProtocolTestBase} from "../utils/ProtocolTestBase.sol";
import {BlacklistingToken} from "../utils/mocks/MaliciousTokens.sol";

/// @title Gate0Regression
/// @author AeroAsset Protocol
/// @notice Regression tests for the Gate 0 audit remediations.
/// @dev Each test here is the inverse of a proof-of-concept in `audit/poc/` that
///      passed against commit `b31b6d2`, where it demonstrated a working attack. If any
///      test in this file starts failing, the corresponding vulnerability has been
///      reintroduced.
contract Gate0Regression is ProtocolTestBase {
    uint128 internal constant PRICE = 1_000_000e6;

    /*//////////////////////////////////////////////////////////////
                   AAP-01 — DISPUTE RESOLUTION DEADLINE
    //////////////////////////////////////////////////////////////*/

    /// @notice A dispute can no longer freeze the buyer's funds indefinitely.
    /// @dev The original attack: the seller disputes the instant the buyer funds, and
    ///      because `DISPUTED` had no deadline every exit was permanently closed.
    function test_AAP01_DisputeCannotFreezeFundsForever() public {
        (,, address escrowAddr) = _openTrade(PRICE);
        IEscrow escrow = IEscrow(escrowAddr);

        _fundBuyer(bob, escrowAddr, PRICE);
        vm.prank(bob);
        escrow.fund();

        vm.prank(alice);
        escrow.raiseDispute();
        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.DISPUTED), "not disputed");

        uint40 deadline = escrow.disputeDeadline();
        assertEq(deadline, escrow.disputeRaisedAt() + escrow.DISPUTE_RESOLUTION_WINDOW(), "deadline not set");

        // Still protected while arbitration has time to run.
        vm.warp(deadline);
        vm.expectRevert(
            abi.encodeWithSelector(IEscrow.DisputeDeadlineNotPassed.selector, deadline, uint40(block.timestamp))
        );
        escrow.claimDisputeTimeout();

        // Once the window lapses, anyone can make the buyer whole.
        vm.warp(uint256(deadline) + 1);
        uint256 balanceBefore = settlementToken.balanceOf(bob);
        vm.prank(carol);
        escrow.claimDisputeTimeout();

        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.REFUNDED), "not refunded");
        assertEq(settlementToken.balanceOf(bob) - balanceBefore, PRICE, "buyer not made whole");
        assertEq(settlementToken.balanceOf(escrowAddr), 0, "escrow retained funds");
    }

    /// @notice An arbitrator that never acts cannot strand a deposit.
    function test_AAP01_AbandonedArbitrationStillRefunds() public {
        (,, address escrowAddr) = _openTrade(PRICE);
        IEscrow escrow = IEscrow(escrowAddr);

        _fundBuyer(bob, escrowAddr, PRICE);
        vm.prank(bob);
        escrow.fund();
        vm.prank(bob);
        escrow.raiseDispute();

        // The arbitrator key is lost: the role is revoked and nobody replaces it.
        vm.prank(protocolAdmin);
        roleManager.revokeRole(ProtocolRoles.ARBITRATOR_ROLE, arbitrator);
        assertEq(roleManager.getRoleMemberCount(ProtocolRoles.ARBITRATOR_ROLE), 0, "arbitrator remains");

        vm.warp(block.timestamp + escrow.DISPUTE_RESOLUTION_WINDOW() + 1);
        escrow.claimDisputeTimeout();

        assertEq(settlementToken.balanceOf(bob), PRICE, "deposit stranded by missing arbitrator");
    }

    /// @notice Arbitration still wins while it is inside the window.
    function test_AAP01_ArbitratorStillResolvesWithinWindow() public {
        (uint256 assetId,, address escrowAddr) = _openTrade(PRICE);
        IEscrow escrow = IEscrow(escrowAddr);

        _fundBuyer(bob, escrowAddr, PRICE);
        vm.prank(bob);
        escrow.fund();
        vm.prank(bob);
        escrow.raiseDispute();

        vm.warp(block.timestamp + 7 days);
        vm.prank(arbitrator);
        escrow.resolveDispute(true);

        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.RELEASED), "not released");
        assertEq(assetOwnership.ownerOf(assetId), bob, "asset not delivered");
    }

    /*//////////////////////////////////////////////////////////////
                 AAP-02 — NO FREEZING A LIVE SETTLEMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice A seller can no longer brick the asset once the buyer has funded.
    function test_AAP02_SellerCannotBrickAssetMidEscrow() public {
        (uint256 assetId,, address escrowAddr) = _openTrade(PRICE);
        IEscrow escrow = IEscrow(escrowAddr);

        _fundBuyer(bob, escrowAddr, PRICE);
        vm.prank(bob);
        escrow.fund();

        vm.expectRevert(abi.encodeWithSelector(IAssetRegistry.AssetLockedBySettlement.selector, assetId, escrowAddr));
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.DESTROYED);

        vm.expectRevert(abi.encodeWithSelector(IAssetRegistry.AssetLockedBySettlement.selector, assetId, escrowAddr));
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.RETIRED);

        // The trade completes exactly as agreed.
        vm.prank(bob);
        escrow.release();
        assertEq(assetOwnership.ownerOf(assetId), bob, "settlement blocked");
    }

    /// @notice Non-terminal statuses remain freely settable during a trade.
    /// @dev The guard must be narrow: only the transitions that freeze are blocked.
    function test_AAP02_NonTerminalStatusStillAllowedWhileLocked() public {
        (uint256 assetId,, address escrowAddr) = _openTrade(PRICE);

        _fundBuyer(bob, escrowAddr, PRICE);
        vm.prank(bob);
        IEscrow(escrowAddr).fund();

        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.UNDER_MAINTENANCE);

        assertEq(
            uint8(assetRegistry.getAsset(assetId).status),
            uint8(IAssetRegistry.AssetStatus.UNDER_MAINTENANCE),
            "operational status blocked"
        );
    }

    /*//////////////////////////////////////////////////////////////
                    AAP-03 — FREEZE IS RECOVERABLE
    //////////////////////////////////////////////////////////////*/

    /// @notice A retired aircraft can return to service without losing its provenance.
    function test_AAP03_RetirementIsReversible() public {
        (, uint256 assetId) = _defaultAircraft();

        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.RETIRED);
        assertFalse(assetOwnership.isTransferable(assetId), "not frozen on retirement");

        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.IN_SERVICE);

        assertTrue(assetOwnership.isTransferable(assetId), "still frozen after return to service");
        assertFalse(assetRegistry.isTerminal(assetId), "still terminal");
        assertEq(assetOwnership.ownerOf(assetId), alice, "ownership disturbed");
    }

    /// @notice Retirement must not be a shortcut into destruction.
    function test_AAP03_RetiredCannotJumpToDestroyed() public {
        (, uint256 assetId) = _defaultAircraft();

        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.RETIRED);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAssetRegistry.InvalidAssetTransition.selector,
                IAssetRegistry.AssetStatus.RETIRED,
                IAssetRegistry.AssetStatus.DESTROYED
            )
        );
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.DESTROYED);
    }

    /// @notice An erroneous destruction is recoverable by the timelocked admin.
    function test_AAP03_AdminCanRecoverErroneousDestruction() public {
        (, uint256 assetId) = _defaultAircraft();

        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.DESTROYED);
        assertFalse(assetOwnership.isTransferable(assetId), "not frozen");

        // The owner has no way back — destruction stays absorbing for them.
        vm.expectRevert(
            abi.encodeWithSelector(
                IAssetRegistry.InvalidAssetTransition.selector,
                IAssetRegistry.AssetStatus.DESTROYED,
                IAssetRegistry.AssetStatus.IN_SERVICE
            )
        );
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.IN_SERVICE);

        vm.prank(protocolAdmin);
        assetRegistry.recoverTerminalAsset(assetId, IAssetRegistry.AssetStatus.STORED);

        assertTrue(assetOwnership.isTransferable(assetId), "recovery did not unfreeze");
        assertEq(uint8(assetRegistry.getAsset(assetId).status), uint8(IAssetRegistry.AssetStatus.STORED), "status");
    }

    /// @notice Recovery is admin-only and cannot be used as a status backdoor.
    function test_AAP03_RecoveryIsConstrained() public {
        (, uint256 assetId) = _defaultAircraft();

        // Not reachable on a live asset.
        vm.expectRevert(
            abi.encodeWithSelector(
                IAssetRegistry.AssetNotTerminal.selector, assetId, IAssetRegistry.AssetStatus.REGISTERED
            )
        );
        vm.prank(protocolAdmin);
        assetRegistry.recoverTerminalAsset(assetId, IAssetRegistry.AssetStatus.IN_SERVICE);

        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.DESTROYED);

        // Not a route between terminal states.
        vm.expectRevert(
            abi.encodeWithSelector(
                IAssetRegistry.InvalidAssetTransition.selector,
                IAssetRegistry.AssetStatus.DESTROYED,
                IAssetRegistry.AssetStatus.RETIRED
            )
        );
        vm.prank(protocolAdmin);
        assetRegistry.recoverTerminalAsset(assetId, IAssetRegistry.AssetStatus.RETIRED);

        // Not available to the owner.
        vm.expectRevert();
        vm.prank(alice);
        assetRegistry.recoverTerminalAsset(assetId, IAssetRegistry.AssetStatus.IN_SERVICE);
    }

    /*//////////////////////////////////////////////////////////////
                     AAP-13 — DEFERRED PAYOUT FALLBACK
    //////////////////////////////////////////////////////////////*/

    /// @notice A blacklisted buyer no longer traps their own refund.
    function test_AAP13_BlacklistedBuyerRefundIsRecoverable() public {
        BlacklistingToken token = new BlacklistingToken();
        (,, address escrowAddr) = _openTradeWithToken(address(token), PRICE);
        IEscrow escrow = IEscrow(escrowAddr);

        token.mint(bob, PRICE);
        vm.prank(bob);
        token.approve(escrowAddr, PRICE);
        vm.prank(bob);
        escrow.fund();

        // Bob is blacklisted while his funds sit in escrow.
        token.setBlocked(bob, true);

        vm.warp(block.timestamp + 31 days);
        escrow.claimTimeout();

        // The escrow still reached its terminal state rather than reverting forever.
        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.REFUNDED), "refund blocked by blacklist");
        assertEq(escrow.withdrawable(bob), PRICE, "refund not deferred");
        assertEq(escrow.totalDeferred(), PRICE, "deferred total wrong");

        // Once the block lifts, the funds are claimable.
        token.setBlocked(bob, false);
        escrow.withdraw(bob);

        assertEq(token.balanceOf(bob), PRICE, "buyer not repaid");
        assertEq(escrow.withdrawable(bob), 0, "balance not cleared");
        assertEq(escrow.totalDeferred(), 0, "deferred total not cleared");
    }

    /// @notice A blacklisted treasury does not halt settlement protocol-wide.
    function test_AAP13_BlacklistedTreasuryDoesNotBlockSettlement() public {
        BlacklistingToken token = new BlacklistingToken();
        (uint256 assetId,, address escrowAddr) = _openTradeWithToken(address(token), PRICE);
        IEscrow escrow = IEscrow(escrowAddr);

        token.mint(bob, PRICE);
        vm.prank(bob);
        token.approve(escrowAddr, PRICE);
        vm.prank(bob);
        escrow.fund();

        token.setBlocked(treasury, true);

        vm.prank(bob);
        escrow.release();

        uint256 fee = escrow.getTerms().feeAmount;
        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.RELEASED), "settlement blocked by treasury");
        assertEq(assetOwnership.ownerOf(assetId), bob, "asset not delivered");
        assertEq(token.balanceOf(alice), PRICE - fee, "seller not paid in full");
        assertEq(escrow.withdrawable(treasury), fee, "fee not deferred");
    }

    /// @notice A seller who cannot be paid does not receive the aircraft's buyer's money
    ///         — and does not lose the aircraft either.
    /// @dev The deliberate asymmetry: the seller payout stays strict because reverting
    ///      leaves a recoverable trade, whereas deferring would hand over the asset
    ///      against an IOU.
    function test_AAP13_BlacklistedSellerRevertsRatherThanDeferring() public {
        BlacklistingToken token = new BlacklistingToken();
        (uint256 assetId,, address escrowAddr) = _openTradeWithToken(address(token), PRICE);
        IEscrow escrow = IEscrow(escrowAddr);

        token.mint(bob, PRICE);
        vm.prank(bob);
        token.approve(escrowAddr, PRICE);
        vm.prank(bob);
        escrow.fund();

        token.setBlocked(alice, true);

        vm.expectRevert();
        vm.prank(bob);
        escrow.release();

        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.FUNDED), "status advanced despite failed payment");
        assertEq(assetOwnership.ownerOf(assetId), alice, "asset moved without payment");

        // The buyer is not stranded: the timeout path still returns their funds.
        vm.warp(block.timestamp + 31 days);
        escrow.claimTimeout();
        assertEq(token.balanceOf(bob), PRICE, "buyer not refunded");
    }

    /// @notice Withdrawing with nothing owed reverts rather than silently succeeding.
    function test_AAP13_WithdrawRequiresABalance() public {
        (,, address escrowAddr) = _openTrade(PRICE);

        vm.expectRevert(abi.encodeWithSelector(IEscrow.NothingToWithdraw.selector, bob));
        IEscrow(escrowAddr).withdraw(bob);
    }
}
