// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolCast} from "../libraries/ProtocolCast.sol";
import {DeadlineInPast} from "../libraries/ProtocolErrors.sol";
import {MarketplaceBase} from "./MarketplaceBase.sol";

/// @title OfferManager
/// @author AeroAsset Protocol
/// @notice Offer half of the marketplace state machine.
/// @dev Abstract; deployed as part of {Marketplace}.
///
///      Accepting an offer does **not** bulk-reject its siblings. Doing so would
///      iterate an attacker-controlled array in a state-changing function, which the
///      protocol forbids without exception (`docs/security-model.md` §5). Sibling
///      offers simply become unacceptable once the listing leaves `ACTIVE`, and no
///      funds are locked by an unaccepted offer, so nothing is at risk while one sits
///      idle.
abstract contract OfferManager is MarketplaceBase {
    using ProtocolCast for uint256;

    /// @notice Makes an offer against an active listing.
    /// @dev The offer carries no funds. It is an expression of intent; the buyer only
    ///      commits capital when the seller accepts and the escrow is funded.
    /// @param listingId The listing to bid on.
    /// @param price Gross offered amount. Must be non-zero.
    /// @param expiresAt When the offer stops being acceptable. Must be in the future.
    /// @return offerId The newly minted offer id.
    function makeOffer(uint256 listingId, uint128 price, uint40 expiresAt)
        external
        whenNotPaused
        returns (uint256 offerId)
    {
        Listing storage listing = _requireListing(listingId);

        if (price == 0) {
            revert PriceTooLow();
        }
        if (expiresAt <= block.timestamp) {
            revert DeadlineInPast(expiresAt, uint40(block.timestamp));
        }
        if (!isListingActive(listingId)) {
            revert ListingNotActive(listingId, listing.status);
        }
        if (msg.sender == listing.seller) {
            revert SelfOffer(msg.sender);
        }

        MarketplaceStorage storage $ = _s();

        // Cannot realistically overflow: one increment per offer transaction.
        unchecked {
            offerId = ++$.offerCount;
        }

        $.offers[offerId] = Offer({
            buyer: msg.sender,
            createdAt: uint40(block.timestamp),
            expiresAt: expiresAt,
            status: OfferStatus.ACTIVE,
            listingId: listingId.toUint64(),
            price: price
        });

        emit OfferMade(offerId, listingId, msg.sender, price, expiresAt);
        emit OfferStatusChanged(offerId, OfferStatus.NONE, OfferStatus.ACTIVE);
    }

    /// @notice Withdraws an offer.
    /// @dev Callable by the buyer at any time while the offer is active. A buyer is
    ///      never locked into a bid they have not funded.
    ///
    ///      **An offer is binding until withdrawn, and withdrawal is not guaranteed to
    ///      win a race with acceptance.** A pending `withdrawOffer` is visible in the
    ///      mempool, so a seller can front-run it with {Marketplace.acceptOffer} and
    ///      force the offer to `ACCEPTED` (audit AAP-19). This is accepted behaviour
    ///      rather than a defect, and it is documented here because silence made it
    ///      look like an oversight.
    ///
    ///      The exposure is bounded: an offer carries no funds, so the buyer's remedy is
    ///      simply not to call `fund`. Either party may then `cancel` the escrow
    ///      immediately, and anyone may once `fundingDeadline` passes. The buyer loses
    ///      gas; the seller gains nothing and has burned their listing's escrow slot for
    ///      as long as they leave it open.
    /// @param offerId The offer to withdraw.
    function withdrawOffer(uint256 offerId) external whenNotPaused {
        Offer storage offer = _requireOffer(offerId);

        if (msg.sender != offer.buyer) {
            revert NotOfferBuyer(offerId, msg.sender);
        }

        _writeOfferStatus(offerId, offer, OfferStatus.WITHDRAWN);
    }

    /// @notice Declines an offer.
    /// @dev Callable by the seller of the offer's listing.
    /// @param offerId The offer to reject.
    function rejectOffer(uint256 offerId) external whenNotPaused {
        Offer storage offer = _requireOffer(offerId);
        Listing storage listing = _requireListing(offer.listingId);

        if (msg.sender != listing.seller) {
            revert NotListingSeller(offer.listingId, msg.sender);
        }

        _writeOfferStatus(offerId, offer, OfferStatus.REJECTED);
    }

    /// @notice Records that an offer's expiry has passed.
    /// @dev Permissionless, for the same reason as listing expiry: it only records
    ///      elapsed time and reverts otherwise.
    /// @param offerId The offer to expire.
    function expireOffer(uint256 offerId) external {
        Offer storage offer = _requireOffer(offerId);

        if (offer.status != OfferStatus.ACTIVE) {
            revert OfferNotActive(offerId, offer.status);
        }
        // No `expiresAt == 0` case: {makeOffer} rejects it. See `isOfferActive`.
        if (offer.expiresAt > block.timestamp) {
            revert OfferNotExpired(offerId, offer.expiresAt);
        }

        _writeOfferStatus(offerId, offer, OfferStatus.EXPIRED);
    }
}
