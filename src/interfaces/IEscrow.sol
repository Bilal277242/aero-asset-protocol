// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IEscrowFactory} from "./IEscrowFactory.sol";

/// @title IEscrow
/// @author AeroAsset Protocol
/// @notice Interface, types, events and errors for a per-trade escrow.
/// @dev Layer L4, immutable, deployed as an EIP-1167 clone per trade so a defect
///      cannot reach funds held for an unrelated trade (`docs/architecture.md` §D7).
interface IEscrow {
    /*//////////////////////////////////////////////////////////////
                                  TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Lifecycle state of an escrow.
    enum EscrowStatus {
        /// @notice Reserved sentinel; an uninitialized clone.
        NONE,
        /// @notice Deployed; the buyer has not paid.
        AWAITING_FUNDING,
        /// @notice Funds held.
        FUNDED,
        /// @notice Frozen pending arbitration.
        DISPUTED,
        /// @notice Terminal. Seller paid, asset transferred.
        RELEASED,
        /// @notice Terminal. Buyer repaid, asset unmoved.
        REFUNDED,
        /// @notice Terminal. Expired before funding; no funds ever moved.
        CANCELLED
    }

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when the buyer funds the escrow.
    /// @param escrowId The escrow id.
    /// @param buyer The funding buyer.
    /// @param amount The **measured** amount received.
    event EscrowFunded(uint256 indexed escrowId, address indexed buyer, uint256 amount);

    /// @notice Emitted on every escrow lifecycle transition.
    /// @param escrowId The escrow id.
    /// @param oldStatus The status before the transition.
    /// @param newStatus The status after the transition.
    event EscrowStatusChanged(uint256 indexed escrowId, EscrowStatus indexed oldStatus, EscrowStatus indexed newStatus);

    /// @notice Emitted when a trade settles in the seller's favour.
    /// @param escrowId The escrow id.
    /// @param seller The paid seller.
    /// @param sellerProceeds Amount paid to the seller.
    /// @param feeAmount Protocol fee paid to the treasury.
    event EscrowSettled(uint256 indexed escrowId, address indexed seller, uint256 sellerProceeds, uint256 feeAmount);

    /// @notice Emitted when funds return to the buyer.
    /// @param escrowId The escrow id.
    /// @param buyer The repaid buyer.
    /// @param amount Amount returned.
    event EscrowRefunded(uint256 indexed escrowId, address indexed buyer, uint256 amount);

    /// @notice Emitted when a party disputes a funded escrow.
    /// @param escrowId The escrow id.
    /// @param raisedBy The disputing party.
    event DisputeRaised(uint256 indexed escrowId, address indexed raisedBy);

    /// @notice Emitted when an arbitrator resolves a dispute.
    /// @param escrowId The escrow id.
    /// @param arbitrator The resolving arbitrator.
    /// @param releasedToSeller True if resolved in the seller's favour.
    event DisputeResolved(uint256 indexed escrowId, address indexed arbitrator, bool releasedToSeller);

    /// @notice Emitted when the protocol fee is paid to the treasury.
    /// @dev Emitted here rather than by `FeeManager`, which never touches tokens and
    ///      therefore cannot observe a collection.
    /// @param token The settlement token.
    /// @param treasury The recipient.
    /// @param amount The fee paid.
    /// @param feeType The fee category charged.
    event FeeCollected(address indexed token, address indexed treasury, uint256 amount, bytes32 indexed feeType);

    /// @notice Emitted when a payout could not be delivered and was made claimable.
    /// @dev The escrow still reaches its terminal state; the amount is recoverable by
    ///      the recipient through {withdraw} once whatever blocked the transfer — a
    ///      token blacklist, most plausibly — no longer applies. A recipient who can
    ///      never receive must not be able to block the counterparty's settlement.
    /// @param recipient The account the transfer was intended for.
    /// @param amount The amount now claimable.
    event PayoutDeferred(address indexed recipient, uint256 amount);

    /// @notice Emitted when a deferred payout is successfully claimed.
    /// @param recipient The claiming account.
    /// @param amount The amount withdrawn.
    event PayoutWithdrawn(address indexed recipient, uint256 amount);

    /// @notice Emitted when a party disputes, recording when arbitration must complete.
    /// @param escrowId The escrow id.
    /// @param deadline After this, {claimDisputeTimeout} refunds the buyer.
    event DisputeDeadlineSet(uint256 indexed escrowId, uint40 deadline);

    /// @notice Emitted when a lapsed buyer forfeits part of their deposit.
    /// @dev Only on the buyer-fault timeout path. A refund the buyer did not cause —
    ///      an arbitrator ruling for them, or arbitration never happening — returns the
    ///      deposit in full and emits nothing here.
    /// @param escrowId The escrow id.
    /// @param seller The compensated seller.
    /// @param amount The forfeited amount.
    event TimeoutPenaltyCharged(uint256 indexed escrowId, address indexed seller, uint256 amount);

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when a lifecycle transition is not permitted.
    /// @param from The current status.
    /// @param to The attempted status.
    error InvalidEscrowTransition(EscrowStatus from, EscrowStatus to);

    /// @notice Thrown when a buyer-only action is attempted by another account.
    /// @param caller The unauthorized caller.
    /// @param buyer The escrow's buyer.
    error NotEscrowBuyer(address caller, address buyer);

    /// @notice Thrown when an action restricted to the trade's parties is attempted by
    ///         an outsider.
    /// @param caller The unauthorized caller.
    error NotEscrowParty(address caller);

    /// @notice Thrown when the token delivered less than the escrow requested.
    /// @dev The amount is a **measured** balance delta, so a fee-on-transfer or
    ///      otherwise non-conforming token fails loudly here rather than silently
    ///      short-paying the seller at settlement (`INV-ESC-02`).
    /// @param expected The price the escrow requires.
    /// @param received The amount actually received.
    error IncorrectFundingAmount(uint256 expected, uint256 received);

    /// @notice Thrown when funding after the funding deadline.
    /// @param deadline The funding deadline.
    /// @param nowTs The block timestamp.
    error FundingDeadlinePassed(uint40 deadline, uint40 nowTs);

    /// @notice Thrown when claiming a timeout refund before the settlement deadline.
    /// @param deadline The settlement deadline.
    /// @param nowTs The block timestamp.
    error SettlementDeadlineNotPassed(uint40 deadline, uint40 nowTs);

    /// @notice Thrown when disputing after the settlement deadline.
    /// @dev A last-second dispute must not be able to block the refund path.
    /// @param deadline The settlement deadline.
    /// @param nowTs The block timestamp.
    error SettlementDeadlinePassed(uint40 deadline, uint40 nowTs);

    /// @notice Thrown when cancelling before the funding deadline by a non-party.
    /// @param deadline The funding deadline.
    /// @param nowTs The block timestamp.
    error FundingDeadlineNotPassed(uint40 deadline, uint40 nowTs);

    /// @notice Thrown when the fee exceeds the price it is charged on.
    /// @param feeAmount The quoted fee.
    /// @param price The trade price.
    error FeeExceedsPrice(uint128 feeAmount, uint128 price);

    /// @notice Thrown when claiming a dispute timeout before arbitration has run out.
    /// @param deadline The dispute-resolution deadline.
    /// @param nowTs The block timestamp.
    error DisputeDeadlineNotPassed(uint40 deadline, uint40 nowTs);

    /// @notice Thrown when withdrawing a deferred payout with nothing owed.
    /// @param account The claiming account.
    error NothingToWithdraw(address account);

    /*//////////////////////////////////////////////////////////////
                                FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Initializes a freshly deployed clone with frozen trade terms.
    /// @dev Callable once, by the factory only.
    /// @param escrowId_ The escrow id assigned by the factory.
    /// @param terms The frozen trade terms.
    function initialize(uint256 escrowId_, IEscrowFactory.EscrowTerms calldata terms) external;

