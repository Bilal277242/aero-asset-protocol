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
    /// @param treasury The account the protocol fee is paid to. Captured here rather
    ///        than resolved at settlement so a treasury change cannot redirect the fee
    ///        on a trade both parties have already agreed (audit AAP-15).
    /// @param fundingDeadline After this, the escrow may be cancelled unfunded.
    /// @param settlementDeadline After this, anyone may refund the buyer, less the
    ///        timeout penalty.
    struct EscrowTerms {
        uint256 listingId;
        uint256 assetId;
        address buyer;
        address seller;
        address paymentToken;
        address treasury;
        uint128 price;
        uint128 feeAmount;
        uint40 fundingDeadline;
        uint40 settlementDeadline;
    }

    /// @notice Emitted when an escrow is deployed for an accepted offer.
    /// @param escrowId The newly minted escrow id.
    /// @param escrow The deployed clone's address.
    /// @param listingId The listing being settled.
    /// @param buyer The account that must fund it.
    /// @param seller The account that receives the proceeds.
    /// @param price The gross settlement amount.
    /// @param feeAmount The protocol fee quoted at acceptance.
    event EscrowOpened(
        uint256 indexed escrowId,
        address indexed escrow,
        uint256 indexed listingId,
        address buyer,
        address seller,
        uint128 price,
        uint128 feeAmount
    );

    /// @notice Thrown when a deployed clone lands at an address other than predicted.
    /// @dev Deterministic deployment plus this check is what lets the factory grant
    ///      `SETTLEMENT_ROLE` to an address it is certain it just created.
    /// @param predicted The address computed before deployment.
    /// @param deployed The address actually deployed.
    error CloneAddressMismatch(address predicted, address deployed);

    /// @notice Thrown when an escrow id does not exist.
    /// @param escrowId The offending id.
    error EscrowNotFound(uint256 escrowId);

    /// @notice Deploys an escrow for an accepted offer.
    /// @dev Callable only by the registered `Marketplace`.
    /// @param terms The frozen trade terms.
    /// @return escrowId The newly minted escrow id.
    /// @return escrow The deployed escrow's address.
    function openEscrow(EscrowTerms calldata terms) external returns (uint256 escrowId, address escrow);

    /// @notice Returns the escrow deployed for an id.
    /// @param escrowId The escrow id.
    /// @return The clone's address.
    function escrowOf(uint256 escrowId) external view returns (address);

    /// @notice Reports whether an address is an escrow this factory deployed.
    /// @param account The address to test.
    /// @return True if the factory deployed it.
    function isEscrow(address account) external view returns (bool);

    /// @notice Returns the number of escrows opened so far.
    /// @return The highest minted escrow id.
    function escrowCount() external view returns (uint256);
}
