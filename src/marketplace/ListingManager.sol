// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAssetRegistry} from "../interfaces/IAssetRegistry.sol";
import {ProtocolCast} from "../libraries/ProtocolCast.sol";
import {DeadlineInPast} from "../libraries/ProtocolErrors.sol";
import {MarketplaceBase} from "./MarketplaceBase.sol";

/// @title ListingManager
/// @author AeroAsset Protocol
/// @notice Listing half of the marketplace state machine.
/// @dev Abstract; deployed as part of {Marketplace}. See {MarketplaceBase} for why the
///      split is a file boundary rather than a deployment boundary.
abstract contract ListingManager is MarketplaceBase {
    using ProtocolCast for uint256;

    /// @notice Longest permitted listing duration.
    /// @dev Bounds how long a stale listing can sit claiming an asset's only active
    ///      slot. Changing it is a UUPS upgrade, deliberately — it is a protocol
    ///      policy, not an operational dial.
    uint40 internal constant MAX_LISTING_DURATION = 365 days;

    /// @notice Lists an owned asset for sale.
    /// @dev Requires the caller to own a verified, non-terminal, transferable asset
    ///      with no other active listing, priced in an allowlisted token.
    /// @param assetId The asset to list.
    /// @param paymentToken The settlement token. Must be allowlisted.
    /// @param price Gross asking price. Must be non-zero.
    /// @param expiresAt When the listing stops being active. Must be in the future and
    ///        within {MAX_LISTING_DURATION}.
    /// @return listingId The newly minted listing id.
    function createListing(uint256 assetId, address paymentToken, uint128 price, uint40 expiresAt)
        external
        whenNotPaused
        returns (uint256 listingId)
    {
        if (price == 0) {
            revert PriceTooLow();
        }
        if (expiresAt <= block.timestamp) {
            revert DeadlineInPast(expiresAt, uint40(block.timestamp));
        }
        if (expiresAt > block.timestamp + MAX_LISTING_DURATION) {
            revert DeadlineTooFar(expiresAt, uint40(block.timestamp + MAX_LISTING_DURATION));
        }

        _fees().requireTokenAllowed(paymentToken);
        _ownership().requireOwner(assetId, msg.sender);

        IAssetRegistry assets = _assets();
        IAssetRegistry.Asset memory asset = assets.getAsset(assetId);
        // FR-23: only a verified asset may be listed. Registration alone is not a
        // claim anyone should be able to trade on.
        if (asset.verifiedAt == 0) {
            revert AssetNotVerified(assetId);
        }
        if (asset.status == IAssetRegistry.AssetStatus.RETIRED || asset.status == IAssetRegistry.AssetStatus.DESTROYED)
        {
            revert IAssetRegistry.AssetTerminal(assetId, asset.status);
        }
        // A locked or frozen asset cannot complete a sale, so it must not start one.
        if (!_ownership().isTransferable(assetId)) {
            revert AssetNotTransferable(assetId);
        }

        uint256 existing = activeListingOf(assetId);
        if (existing != 0) {
            revert AssetAlreadyListed(assetId, existing);
        }

        MarketplaceStorage storage $ = _s();

        // Cannot realistically overflow: one increment per listing transaction.
        unchecked {
            listingId = ++$.listingCount;
        }

        $.listings[listingId] = Listing({
            // A snapshot, deliberately not re-read at settlement. Settlement instead
            // asserts this still matches live ownership, which is what surfaces a
            // mid-flight transfer as a failure rather than a silent re-target.
            seller: msg.sender,
            createdAt: uint40(block.timestamp),
            expiresAt: expiresAt,
            status: ListingStatus.ACTIVE,
            paymentToken: paymentToken,
            assetId: assetId.toUint64(),
            price: price,
            escrowId: 0
        });
        $.activeListingOf[assetId] = listingId;

        emit ListingCreated(listingId, assetId, msg.sender, paymentToken, price, expiresAt);
        emit ListingStatusChanged(listingId, ListingStatus.NONE, ListingStatus.ACTIVE);
    }

    /// @notice Withdraws a listing.
    /// @dev Callable by the seller. Reverts while an escrow is live: a seller must not
    ///      be able to cancel out from under a buyer who has already committed funds.
    /// @param listingId The listing to cancel.
    function cancelListing(uint256 listingId) external whenNotPaused {
        Listing storage listing = _requireListing(listingId);

        if (msg.sender != listing.seller) {
            revert NotListingSeller(listingId, msg.sender);
        }
        if (listing.status != ListingStatus.ACTIVE) {
            revert ListingNotActive(listingId, listing.status);
        }
        if (listing.escrowId != 0) {
            revert EscrowInProgress(listingId, listing.escrowId);
        }

        _writeListingStatus(listingId, listing, ListingStatus.CANCELLED);
    }

    /// @notice Records that a listing's expiry has passed.
    /// @dev **Permissionless by design.** It only makes on-chain state agree with time
    ///      that has already elapsed, and reverts for any listing that has not
    ///      genuinely expired. Consumers must not rely on it having been called —
    ///      {isListingActive} checks expiry directly.
    /// @param listingId The listing to expire.
    function expireListing(uint256 listingId) external {
        Listing storage listing = _requireListing(listingId);

        if (listing.status != ListingStatus.ACTIVE) {
            revert ListingNotActive(listingId, listing.status);
        }
        if (listing.expiresAt == 0 || listing.expiresAt > block.timestamp) {
            revert ListingNotExpired(listingId, listing.expiresAt);
        }

        _writeListingStatus(listingId, listing, ListingStatus.EXPIRED);
    }

    /// @notice Thrown when a listing deadline exceeds the maximum duration.
    /// @param deadline The offending deadline.
    /// @param max The latest permitted deadline.
    error DeadlineTooFar(uint40 deadline, uint40 max);
}
