// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAssetRegistry} from "../../../src/interfaces/IAssetRegistry.sol";
import {IMarketplace} from "../../../src/interfaces/IMarketplace.sol";
import {DeadlineInPast} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";

/// @title MarketplaceStateMachineTest
/// @author AeroAsset Protocol
/// @notice Exhaustive transition-table coverage and the negative paths that guard it.
/// @dev Kept separate from `Marketplace.t.sol`, which covers behaviour. This suite
///      covers the machine itself: every `(from, to)` pair, every not-found path, and
///      every guard that rejects an operation on an already-terminal record.
contract MarketplaceStateMachineTest is ProtocolTestBase {
    uint128 internal constant PRICE = 1_000_000e6;

    /// @dev Verified aircraft owned by `alice`, with an active listing.
    uint256 internal assetId;
    /// @dev The active listing.
    uint256 internal listingId;

    function setUp() public override {
        super.setUp();
        uint256 orgId;
        (orgId, assetId, listingId) = _listedAircraft(PRICE);
        orgId; // silence unused-variable warning without weakening the fixture
    }

    /*//////////////////////////////////////////////////////////////
                            TRANSITION TABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice The listing table matches `docs/state-machines.md` §5 exactly.
    /// @dev Only `ACTIVE` has outgoing transitions, and all three exits are terminal —
    ///      which is what makes `INV-MKT-01` hold.
    function test_ListingTransitionTable() public view {
        uint8 expired = uint8(IMarketplace.ListingStatus.EXPIRED);
        uint8 active = uint8(IMarketplace.ListingStatus.ACTIVE);

        for (uint8 from; from <= expired; ++from) {
            for (uint8 to; to <= expired; ++to) {
                bool isTerminalTarget = to == uint8(IMarketplace.ListingStatus.SOLD)
                    || to == uint8(IMarketplace.ListingStatus.CANCELLED) || to == expired;
                bool expected = from == active && isTerminalTarget;

                assertEq(
                    marketplace.isValidListingTransition(
                        IMarketplace.ListingStatus(from), IMarketplace.ListingStatus(to)
                    ),
                    expected,
                    "listing table drifted from specification"
                );
            }
        }
    }

    /// @notice The offer table matches `docs/state-machines.md` §6 exactly.
    /// @dev Every non-`ACTIVE` offer status is terminal.
    function test_OfferTransitionTable() public view {
        uint8 expired = uint8(IMarketplace.OfferStatus.EXPIRED);
        uint8 active = uint8(IMarketplace.OfferStatus.ACTIVE);

        for (uint8 from; from <= expired; ++from) {
            for (uint8 to; to <= expired; ++to) {
                bool expected = from == active && to != 0 && to != active;

                assertEq(
                    marketplace.isValidOfferTransition(IMarketplace.OfferStatus(from), IMarketplace.OfferStatus(to)),
                    expected,
                    "offer table drifted from specification"
                );
            }
        }
    }

    /*//////////////////////////////////////////////////////////////
                                NOT FOUND
    //////////////////////////////////////////////////////////////*/

    /// @notice Every listing accessor rejects an unknown id.
    function testFuzz_RevertWhen_ListingUnknown(uint256 unknownId) public {
        vm.assume(unknownId != listingId && unknownId != 0);

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.ListingNotFound.selector, unknownId));
        marketplace.getListing(unknownId);

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.ListingNotFound.selector, unknownId));
        vm.prank(alice);
        marketplace.cancelListing(unknownId);

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.ListingNotFound.selector, unknownId));
        marketplace.expireListing(unknownId);

        // An unknown listing is simply not active, rather than reverting.
        assertFalse(marketplace.isListingActive(unknownId), "unknown listing reported active");
    }

    /// @notice Every offer accessor rejects an unknown id.
    function testFuzz_RevertWhen_OfferUnknown(uint256 unknownId) public {
        vm.assume(unknownId != 0);

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.OfferNotFound.selector, unknownId));
        marketplace.getOffer(unknownId);

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.OfferNotFound.selector, unknownId));
        vm.prank(bob);
        marketplace.withdrawOffer(unknownId);

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.OfferNotFound.selector, unknownId));
        marketplace.expireOffer(unknownId);

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.OfferNotFound.selector, unknownId));
        vm.prank(alice);
        marketplace.acceptOffer(unknownId);

        assertFalse(marketplace.isOfferActive(unknownId), "unknown offer reported active");
    }

    /*//////////////////////////////////////////////////////////////
                             OFFER VALIDATION
    //////////////////////////////////////////////////////////////*/

    /// @notice A zero-price offer is rejected.
    function test_RevertWhen_OfferPriceIsZero() public {
        vm.expectRevert(IMarketplace.PriceTooLow.selector);
        vm.prank(bob);
        marketplace.makeOffer(listingId, 0, uint40(block.timestamp + 1 days));
    }

    /// @notice An offer deadline must be strictly in the future.
    function test_RevertWhen_OfferDeadlineNotFuture() public {
        uint40 now_ = uint40(block.timestamp);

        vm.expectRevert(abi.encodeWithSelector(DeadlineInPast.selector, now_, now_));
        vm.prank(bob);
        marketplace.makeOffer(listingId, PRICE, now_);
    }

    /// @notice An offer cannot be made against an inactive listing.
    function test_RevertWhen_OfferingOnInactiveListing() public {
        vm.prank(alice);
        marketplace.cancelListing(listingId);

        vm.expectRevert(
            abi.encodeWithSelector(
                IMarketplace.ListingNotActive.selector, listingId, IMarketplace.ListingStatus.CANCELLED
            )
        );
        vm.prank(bob);
        marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 1 days));
    }

    /// @notice An offer cannot be made against a listing that lapsed by time.
    /// @dev The stored status still reads `ACTIVE`, so this exercises the computed
    ///      check rather than the stored one.
    function test_RevertWhen_OfferingOnLapsedListing() public {
        vm.warp(block.timestamp + 31 days);

        vm.expectRevert(
            abi.encodeWithSelector(IMarketplace.ListingNotActive.selector, listingId, IMarketplace.ListingStatus.ACTIVE)
        );
        vm.prank(bob);
        marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 1 days));
    }

    /*//////////////////////////////////////////////////////////////
                            TERMINAL GUARDS
    //////////////////////////////////////////////////////////////*/

    /// @notice A terminal offer cannot be withdrawn, rejected or expired again.
    function test_RevertWhen_MutatingTerminalOffer() public {
        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 1 days));
        vm.prank(bob);
        marketplace.withdrawOffer(offerId);

        vm.expectRevert(
            abi.encodeWithSelector(
                IMarketplace.InvalidOfferTransition.selector,
                IMarketplace.OfferStatus.WITHDRAWN,
                IMarketplace.OfferStatus.WITHDRAWN
            )
        );
        vm.prank(bob);
        marketplace.withdrawOffer(offerId);

        vm.expectRevert(
            abi.encodeWithSelector(
                IMarketplace.InvalidOfferTransition.selector,
                IMarketplace.OfferStatus.WITHDRAWN,
                IMarketplace.OfferStatus.REJECTED
            )
        );
        vm.prank(alice);
        marketplace.rejectOffer(offerId);

        vm.expectRevert(
            abi.encodeWithSelector(IMarketplace.OfferNotActive.selector, offerId, IMarketplace.OfferStatus.WITHDRAWN)
        );
        marketplace.expireOffer(offerId);
    }

    /// @notice An offer expiry cannot be recorded early.
    function test_RevertWhen_ExpiringLiveOffer() public {
        uint40 deadline = uint40(block.timestamp + 1 days);
        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, deadline);

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.OfferNotExpired.selector, offerId, deadline));
        marketplace.expireOffer(offerId);
    }

    /// @notice A cancelled listing cannot be expired, and vice versa.
    function test_RevertWhen_ExpiringTerminalListing() public {
        vm.prank(alice);
        marketplace.cancelListing(listingId);
        vm.warp(block.timestamp + 31 days);

        vm.expectRevert(
            abi.encodeWithSelector(
                IMarketplace.ListingNotActive.selector, listingId, IMarketplace.ListingStatus.CANCELLED
            )
        );
        marketplace.expireListing(listingId);
    }

    /*//////////////////////////////////////////////////////////////
                             ACCEPTANCE GUARDS
    //////////////////////////////////////////////////////////////*/

    /// @notice An offer on a lapsed listing cannot be accepted.
    function test_RevertWhen_AcceptingOnLapsedListing() public {
        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 60 days));

        vm.warp(block.timestamp + 31 days);

        vm.expectRevert(
            abi.encodeWithSelector(IMarketplace.ListingNotActive.selector, listingId, IMarketplace.ListingStatus.ACTIVE)
        );
        vm.prank(alice);
        marketplace.acceptOffer(offerId);
    }

    /// @notice An offer cannot be accepted once the asset is locked by another escrow.
    function test_RevertWhen_AcceptingWithAssetLocked() public {
        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 7 days));

        address foreignEscrow = makeAddr("foreignEscrow");
        _grantSettlementRole(foreignEscrow);
        vm.prank(foreignEscrow);
        assetOwnership.setTransferLock(assetId, true);

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.AssetNotTransferable.selector, assetId));
        vm.prank(alice);
        marketplace.acceptOffer(offerId);
    }

    /// @notice Only the seller may cancel a listing.
    function testFuzz_RevertWhen_NonSellerCancels(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != alice);

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.NotListingSeller.selector, listingId, caller));
        vm.prank(caller);
        marketplace.cancelListing(listingId);
    }

    /// @notice A destroyed asset cannot have an offer accepted against it.
    /// @dev Surfaces as `AssetNotTransferable`: the terminal status freezes
    ///      transferability atomically, so the frozen check catches it first and a
    ///      separate terminal check would be unreachable.
    function test_RevertWhen_AcceptingOnDestroyedAsset() public {
        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 7 days));

        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.DESTROYED);

        vm.expectRevert(abi.encodeWithSelector(IMarketplace.AssetNotTransferable.selector, assetId));
        vm.prank(alice);
        marketplace.acceptOffer(offerId);
    }

    /*//////////////////////////////////////////////////////////////
                                 COUNTERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Listing and offer counters are dense and monotonic.
    function test_CountersAreDenseAndMonotonic() public {
        assertEq(marketplace.listingCount(), 1, "listing counter wrong after fixture");
        assertEq(marketplace.offerCount(), 0, "offer counter not zero");

        for (uint256 i = 1; i <= 3; ++i) {
            vm.prank(bob);
            uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 1 days));
            assertEq(offerId, i, "offer id not monotonic");
            assertEq(marketplace.offerCount(), i, "offer counter not incremented");
        }

        vm.prank(alice);
        marketplace.cancelListing(listingId);
        uint256 second = _relist();
        assertEq(second, 2, "listing id not monotonic");
        assertEq(marketplace.listingCount(), 2, "listing counter not incremented");
    }

    /// @notice Re-lists the fixture aircraft after its listing became terminal.
    /// @return The new listing id.
    function _relist() internal returns (uint256) {
        vm.prank(alice);
        return marketplace.createListing(assetId, address(settlementToken), PRICE, uint40(block.timestamp + 30 days));
    }
}
