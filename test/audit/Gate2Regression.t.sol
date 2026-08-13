// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IEscrow} from "../../src/interfaces/IEscrow.sol";
import {IFeeManager} from "../../src/interfaces/IFeeManager.sol";
import {IMaintenanceRegistry} from "../../src/interfaces/IMaintenanceRegistry.sol";
import {IOrganizationRegistry} from "../../src/interfaces/IOrganizationRegistry.sol";
import {ProtocolFeeTypes} from "../../src/libraries/ProtocolFeeTypes.sol";
import {ProtocolTestBase} from "../utils/ProtocolTestBase.sol";

/// @title Gate2Regression
/// @author AeroAsset Protocol
/// @notice Regression tests for the Gate 2 audit remediations.
/// @dev Gate 2 covers economic design and data integrity. Unlike Gates 0 and 1, none of
///      these findings could strand value — they are about incentives being mispriced
///      and about assertions being indistinguishable from observations.
contract Gate2Regression is ProtocolTestBase {
    uint128 internal constant PRICE = 1_000_000e6;

    /// @dev Representative maintenance category used throughout.
    IMaintenanceRegistry.MaintenanceType internal constant C_CHECK = IMaintenanceRegistry.MaintenanceType.C_CHECK;

    /// @dev The deposit share a lapsed buyer forfeits, mirrored from `Escrow`.
    function _penaltyOn(uint256 amount, IEscrow escrow) internal view returns (uint256) {
        return (amount * escrow.TIMEOUT_PENALTY_BPS()) / 10_000;
    }

    /*//////////////////////////////////////////////////////////////
                     AAP-09 — THE FREE OPTION IS PRICED
    //////////////////////////////////////////////////////////////*/

    /// @notice Walking away from a funded trade now costs the buyer.
    /// @dev Previously `claimTimeout` returned 100%, so a buyer held a costless option:
    ///      exercise if the asset appreciated, walk if it fell, while the seller's
    ///      aircraft sat locked and unsaleable either way.
    function test_AAP09_TimeoutCostsTheBuyer() public {
        (,, address escrowAddr) = _openTrade(PRICE);
        IEscrow escrow = IEscrow(escrowAddr);

        _fundBuyer(bob, escrowAddr, PRICE);
        vm.prank(bob);
        escrow.fund();

        uint256 sellerBefore = settlementToken.balanceOf(alice);
        vm.warp(uint256(escrow.getTerms().settlementDeadline) + 1);

        uint256 penalty = _penaltyOn(PRICE, escrow);
        vm.expectEmit(true, true, true, true, escrowAddr);
        emit IEscrow.TimeoutPenaltyCharged(escrow.escrowId(), alice, penalty);
        escrow.claimTimeout();

        assertGt(penalty, 0, "penalty is zero");
        assertEq(settlementToken.balanceOf(bob), PRICE - penalty, "buyer keeps the full deposit");
        assertEq(settlementToken.balanceOf(alice) - sellerBefore, penalty, "seller uncompensated");

        // Conservation is exact across the split.
        assertEq(settlementToken.balanceOf(escrowAddr), 0, "escrow retained funds");
    }

    /// @notice A buyer the arbitrator rules for is refunded in full.
    /// @dev The penalty is for buyer fault, not for losing a trade. Charging it here
    ///      would let a seller manufacture a fee by disputing.
    function test_AAP09_ArbitratedRefundCarriesNoPenalty() public {
        (,, address escrowAddr) = _openTrade(PRICE);
        IEscrow escrow = IEscrow(escrowAddr);

        _fundBuyer(bob, escrowAddr, PRICE);
        vm.prank(bob);
        escrow.fund();
        vm.prank(alice);
        escrow.raiseDispute();

        vm.prank(arbitrator);
        escrow.resolveDispute(false);

        assertEq(settlementToken.balanceOf(bob), PRICE, "arbitrated refund was penalised");
        assertEq(settlementToken.balanceOf(alice), 0, "seller paid on a losing dispute");
    }

    /// @notice An abandoned arbitration refunds in full too.
    /// @dev The buyer did not cause the arbitrator's absence, so they must not pay for
    ///      it — otherwise a seller could dispute, wait, and collect.
    function test_AAP09_DisputeTimeoutCarriesNoPenalty() public {
        (,, address escrowAddr) = _openTrade(PRICE);
        IEscrow escrow = IEscrow(escrowAddr);

        _fundBuyer(bob, escrowAddr, PRICE);
        vm.prank(bob);
        escrow.fund();
        vm.prank(alice);
        escrow.raiseDispute();

        vm.warp(block.timestamp + escrow.DISPUTE_RESOLUTION_WINDOW() + 1);
        escrow.claimDisputeTimeout();

        assertEq(settlementToken.balanceOf(bob), PRICE, "dispute timeout was penalised");
        assertEq(settlementToken.balanceOf(alice), 0, "seller rewarded for stalling");
    }

    /// @notice The settlement window is bounded to 14 days.
    /// @dev Every extra day was free optionality for the buyer, paid for with the
    ///      seller's locked asset.
    function test_AAP09_SettlementWindowIsBounded() public {
        (,, address escrowAddr) = _openTrade(PRICE);
        IEscrow.EscrowStatus statusBefore = IEscrow(escrowAddr).status();

        uint256 window = IEscrow(escrowAddr).getTerms().settlementDeadline - block.timestamp;
        assertEq(window, 14 days, "settlement window is not 14 days");
        assertEq(uint8(statusBefore), uint8(IEscrow.EscrowStatus.AWAITING_FUNDING), "unexpected initial status");
    }

    /*//////////////////////////////////////////////////////////////
                  AAP-15 — TREASURY IS FROZEN AT ACCEPTANCE
    //////////////////////////////////////////////////////////////*/

    /// @notice Changing the treasury cannot redirect an already-agreed trade.
    function test_AAP15_TreasuryIsCapturedAtAcceptance() public {
        (,, address escrowAddr) = _openTrade(PRICE);
        IEscrow escrow = IEscrow(escrowAddr);

        address agreedTreasury = escrow.getTerms().treasury;
        assertEq(agreedTreasury, treasury, "treasury not captured in terms");

        // The treasury rotates after the parties agreed but before settlement.
        address newTreasury = makeAddr("newTreasury");
        vm.prank(protocolAdmin);
        feeManager.setTreasury(newTreasury);

        _fundBuyer(bob, escrowAddr, PRICE);
        vm.prank(bob);
        escrow.fund();
        vm.prank(bob);
        escrow.release();

        uint256 fee = escrow.getTerms().feeAmount;
        assertGt(fee, 0, "no fee to misdirect");
        assertEq(settlementToken.balanceOf(agreedTreasury), fee, "fee did not go to the agreed treasury");
        assertEq(settlementToken.balanceOf(newTreasury), 0, "fee redirected mid-trade");
    }

    /*//////////////////////////////////////////////////////////////
                AAP-18 — ALLOWLIST RE-CHECKED AT ACCEPTANCE
    //////////////////////////////////////////////////////////////*/

    /// @notice De-allowlisting a token stops existing listings from opening escrows.
    /// @dev Removing a token is the expected response to it being compromised. Checking
    ///      only at listing time left every already-live listing able to settle in it.
    function test_AAP18_DeallowlistedTokenBlocksAcceptance() public {
        (,, uint256 listingId) = _listedAircraft(PRICE);

        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 7 days));

        // The token is withdrawn from the allowlist after the listing was created.
        vm.prank(protocolAdmin);
        feeManager.setTokenAllowed(address(settlementToken), false);

        vm.expectRevert(abi.encodeWithSelector(IFeeManager.TokenNotAllowed.selector, address(settlementToken)));
        vm.prank(alice);
        marketplace.acceptOffer(offerId);
    }

    /// @notice Re-allowlisting restores acceptance.
    function test_AAP18_ReallowlistingRestoresAcceptance() public {
        (,, uint256 listingId) = _listedAircraft(PRICE);

        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 7 days));

        vm.startPrank(protocolAdmin);
        feeManager.setTokenAllowed(address(settlementToken), false);
        feeManager.setTokenAllowed(address(settlementToken), true);
        vm.stopPrank();

        vm.prank(alice);
        (, address escrowAddr) = marketplace.acceptOffer(offerId);
        assertTrue(escrowAddr != address(0), "acceptance blocked after re-allowlisting");
    }

    /*//////////////////////////////////////////////////////////////
               AAP-11 — VERIFY-THEN-SWAP IS NOT SILENT
    //////////////////////////////////////////////////////////////*/

    /// @notice Changing attested metadata demotes a verified organization.
    function test_AAP11_MetadataChangeDemotesVerifiedOrg() public {
        uint256 orgId = _defaultVerifiedOrg();
        bytes32 oldHash = orgRegistry.getOrganization(orgId).metadataHash;
        bytes32 newHash = keccak256("swapped-after-verification");

        vm.expectEmit(true, true, true, true, address(orgRegistry));
        emit IOrganizationRegistry.OrganizationRequiresReverification(orgId, oldHash, newHash);
        vm.prank(alice);
        orgRegistry.updateOrganization(orgId, newHash, "ipfs://swapped");

        assertEq(
            uint8(orgRegistry.getOrganization(orgId).status),
            uint8(IOrganizationRegistry.OrganizationStatus.SUSPENDED),
            "verified badge survived a content swap"
        );
        // And the demotion has teeth: the org can no longer act.
        assertFalse(orgRegistry.isActingFor(orgId, alice), "suspended org can still act");
    }

    /// @notice Changing only the URI does not demote.
    /// @dev The hash is what was attested; the URI is only where it lives. Moving a
    ///      profile between gateways must not cost an organization its verification.
    function test_AAP11_UriOnlyChangeDoesNotDemote() public {
        uint256 orgId = _defaultVerifiedOrg();
        bytes32 sameHash = orgRegistry.getOrganization(orgId).metadataHash;

        vm.prank(alice);
        orgRegistry.updateOrganization(orgId, sameHash, "ipfs://moved-to-a-new-gateway");

        assertEq(
            uint8(orgRegistry.getOrganization(orgId).status),
            uint8(IOrganizationRegistry.OrganizationStatus.VERIFIED),
            "relocation cost the verification"
        );
        assertTrue(orgRegistry.isActingFor(orgId, alice), "org lost its authority");
    }

    /// @notice A demoted organization can be re-verified after review.
    function test_AAP11_DemotionIsReversibleByTheVerifier() public {
        uint256 orgId = _defaultVerifiedOrg();

        vm.prank(alice);
        orgRegistry.updateOrganization(orgId, keccak256("v2"), "ipfs://v2");

        vm.prank(orgVerifier);
        orgRegistry.reactivateOrganization(orgId);

        assertTrue(orgRegistry.isActingFor(orgId, alice), "re-verification did not restore authority");
    }

    /*//////////////////////////////////////////////////////////////
              AAP-12 — BACKDATING IS VISIBLE, NOT PREVENTED
    //////////////////////////////////////////////////////////////*/

    /// @notice Every maintenance record carries the date the protocol observed it.
    /// @dev The protocol cannot verify a claim about the physical world, and must not
    ///      forbid old dates — backfilling an airframe's service history at onboarding
    ///      is a primary use case. What it can do is record its own observation next to
    ///      the claim, so a fabricated back-history is plainly visible as one.
    function test_AAP12_RecordedAtExposesBackdating() public {
        (uint256 orgId, uint256 assetId) = _defaultAircraft();
        uint256 mroOrg = _credentialedMroFor(orgId);

        uint40 claimed = uint40(block.timestamp - 3 * 365 days);

        vm.prank(mro);
        uint256 recordId =
            maintenanceRegistry.recordMaintenance(assetId, mroOrg, C_CHECK, claimed, 0, keccak256("wp-1"));

        IMaintenanceRegistry.MaintenanceRecord memory record = maintenanceRegistry.getMaintenanceRecord(recordId);

        assertEq(record.performedAt, claimed, "claimed date lost");
        assertEq(record.recordedAt, uint40(block.timestamp), "observed date not recorded");
        // The gap is what a buyer inspects: work claimed three years ago, asserted today.
        assertEq(record.recordedAt - record.performedAt, 3 * 365 days, "gap not derivable");
    }

    /// @notice A contemporaneous record shows no gap.
    function test_AAP12_ContemporaneousRecordHasNoGap() public {
        (uint256 orgId, uint256 assetId) = _defaultAircraft();
        uint256 mroOrg = _credentialedMroFor(orgId);

        uint40 now40 = uint40(block.timestamp);

        vm.prank(mro);
        uint256 recordId = maintenanceRegistry.recordMaintenance(assetId, mroOrg, C_CHECK, now40, 0, keccak256("wp-2"));

        IMaintenanceRegistry.MaintenanceRecord memory record = maintenanceRegistry.getMaintenanceRecord(recordId);
        assertEq(record.recordedAt, record.performedAt, "contemporaneous record shows a gap");
    }

    /// @notice Future-dated work is still refused outright.
    function test_AAP12_FutureDatesStillRejected() public {
        (uint256 orgId, uint256 assetId) = _defaultAircraft();
        uint256 mroOrg = _credentialedMroFor(orgId);

        uint40 future = uint40(block.timestamp + 1);

        vm.expectRevert(
            abi.encodeWithSelector(IMaintenanceRegistry.PerformedAtInFuture.selector, future, uint40(block.timestamp))
        );
        vm.prank(mro);
        maintenanceRegistry.recordMaintenance(assetId, mroOrg, C_CHECK, future, 0, keccak256("wp-3"));
    }

    /*//////////////////////////////////////////////////////////////
                 AAP-17 — REVOKED RECORDS STOP CHANGING
    //////////////////////////////////////////////////////////////*/

    /// @notice A revoked organization can no longer be administered at all.
    function test_AAP17_RevokedOrgIsFullyFrozen() public {
        uint256 orgId = _defaultVerifiedOrg();

        vm.prank(protocolAdmin);
        orgRegistry.revokeOrganization(orgId);

        bytes memory expected = abi.encodeWithSelector(
            IOrganizationRegistry.InvalidOrganizationTransition.selector,
            IOrganizationRegistry.OrganizationStatus.REVOKED,
            IOrganizationRegistry.OrganizationStatus.REVOKED
        );

        vm.expectRevert(expected);
        vm.prank(alice);
        orgRegistry.setOperator(orgId, bob, true);

        vm.expectRevert(expected);
        vm.prank(alice);
        orgRegistry.transferOrganizationAdmin(orgId, bob);

        vm.expectRevert(expected);
        vm.prank(alice);
        orgRegistry.updateOrganization(orgId, keccak256("x"), "ipfs://x");
    }

    /*//////////////////////////////////////////////////////////////
                                 HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @dev Registers a credentialed MRO distinct from `orgId`'s namespace.
    /// @param salt Distinguishes the MRO's name from the caller's fixture.
    /// @return orgId The MRO organization id.
    function _credentialedMroFor(uint256 salt) internal returns (uint256 orgId) {
        salt; // fixtures already vary by call order; kept for call-site readability
        (orgId,) = _credentialedMro();
    }
}
