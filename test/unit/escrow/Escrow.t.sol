// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAssetOwnership} from "../../../src/interfaces/IAssetOwnership.sol";
import {IEscrow} from "../../../src/interfaces/IEscrow.sol";
import {IEscrowFactory} from "../../../src/interfaces/IEscrowFactory.sol";
import {IMarketplace} from "../../../src/interfaces/IMarketplace.sol";
import {MissingRole} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../../../src/libraries/ProtocolRoles.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title EscrowTest
/// @author AeroAsset Protocol
/// @notice Lifecycle, settlement, dispute, timeout and conservation coverage for
///         {Escrow} — the only contract in the protocol that holds funds.
contract EscrowTest is ProtocolTestBase {
    uint128 internal constant PRICE = 1_000_000e6;

    /// @dev The listed aircraft.
    uint256 internal assetId;
    /// @dev The listing being settled.
    uint256 internal listingId;
    /// @dev The escrow under test, opened but unfunded.
    IEscrow internal escrow;
    /// @dev Protocol fee quoted at acceptance.
    uint256 internal expectedFee;

    function setUp() public override {
        super.setUp();

        address escrowAddr;
        (assetId, listingId, escrowAddr) = _openTrade(PRICE);
        escrow = IEscrow(escrowAddr);
        expectedFee = (uint256(PRICE) * FIXTURE_FEE_BPS) / 10_000;

        _fundBuyer(bob, escrowAddr, PRICE);
        vm.label(escrowAddr, "Escrow");
    }

    /*//////////////////////////////////////////////////////////////
                             INITIALIZATION
    //////////////////////////////////////////////////////////////*/

    /// @notice A freshly opened escrow carries the frozen terms and awaits funding.
    function test_Initialize_FreezesTerms() public view {
        IEscrowFactory.EscrowTerms memory terms = escrow.getTerms();

        assertEq(terms.listingId, listingId, "wrong listing");
        assertEq(terms.assetId, assetId, "wrong asset");
        assertEq(terms.buyer, bob, "wrong buyer");
        assertEq(terms.seller, alice, "wrong seller");
        assertEq(terms.paymentToken, address(settlementToken), "wrong token");
        assertEq(terms.price, PRICE, "wrong price");
        assertEq(terms.feeAmount, expectedFee, "wrong fee");

        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.AWAITING_FUNDING), "not AWAITING_FUNDING");
        assertEq(escrow.depositedAmount(), 0, "deposit before funding");
        assertFalse(escrow.isTerminal(), "terminal at open");
    }

    /// @notice The escrow holds `SETTLEMENT_ROLE` while live.
    function test_EscrowIsArmedWhileLive() public view {
        assertTrue(roleManager.hasRole(ProtocolRoles.SETTLEMENT_ROLE, address(escrow)), "escrow not armed at open");
    }

    /// @notice A clone cannot be re-initialized.
    function test_RevertWhen_Reinitializing() public {
        // Cached: an inline `escrow.getTerms()` would be the "next call" that
        // `expectRevert` and `prank` bind to, not `initialize`.
        IEscrowFactory.EscrowTerms memory terms = escrow.getTerms();

        vm.expectRevert(Initializable.InvalidInitialization.selector);
        vm.prank(address(escrowFactory));
        escrow.initialize(99, terms);
    }

    /// @notice The shared implementation can never be initialized.
    /// @dev An initialized implementation would be a live escrow anyone could drive.
    function test_RevertWhen_InitializingImplementation() public {
        IEscrowFactory.EscrowTerms memory terms = escrow.getTerms();

        vm.expectRevert(Initializable.InvalidInitialization.selector);
        vm.prank(address(escrowFactory));
        IEscrow(escrowImpl).initialize(1, terms);
    }

    /*//////////////////////////////////////////////////////////////
                                 FUNDING
    //////////////////////////////////////////////////////////////*/

    /// @notice Funding takes custody and locks the asset.
    function test_Fund_LocksAsset() public {
        vm.expectEmit(true, true, true, true, address(escrow));
        emit IEscrow.EscrowFunded(1, bob, PRICE);

        vm.prank(bob);
        escrow.fund();

        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.FUNDED), "not FUNDED");
        assertEq(escrow.depositedAmount(), PRICE, "deposit not recorded");
        assertEq(settlementToken.balanceOf(address(escrow)), PRICE, "escrow does not hold the funds");

        // The seller can no longer move the aircraft out from under the buyer.
        assertEq(assetOwnership.lockHolderOf(assetId), address(escrow), "asset not locked by the escrow");
        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.AssetTransferLocked.selector, assetId, address(escrow)));
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, carol, 0);
    }

    /// @notice Only the named buyer may fund.
    function testFuzz_RevertWhen_NonBuyerFunds(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != bob);

        vm.expectRevert(abi.encodeWithSelector(IEscrow.NotEscrowBuyer.selector, caller, bob));
        vm.prank(caller);
        escrow.fund();
    }

    /// @notice Funding twice is rejected.
    function test_RevertWhen_FundingTwice() public {
        vm.startPrank(bob);
        escrow.fund();

        vm.expectRevert(
            abi.encodeWithSelector(
                IEscrow.InvalidEscrowTransition.selector, IEscrow.EscrowStatus.FUNDED, IEscrow.EscrowStatus.FUNDED
            )
        );
        escrow.fund();
        vm.stopPrank();
    }

    /// @notice Funding after the deadline is rejected.
    function test_RevertWhen_FundingLate() public {
        uint40 deadline = escrow.getTerms().fundingDeadline;
        vm.warp(uint256(deadline) + 1);

        vm.expectRevert(
            abi.encodeWithSelector(IEscrow.FundingDeadlinePassed.selector, deadline, uint40(block.timestamp))
        );
        vm.prank(bob);
        escrow.fund();
    }

    /*//////////////////////////////////////////////////////////////
                                SETTLEMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice Release settles asset, fee and proceeds atomically.
    function test_Release_SettlesEverything() public {
        vm.prank(bob);
        escrow.fund();

        uint256 sellerBefore = settlementToken.balanceOf(alice);
        uint256 treasuryBefore = settlementToken.balanceOf(treasury);
        uint256 proceeds = PRICE - expectedFee;

        vm.expectEmit(true, true, true, true, address(escrow));
        emit IEscrow.EscrowSettled(1, alice, proceeds, expectedFee);
        vm.prank(bob);
        escrow.release();

        // Money.
        assertEq(settlementToken.balanceOf(alice) - sellerBefore, proceeds, "seller underpaid");
        assertEq(settlementToken.balanceOf(treasury) - treasuryBefore, expectedFee, "treasury underpaid");
        assertEq(settlementToken.balanceOf(address(escrow)), 0, "escrow retained dust");

        // Asset.
        assertEq(assetOwnership.ownerOf(assetId), bob, "asset not transferred to the buyer");
        assertEq(assetOwnership.lockHolderOf(assetId), address(0), "lock not released");

        // Listing.
        assertEq(uint8(marketplace.getListing(listingId).status), uint8(IMarketplace.ListingStatus.SOLD), "not SOLD");

        // The escrow disarms itself.
        assertFalse(
            roleManager.hasRole(ProtocolRoles.SETTLEMENT_ROLE, address(escrow)), "escrow still armed after settling"
        );
        assertTrue(escrow.isTerminal(), "not terminal");
    }

    /// @notice Fee plus proceeds always equals the deposit exactly. INV-ESC-04.
    function testFuzz_Settlement_ConservesValue(uint128 price, uint16 bps) public {
        price = uint128(bound(price, 1e6, type(uint96).max));
        bps = uint16(bound(bps, 0, feeManager.MAX_FEE_BPS()));

        vm.prank(protocolAdmin);
        feeManager.setFeeBps(keccak256("aeroasset.fee.MARKETPLACE"), bps);

        (,, address escrowAddr) = _openTradeWithSalt(price, keccak256(abi.encode("conservation", price, bps)));
        _fundBuyer(bob, escrowAddr, price);

        uint256 sellerBefore = settlementToken.balanceOf(alice);
        uint256 treasuryBefore = settlementToken.balanceOf(treasury);

        vm.startPrank(bob);
        IEscrow(escrowAddr).fund();
        IEscrow(escrowAddr).release();
        vm.stopPrank();

        uint256 paidToSeller = settlementToken.balanceOf(alice) - sellerBefore;
        uint256 paidToTreasury = settlementToken.balanceOf(treasury) - treasuryBefore;

        assertEq(paidToSeller + paidToTreasury, price, "value not conserved");
        assertEq(settlementToken.balanceOf(escrowAddr), 0, "escrow retained funds");
    }

    /// @notice Only the buyer may release.
    /// @dev The seller releasing would let them take payment without the buyer ever
    ///      confirming they received the aircraft.
    function testFuzz_RevertWhen_NonBuyerReleases(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != bob);
        vm.prank(bob);
        escrow.fund();

        vm.expectRevert(abi.encodeWithSelector(IEscrow.NotEscrowBuyer.selector, caller, bob));
        vm.prank(caller);
        escrow.release();
    }

    /// @notice An unfunded escrow cannot be released.
    function test_RevertWhen_ReleasingUnfunded() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IEscrow.InvalidEscrowTransition.selector,
                IEscrow.EscrowStatus.AWAITING_FUNDING,
                IEscrow.EscrowStatus.RELEASED
            )
        );
        vm.prank(bob);
        escrow.release();
    }

    /*//////////////////////////////////////////////////////////////
                              CANCELLATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Either party may abandon an unfunded escrow, freeing the listing.
    function test_Cancel_ByParty() public {
        vm.prank(alice);
        escrow.cancel();

        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.CANCELLED), "not CANCELLED");
        assertEq(marketplace.escrowOf(listingId), address(0), "listing not released");
        assertTrue(marketplace.isListingActive(listingId), "listing not still active");
        assertFalse(roleManager.hasRole(ProtocolRoles.SETTLEMENT_ROLE, address(escrow)), "escrow still armed");
    }

    /// @notice An outsider may only clean up after the funding deadline.
    function test_Cancel_ByStrangerOnlyAfterDeadline() public {
        uint40 deadline = escrow.getTerms().fundingDeadline;

        vm.expectRevert(
            abi.encodeWithSelector(IEscrow.FundingDeadlineNotPassed.selector, deadline, uint40(block.timestamp))
        );
        vm.prank(attacker);
        escrow.cancel();

        vm.warp(uint256(deadline) + 1);
        vm.prank(attacker);
        escrow.cancel();

        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.CANCELLED), "not CANCELLED");
    }

    /// @notice A funded escrow cannot be cancelled.
    function test_RevertWhen_CancellingFunded() public {
        vm.startPrank(bob);
        escrow.fund();

        vm.expectRevert(
            abi.encodeWithSelector(
                IEscrow.InvalidEscrowTransition.selector, IEscrow.EscrowStatus.FUNDED, IEscrow.EscrowStatus.CANCELLED
            )
        );
        escrow.cancel();
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                                 TIMEOUT
    //////////////////////////////////////////////////////////////*/

    /// @notice Anyone may refund the buyer once the settlement deadline passes.
    /// @dev A buyer's deposit must never be strandable by an unresponsive seller.
    function testFuzz_ClaimTimeout_IsPermissionless(address caller) public {
        _assumeSafeRecipient(caller);
        vm.prank(bob);
        escrow.fund();

        uint256 buyerBefore = settlementToken.balanceOf(bob);
        vm.warp(uint256(escrow.getTerms().settlementDeadline) + 1);

        vm.prank(caller);
        escrow.claimTimeout();

        // Refund goes to the recorded buyer, never to the caller.
        assertEq(settlementToken.balanceOf(bob) - buyerBefore, PRICE, "buyer not made whole");
        assertEq(settlementToken.balanceOf(address(escrow)), 0, "escrow retained funds");
        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.REFUNDED), "not REFUNDED");

        // The asset never moved and is free again.
        assertEq(assetOwnership.ownerOf(assetId), alice, "asset moved on a refund");
        assertEq(assetOwnership.lockHolderOf(assetId), address(0), "lock not released");
        assertEq(marketplace.escrowOf(listingId), address(0), "listing still attached to the escrow");
        assertTrue(marketplace.isListingActive(listingId), "listing not returned to active");
    }

    /// @notice A timeout cannot be claimed early.
    function test_RevertWhen_ClaimingTimeoutEarly() public {
        vm.prank(bob);
        escrow.fund();
        uint40 deadline = escrow.getTerms().settlementDeadline;

        vm.expectRevert(
            abi.encodeWithSelector(IEscrow.SettlementDeadlineNotPassed.selector, deadline, uint40(block.timestamp))
        );
        escrow.claimTimeout();
    }

    /// @notice A pause cannot strand a buyer's deposit.
    /// @dev `AssetOwnership` being paused blocks `release` but must not block the
    ///      refund path — that asymmetry is the whole point.
    function test_ClaimTimeout_WorksWhileProtocolPaused() public {
        vm.prank(bob);
        escrow.fund();

        vm.startPrank(pauser);
        assetOwnership.pause();
        marketplace.pause();
        vm.stopPrank();

        vm.warp(uint256(escrow.getTerms().settlementDeadline) + 1);

        // Settlement is blocked...
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(bob);
        escrow.release();

        // ...but the refund is not.
        escrow.claimTimeout();
        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.REFUNDED), "refund blocked by pause");
        assertEq(settlementToken.balanceOf(bob), PRICE, "buyer not made whole");
    }

    /*//////////////////////////////////////////////////////////////
                                 DISPUTES
    //////////////////////////////////////////////////////////////*/

    /// @notice Either party may dispute a funded escrow.
    function test_RaiseDispute_ByEitherParty() public {
        vm.prank(bob);
        escrow.fund();

        vm.expectEmit(true, true, true, true, address(escrow));
        emit IEscrow.DisputeRaised(1, alice);
        vm.prank(alice);
        escrow.raiseDispute();

        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.DISPUTED), "not DISPUTED");
    }

    /// @notice An outsider cannot dispute.
    function testFuzz_RevertWhen_StrangerDisputes(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != alice && caller != bob);
        vm.prank(bob);
        escrow.fund();

        vm.expectRevert(abi.encodeWithSelector(IEscrow.NotEscrowParty.selector, caller));
        vm.prank(caller);
        escrow.raiseDispute();
    }

    /// @notice A dispute cannot be raised after the refund window opens.
    /// @dev Otherwise a seller could use a last-second dispute to block the buyer's
    ///      timeout claim indefinitely.
    function test_RevertWhen_DisputingAfterSettlementDeadline() public {
        vm.prank(bob);
        escrow.fund();
        uint40 deadline = escrow.getTerms().settlementDeadline;
        vm.warp(uint256(deadline) + 1);

        vm.expectRevert(
            abi.encodeWithSelector(IEscrow.SettlementDeadlinePassed.selector, deadline, uint40(block.timestamp))
        );
        vm.prank(alice);
        escrow.raiseDispute();
    }

    /// @notice The arbitrator can resolve for the seller.
    function test_ResolveDispute_ForSeller() public {
        _disputed();
        uint256 sellerBefore = settlementToken.balanceOf(alice);

        vm.expectEmit(true, true, true, true, address(escrow));
        emit IEscrow.DisputeResolved(1, arbitrator, true);
        vm.prank(arbitrator);
        escrow.resolveDispute(true);

        assertEq(settlementToken.balanceOf(alice) - sellerBefore, PRICE - expectedFee, "seller not paid");
        assertEq(assetOwnership.ownerOf(assetId), bob, "asset not transferred");
        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.RELEASED), "not RELEASED");
    }

    /// @notice The arbitrator can resolve for the buyer.
    function test_ResolveDispute_ForBuyer() public {
        _disputed();
        uint256 buyerBefore = settlementToken.balanceOf(bob);

        vm.prank(arbitrator);
        escrow.resolveDispute(false);

        assertEq(settlementToken.balanceOf(bob) - buyerBefore, PRICE, "buyer not refunded");
        assertEq(assetOwnership.ownerOf(assetId), alice, "asset moved on a refund");
        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.REFUNDED), "not REFUNDED");
    }

    /// @notice Only `ARBITRATOR_ROLE` may resolve.
    function testFuzz_RevertWhen_UnauthorizedResolve(address caller) public {
        _assumeUnprivileged(caller);
        _disputed();

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.ARBITRATOR_ROLE, caller));
        vm.prank(caller);
        escrow.resolveDispute(true);
    }

    /// @notice A non-disputed escrow cannot be resolved.
    /// @dev The arbitrator's reach is confined to trades that were actually disputed.
    function test_RevertWhen_ResolvingNonDisputedEscrow() public {
        vm.prank(bob);
        escrow.fund();

        vm.expectRevert(
            abi.encodeWithSelector(
                IEscrow.InvalidEscrowTransition.selector, IEscrow.EscrowStatus.FUNDED, IEscrow.EscrowStatus.RELEASED
            )
        );
        vm.prank(arbitrator);
        escrow.resolveDispute(true);
    }

    /// @notice The arbitrator cannot pay a third party or change the amount.
    /// @dev The only choice available is which of the two named parties wins; the
    ///      amounts come from the frozen terms.
    function test_ArbitratorCannotRedirectFunds() public {
        _disputed();
        uint256 attackerBefore = settlementToken.balanceOf(attacker);

        vm.prank(arbitrator);
        escrow.resolveDispute(true);

        assertEq(settlementToken.balanceOf(attacker), attackerBefore, "funds reached a third party");
        assertEq(
            settlementToken.balanceOf(alice) + settlementToken.balanceOf(treasury),
            PRICE,
            "payout did not match the frozen terms"
        );
    }

    /*//////////////////////////////////////////////////////////////
                                 HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Funds the escrow and raises a dispute.
    function _disputed() internal {
        vm.prank(bob);
        escrow.fund();
        vm.prank(bob);
        escrow.raiseDispute();
    }
}
