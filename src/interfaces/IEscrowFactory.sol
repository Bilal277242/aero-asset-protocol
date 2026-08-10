// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IEscrowFactory
/// @author AeroAsset Protocol
/// @notice Interface through which `Marketplace` opens a per-trade escrow.
/// @dev Declared in Phase 6 because `Marketplace.acceptOffer` cannot compile without
///      it; the implementation lands in Phase 7. Keeping the boundary an interface
///      means the marketplace never learns anything about escrow internals — it hands
///      over a frozen set of trade terms and receives an address back.
interface IEscrowFactory {
    /// @notice Trade terms handed to a newly deployed escrow.
    /// @dev Every field is fixed at the moment the seller accepts the offer. Nothing
    ///      here is re-derived later, so a change in price, fee rate or ownership
    ///      after acceptance cannot alter an in-flight trade.
    /// @param listingId The listing being settled.
    /// @param assetId The asset changing hands.
    /// @param buyer The account that must fund the escrow.
    /// @param seller The account that receives the proceeds.
    /// @param paymentToken The settlement token.
    /// @param price The gross amount the buyer must deposit.
    /// @param feeAmount The protocol fee, already deducted from `price` to give the
    ///        seller's proceeds. Quoted at acceptance so a later fee change cannot
    ///        re-price a live trade.
    /// @param fundingDeadline After this, the escrow may be cancelled unfunded.
    /// @param settlementDeadline After this, anyone may refund the buyer.
    struct EscrowTerms {
        uint256 listingId;
        uint256 assetId;
        address buyer;
        address seller;
        address paymentToken;
        uint128 price;
        uint128 feeAmount;
        uint40 fundingDeadline;
        uint40 settlementDeadline;
    }

    /// @notice Deploys an escrow for an accepted offer.
    /// @dev Callable only by the registered `Marketplace`.
    /// @param terms The frozen trade terms.
    /// @return escrowId The newly minted escrow id.
    /// @return escrow The deployed escrow's address.
    function openEscrow(EscrowTerms calldata terms) external returns (uint256 escrowId, address escrow);
}