    /// @notice Deposits the full price and locks the asset.
    /// @dev Buyer only. Requires an ERC-20 allowance for `price`.
    function fund() external;

    /// @notice Releases funds to the seller and the asset to the buyer.
    /// @dev Buyer only, from `FUNDED`. Settles atomically: asset moves, fee goes to
    ///      the treasury, remainder to the seller, listing marked sold.
    function release() external;

    /// @notice Abandons an unfunded escrow.
    /// @dev Either party at any time, or anyone once the funding deadline passes.
    function cancel() external;

    /// @notice Freezes a funded escrow pending arbitration.
    /// @dev Buyer or seller, before the settlement deadline.
    function raiseDispute() external;

    /// @notice Resolves a disputed escrow to exactly one party.
    /// @dev `ARBITRATOR_ROLE` only. Cannot alter amounts or pay a third party.
    /// @param releaseToSeller True to settle for the seller, false to refund the buyer.
    function resolveDispute(bool releaseToSeller) external;

    /// @notice Returns the buyer's deposit after the settlement deadline.
    /// @dev **Permissionless.** A buyer's deposit must never be strandable by an
    ///      unresponsive counterparty.
    function claimTimeout() external;

    /// @notice Refunds the buyer when arbitration has not happened in time.
    /// @dev **Permissionless**, and the reason `DISPUTED` is not a trap. Without it a
    ///      party could freeze the counterparty's funds indefinitely simply by
    ///      disputing, and an unavailable arbitrator would strand every disputed trade
    ///      forever. Refund-by-default matches {claimTimeout}: settlement can stall,
    ///      refunds cannot.
    function claimDisputeTimeout() external;

