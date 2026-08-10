// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAssetOwnership} from "../../../src/interfaces/IAssetOwnership.sol";
import {IAssetRegistry} from "../../../src/interfaces/IAssetRegistry.sol";
import {IEscrowFactory} from "../../../src/interfaces/IEscrowFactory.sol";
import {IFeeManager} from "../../../src/interfaces/IFeeManager.sol";
import {IMarketplace} from "../../../src/interfaces/IMarketplace.sol";
import {DeadlineInPast, UnexpectedCaller} from "../../../src/libraries/ProtocolErrors.sol";
import {ListingManager} from "../../../src/marketplace/ListingManager.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";
import {MockEscrow} from "../../utils/mocks/MockEscrowFactory.sol";

/// @title MarketplaceTest
/// @author AeroAsset Protocol
/// @notice Listing, offer, acceptance and settlement-hook coverage for {Marketplace}.
contract MarketplaceTest is ProtocolTestBase {
    /// @dev One million settlement-token units at six decimals.
    uint128 internal constant PRICE = 1_000_000e6;

    /// @dev Verified organization administered by `alice`.
    uint256 internal orgId;
    /// @dev Verified aircraft owned by `alice`.
    uint256 internal assetId;

    function setUp() public override {
        super.setUp();
        (orgId, assetId) = _defaultAircraft();
        vm.prank(orgVerifier);
        assetRegistry.verifyAsset(assetId, orgId);
    }

    /// @notice Creates a listing for the fixture aircraft.
    /// @return The listing id.
    function _list() internal returns (uint256) {
        vm.prank(alice);
        return marketplace.createListing(assetId, address(settlementToken), PRICE, uint40(block.timestamp + 30 days));
    }

    /*//////////////////////////////////////////////////////////////
                                LISTINGS
    //////////////////////////////////////////////////////////////*/

    /// @notice Creating a listing records the terms and claims the asset's slot.
    function test_CreateListing() public {
        uint40 expiry = uint40(block.timestamp + 30 days);

        vm.expectEmit(true, true, true, true, address(marketplace));
        emit IMarketplace.ListingCreated(1, assetId, alice, address(settlementToken), PRICE, expiry);

        uint256 listingId = _list();

        IMarketplace.Listing memory listing = marketplace.getListing(listingId);
        assertEq(listing.seller, alice, "wrong seller");
        assertEq(listing.assetId, assetId, "wrong asset");
        assertEq(listing.paymentToken, address(settlementToken), "wrong token");
        assertEq(listing.price, PRICE, "wrong price");
        assertEq(listing.expiresAt, expiry, "wrong expiry");
        assertEq(uint8(listing.status), uint8(IMarketplace.ListingStatus.ACTIVE), "not ACTIVE");
        assertEq(listing.escrowId, 0, "escrow set at creation");

        assertTrue(marketplace.isListingActive(listingId), "not effectively active");
        assertEq(marketplace.activeListingOf(assetId), listingId, "asset slot not claimed");
    }

    /// @notice At most one active listing per asset. INV-MKT-02.
    function test_RevertWhen_AssetAlreadyListed() public {
        uint256 first = _list();

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.AssetAlreadyListed.selector, assetId, first));
        _list();
    }

    /// @notice Cancelling frees the asset for a fresh listing.
    function test_CancelListing_FreesAssetSlot() public {
        uint256 listingId = _list();

        vm.prank(alice);
        marketplace.cancelListing(listingId);

        assertEq(
            uint8(marketplace.getListing(listingId).status),
            uint8(IMarketplace.ListingStatus.CANCELLED),
            "not CANCELLED"
        );
        assertEq(marketplace.activeListingOf(assetId), 0, "asset slot not freed");

        uint256 second = _list();
        assertTrue(second > listingId, "relisting failed");
    }

    /// @notice Only a verified asset may be listed. FR-23.
    function test_RevertWhen_AssetNotVerified() public {
        uint256 unverified = _registerAircraft(orgId, alice, alice, keccak256("MSN-UNVERIFIED"));

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.AssetNotVerified.selector, unverified));
        vm.prank(alice);
        marketplace.createListing(unverified, address(settlementToken), PRICE, uint40(block.timestamp + 30 days));
    }

    /// @notice A locked asset cannot be listed.
    /// @dev It could not complete a sale, so it must not start one.
    function test_RevertWhen_AssetLocked() public {
        address escrow = makeAddr("otherEscrow");
        _grantSettlementRole(escrow);
        vm.prank(escrow);
        assetOwnership.setTransferLock(assetId, true);

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.AssetNotTransferable.selector, assetId));
        _list();
    }

    /// @notice A terminal asset cannot be listed.
    function test_RevertWhen_AssetTerminal() public {
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.DESTROYED);

        vm.expectRevert(
            abi.encodeWithSelector(IAssetRegistry.AssetTerminal.selector, assetId, IAssetRegistry.AssetStatus.DESTROYED)
        );
        _list();
    }

    /// @notice Only the owner may list.
    function testFuzz_RevertWhen_NonOwnerLists(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != alice);

        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.NotAssetOwner.selector, assetId, caller, alice));
        vm.prank(caller);
        marketplace.createListing(assetId, address(settlementToken), PRICE, uint40(block.timestamp + 30 days));
    }

    /// @notice The settlement token must be allowlisted.
    function test_RevertWhen_TokenNotAllowed() public {
        vm.prank(protocolAdmin);
        feeManager.setTokenAllowed(address(settlementToken), false);

        vm.expectRevert(abi.encodeWithSelector(IFeeManager.TokenNotAllowed.selector, address(settlementToken)));
        _list();
    }

    /// @notice Price and deadline are validated.
    function test_RevertWhen_ListingParamsInvalid() public {
        vm.startPrank(alice);

        vm.expectRevert(IMarketplace.PriceTooLow.selector);
        marketplace.createListing(assetId, address(settlementToken), 0, uint40(block.timestamp + 1 days));

        uint40 past = uint40(block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(DeadlineInPast.selector, past, past));
        marketplace.createListing(assetId, address(settlementToken), PRICE, past);

        uint40 tooFar = uint40(block.timestamp + 366 days);
        vm.expectRevert(
            abi.encodeWithSelector(ListingManager.DeadlineTooFar.selector, tooFar, uint40(block.timestamp + 365 days))
        );
        marketplace.createListing(assetId, address(settlementToken), PRICE, tooFar);
        vm.stopPrank();
    }

    /// @notice Expiry is computed, not merely stored.
    /// @dev A listing past its deadline reads `ACTIVE` in storage until someone pays to
    ///      record it — the same trap `CredentialRegistry.isValid` closes.
    function test_ListingExpiry_IsComputed() public {
        uint256 listingId = _list();
        vm.warp(block.timestamp + 31 days);

        assertEq(
            uint8(marketplace.getListing(listingId).status),
            uint8(IMarketplace.ListingStatus.ACTIVE),
            "stored status changed without a transaction"
        );
        assertFalse(marketplace.isListingActive(listingId), "expired listing reported active");
        assertEq(marketplace.activeListingOf(assetId), 0, "expired listing still claims the slot");
    }

    /// @notice Anyone may record an expiry that has already happened.
    function testFuzz_ExpireListing_IsPermissionless(address caller) public {
        _assumeSafeRecipient(caller);
        uint256 listingId = _list();
        vm.warp(block.timestamp + 31 days);

        vm.prank(caller);
        marketplace.expireListing(listingId);

        assertEq(
            uint8(marketplace.getListing(listingId).status), uint8(IMarketplace.ListingStatus.EXPIRED), "not EXPIRED"
        );
    }

    /// @notice Expiry cannot be recorded early.
    function test_RevertWhen_ExpiringLiveListing() public {
        uint256 listingId = _list();
        uint40 expiry = marketplace.getListing(listingId).expiresAt;

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.ListingNotExpired.selector, listingId, expiry));
        marketplace.expireListing(listingId);
    }

    /// @notice Every listing exit is terminal. INV-MKT-01.
    function test_ListingTerminalStatesAreAbsorbing() public {
        uint256 listingId = _list();
        vm.prank(alice);
        marketplace.cancelListing(listingId);

        vm.expectRevert(
            abi.encodeWithSelector(
                IMarketplace.ListingNotActive.selector, listingId, IMarketplace.ListingStatus.CANCELLED
            )
        );
        vm.prank(alice);
        marketplace.cancelListing(listingId);

        assertFalse(
            marketplace.isValidListingTransition(IMarketplace.ListingStatus.SOLD, IMarketplace.ListingStatus.ACTIVE),
            "SOLD is not absorbing"
        );
    }

    /*//////////////////////////////////////////////////////////////
                                 OFFERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Making an offer records it without moving any funds.
    function test_MakeOffer() public {
        uint256 listingId = _list();
        uint40 expiry = uint40(block.timestamp + 7 days);

        vm.expectEmit(true, true, true, true, address(marketplace));
        emit IMarketplace.OfferMade(1, listingId, bob, PRICE, expiry);
        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, expiry);

        IMarketplace.Offer memory offer = marketplace.getOffer(offerId);
        assertEq(offer.buyer, bob, "wrong buyer");
        assertEq(offer.listingId, listingId, "wrong listing");
        assertEq(offer.price, PRICE, "wrong price");
        assertTrue(marketplace.isOfferActive(offerId), "not active");
        assertEq(settlementToken.balanceOf(address(marketplace)), 0, "marketplace took custody");
    }

    /// @notice A seller cannot bid on their own listing.
    function test_RevertWhen_SelfOffer() public {
        uint256 listingId = _list();

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.SelfOffer.selector, alice));
        vm.prank(alice);
        marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 1 days));
    }

    /// @notice A buyer can withdraw; a seller can reject.
    function test_Offer_WithdrawAndReject() public {
        uint256 listingId = _list();

        vm.prank(bob);
        uint256 offerA = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 1 days));
        vm.prank(bob);
        marketplace.withdrawOffer(offerA);
        assertEq(uint8(marketplace.getOffer(offerA).status), uint8(IMarketplace.OfferStatus.WITHDRAWN), "not WITHDRAWN");

        vm.prank(carol);
        uint256 offerB = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 1 days));
        vm.prank(alice);
        marketplace.rejectOffer(offerB);
        assertEq(uint8(marketplace.getOffer(offerB).status), uint8(IMarketplace.OfferStatus.REJECTED), "not REJECTED");
    }

    /// @notice Sibling offers survive an acceptance rather than being bulk-rejected.
    /// @dev Rejecting them would iterate an attacker-controlled array in a
    ///      state-changing function. They become unacceptable because the listing
    ///      leaves `ACTIVE`, and no funds are at risk while one sits idle.
    function test_SiblingOffersAreNotBulkRejected() public {
        uint256 listingId = _list();
        vm.prank(bob);
        uint256 accepted = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 1 days));
        vm.prank(carol);
        uint256 sibling = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 1 days));

        vm.prank(alice);
        marketplace.acceptOffer(accepted);

        assertEq(
            uint8(marketplace.getOffer(sibling).status), uint8(IMarketplace.OfferStatus.ACTIVE), "sibling was mutated"
        );
        // But it can no longer be accepted, because the listing has a live escrow.
        vm.expectRevert(abi.encodeWithSelector(IMarketplace.EscrowInProgress.selector, listingId, uint256(1)));
        vm.prank(alice);
        marketplace.acceptOffer(sibling);
    }

    /// @notice Offer expiry is computed, and recordable by anyone.
    function test_OfferExpiry() public {
        uint256 listingId = _list();
        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 1 days));

        vm.warp(block.timestamp + 2 days);
        assertFalse(marketplace.isOfferActive(offerId), "expired offer reported active");

        marketplace.expireOffer(offerId);
        assertEq(uint8(marketplace.getOffer(offerId).status), uint8(IMarketplace.OfferStatus.EXPIRED), "not EXPIRED");
    }

    /// @notice Only the buyer may withdraw, only the seller may reject.
    function test_Offer_AccessControl() public {
        uint256 listingId = _list();
        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 1 days));

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.NotOfferBuyer.selector, offerId, attacker));
        vm.prank(attacker);
        marketplace.withdrawOffer(offerId);

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.NotListingSeller.selector, listingId, attacker));
        vm.prank(attacker);
        marketplace.rejectOffer(offerId);
    }

    /*//////////////////////////////////////////////////////////////
                               ACCEPTANCE
    //////////////////////////////////////////////////////////////*/

    /// @notice Accepting opens an escrow with terms frozen at that moment.
    function test_AcceptOffer_FreezesTerms() public {
        uint256 listingId = _list();
        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 7 days));

        uint128 expectedFee = uint128(feeManager.quote(keccak256("aeroasset.fee.MARKETPLACE"), PRICE));

        vm.prank(alice);
        (uint256 escrowId, address escrow) = marketplace.acceptOffer(offerId);

        assertEq(escrowId, 1, "wrong escrow id");
        assertEq(marketplace.escrowOf(listingId), escrow, "escrow not attached");
        assertEq(marketplace.getListing(listingId).escrowId, escrowId, "escrow id not recorded");
        assertEq(
            uint8(marketplace.getOffer(offerId).status), uint8(IMarketplace.OfferStatus.ACCEPTED), "offer not ACCEPTED"
        );

        IEscrowFactory.EscrowTerms memory terms = escrowFactory.termsOf(escrowId);
        assertEq(terms.buyer, bob, "wrong buyer");
        assertEq(terms.seller, alice, "wrong seller");
        assertEq(terms.assetId, assetId, "wrong asset");
        assertEq(terms.price, PRICE, "wrong price");
        assertEq(terms.feeAmount, expectedFee, "fee not quoted at acceptance");
        assertEq(terms.paymentToken, address(settlementToken), "wrong token");
        assertGt(terms.settlementDeadline, terms.fundingDeadline, "deadlines out of order");
    }

    /// @notice A later fee change cannot re-price a live trade.
    /// @dev The fee is quoted once, at acceptance, and carried in the escrow terms.
    function test_AcceptOffer_FeeIsNotRepricedLater() public {
        uint256 listingId = _list();
        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 7 days));

        vm.prank(alice);
        (uint256 escrowId,) = marketplace.acceptOffer(offerId);
        uint128 quotedFee = escrowFactory.termsOf(escrowId).feeAmount;

        vm.prank(protocolAdmin);
        feeManager.setFeeBps(keccak256("aeroasset.fee.MARKETPLACE"), 1000);

        assertEq(escrowFactory.termsOf(escrowId).feeAmount, quotedFee, "live trade was re-priced");
    }

    /// @notice Acceptance fails if the seller no longer owns the asset. INV-MKT-04.
    /// @dev The listing's seller is a snapshot; this is what surfaces a mid-flight
    ///      transfer as a failure rather than settling someone else's property.
    function test_RevertWhen_SellerNoLongerOwner() public {
        uint256 listingId = _list();
        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 7 days));

        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, carol, 0);
        vm.prank(carol);
        assetOwnership.acceptTransfer(assetId);

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.SellerNoLongerOwner.selector, assetId, alice, carol));
        vm.prank(alice);
        marketplace.acceptOffer(offerId);
    }

    /// @notice Only the seller may accept.
    function testFuzz_RevertWhen_NonSellerAccepts(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != alice);
        uint256 listingId = _list();
        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 7 days));

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.NotListingSeller.selector, listingId, caller));
        vm.prank(caller);
        marketplace.acceptOffer(offerId);
    }

    /// @notice An expired offer cannot be accepted.
    function test_RevertWhen_AcceptingExpiredOffer() public {
        uint256 listingId = _list();
        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 1 days));

        vm.warp(block.timestamp + 2 days);

        vm.expectRevert(
            abi.encodeWithSelector(IMarketplace.OfferNotActive.selector, offerId, IMarketplace.OfferStatus.ACTIVE)
        );
        vm.prank(alice);
        marketplace.acceptOffer(offerId);
    }

    /// @notice A seller cannot cancel out from under a committed buyer.
    /// @dev docs/threat-model.md T-05.
    function test_RevertWhen_CancellingWithLiveEscrow() public {
        uint256 listingId = _list();
        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 7 days));
        vm.prank(alice);
        (uint256 escrowId,) = marketplace.acceptOffer(offerId);

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.EscrowInProgress.selector, listingId, escrowId));
        vm.prank(alice);
        marketplace.cancelListing(listingId);
    }

    /*//////////////////////////////////////////////////////////////
                            SETTLEMENT HOOKS
    //////////////////////////////////////////////////////////////*/

    /// @notice A released escrow marks its listing sold.
    function test_MarkSold_ByAttachedEscrow() public {
        (uint256 listingId, address escrow) = _acceptedTrade();
        _grantSettlementRole(escrow);

        MockEscrow(escrow).markSold();

        assertEq(uint8(marketplace.getListing(listingId).status), uint8(IMarketplace.ListingStatus.SOLD), "not SOLD");
        assertEq(marketplace.escrowOf(listingId), address(0), "escrow not detached");
        assertEq(marketplace.activeListingOf(assetId), 0, "asset slot not freed");
    }

    /// @notice A cancelled escrow detaches and leaves the listing active.
    /// @dev Without this the listing would be stranded: `cancelListing` refuses while
    ///      an escrow is attached, so one failed trade would freeze it permanently.
    function test_ClearEscrow_LeavesListingActive() public {
        (uint256 listingId, address escrow) = _acceptedTrade();
        _grantSettlementRole(escrow);

        MockEscrow(escrow).clearEscrow();

        assertTrue(marketplace.isListingActive(listingId), "listing not still active");
        assertEq(marketplace.escrowOf(listingId), address(0), "escrow not detached");
        assertEq(marketplace.getListing(listingId).escrowId, 0, "escrow id not cleared");

        // The seller can now cancel, or accept a different offer.
        vm.prank(alice);
        marketplace.cancelListing(listingId);
    }

    /// @notice Holding `SETTLEMENT_ROLE` is not sufficient to close a trade.
    /// @dev The same defence in depth as `AssetOwnership.settleTransfer`: the caller
    ///      must be *this listing's* escrow, so a rogue role-holder cannot close out a
    ///      trade it is not party to.
    function test_RevertWhen_ForeignEscrowMarksSold() public {
        (uint256 listingId, address escrow) = _acceptedTrade();
        address rogue = makeAddr("rogueEscrow");
        _grantSettlementRole(rogue);

        vm.expectRevert(abi.encodeWithSelector(UnexpectedCaller.selector, escrow, rogue));
        vm.prank(rogue);
        marketplace.markSold(listingId);

        vm.expectRevert(abi.encodeWithSelector(UnexpectedCaller.selector, escrow, rogue));
        vm.prank(rogue);
        marketplace.clearEscrow(listingId);
    }

    /// @notice A caller without `SETTLEMENT_ROLE` cannot reach the hooks at all.
    function testFuzz_RevertWhen_UnauthorizedSettlementHooks(address caller) public {
        _assumeUnprivileged(caller);
        (uint256 listingId,) = _acceptedTrade();

        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("MissingRole(bytes32,address)")), keccak256("aeroasset.role.SETTLEMENT"), caller
            )
        );
        vm.prank(caller);
        marketplace.markSold(listingId);
    }

    /*//////////////////////////////////////////////////////////////
                                  PAUSE
    //////////////////////////////////////////////////////////////*/

    /// @notice Pausing blocks listing, offering and acceptance.
    function test_Pause_BlocksTrading() public {
        uint256 listingId = _list();
        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 7 days));

        vm.prank(pauser);
        marketplace.pause();

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(alice);
        marketplace.acceptOffer(offerId);

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(carol);
        marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 7 days));
    }

    /// @notice Permissionless expiry stays available while paused.
    /// @dev It only records elapsed time, so blocking it would serve no purpose.
    function test_Pause_AllowsExpiry() public {
        uint256 listingId = _list();
        vm.warp(block.timestamp + 31 days);

        vm.prank(pauser);
        marketplace.pause();

        marketplace.expireListing(listingId);
        assertEq(
            uint8(marketplace.getListing(listingId).status),
            uint8(IMarketplace.ListingStatus.EXPIRED),
            "expiry blocked while paused"
        );
    }

    /*//////////////////////////////////////////////////////////////
                                 HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Lists, offers and accepts, returning the listing and its escrow.
    /// @return listingId The listing id.
    /// @return escrow The attached escrow address.
    function _acceptedTrade() internal returns (uint256 listingId, address escrow) {
        listingId = _list();
        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 7 days));
        vm.prank(alice);
        (, escrow) = marketplace.acceptOffer(offerId);
    }
}
