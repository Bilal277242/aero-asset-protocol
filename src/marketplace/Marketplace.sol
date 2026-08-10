// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IEscrowFactory} from "../interfaces/IEscrowFactory.sol";
import {ProtocolAddressKeys} from "../libraries/ProtocolAddressKeys.sol";
import {ProtocolCast} from "../libraries/ProtocolCast.sol";
import {UnexpectedCaller} from "../libraries/ProtocolErrors.sol";
import {ProtocolFeeTypes} from "../libraries/ProtocolFeeTypes.sol";
import {ProtocolRoles} from "../libraries/ProtocolRoles.sol";
import {ListingManager} from "./ListingManager.sol";
import {OfferManager} from "./OfferManager.sol";
import {
    ReentrancyGuardTransientUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";

/// @title Marketplace
/// @author AeroAsset Protocol
/// @notice Listings, offers and the hand-off into escrow.
/// @dev Layer L4. **The marketplace never custodies funds or assets.** It records
///      intent; `Escrow` moves money and `AssetOwnership` moves title. That separation
///      is why this contract can be upgradeable while the finance contracts stay
///      immutable (`docs/architecture.md` §D1) — an upgrade here cannot reach anyone's
///      money.
///
///      {ListingManager} and {OfferManager} are abstract halves of one state machine,
///      deployed as this single contract.
contract Marketplace is ListingManager, OfferManager, ReentrancyGuardTransientUpgradeable {
    using ProtocolCast for uint256;

    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice How long a buyer has to fund an escrow after acceptance.
    uint40 internal constant FUNDING_WINDOW = 7 days;

    /// @notice How long a funded escrow may remain unsettled before anyone may refund
    ///         the buyer.
    /// @dev Bounds how long a seller's asset can sit locked by an unresponsive buyer.
    ///      Measured from acceptance, so it is known to both parties up front.
    uint40 internal constant SETTLEMENT_WINDOW = 30 days;

    /*//////////////////////////////////////////////////////////////
                              INITIALIZATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Initializes the marketplace behind its ERC-1967 proxy.
    /// @param roleManager_ The protocol `RoleManager`. Must be non-zero.
    /// @param addressRegistry_ The protocol `ProtocolAddressRegistry`. Must be non-zero.
    function initialize(address roleManager_, address addressRegistry_) external initializer {
        __ProtocolModule_init(roleManager_, addressRegistry_);
        __ReentrancyGuardTransient_init();
    }

    /*//////////////////////////////////////////////////////////////
                                ACCEPTANCE
    //////////////////////////////////////////////////////////////*/

    /// @notice Accepts an offer and opens a per-trade escrow.
    /// @dev Callable by the listing's seller. Freezes the trade terms — price, fee and
    ///      both deadlines — at this moment, so a later fee change or price edit
    ///      cannot re-price a live trade.
    ///
    ///      Guarded and ordered checks-effects-interactions: the offer is marked
    ///      `ACCEPTED` before `EscrowFactory` is called, so a reentrant path finds a
    ///      terminal offer and fails the transition guard.
    /// @param offerId The offer to accept.
    /// @return escrowId The newly opened escrow id.
    /// @return escrow The deployed escrow's address.
    function acceptOffer(uint256 offerId)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 escrowId, address escrow)
    {
        Offer storage offer = _requireOffer(offerId);
        uint256 listingId = offer.listingId;
        Listing storage listing = _requireListing(listingId);

        if (msg.sender != listing.seller) {
            revert NotListingSeller(listingId, msg.sender);
        }
        if (!isListingActive(listingId)) {
            revert ListingNotActive(listingId, listing.status);
        }
        if (!isOfferActive(offerId)) {
            revert OfferNotActive(offerId, offer.status);
        }
        if (listing.escrowId != 0) {
            revert EscrowInProgress(listingId, listing.escrowId);
        }

        uint256 assetId = listing.assetId;

        // The listing's `seller` is a snapshot taken at creation. If the asset changed
        // hands since, the trade is against a stale premise — fail loudly rather than
        // settle someone else's property (INV-MKT-04).
        address currentOwner = _ownership().ownerOf(assetId);
        if (currentOwner != listing.seller) {
            revert SellerNoLongerOwner(assetId, listing.seller, currentOwner);
        }
        // `isTransferable` already subsumes the terminal check: `AssetRegistry`
        // freezes transferability in the same transaction as the terminal status
        // change, and `INV-OWN-06` asserts the mirror never drifts. A separate
        // `isTerminal` call here would be unreachable code costing two external calls
        // on every acceptance.
        if (!_ownership().isTransferable(assetId)) {
            revert AssetNotTransferable(assetId);
        }

        uint128 price = offer.price;
        uint128 feeAmount = _fees().quote(ProtocolFeeTypes.MARKETPLACE, price).toUint128();

        // Effects before the external call.
        _writeOfferStatus(offerId, offer, OfferStatus.ACCEPTED);

        (escrowId, escrow) = IEscrowFactory(_resolve(ProtocolAddressKeys.ESCROW_FACTORY))
            .openEscrow(
                IEscrowFactory.EscrowTerms({
                    listingId: listingId,
                    assetId: assetId,
                    buyer: offer.buyer,
                    seller: listing.seller,
                    paymentToken: listing.paymentToken,
                    price: price,
                    feeAmount: feeAmount,
                    fundingDeadline: uint40(block.timestamp) + FUNDING_WINDOW,
                    settlementDeadline: uint40(block.timestamp) + SETTLEMENT_WINDOW
                })
            );

        MarketplaceStorage storage $ = _s();
        listing.escrowId = escrowId.toUint64();
        $.escrowOf[listingId] = escrow;

        emit EscrowOpened(listingId, offerId, escrowId, escrow, price, feeAmount);
    }

    /*//////////////////////////////////////////////////////////////
                            SETTLEMENT HOOKS
    //////////////////////////////////////////////////////////////*/

    /// @notice Marks a listing sold once its escrow has released.
    /// @dev Restricted to `SETTLEMENT_ROLE` **and** to the escrow attached to this
    ///      listing. Holding the role alone is not sufficient — the same defence in
    ///      depth as `AssetOwnership.settleTransfer`, so a rogue role-holder cannot
    ///      close out a trade it is not party to.
    /// @param listingId The listing to mark sold.
    function markSold(uint256 listingId) external onlyRole(ProtocolRoles.SETTLEMENT_ROLE) {
        Listing storage listing = _requireListing(listingId);
        _requireAttachedEscrow(listingId);

        listing.escrowId = 0;
        delete _s().escrowOf[listingId];

        _writeListingStatus(listingId, listing, ListingStatus.SOLD);
    }

    /// @notice Detaches a listing's escrow without selling.
    /// @dev Called when an escrow reaches a non-release terminal state — cancelled or
    ///      refunded. The listing stays `ACTIVE` so the seller can accept another
    ///      offer or cancel; without this, a single failed trade would strand the
    ///      listing permanently, since `cancelListing` refuses while an escrow is live.
    ///
    ///      Restricted to the attached escrow, exactly as {markSold} is.
    /// @param listingId The listing to detach.
    function clearEscrow(uint256 listingId) external onlyRole(ProtocolRoles.SETTLEMENT_ROLE) {
        Listing storage listing = _requireListing(listingId);
        _requireAttachedEscrow(listingId);

        uint256 escrowId = listing.escrowId;
        listing.escrowId = 0;
        delete _s().escrowOf[listingId];

        emit EscrowCleared(listingId, escrowId);
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @notice Reverts unless the caller is the escrow attached to this listing.
    /// @param listingId The listing id.
    function _requireAttachedEscrow(uint256 listingId) private view {
        address attached = _s().escrowOf[listingId];
        if (msg.sender != attached) {
            revert UnexpectedCaller(attached, msg.sender);
        }
    }
}