    /// @notice Claims a payout that could not be delivered at settlement.
    /// @dev The escape hatch for a recipient that was untransferable at the moment the
    ///      escrow settled — a blacklisted account, most plausibly. Anyone may trigger
    ///      the claim; funds only ever go to the recorded recipient.
    /// @param account The recipient whose deferred balance is being claimed.
    function withdraw(address account) external;

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns this escrow's id, as assigned by the factory.
    /// @return The escrow id.
    function escrowId() external view returns (uint256);

    /// @notice Returns the escrow's current lifecycle state.
    /// @return The status.
    function status() external view returns (EscrowStatus);

    /// @notice Returns the measured amount currently held.
    /// @return The deposited amount.
    function depositedAmount() external view returns (uint256);

    /// @notice Returns the frozen trade terms.
    /// @return The escrow terms.
    function getTerms() external view returns (IEscrowFactory.EscrowTerms memory);

    /// @notice Reports whether the escrow has reached a terminal state.
    /// @return True if released, refunded or cancelled.
    function isTerminal() external view returns (bool);

    /// @notice Returns how long an arbitrator has to resolve a dispute.
    /// @dev A published constant, so both parties know the bound before they trade.
    /// @return The window in seconds.
    function DISPUTE_RESOLUTION_WINDOW() external view returns (uint40);

    /// @notice Returns the share of a deposit forfeited on a buyer-fault timeout.
    /// @dev A published constant in immutable code; no admin action can raise it.
    /// @return The penalty in basis points.
    function TIMEOUT_PENALTY_BPS() external view returns (uint16);

    /// @notice Returns when the dispute was raised, or 0 if none has been.
    /// @return The dispute timestamp.
    function disputeRaisedAt() external view returns (uint40);

    /// @notice Returns the deadline by which arbitration must complete.
    /// @dev Zero while no dispute is open.
    /// @return The dispute-resolution deadline.
    function disputeDeadline() external view returns (uint40);

    /// @notice Returns an account's undelivered payout.
    /// @param account The recipient to query.
    /// @return The amount claimable through {withdraw}.
    function withdrawable(address account) external view returns (uint256);

    /// @notice Returns the total undelivered payout held by this escrow.
    /// @dev A terminal escrow's token balance equals exactly this (`INV-ESC-03`).
    /// @return The total deferred amount.
    function totalDeferred() external view returns (uint256);
}
