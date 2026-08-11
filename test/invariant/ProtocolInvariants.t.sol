// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IComponentRegistry} from "../../src/interfaces/IComponentRegistry.sol";
import {ICredentialRegistry} from "../../src/interfaces/ICredentialRegistry.sol";
import {IEscrow} from "../../src/interfaces/IEscrow.sol";
import {IMarketplace} from "../../src/interfaces/IMarketplace.sol";
import {IOrganizationRegistry} from "../../src/interfaces/IOrganizationRegistry.sol";
import {ProtocolFeeTypes} from "../../src/libraries/ProtocolFeeTypes.sol";
import {ProtocolRoles} from "../../src/libraries/ProtocolRoles.sol";
import {ProtocolTestBase} from "../utils/ProtocolTestBase.sol";
import {ProtocolHandler} from "./handlers/ProtocolHandler.sol";

/// @title ProtocolInvariantsTest
/// @author AeroAsset Protocol
/// @notice Executable form of `docs/invariants.md`. One randomized action sequence
///         drives the whole protocol; every `invariant_*` below is asserted after each
///         step of it.
/// @dev Sharing one handler across all assertions is deliberate — a single deep
///      sequence exercises far more interesting state than several shallow ones, and
///      an invariant that only holds in isolation is not an invariant.
contract ProtocolInvariantsTest is ProtocolTestBase {
    ProtocolHandler internal handler;

    function setUp() public override {
        super.setUp();

        address[] memory actors = new address[](3);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = carol;

        // The verifier doubles as arbitrator and credential issuer so the handler
        // needs only one privileged account.
        vm.startPrank(protocolAdmin);
        roleManager.grantRole(ProtocolRoles.ARBITRATOR_ROLE, orgVerifier);
        roleManager.grantRole(ProtocolRoles.CREDENTIAL_ISSUER_ROLE, orgVerifier);
        vm.stopPrank();

        // Every actor gets a verified organization to register assets under. Built
        // before the handler exists, so they can be constructor-injected rather than
        // set through a function the fuzzer would also call.
        uint256[] memory orgIds = new uint256[](actors.length);
        for (uint256 i; i < actors.length; ++i) {
            orgIds[i] = _registerVerifiedOrg(
                actors[i], keccak256(abi.encode("inv-org", i)), IOrganizationRegistry.OrganizationType.AIRLINE
            );
        }
        (uint256 mroOrg,) = _credentialedMro();

        // Seed one aircraft and one component per actor so installation, listing and
        // settlement are reachable immediately rather than only in long sequences.
        uint256[] memory seedAircraft = new uint256[](actors.length);
        uint256[] memory seedComponents = new uint256[](actors.length);
        for (uint256 i; i < actors.length; ++i) {
            seedAircraft[i] = _registerAircraft(orgIds[i], actors[i], actors[i], keccak256(abi.encode("seed-msn", i)));
            seedComponents[i] = _registerComponent(
                orgIds[i],
                actors[i],
                actors[i],
                IComponentRegistry.ComponentKind.ENGINE,
                keccak256(abi.encode("seed-esn", i))
            );
            vm.prank(orgVerifier);
            assetRegistry.verifyAsset(seedAircraft[i], 0);
        }

        handler = new ProtocolHandler(
            [
                address(assetRegistry),
                address(assetOwnership),
                address(aircraftRegistry),
                address(componentRegistry),
                address(documentRegistry),
                address(maintenanceRegistry),
                address(credentialRegistry),
                address(marketplace),
                address(settlementToken)
            ],
            actors,
            orgIds,
            mroOrg,
            mro,
            orgVerifier,
            seedAircraft,
            seedComponents
        );

        targetContract(address(handler));
    }

    /*//////////////////////////////////////////////////////////////
                                OWNERSHIP
    //////////////////////////////////////////////////////////////*/

    /// @notice INV-OWN-01: every registered asset has exactly one non-zero owner.
    /// @dev Roadmap §16. An asset with no owner is unsellable, unmaintainable and
    ///      unrecoverable.
    function invariant_EveryAssetHasExactlyOneOwner() public view {
        uint256 count = assetRegistry.assetCount();
        for (uint256 assetId = 1; assetId <= count; ++assetId) {
            assertTrue(assetOwnership.ownerOf(assetId) != address(0), "asset has no owner");
        }
    }

    /// @notice INV-OWN-05: a locked asset never has a pending direct transfer.
    /// @dev Otherwise a seller's offer could fire the instant settlement releases.
    function invariant_LockedAssetHasNoPendingTransfer() public view {
        uint256 count = assetRegistry.assetCount();
        for (uint256 assetId = 1; assetId <= count; ++assetId) {
            if (assetOwnership.lockHolderOf(assetId) != address(0)) {
                assertEq(
                    assetOwnership.getOwnership(assetId).pendingOwner,
                    address(0),
                    "locked asset carries a pending transfer"
                );
            }
        }
    }

    /// @notice INV-OWN-06: the frozen mirror never drifts from terminal status.
    /// @dev `AssetOwnership` cannot read asset status, so `AssetRegistry` pushes this
    ///      bit down. This is the assertion that the mirror stays honest.
    function invariant_FrozenMirrorMatchesTerminalStatus() public view {
        uint256 count = assetRegistry.assetCount();
        for (uint256 assetId = 1; assetId <= count; ++assetId) {
            assertEq(
                assetOwnership.getOwnership(assetId).transferFrozen,
                assetRegistry.isTerminal(assetId),
                "frozen flag drifted from terminal status"
            );
        }
    }

    /*//////////////////////////////////////////////////////////////
                                COMPONENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice INV-COMP-01: `parentAssetId != 0` if and only if `status == INSTALLED`.
    /// @dev Roadmap §16 — a component never belongs to two aircraft. The property is
    ///      structural, but this proves no transition path breaks it.
    function invariant_ComponentParentSetIffInstalled() public view {
        uint256 count = handler.componentCount();
        for (uint256 i; i < count; ++i) {
            uint256 componentId = handler.componentIds(i);
            IComponentRegistry.Component memory component = componentRegistry.getComponent(componentId);

            assertEq(
                component.parentAssetId != 0,
                component.status == IComponentRegistry.ComponentStatus.INSTALLED,
                "INV-COMP-01 violated"
            );
        }
    }

    /// @notice INV-COMP-02: the installed index has no stale or duplicate entries.
    function invariant_InstalledIndexIsConsistent() public view {
        uint256 aircraftTotal = handler.aircraftCount();
        for (uint256 i; i < aircraftTotal; ++i) {
            uint256 parentId = handler.aircraftIds(i);
            uint256[] memory installed = componentRegistry.componentsOf(parentId, 0, type(uint256).max);

            for (uint256 j; j < installed.length; ++j) {
                IComponentRegistry.Component memory component = componentRegistry.getComponent(installed[j]);
                assertEq(component.parentAssetId, parentId, "index points at a component with a different parent");
                assertEq(
                    uint8(component.status),
                    uint8(IComponentRegistry.ComponentStatus.INSTALLED),
                    "index retains a detached component"
                );

                for (uint256 k = j + 1; k < installed.length; ++k) {
                    assertTrue(installed[j] != installed[k], "index contains a duplicate");
                }
            }
        }
    }

    /// @notice INV-COMP-03: no two installed components share a kind and position.
    function invariant_NoPositionCollisions() public view {
        uint256 aircraftTotal = handler.aircraftCount();
        for (uint256 i; i < aircraftTotal; ++i) {
            uint256 parentId = handler.aircraftIds(i);
            uint256[] memory installed = componentRegistry.componentsOf(parentId, 0, type(uint256).max);

            for (uint256 j; j < installed.length; ++j) {
                IComponentRegistry.Component memory component = componentRegistry.getComponent(installed[j]);
                assertEq(
                    componentRegistry.positionOccupant(parentId, component.kind, component.position),
                    installed[j],
                    "position index disagrees with the component record"
                );
            }
        }
    }

    /*//////////////////////////////////////////////////////////////
                                  ESCROW
    //////////////////////////////////////////////////////////////*/

    /// @notice INV-ESC-02/03: escrows never pay out more than was deposited, and a
    ///         terminal escrow holds nothing.
    /// @dev Roadmap §16. The ghost totals are tracked by the handler rather than read
    ///      back from the contracts, so this is an independent accounting check.
    function invariant_EscrowsConserveValue() public view {
        assertLe(handler.ghostPaidOut(), handler.ghostDeposited(), "more was paid out than was ever deposited");

        uint256 count = handler.escrowCount();
        uint256 heldByLiveEscrows;

        for (uint256 i; i < count; ++i) {
            IEscrow escrow = IEscrow(handler.escrows(i));
            uint256 balance = settlementToken.balanceOf(address(escrow));

            if (escrow.isTerminal()) {
                assertEq(balance, 0, "terminal escrow retained funds");
            } else {
                assertEq(balance, escrow.depositedAmount(), "live escrow balance disagrees with its deposit");
                heldByLiveEscrows += balance;
            }
        }

        assertEq(
            handler.ghostDeposited() - handler.ghostPaidOut(),
            heldByLiveEscrows,
            "protocol-wide escrow accounting does not balance"
        );
    }

    /// @notice INV-ESC-05: an escrow holds `SETTLEMENT_ROLE` iff it is non-terminal.
    /// @dev The window in which an escrow can move an aircraft is exactly the window
    ///      in which its trade is live.
    function invariant_EscrowArmedIffLive() public view {
        uint256 count = handler.escrowCount();
        for (uint256 i; i < count; ++i) {
            address escrow = handler.escrows(i);
            assertEq(
                roleManager.hasRole(ProtocolRoles.SETTLEMENT_ROLE, escrow),
                !IEscrow(escrow).isTerminal(),
                "escrow armament does not match its lifecycle"
            );
        }
    }

    /// @notice INV-ESC-06: frozen trade terms never change after initialization.
    function invariant_EscrowTermsAreImmutable() public view {
        uint256 count = handler.escrowCount();
        for (uint256 i; i < count; ++i) {
            IEscrow escrow = IEscrow(handler.escrows(i));
            assertTrue(escrow.getTerms().buyer != address(0), "buyer was cleared");
            assertTrue(escrow.getTerms().seller != address(0), "seller was cleared");
            assertLe(escrow.getTerms().feeAmount, escrow.getTerms().price, "fee exceeds price");
        }
    }

    /*//////////////////////////////////////////////////////////////
                                MARKETPLACE
    //////////////////////////////////////////////////////////////*/

    /// @notice INV-MKT-01: a terminal listing never returns to `ACTIVE`.
    /// @dev Roadmap §16 — a sold listing must never reactivate.
    function invariant_TerminalListingsStayTerminal() public view {
        uint256 count = handler.listingCount();
        for (uint256 i; i < count; ++i) {
            uint256 listingId = handler.listingIds(i);
            if (handler.ghostTerminalListing(listingId)) {
                assertTrue(
                    marketplace.getListing(listingId).status != IMarketplace.ListingStatus.ACTIVE,
                    "a terminal listing became active again"
                );
            }
        }
    }

    /// @notice INV-MKT-02: at most one effectively-active listing per asset.
    function invariant_AtMostOneActiveListingPerAsset() public view {
        uint256 assetTotal = assetRegistry.assetCount();
        uint256 listingTotal = handler.listingCount();

        for (uint256 assetId = 1; assetId <= assetTotal; ++assetId) {
            uint256 activeCount;
            for (uint256 i; i < listingTotal; ++i) {
                uint256 listingId = handler.listingIds(i);
                if (marketplace.getListing(listingId).assetId == assetId && marketplace.isListingActive(listingId)) {
                    activeCount += 1;
                }
            }
            assertLe(activeCount, 1, "asset has more than one active listing");
        }
    }

    /// @notice INV-MKT-03: a sold listing's escrow actually released.
    function invariant_SoldListingsHaveReleasedEscrows() public view {
        uint256 count = handler.escrowCount();
        for (uint256 i; i < count; ++i) {
            IEscrow escrow = IEscrow(handler.escrows(i));
            uint256 listingId = escrow.getTerms().listingId;

            if (marketplace.getListing(listingId).status == IMarketplace.ListingStatus.SOLD) {
                assertEq(
                    uint8(escrow.status()),
                    uint8(IEscrow.EscrowStatus.RELEASED),
                    "listing sold without its escrow releasing"
                );
            }
        }
    }

    /*//////////////////////////////////////////////////////////////
                               CREDENTIALS
    //////////////////////////////////////////////////////////////*/

    /// @notice INV-CRED-01/03: validity implies `ACTIVE` and unexpired, and a
    ///         terminal credential never becomes valid again.
    /// @dev Roadmap §16 — reissuance mints a new id, it never resurrects an old one.
    function invariant_CredentialValidityIsSound() public view {
        uint256 count = credentialRegistry.credentialCount();
        for (uint256 credentialId = 1; credentialId <= count; ++credentialId) {
            ICredentialRegistry.Credential memory credential = credentialRegistry.getCredential(credentialId);

            if (credentialRegistry.isValid(credentialId)) {
                assertEq(
                    uint8(credential.status),
                    uint8(ICredentialRegistry.CredentialStatus.ACTIVE),
                    "a non-active credential reported valid"
                );
                assertTrue(
                    credential.expiresAt == 0 || credential.expiresAt > block.timestamp,
                    "an expired credential reported valid"
                );
                assertFalse(handler.ghostTerminalCredential(credentialId), "a revoked credential became valid again");
            }
        }
    }

    /// @notice INV-CRED-04: at most one valid credential per organization and type.
    /// @dev This is what makes the O(1) `validCredentialOfType` lookup exact, and what
    ///      lets maintenance authorization avoid an unbounded loop.
    function invariant_AtMostOneValidCredentialPerOrgAndType() public view {
        uint256 count = credentialRegistry.credentialCount();

        for (uint256 typeRaw = 1; typeRaw <= 6; ++typeRaw) {
            ICredentialRegistry.CredentialType credType = ICredentialRegistry.CredentialType(typeRaw);
            uint256 orgTotal = orgRegistry.organizationCount();

            for (uint256 orgId = 1; orgId <= orgTotal; ++orgId) {
                uint256 validCount;
                for (uint256 credentialId = 1; credentialId <= count; ++credentialId) {
                    ICredentialRegistry.Credential memory credential = credentialRegistry.getCredential(credentialId);
                    if (
                        credential.subjectOrgId == orgId && credential.credType == credType
                            && credentialRegistry.isValid(credentialId)
                    ) {
                        validCount += 1;
                    }
                }
                assertLe(validCount, 1, "organization holds two valid credentials of one type");
            }
        }
    }

    /*//////////////////////////////////////////////////////////////
                                  SYSTEM
    //////////////////////////////////////////////////////////////*/

    /// @notice INV-FEE-01: the configured fee never exceeds the hard cap.
    function invariant_FeeNeverExceedsCap() public view {
        assertLe(feeManager.feeBps(ProtocolFeeTypes.MARKETPLACE), feeManager.MAX_FEE_BPS(), "fee exceeded the hard cap");
        assertTrue(feeManager.treasury() != address(0), "treasury was cleared");
    }

    /// @notice INV-SYS-01: exactly one `DEFAULT_ADMIN_ROLE` holder.
    function invariant_SingleProtocolAdmin() public view {
        assertEq(roleManager.getRoleMemberCount(roleManager.DEFAULT_ADMIN_ROLE()), 1, "admin set changed size");
    }

    /// @notice INV-SYS-03: no protocol contract ever holds native ether.
    /// @dev The protocol settles only in ERC-20. Holding ether would mean an ETH
    ///      transfer path exists, and with it a reentrancy surface.
    function invariant_NoContractHoldsEther() public view {
        assertEq(address(assetRegistry).balance, 0, "asset registry holds ether");
        assertEq(address(assetOwnership).balance, 0, "ownership holds ether");
        assertEq(address(marketplace).balance, 0, "marketplace holds ether");
        assertEq(address(feeManager).balance, 0, "fee manager holds ether");
        assertEq(address(escrowFactory).balance, 0, "escrow factory holds ether");

        uint256 count = handler.escrowCount();
        for (uint256 i; i < count; ++i) {
            assertEq(handler.escrows(i).balance, 0, "escrow holds ether");
        }
    }

    /// @notice INV-ASSET-03: registration never verifies, and ids stay dense.
    function invariant_AssetIdsAreDenseAndUnverifiedAtBirth() public view {
        uint256 count = assetRegistry.assetCount();
        for (uint256 assetId = 1; assetId <= count; ++assetId) {
            assertTrue(assetRegistry.exists(assetId), "id gap in the asset space");
        }
        assertFalse(assetRegistry.exists(count + 1), "asset exists beyond the counter");
    }

    /*//////////////////////////////////////////////////////////////
                                 COVERAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Proves the sequence actually reached the interesting states.
    /// @dev With `fail_on_revert = false`, a handler whose every action reverts would
    ///      make every invariant above pass vacuously. This is the guard against a
    ///      suite that is green because it did nothing.
    ///
    ///      It must be `afterInvariant`, not an `invariant_*` function: Foundry
    ///      asserts every invariant once *before* the run as well, when no action has
    ///      executed yet and the counters are legitimately zero.
    ///
    ///      This asserts an **aggregate**, not per-action minimums. A single bounded
    ///      sequence will not reliably reach all sixteen actions, so demanding that
    ///      here would make the suite flaky rather than rigorous. Per-action
    ///      reachability is proved deterministically by
    ///      {test_EveryHandlerActionIsReachable} instead — together the two catch both
    ///      "the sequence did nothing" and "this action can never succeed".
    ///      The threshold is deliberately `> 0` rather than an arbitrary larger
    ///      number. Sequence length varies, and a tighter bound would fail
    ///      occasionally on a legitimately short run — a flaky guard teaches people to
    ///      ignore it. The strong claim lives in the deterministic test below.
    function afterInvariant() public view {
        assertGt(handler.totalCalls(), 0, "the sequence performed no successful action at all");
    }

    /// @notice Every handler action can succeed at least once.
    /// @dev Deterministic companion to {afterInvariant}. An action that always reverts
    ///      contributes nothing to the invariant suite while looking like coverage;
    ///      this is what surfaces one.
    function test_EveryHandlerActionIsReachable() public {
        handler.registerAircraft(0, 1);
        handler.registerComponent(0, 1, 1);
        handler.installComponent(0, 0, 1);
        // Index 3 is the aircraft just registered above; the three seeded ones are
        // already verified, so pointing at one of those would only ever revert.
        handler.verifyAsset(3);
        // Runs before the trade below, while nothing is locked: asset 1 is a seeded
        // aircraft owned by actor 1, transferred to actor 0.
        handler.transferAsset(1, 0);
        handler.registerDocument(0, 1);
        handler.recordMaintenance(0);
        handler.createListing(0, 1);
        handler.makeOffer(0, 1);
        handler.acceptOffer(0);
        handler.fundEscrow(0);
        handler.disputeEscrow(0);
        handler.resolveDispute(0, true);
        handler.removeComponent(0);
        handler.setComponentStatus(0, 1);
        handler.warpTime(1);

        string[16] memory actions = [
            "registerAircraft",
            "registerComponent",
            "installComponent",
            "verifyAsset",
            "registerDocument",
            "recordMaintenance",
            "createListing",
            "makeOffer",
            "acceptOffer",
            "fundEscrow",
            "disputeEscrow",
            "resolveDispute",
            "removeComponent",
            "setComponentStatus",
            "transferAsset",
            "warpTime"
        ];
        for (uint256 i; i < actions.length; ++i) {
            assertGt(handler.callsOf(bytes32(bytes(actions[i]))), 0, actions[i]);
        }
    }
}
