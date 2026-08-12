// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAssetOwnership} from "../interfaces/IAssetOwnership.sol";
import {IEscrow} from "../interfaces/IEscrow.sol";
import {IEscrowFactory} from "../interfaces/IEscrowFactory.sol";
import {IFeeManager} from "../interfaces/IFeeManager.sol";
import {IMarketplace} from "../interfaces/IMarketplace.sol";
import {IProtocolAddressRegistry} from "../interfaces/IProtocolAddressRegistry.sol";
import {IRoleManager} from "../interfaces/IRoleManager.sol";
import {ProtocolAddressKeys} from "../libraries/ProtocolAddressKeys.sol";
import {MissingRole, UnexpectedCaller, ZeroAddress} from "../libraries/ProtocolErrors.sol";
import {ProtocolFeeTypes} from "../libraries/ProtocolFeeTypes.sol";
import {ProtocolRoles} from "../libraries/ProtocolRoles.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @title Escrow
/// @author AeroAsset Protocol
/// @notice Holds a buyer's funds for one aviation asset trade and settles it.
/// @dev Layer L4, **immutable**, deployed as an EIP-1167 clone per trade. Per-trade
///      isolation costs roughly 40k gas per trade and buys blast-radius containment:
///      a defect here cannot reach funds held for an unrelated trade
///      (`docs/architecture.md` §D7).
///
///      Security properties, in the order they matter:
///
///      1. **Checks-effects-interactions, without exception.** Status is written to
///         its terminal value *before* any transfer, so a reentrant call fails the
///         state-machine guard on its own, before the reentrancy guard is reached.
///      2. **`ReentrancyGuardTransient`** on every fund-moving function, as a second
///         independent layer (EIP-1153; ~2.1k gas cheaper than the storage guard).
///      3. **Measured balance deltas.** `depositedAmount` is what the escrow actually
///         received, never what it asked for. A fee-on-transfer token therefore fails
///         to reach `FUNDED` rather than silently short-paying the seller
///         (`INV-ESC-02`).
///      4. **No native ETH.** No `receive`, no `fallback`, no `call{value:}`. The
///         escrow cannot be reentered through an ETH transfer because it never makes
///         one (`INV-SYS-03`).
///      5. **The escrow disarms itself.** It renounces `SETTLEMENT_ROLE` on entry to
///         any terminal state, so its ability to move an aircraft exists only for the
///         window in which the trade is live (`INV-ESC-05`).
///      6. **Every funded escrow has an exit no single party can remove.** Each
///         non-terminal state is bounded by a deadline after which a permissionless
///         call reaches a terminal state: `AWAITING_FUNDING` by `fundingDeadline`,
///         `FUNDED` by `settlementDeadline`, and `DISPUTED` by
///         {DISPUTE_RESOLUTION_WINDOW}. Arbitration can therefore fail, stall or be
///         abandoned without any deposit becoming unrecoverable.
///      7. **A recipient who cannot receive cannot block settlement.** Payouts that
///         revert — a blacklisted account on a token like USDC — are credited as
///         claimable instead of reverting the transition. See {_payout}.
///
///      Deliberately **not pausable**. A pause must never strand a buyer's deposit, and
///      the refund paths here are the last resort. Pausing `AssetOwnership` still
///      blocks `release`, which is the intended asymmetry: settlement stops, refunds
///      do not.
contract Escrow is IEscrow, Initializable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice The protocol's authorization authority.
    /// @dev An implementation immutable, shared by every clone: it lives in the
    ///      implementation's bytecode, not in per-clone storage.
    IRoleManager public immutable ROLE_MANAGER;

    /// @notice The protocol's address book.
    IProtocolAddressRegistry public immutable ADDRESS_REGISTRY;

    /*//////////////////////////////////////////////////////////////
                                  STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice How long an arbitrator has to resolve a dispute before the buyer may
    ///         reclaim the deposit.
    /// @dev Measured from the moment the dispute is raised. Without this window
    ///      `DISPUTED` has no exit that does not depend on a third party choosing to
    ///      act, which makes it a trap: either party could freeze the counterparty's
    ///      funds indefinitely at the cost of one transaction, and a lost arbitrator
    ///      key would strand every disputed trade permanently.
    uint40 public constant DISPUTE_RESOLUTION_WINDOW = 14 days;

    /// @notice This escrow's id, assigned by the factory.
    uint256 public escrowId;

    /// @notice The frozen trade terms. Written once at {initialize}, never mutated.
    IEscrowFactory.EscrowTerms internal _terms;

    /// @inheritdoc IEscrow
    EscrowStatus public status;

    /// @inheritdoc IEscrow
    /// @dev Packed against `status`; both are written together on the dispute path.
    uint40 public disputeRaisedAt;

    /// @inheritdoc IEscrow
    /// @dev The **measured** balance delta from the buyer's transfer, not the amount
    ///      requested.
    uint256 public depositedAmount;

    /// @inheritdoc IEscrow
    mapping(address account => uint256 amount) public withdrawable;

    /// @inheritdoc IEscrow
    uint256 public totalDeferred;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the shared implementation.
    /// @dev Disables initializers so the implementation itself can never be
    ///      initialized and used as a live escrow.
    /// @param roleManager The protocol `RoleManager`. Must be non-zero.
    /// @param addressRegistry The protocol `ProtocolAddressRegistry`. Must be non-zero.
    constructor(address roleManager, address addressRegistry) {
        if (roleManager == address(0) || addressRegistry == address(0)) {
            revert ZeroAddress();
        }

        ROLE_MANAGER = IRoleManager(roleManager);
        ADDRESS_REGISTRY = IProtocolAddressRegistry(addressRegistry);

        _disableInitializers();
    }

    /// @inheritdoc IEscrow
    function initialize(uint256 escrowId_, IEscrowFactory.EscrowTerms calldata terms) external initializer {
        address factory = ADDRESS_REGISTRY.getAddress(ProtocolAddressKeys.ESCROW_FACTORY);
        if (msg.sender != factory) {
            revert UnexpectedCaller(factory, msg.sender);
        }
        if (terms.feeAmount > terms.price) {
            revert FeeExceedsPrice(terms.feeAmount, terms.price);
        }

        escrowId = escrowId_;
        _terms = terms;
        status = EscrowStatus.AWAITING_FUNDING;

        emit EscrowStatusChanged(escrowId_, EscrowStatus.NONE, EscrowStatus.AWAITING_FUNDING);
    }

    /*//////////////////////////////////////////////////////////////
                                 FUNDING
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IEscrow
    function fund() external nonReentrant {
        IEscrowFactory.EscrowTerms memory terms = _terms;

        if (status != EscrowStatus.AWAITING_FUNDING) {
            revert InvalidEscrowTransition(status, EscrowStatus.FUNDED);
        }
        if (msg.sender != terms.buyer) {
            revert NotEscrowBuyer(msg.sender, terms.buyer);
        }
        if (block.timestamp > terms.fundingDeadline) {
            revert FundingDeadlinePassed(terms.fundingDeadline, uint40(block.timestamp));
        }

        IERC20 token = IERC20(terms.paymentToken);

        // Measure what actually arrives. A token that delivers less than requested
        // leaves the escrow unable to reach FUNDED, which is strictly better than
        // discovering the shortfall when the seller is paid.
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), terms.price);
        uint256 received = token.balanceOf(address(this)) - balanceBefore;

        if (received != terms.price) {
            revert IncorrectFundingAmount(terms.price, received);
        }

        depositedAmount = received;
        _setStatus(EscrowStatus.FUNDED);

        // Lock the asset so the seller cannot transfer it out from under the buyer
        // who has now committed funds (`docs/threat-model.md` T-05).
        _ownership().setTransferLock(terms.assetId, true);

        emit EscrowFunded(escrowId, msg.sender, received);
    }

    /*//////////////////////////////////////////////////////////////
                                SETTLEMENT
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IEscrow
    function release() external nonReentrant {
        if (status != EscrowStatus.FUNDED) {
            revert InvalidEscrowTransition(status, EscrowStatus.RELEASED);
        }
        if (msg.sender != _terms.buyer) {
            revert NotEscrowBuyer(msg.sender, _terms.buyer);
        }

        _settle();
    }

    /// @inheritdoc IEscrow
    function claimTimeout() external nonReentrant {
        IEscrowFactory.EscrowTerms memory terms = _terms;

        if (status != EscrowStatus.FUNDED) {
            revert InvalidEscrowTransition(status, EscrowStatus.REFUNDED);
        }
        if (block.timestamp <= terms.settlementDeadline) {
            revert SettlementDeadlineNotPassed(terms.settlementDeadline, uint40(block.timestamp));
        }

        _refund();
    }

    /// @inheritdoc IEscrow
    function cancel() external nonReentrant {
        IEscrowFactory.EscrowTerms memory terms = _terms;

        if (status != EscrowStatus.AWAITING_FUNDING) {
            revert InvalidEscrowTransition(status, EscrowStatus.CANCELLED);
        }
        // Either party may abandon an unfunded trade at will; anyone may clean up once
        // the funding window has closed.
        if (msg.sender != terms.buyer && msg.sender != terms.seller) {
            if (block.timestamp <= terms.fundingDeadline) {
                revert FundingDeadlineNotPassed(terms.fundingDeadline, uint40(block.timestamp));
            }
        }

        _setStatus(EscrowStatus.CANCELLED);

        // No funds moved and no lock was taken, so only the listing needs releasing.
        _marketplace().clearEscrow(terms.listingId);
        _disarm();
    }

    /*//////////////////////////////////////////////////////////////
                                 DISPUTES
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IEscrow
    function raiseDispute() external {
        IEscrowFactory.EscrowTerms memory terms = _terms;

        if (status != EscrowStatus.FUNDED) {
            revert InvalidEscrowTransition(status, EscrowStatus.DISPUTED);
        }
        if (msg.sender != terms.buyer && msg.sender != terms.seller) {
            revert NotEscrowParty(msg.sender);
        }
        // Disputing is unavailable once the refund window opens, so a seller cannot
        // use a last-second dispute to block the buyer's timeout claim.
        if (block.timestamp > terms.settlementDeadline) {
            revert SettlementDeadlinePassed(terms.settlementDeadline, uint40(block.timestamp));
        }

        _setStatus(EscrowStatus.DISPUTED);

        // Start the arbitration clock. `DISPUTED` must never be reachable without a
        // bounded exit; see {claimDisputeTimeout}.
        uint40 raisedAt = uint40(block.timestamp);
        disputeRaisedAt = raisedAt;

        emit DisputeRaised(escrowId, msg.sender);
        emit DisputeDeadlineSet(escrowId, raisedAt + DISPUTE_RESOLUTION_WINDOW);
    }

    /// @inheritdoc IEscrow
    function claimDisputeTimeout() external nonReentrant {
        if (status != EscrowStatus.DISPUTED) {
            revert InvalidEscrowTransition(status, EscrowStatus.REFUNDED);
        }

        uint40 deadline = disputeRaisedAt + DISPUTE_RESOLUTION_WINDOW;
        if (block.timestamp <= deadline) {
            revert DisputeDeadlineNotPassed(deadline, uint40(block.timestamp));
        }

        // The buyer is made whole. Refund-by-default removes the incentive to dispute
        // as a griefing tactic: a party who disputes to stall now only delays a refund
        // they were never able to prevent.
        _refund();
    }

    /// @inheritdoc IEscrow
    function resolveDispute(bool releaseToSeller) external nonReentrant {
        if (!ROLE_MANAGER.hasRole(ProtocolRoles.ARBITRATOR_ROLE, msg.sender)) {
            revert MissingRole(ProtocolRoles.ARBITRATOR_ROLE, msg.sender);
        }
        if (status != EscrowStatus.DISPUTED) {
            revert InvalidEscrowTransition(status, releaseToSeller ? EscrowStatus.RELEASED : EscrowStatus.REFUNDED);
        }

        emit DisputeResolved(escrowId, msg.sender, releaseToSeller);

        // The arbitrator chooses a winner and nothing else: it cannot alter amounts,
        // pay a third party, or reach a non-disputed escrow.
        if (releaseToSeller) {
            _settle();
        } else {
            _refund();
        }
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IEscrow
    function getTerms() external view returns (IEscrowFactory.EscrowTerms memory) {
        return _terms;
    }

    /// @inheritdoc IEscrow
    function isTerminal() public view returns (bool) {
        return status == EscrowStatus.RELEASED || status == EscrowStatus.REFUNDED || status == EscrowStatus.CANCELLED;
    }

    /// @inheritdoc IEscrow
    function disputeDeadline() external view returns (uint40) {
        uint40 raisedAt = disputeRaisedAt;
        // slither-disable-next-line incorrect-equality
        return raisedAt == 0 ? 0 : raisedAt + DISPUTE_RESOLUTION_WINDOW;
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @notice Settles the trade in the seller's favour.
    /// @dev Effects first: status is terminal before any external call, so a reentrant
    ///      path fails the state-machine guard regardless of the reentrancy guard.
    function _settle() private {
        IEscrowFactory.EscrowTerms memory terms = _terms;
        uint256 deposited = depositedAmount;

        _setStatus(EscrowStatus.RELEASED);

        // `fee + proceeds == deposited` exactly, by construction: proceeds is the
        // remainder, so no rounding can create or destroy dust (`INV-ESC-04`).
        uint256 fee = terms.feeAmount;
        uint256 proceeds = deposited - fee;

        // Asset and listing move while the escrow still holds SETTLEMENT_ROLE.
        _ownership().settleTransfer(terms.assetId, terms.seller, terms.buyer);
        _marketplace().markSold(terms.listingId);
        _disarm();

        IERC20 token = IERC20(terms.paymentToken);
        if (fee != 0) {
            address treasury = _fees().treasury();
            // Deferrable. A treasury that cannot receive must not halt settlement for
            // every trade in the protocol at once; the fee is claimable later.
            _payout(token, treasury, fee);
            emit FeeCollected(terms.paymentToken, treasury, fee, ProtocolFeeTypes.MARKETPLACE);
        }

        // **Strict, deliberately.** If the seller cannot be paid, the aircraft must not
        // change hands: reverting leaves the trade intact and retryable, and the buyer
        // still reaches a refund through `claimTimeout`. Deferring here would hand over
        // the asset against an IOU, which is the one outcome worse than a failed trade.
        token.safeTransfer(terms.seller, proceeds);

        emit EscrowSettled(escrowId, terms.seller, proceeds, fee);
    }

    /// @notice Returns the full deposit to the buyer and releases the asset.
    function _refund() private {
        IEscrowFactory.EscrowTerms memory terms = _terms;
        uint256 deposited = depositedAmount;

        _setStatus(EscrowStatus.REFUNDED);

        // Release the lock and the listing while the role is still held.
        _ownership().setTransferLock(terms.assetId, false);
        _marketplace().clearEscrow(terms.listingId);
        _disarm();

        // The buyer is repaid in full; the asset never moved.
        _payout(IERC20(terms.paymentToken), terms.buyer, deposited);

        emit EscrowRefunded(escrowId, terms.buyer, deposited);
    }

    /// @notice Pays `to`, deferring the amount if the transfer cannot be delivered.
    /// @dev Uses a raw `call` rather than `SafeERC20` deliberately, on the two paths
    ///      where a failed transfer would otherwise be unrecoverable:
    ///
    ///      - **the buyer's refund**, which is the protocol's last resort. A blacklisted
    ///        buyer would otherwise make `_refund` revert forever, and every other exit
    ///        from `FUNDED` and `DISPUTED` already routes here;
    ///      - **the protocol fee**, so one blacklisted treasury cannot halt settlement
    ///        across every live trade until a timelocked treasury change lands.
    ///
    ///      It is deliberately **not** used for the seller's proceeds: that path has a
    ///      downstream fallback (revert, then timeout refund), and deferring it would
    ///      transfer the aircraft against an IOU.
    ///
    ///      **Ordering.** The deferred balance is necessarily credited *after* the
    ///      transfer attempt — there is no way to know a transfer failed before making
    ///      it — so this is not checks-effects-interactions, and Slither reports it as
    ///      `reentrancy-benign`. What makes it safe is that the escrow's status is
    ///      already terminal before `_payout` runs, and every caller carries
    ///      `nonReentrant`: a token that reenters finds a terminal state machine behind
    ///      a closed guard. Nothing is read after the credit.
    /// @param token The settlement token.
    /// @param to The intended recipient.
    /// @param amount The amount owed.
    function _payout(IERC20 token, address to, uint256 amount) private {
        // slither-disable-next-line incorrect-equality
        if (amount == 0) {
            return;
        }

        (bool ok, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        // Mirrors SafeERC20's acceptance rule: a call that reverts fails, and a call
        // returning data must return exactly `true`. Tokens returning nothing pass.
        // slither-disable-next-line incorrect-equality
        if (ok && (data.length == 0 || abi.decode(data, (bool)))) {
            return;
        }

        withdrawable[to] += amount;
        totalDeferred += amount;

        emit PayoutDeferred(to, amount);
    }

    /// @inheritdoc IEscrow
    function withdraw(address account) external nonReentrant {
        uint256 amount = withdrawable[account];
        if (amount == 0) {
            revert NothingToWithdraw(account);
        }

        // Effects before the interaction: a token that reenters finds a zero balance.
        withdrawable[account] = 0;
        totalDeferred -= amount;

        // `SafeERC20` here, not the tolerant path: a claim that cannot be delivered
        // must revert and leave the balance intact rather than silently consume it.
        IERC20(_terms.paymentToken).safeTransfer(account, amount);

        emit PayoutWithdrawn(account, amount);
    }

    /// @notice Writes a status change and emits its event.
    /// @param newStatus The status to move to.
    function _setStatus(EscrowStatus newStatus) private {
        EscrowStatus oldStatus = status;
        status = newStatus;

        emit EscrowStatusChanged(escrowId, oldStatus, newStatus);
    }

    /// @notice Gives up `SETTLEMENT_ROLE` on reaching a terminal state.
    /// @dev Self-renunciation, so no admin key is involved: an escrow's ability to
    ///      move an aircraft exists only while its trade is live (`INV-ESC-05`).
    function _disarm() private {
        ROLE_MANAGER.renounceRole(ProtocolRoles.SETTLEMENT_ROLE, address(this));
    }

    /// @notice Resolves the ownership ledger.
    /// @return The current `AssetOwnership`.
    function _ownership() private view returns (IAssetOwnership) {
        return IAssetOwnership(ADDRESS_REGISTRY.getAddress(ProtocolAddressKeys.ASSET_OWNERSHIP));
    }

    /// @notice Resolves the marketplace.
    /// @return The current `Marketplace`.
    function _marketplace() private view returns (IMarketplace) {
        return IMarketplace(ADDRESS_REGISTRY.getAddress(ProtocolAddressKeys.MARKETPLACE));
    }

    /// @notice Resolves the fee manager.
    /// @return The current `FeeManager`.
    function _fees() private view returns (IFeeManager) {
        return IFeeManager(ADDRESS_REGISTRY.getAddress(ProtocolAddressKeys.FEE_MANAGER));
    }
}
