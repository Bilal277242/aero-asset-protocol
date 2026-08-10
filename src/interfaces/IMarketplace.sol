// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IMarketplace
/// @author AeroAsset Protocol
/// @notice Interface, types, events and errors for listings, offers and settlement
///         hand-off.
/// @dev Layer L4. The marketplace **never custodies funds or assets**. It records
///      intent; `Escrow` moves money and `AssetOwnership` moves title. That is what
///      keeps it upgradeable while the finance contracts stay immutable
///      (`docs/architecture.md` §D1).
interface IMarketplace {
    /*//////////////////////////////////////////////////////////////
                                  TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Lifecycle state of a listing.
    /// @dev `CREATED` and `ACTIVE` from the roadmap are collapsed: no protocol action
    ///      separates them, so a listing is `ACTIVE` from creation.
    enum ListingStatus {
        /// @notice Reserved sentinel, and the value of any unknown id.
        NONE,
        /// @notice Open for offers.
        ACTIVE,
        /// @notice Terminal. Settled through escrow.
        SOLD,
        /// @notice Terminal. Withdrawn by the seller.
        CANCELLED,
        /// @notice Terminal. Recorded once real time passed `expiresAt`.
        EXPIRED
    }

    /// @notice Lifecycle state of an offer.
    enum OfferStatus {
        /// @notice Reserved sentinel, and the value of any unknown id.
        NONE,
        /// @notice Open.
        ACTIVE,
        /// @notice Terminal. The seller accepted; an escrow was opened.
        ACCEPTED,
        /// @notice Terminal. Withdrawn by the buyer.
        WITHDRAWN,
        /// @notice Terminal. Declined by the seller.
        REJECTED,
        /// @notice Terminal. Recorded once real time passed `expiresAt`.
        EXPIRED
    }

    /// @notice An asset offered for sale.
    /// @dev Packed to three slots.
    /// @param seller Owner at listing time. A **snapshot**, deliberately not re-read.
    /// @param createdAt Unix time the listing was created.
    /// @param expiresAt Unix time the listing stops being active.
    /// @param status Stored lifecycle state. Use {isListingActive} for the effective
    ///        state, which also accounts for elapsed time.
    /// @param paymentToken Settlement token, allowlisted at listing time.
    /// @param assetId The asset offered.
    /// @param price Gross asking price in `paymentToken` base units.
    /// @param escrowId Live escrow for this listing, or 0.
    struct Listing {
        address seller;
        uint40 createdAt;
        uint40 expiresAt;
        ListingStatus status;
        address paymentToken;
        uint64 assetId;
        uint128 price;
        uint64 escrowId;
    }

    /// @notice A bid against a listing.
    /// @dev Packed to two slots.
    /// @param buyer The bidder.
    /// @param createdAt Unix time the offer was made.
    /// @param expiresAt Unix time the offer stops being acceptable.
    /// @param status Stored lifecycle state. Use {isOfferActive} for the effective state.
    /// @param listingId The listing bid on.
    /// @param price Gross offered amount in the listing's `paymentToken`.
    struct Offer {
        address buyer;
        uint40 createdAt;
        uint40 expiresAt;
        OfferStatus status;
        uint64 listingId;
        uint128 price;
    }

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a listing is created.
    /// @param listingId The newly minted listing id.
    /// @param assetId The asset offered.
    /// @param seller The owner at listing time.
    /// @param paymentToken The settlement token.
    /// @param price The gross asking price.
    /// @param expiresAt When the listing stops being active.
    event ListingCreated(
        uint256 indexed listingId,
        uint256 indexed assetId,
        address indexed seller,
        address paymentToken,
        uint128 price,
        uint40 expiresAt
    );

    /// @notice Emitted on every listing lifecycle transition.
    /// @param listingId The listing id.
    /// @param oldStatus The status before the transition.
    /// @param newStatus The status after the transition.
    event ListingStatusChanged(
        uint256 indexed listingId, ListingStatus indexed oldStatus, ListingStatus indexed newStatus
    );

    /// @notice Emitted when an offer is made.
    /// @param offerId The newly minted offer id.
    /// @param listingId The listing bid on.
    /// @param buyer The bidder.
    /// @param price The gross offered amount.
    /// @param expiresAt When the offer stops being acceptable.
    event OfferMade(
        uint256 indexed offerId, uint256 indexed listingId, address indexed buyer, uint128 price, uint40 expiresAt
    );

    /// @notice Emitted on every offer lifecycle transition.
    /// @param offerId The offer id.
    /// @param oldStatus The status before the transition.
    /// @param newStatus The status after the transition.
    event OfferStatusChanged(uint256 indexed offerId, OfferStatus indexed oldStatus, OfferStatus indexed newStatus);

    /// @notice Emitted when an accepted offer opens an escrow.
    /// @param listingId The listing being settled.
    /// @param offerId The accepted offer.
    /// @param escrowId The escrow id.
    /// @param escrow The escrow contract address.
    /// @param price The gross settlement amount.
    /// @param feeAmount The protocol fee quoted at acceptance.
    event EscrowOpened(
        uint256 indexed listingId,
        uint256 indexed offerId,
        uint256 indexed escrowId,
        address escrow,
        uint128 price,
        uint128 feeAmount
    );

    /// @notice Emitted when a live escrow is detached from a listing without a sale.
    /// @param listingId The listing id.
    /// @param escrowId The escrow that was detached.
    event EscrowCleared(uint256 indexed listingId, uint256 indexed escrowId);

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when a listing id does not exist.
    /// @param listingId The offending id.
    error ListingNotFound(uint256 listingId);

    /// @notice Thrown when an action requires an effectively-active listing.
    /// @param listingId The listing id.
    /// @param status Its stored status, which may read `ACTIVE` while expired by time.
    error ListingNotActive(uint256 listingId, ListingStatus status);

    /// @notice Thrown when a listing lifecycle transition is not permitted.
    /// @param from The current status.
    /// @param to The attempted status.
    error InvalidListingTransition(ListingStatus from, ListingStatus to);

    /// @notice Thrown when an asset already has an active listing.
    /// @param assetId The asset id.
    /// @param existingListingId The listing already active.
    error AssetAlreadyListed(uint256 assetId, uint256 existingListingId);

    /// @notice Thrown when recording an expiry that has not yet occurred.
    /// @param listingId The listing id.
    /// @param expiresAt Its expiry time.
    error ListingNotExpired(uint256 listingId, uint40 expiresAt);

    /// @notice Thrown when an action is blocked by a live escrow.
    /// @dev A seller must not be able to cancel out from under a buyer who has
    ///      already committed.
    /// @param listingId The listing id.
    /// @param escrowId The live escrow.
    error EscrowInProgress(uint256 listingId, uint256 escrowId);

    /// @notice Thrown when a price is zero.
    error PriceTooLow();

    /// @notice Thrown when the asset is not currently transferable.
    /// @param assetId The asset id.
    error AssetNotTransferable(uint256 assetId);

    /// @notice Thrown when listing an unverified asset.
    /// @param assetId The asset id.
    error AssetNotVerified(uint256 assetId);

    /// @notice Thrown when an offer id does not exist.
    /// @param offerId The offending id.
    error OfferNotFound(uint256 offerId);

    /// @notice Thrown when an action requires an effectively-active offer.
    /// @param offerId The offer id.
    /// @param status Its stored status.
    error OfferNotActive(uint256 offerId, OfferStatus status);

    /// @notice Thrown when an offer lifecycle transition is not permitted.
    /// @param from The current status.
    /// @param to The attempted status.
    error InvalidOfferTransition(OfferStatus from, OfferStatus to);

    /// @notice Thrown when an offer belongs to a different listing.
    /// @param offerId The offer id.
    /// @param expectedListingId The listing expected.
    /// @param actualListingId The listing the offer actually targets.
    error OfferListingMismatch(uint256 offerId, uint256 expectedListingId, uint256 actualListingId);

    /// @notice Thrown when a seller bids on their own listing.
    /// @param seller The offending account.
    error SelfOffer(address seller);

    /// @notice Thrown when the caller is not the offer's buyer.
    /// @param offerId The offer id.
    /// @param caller The unauthorized caller.
    error NotOfferBuyer(uint256 offerId, address caller);

    /// @notice Thrown when the caller is not the listing's seller.
    /// @param listingId The listing id.
    /// @param caller The unauthorized caller.
    error NotListingSeller(uint256 listingId, address caller);

    /// @notice Thrown when recording an offer expiry that has not yet occurred.
    /// @param offerId The offer id.
    /// @param expiresAt Its expiry time.
    error OfferNotExpired(uint256 offerId, uint40 expiresAt);

    /// @notice Thrown when the seller no longer owns the asset they listed.
    /// @dev Closes the "sell it twice" race: the listing's `seller` is a snapshot, and
    ///      settlement re-checks it against live ownership (`INV-MKT-04`).
    /// @param assetId The asset id.
    /// @param expectedSeller The seller recorded on the listing.
    /// @param actualOwner The current owner.
    error SellerNoLongerOwner(uint256 assetId, address expectedSeller, address actualOwner);
}
