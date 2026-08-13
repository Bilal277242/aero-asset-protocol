// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Escrow} from "../../../src/escrow/Escrow.sol";
import {EscrowFactory} from "../../../src/escrow/EscrowFactory.sol";
import {IAssetOwnership} from "../../../src/interfaces/IAssetOwnership.sol";
import {IEscrow} from "../../../src/interfaces/IEscrow.sol";
import {IEscrowFactory} from "../../../src/interfaces/IEscrowFactory.sol";
import {IMarketplace} from "../../../src/interfaces/IMarketplace.sol";
import {IOrganizationRegistry} from "../../../src/interfaces/IOrganizationRegistry.sol";
import {UnexpectedCaller, ZeroAddress} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../../../src/libraries/ProtocolRoles.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";
import {FeeOnTransferToken, ReentrantToken, ReturnsFalseToken} from "../../utils/mocks/MaliciousTokens.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

/// @title EscrowSecurityTest
/// @author AeroAsset Protocol
/// @notice Adversarial coverage for the only contract that holds funds: misbehaving
///         tokens, reentrancy, and abuse of `SETTLEMENT_ROLE`.
/// @dev Maps directly to `docs/threat-model.md` T-02 (reentrancy drain), T-04
///      (settlement-role abuse), T-05 (seller double-sell) and T-08 (fee-on-transfer).
contract EscrowSecurityTest is ProtocolTestBase {
    uint128 internal constant PRICE = 1_000_000e6;

    /*//////////////////////////////////////////////////////////////
                            MISBEHAVING TOKENS
    //////////////////////////////////////////////////////////////*/

    /// @notice A fee-on-transfer token cannot fund an escrow. T-08.
    /// @dev The escrow measures what actually arrived. Without that it would reach
    ///      `FUNDED` holding less than the price and short-pay the seller at
    ///      settlement — the shortfall would surface as a failed transfer weeks later,
    ///      after the asset had already moved.
    function test_RevertWhen_FundingWithFeeOnTransferToken() public {
        FeeOnTransferToken token = new FeeOnTransferToken();
        (,, address escrow) = _openTradeWithToken(address(token), PRICE);

        token.mint(bob, PRICE);
        vm.prank(bob);
        token.approve(escrow, PRICE);

        uint256 delivered = PRICE - (uint256(PRICE) * token.TRANSFER_FEE_BPS()) / 10_000;

        vm.expectRevert(abi.encodeWithSelector(IEscrow.IncorrectFundingAmount.selector, PRICE, delivered));
        vm.prank(bob);
        IEscrow(escrow).fund();

        assertEq(
            uint8(IEscrow(escrow).status()),
            uint8(IEscrow.EscrowStatus.AWAITING_FUNDING),
            "escrow accepted a short deposit"
        );
    }

    /// @notice A token whose `transfer` returns false reverts the settlement.
    /// @dev `SafeERC20` turns the silent failure into a revert. A bare
    ///      `token.transfer(...)` would proceed as though the seller had been paid,
    ///      handing over the aircraft for nothing.
    function test_RevertWhen_SettlementTokenReturnsFalse() public {
        ReturnsFalseToken token = new ReturnsFalseToken();
        (uint256 assetId,, address escrow) = _openTradeWithToken(address(token), PRICE);

        token.mint(bob, PRICE);
        vm.prank(bob);
        token.approve(escrow, PRICE);
        vm.prank(bob);
        IEscrow(escrow).fund();

        token.setFailTransfers(true);

        vm.expectRevert();
        vm.prank(bob);
        IEscrow(escrow).release();

        // Nothing moved: the trade is intact and retryable.
        assertEq(uint8(IEscrow(escrow).status()), uint8(IEscrow.EscrowStatus.FUNDED), "status advanced on failure");
        assertEq(assetOwnership.ownerOf(assetId), alice, "asset moved despite failed payment");
        assertEq(token.balanceOf(escrow), PRICE, "funds left the escrow");
    }

    /*//////////////////////////////////////////////////////////////
                                REENTRANCY
    //////////////////////////////////////////////////////////////*/

    /// @notice A token callback cannot re-enter `release` to double-settle. T-02.
    /// @dev Two independent layers stop this: the status is already `RELEASED` before
    ///      any transfer, and `ReentrancyGuardTransient` is active. The assertion is
    ///      simply that the re-entry did not succeed and nothing was paid twice.
    function test_ReentrancyOnRelease_IsBlocked() public {
        ReentrantToken token = new ReentrantToken();
        (,, address escrow) = _openTradeWithToken(address(token), PRICE);

        token.mint(bob, PRICE);
        vm.prank(bob);
        token.approve(escrow, PRICE);
        vm.prank(bob);
        IEscrow(escrow).fund();

        token.arm(escrow, IEscrow.release.selector);

        vm.prank(bob);
        IEscrow(escrow).release();

        assertTrue(token.attempted(), "the token never attempted re-entry");
        assertFalse(token.reentrySucceeded(), "re-entrant release succeeded");

        // Exactly one payout happened.
        assertEq(token.balanceOf(escrow), 0, "escrow retained funds");
        assertEq(token.balanceOf(alice) + token.balanceOf(treasury), PRICE, "more than the deposit left the escrow");
    }

    /// @notice A token callback cannot re-enter `claimTimeout` to double-refund.
    function test_ReentrancyOnRefund_IsBlocked() public {
        ReentrantToken token = new ReentrantToken();
        (,, address escrow) = _openTradeWithToken(address(token), PRICE);

        token.mint(bob, PRICE);
        vm.prank(bob);
        token.approve(escrow, PRICE);
        vm.prank(bob);
        IEscrow(escrow).fund();

        token.arm(escrow, IEscrow.claimTimeout.selector);
        vm.warp(uint256(IEscrow(escrow).getTerms().settlementDeadline) + 1);

        IEscrow(escrow).claimTimeout();

        assertFalse(token.reentrySucceeded(), "re-entrant refund succeeded");
        assertEq(token.balanceOf(escrow), 0, "escrow retained funds");

        // Conservation still holds exactly across the timeout penalty: the deposit is
        // split between buyer and seller and nothing is created or destroyed.
        uint256 penalty = (uint256(PRICE) * IEscrow(escrow).TIMEOUT_PENALTY_BPS()) / 10_000;
        assertEq(token.balanceOf(bob), PRICE - penalty, "buyer received more or less than the remainder");
        assertEq(token.balanceOf(alice), penalty, "seller did not receive the penalty");
        assertEq(token.balanceOf(bob) + token.balanceOf(alice), PRICE, "deposit not conserved");
    }

    /*//////////////////////////////////////////////////////////////
                           SETTLEMENT-ROLE ABUSE
    //////////////////////////////////////////////////////////////*/

    /// @notice A rogue `SETTLEMENT_ROLE` holder cannot move an asset. T-04.
    /// @dev The role is necessary but not sufficient: the caller must also hold the
    ///      asset's lock and name the current owner correctly.
    function test_RogueSettlementRoleCannotStealAsset() public {
        (uint256 assetId,, address escrow) = _openTrade(PRICE);
        _fundBuyer(bob, escrow, PRICE);
        vm.prank(bob);
        IEscrow(escrow).fund();

        address rogue = makeAddr("rogueSettler");
        _grantSettlementRole(rogue);

        // The genuine escrow holds the lock, so the rogue cannot settle.
        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.NotLockHolder.selector, assetId, rogue, escrow));
        vm.prank(rogue);
        assetOwnership.settleTransfer(assetId, alice, attacker);

        // Nor can it take the lock for itself.
        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.AssetAlreadyLocked.selector, assetId, escrow));
        vm.prank(rogue);
        assetOwnership.setTransferLock(assetId, true);

        assertEq(assetOwnership.ownerOf(assetId), alice, "asset was stolen");
    }

    /// @notice A settled escrow is disarmed and cannot act again. INV-ESC-05.
    function test_SettledEscrowIsDisarmed() public {
        (uint256 assetId,, address escrow) = _openTrade(PRICE);
        _fundBuyer(bob, escrow, PRICE);

        vm.startPrank(bob);
        IEscrow(escrow).fund();
        IEscrow(escrow).release();
        vm.stopPrank();

        assertFalse(roleManager.hasRole(ProtocolRoles.SETTLEMENT_ROLE, escrow), "escrow still armed");

        // Even impersonating it, the role is gone.
        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("MissingRole(bytes32,address)")), ProtocolRoles.SETTLEMENT_ROLE, escrow
            )
        );
        vm.prank(escrow);
        assetOwnership.setTransferLock(assetId, true);
    }

    /// @notice A refunded escrow is disarmed too, not only a settled one.
    function test_RefundedEscrowIsDisarmed() public {
        (,, address escrow) = _openTrade(PRICE);
        _fundBuyer(bob, escrow, PRICE);
        vm.prank(bob);
        IEscrow(escrow).fund();

        vm.warp(uint256(IEscrow(escrow).getTerms().settlementDeadline) + 1);
        IEscrow(escrow).claimTimeout();

        assertFalse(roleManager.hasRole(ProtocolRoles.SETTLEMENT_ROLE, escrow), "refunded escrow still armed");
    }

    /*//////////////////////////////////////////////////////////////
                              SELLER DOUBLE-SELL
    //////////////////////////////////////////////////////////////*/

    /// @notice A seller cannot move the asset away from a funded buyer. T-05.
    /// @dev And if they somehow could, settlement would still fail on the owner
    ///      assertion rather than transferring someone else's property.
    function test_SellerCannotEscapeAFundedTrade() public {
        (uint256 assetId, uint256 listingId, address escrow) = _openTrade(PRICE);
        _fundBuyer(bob, escrow, PRICE);
        vm.prank(bob);
        IEscrow(escrow).fund();

        // Direct transfer is blocked by the lock.
        vm.expectRevert(abi.encodeWithSelector(IAssetOwnership.AssetTransferLocked.selector, assetId, escrow));
        vm.prank(alice);
        assetOwnership.initiateTransfer(assetId, attacker, 0);

        // Cancelling the listing is blocked by the live escrow.
        vm.expectRevert(abi.encodeWithSelector(IMarketplace.EscrowInProgress.selector, listingId, uint256(1)));
        vm.prank(alice);
        marketplace.cancelListing(listingId);

        // The trade completes as agreed.
        vm.prank(bob);
        IEscrow(escrow).release();
        assertEq(assetOwnership.ownerOf(assetId), bob, "buyer did not receive the asset");
    }

    /*//////////////////////////////////////////////////////////////
                                NO ETHER
    //////////////////////////////////////////////////////////////*/

    /// @notice The escrow cannot receive native ether. INV-SYS-03.
    /// @dev No `receive`, no `fallback`, no `call{value:}` — so there is no ETH path
    ///      to be reentered through.
    function test_EscrowRejectsEther() public {
        (,, address escrow) = _openTrade(PRICE);

        (bool sent,) = escrow.call{value: 1 ether}("");
        assertFalse(sent, "escrow accepted ether");
        assertEq(escrow.balance, 0, "escrow holds ether");
    }

    /*//////////////////////////////////////////////////////////////
                                 FACTORY
    //////////////////////////////////////////////////////////////*/

    /// @notice Only the registered marketplace may open an escrow.
    /// @dev Otherwise anyone could mint a `SETTLEMENT_ROLE` holder on demand.
    function testFuzz_RevertWhen_UnauthorizedOpenEscrow(address caller) public {
        vm.assume(caller != address(marketplace));

        vm.expectRevert(abi.encodeWithSelector(UnexpectedCaller.selector, address(marketplace), caller));
        vm.prank(caller);
        escrowFactory.openEscrow(_bareTerms());
    }

    /// @notice The factory records every clone it deploys, and only those.
    function test_FactoryTracksItsOwnClones() public {
        (,, address escrow) = _openTrade(PRICE);

        assertTrue(escrowFactory.isEscrow(escrow), "clone not recorded");
        assertEq(escrowFactory.escrowOf(1), escrow, "wrong clone recorded");
        assertEq(escrowFactory.escrowCount(), 1, "wrong count");
        assertFalse(escrowFactory.isEscrow(attacker), "arbitrary address recognised as an escrow");
    }

    /// @notice Deployment is deterministic and matches the prediction.
    /// @dev The prediction check is what lets the factory grant the protocol's most
    ///      dangerous role to an address it is certain it just created.
    function test_ClonesAreDeterministic() public {
        address predicted = escrowFactory.predictEscrowAddress(1);
        (,, address escrow) = _openTrade(PRICE);

        assertEq(escrow, predicted, "deployed address diverged from the prediction");
    }

    /// @notice Reading an unknown escrow id reverts.
    function test_RevertWhen_EscrowIdUnknown() public {
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("EscrowNotFound(uint256)")), uint256(42)));
        escrowFactory.escrowOf(42);
    }

    /*//////////////////////////////////////////////////////////////
                           CONSTRUCTION GUARDS
    //////////////////////////////////////////////////////////////*/

    /// @notice Both escrow contracts reject zero dependencies at deployment.
    function test_RevertWhen_ConstructedWithZeroArgs() public {
        vm.expectRevert(ZeroAddress.selector);
        new Escrow(address(0), address(addressRegistry));

        vm.expectRevert(ZeroAddress.selector);
        new Escrow(address(roleManager), address(0));

        vm.expectRevert(ZeroAddress.selector);
        new EscrowFactory(address(0), address(addressRegistry), escrowImpl);

        vm.expectRevert(ZeroAddress.selector);
        new EscrowFactory(address(roleManager), address(addressRegistry), address(0));
    }

    /// @notice Only the registered factory may initialize a clone.
    /// @dev A clone initialized by anyone else would be a fully-armed escrow with
    ///      attacker-chosen terms, since the factory grants `SETTLEMENT_ROLE` before
    ///      initialization.
    function testFuzz_RevertWhen_NonFactoryInitializes(address caller) public {
        vm.assume(caller != address(escrowFactory));
        address clone = Clones.clone(escrowImpl);

        vm.expectRevert(abi.encodeWithSelector(UnexpectedCaller.selector, address(escrowFactory), caller));
        vm.prank(caller);
        IEscrow(clone).initialize(1, _bareTerms());
    }

    /// @notice A fee larger than the price is rejected at initialization.
    /// @dev Would otherwise underflow the seller's proceeds at settlement. The
    ///      marketplace quotes the fee as a fraction so this cannot arise in practice,
    ///      but the escrow does not take that on trust.
    function test_RevertWhen_FeeExceedsPrice() public {
        address clone = Clones.clone(escrowImpl);
        IEscrowFactory.EscrowTerms memory terms = _bareTerms();
        terms.feeAmount = terms.price + 1;

        vm.expectRevert(abi.encodeWithSelector(IEscrow.FeeExceedsPrice.selector, terms.price + 1, terms.price));
        vm.prank(address(escrowFactory));
        IEscrow(clone).initialize(1, terms);
    }

    /// @notice An unfunded escrow cannot be timed out, and a settled one cannot be
    ///         disputed.
    function test_RevertWhen_WrongStatusForTimeoutOrDispute() public {
        (,, address escrow) = _openTrade(PRICE);

        vm.expectRevert(
            abi.encodeWithSelector(
                IEscrow.InvalidEscrowTransition.selector,
                IEscrow.EscrowStatus.AWAITING_FUNDING,
                IEscrow.EscrowStatus.REFUNDED
            )
        );
        IEscrow(escrow).claimTimeout();

        vm.expectRevert(
            abi.encodeWithSelector(
                IEscrow.InvalidEscrowTransition.selector,
                IEscrow.EscrowStatus.AWAITING_FUNDING,
                IEscrow.EscrowStatus.DISPUTED
            )
        );
        vm.prank(bob);
        IEscrow(escrow).raiseDispute();
    }

    /*//////////////////////////////////////////////////////////////
                                 HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Builds a syntactically valid terms struct for direct factory calls.
    /// @dev Only used to prove the caller gate rejects it before any of it matters.
    /// @return The assembled terms.
    function _bareTerms() internal view returns (IEscrowFactory.EscrowTerms memory) {
        return IEscrowFactory.EscrowTerms({
            listingId: 1,
            assetId: 1,
            buyer: bob,
            seller: alice,
            paymentToken: address(settlementToken),
            treasury: treasury,
            price: PRICE,
            feeAmount: 0,
            fundingDeadline: uint40(block.timestamp + 1 days),
            settlementDeadline: uint40(block.timestamp + 2 days)
        });
    }
}
