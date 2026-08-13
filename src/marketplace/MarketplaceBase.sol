// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolModuleUpgradeable} from "../core/ProtocolModuleUpgradeable.sol";
import {IAssetOwnership} from "../interfaces/IAssetOwnership.sol";
import {IAssetRegistry} from "../interfaces/IAssetRegistry.sol";
import {IFeeManager} from "../interfaces/IFeeManager.sol";
import {IMarketplace} from "../interfaces/IMarketplace.sol";
import {ProtocolAddressKeys} from "../libraries/ProtocolAddressKeys.sol";

/// @title MarketplaceBase
/// @author AeroAsset Protocol
/// @notice Shared storage, status machinery and peer resolution for the marketplace.
/// @dev {ListingManager} and {OfferManager} are abstract halves of one state machine
///      and share this storage namespace, so the split is a source-file boundary
///      rather than a deployment boundary (`docs/architecture.md` §3.1). Splitting
///      them into separate contracts would require cross-contract authorization
///      between two halves of the same machine, for no isolation benefit — neither
///      custodies funds.
///
///      **Effective status is computed, never stored.** A listing or offer past its
///      deadline reads `ACTIVE` in storage until someone pays to record the expiry.
///      Consumers must use {isListingActive} / {isOfferActive}, exactly as
///      `CredentialRegistry` requires {isValid} over a raw status read.
abstract contract MarketplaceBase is ProtocolModuleUpgradeable, IMarketplace {
    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice ERC-7201 namespaced storage shared by both marketplace halves.
    /// @param listingCount Highest minted listing id. Ids are dense from 1.
    /// @param offerCount Highest minted offer id. Ids are dense from 1.
    /// @param listings Listing records by id.
    /// @param offers Offer records by id.
    /// @param activeListingOf The single active listing per asset, enforcing
    ///        `INV-MKT-02` in O(1) with no search.
    /// @param escrowOf The escrow contract currently attached to a listing, or zero.
    ///        Settlement callbacks are authorized against this, not merely against
    ///        `SETTLEMENT_ROLE`.
    /// @custom:storage-location erc7201:aeroasset.storage.Marketplace
    struct MarketplaceStorage {
        uint256 listingCount;
        uint256 offerCount;
        mapping(uint256 listingId => Listing) listings;
        mapping(uint256 offerId => Offer) offers;
        mapping(uint256 assetId => uint256 listingId) activeListingOf;
        mapping(uint256 listingId => address escrow) escrowOf;
    }

    /// @dev `keccak256(abi.encode(uint256(keccak256("aeroasset.storage.Marketplace")) - 1))
    ///      & ~bytes32(uint256(0xff))`. Asserted in `test/upgrade/Namespaces.t.sol`.
    bytes32 private constant _MARKETPLACE_STORAGE = 0xb05b97945034696db99e023472a493b922a17679dd5cac26de9d694a080ee100;

    /*//////////////////////////////////////////////////////////////
                             EFFECTIVE STATUS
    //////////////////////////////////////////////////////////////*/

    /// @notice Reports whether a listing is currently open for offers.
    /// @dev Checks stored status **and** elapsed time. Reading `status` alone would
    ///      treat a long-expired listing as live.
    ///
    ///      There is no "never expires" case: {ListingManager.createListing} rejects any
    ///      `expiresAt` at or before `block.timestamp`, which rejects zero, and no path
    ///      rewrites the field afterwards. An earlier `expiresAt == 0 ||` disjunct here
    ///      was therefore unreachable (audit AAP-20). Perpetual listings would also
    ///      contradict `MAX_LISTING_DURATION`, which exists to stop a stale listing
    ///      holding an asset's only active slot indefinitely.
    /// @param listingId The listing id.
    /// @return True if the listing is `ACTIVE` and unexpired.
    function isListingActive(uint256 listingId) public view returns (bool) {
        Listing storage listing = _s().listings[listingId];
        if (listing.status != ListingStatus.ACTIVE) {
            return false;
        }
        return listing.expiresAt > block.timestamp;
    }

    /// @notice Reports whether an offer is currently acceptable.
    /// @dev Requires the offer itself to be live; the listing is checked separately by
    ///      the caller, since an offer can outlive the listing it targets.
    ///
    ///      As with listings, there is no non-expiring case — {OfferManager.makeOffer}
    ///      rejects zero along with every other past deadline.
    ///
    ///      Note that `CredentialRegistry.isValid` keeps its `expiresAt == 0` disjunct:
    ///      there the zero case is genuinely reachable, because a credential may be
    ///      issued without an expiry.
    /// @param offerId The offer id.
    /// @return True if the offer is `ACTIVE` and unexpired.
    function isOfferActive(uint256 offerId) public view returns (bool) {
        Offer storage offer = _s().offers[offerId];
        if (offer.status != OfferStatus.ACTIVE) {
            return false;
        }
        return offer.expiresAt > block.timestamp;
    }

    /// @notice Reports whether a listing transition is permitted.
    /// @dev `SOLD`, `CANCELLED` and `EXPIRED` are all absorbing, which is what makes
    ///      `INV-MKT-01` hold: a sold listing can never return to `ACTIVE`.
    /// @param from The current status.
    /// @param to The proposed status.
    /// @return True if the transition is legal.
    function isValidListingTransition(ListingStatus from, ListingStatus to) public pure returns (bool) {
        if (from != ListingStatus.ACTIVE) {
            return false;
        }
        return to == ListingStatus.SOLD || to == ListingStatus.CANCELLED || to == ListingStatus.EXPIRED;
    }

    /// @notice Reports whether an offer transition is permitted.
    /// @dev Every non-`ACTIVE` offer status is terminal.
    /// @param from The current status.
    /// @param to The proposed status.
    /// @return True if the transition is legal.
    function isValidOfferTransition(OfferStatus from, OfferStatus to) public pure returns (bool) {
        if (from != OfferStatus.ACTIVE) {
            return false;
        }
        return to != OfferStatus.NONE && to != OfferStatus.ACTIVE;
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the stored listing record.
    /// @dev Raw storage. Pair with {isListingActive} for the effective state.
    /// @param listingId The listing id.
    /// @return The listing record.
    function getListing(uint256 listingId) external view returns (Listing memory) {
        return _requireListing(listingId);
    }

    /// @notice Returns the stored offer record.
    /// @param offerId The offer id.
    /// @return The offer record.
    function getOffer(uint256 offerId) external view returns (Offer memory) {
        return _requireOffer(offerId);
    }

    /// @notice Returns the active listing for an asset, if any.
    /// @param assetId The asset id.
    /// @return The active listing id, or 0.
    function activeListingOf(uint256 assetId) public view returns (uint256) {
        uint256 listingId = _s().activeListingOf[assetId];
        // The index is cleared on every terminal transition, but a listing can lapse
        // by time alone with no transaction, so the freshness check is still required.
        if (listingId != 0 && !isListingActive(listingId)) {
            return 0;
        }
        return listingId;
    }

    /// @notice Returns the escrow contract attached to a listing.
    /// @param listingId The listing id.
    /// @return The escrow address, or zero when none is live.
    function escrowOf(uint256 listingId) public view returns (address) {
        return _s().escrowOf[listingId];
    }

    /// @notice Returns the number of listings created so far.
    /// @return The highest minted listing id.
    function listingCount() external view returns (uint256) {
        return _s().listingCount;
    }

    /// @notice Returns the number of offers made so far.
    /// @return The highest minted offer id.
    function offerCount() external view returns (uint256) {
        return _s().offerCount;
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @notice Writes a validated listing status change and maintains the index.
    /// @param listingId The listing id.
    /// @param listing Storage pointer to the record.
    /// @param to The status to move to.
    function _writeListingStatus(uint256 listingId, Listing storage listing, ListingStatus to) internal {
        ListingStatus from = listing.status;
        if (!isValidListingTransition(from, to)) {
            revert InvalidListingTransition(from, to);
        }

        listing.status = to;

        // Every exit from ACTIVE is terminal, so the per-asset index is always freed.
        MarketplaceStorage storage $ = _s();
        if ($.activeListingOf[listing.assetId] == listingId) {
            delete $.activeListingOf[listing.assetId];
        }

        emit ListingStatusChanged(listingId, from, to);
    }

    /// @notice Writes a validated offer status change.
    /// @param offerId The offer id.
    /// @param offer Storage pointer to the record.
    /// @param to The status to move to.
    function _writeOfferStatus(uint256 offerId, Offer storage offer, OfferStatus to) internal {
        OfferStatus from = offer.status;
        if (!isValidOfferTransition(from, to)) {
            revert InvalidOfferTransition(from, to);
        }

        offer.status = to;

        emit OfferStatusChanged(offerId, from, to);
    }

    /// @notice Returns a storage pointer to an existing listing, or reverts.
    /// @param listingId The listing id.
    /// @return listing Storage pointer to the record.
    function _requireListing(uint256 listingId) internal view returns (Listing storage listing) {
        listing = _s().listings[listingId];
        if (listing.status == ListingStatus.NONE) {
            revert ListingNotFound(listingId);
        }
    }

    /// @notice Returns a storage pointer to an existing offer, or reverts.
    /// @param offerId The offer id.
    /// @return offer Storage pointer to the record.
    function _requireOffer(uint256 offerId) internal view returns (Offer storage offer) {
        offer = _s().offers[offerId];
        if (offer.status == OfferStatus.NONE) {
            revert OfferNotFound(offerId);
        }
    }

    /// @notice Resolves the generic asset registry.
    /// @return The current `AssetRegistry`.
    function _assets() internal view returns (IAssetRegistry) {
        return IAssetRegistry(_resolve(ProtocolAddressKeys.ASSET_REGISTRY));
    }

    /// @notice Resolves the ownership ledger.
    /// @return The current `AssetOwnership`.
    function _ownership() internal view returns (IAssetOwnership) {
        return IAssetOwnership(_resolve(ProtocolAddressKeys.ASSET_OWNERSHIP));
    }

    /// @notice Resolves the fee manager.
    /// @return The current `FeeManager`.
    function _fees() internal view returns (IFeeManager) {
        return IFeeManager(_resolve(ProtocolAddressKeys.FEE_MANAGER));
    }

    /// @notice Returns a pointer to the shared ERC-7201 storage struct.
    /// @return $ The marketplace storage.
    function _s() internal pure returns (MarketplaceStorage storage $) {
        assembly ("memory-safe") {
            $.slot := _MARKETPLACE_STORAGE
        }
    }
}
