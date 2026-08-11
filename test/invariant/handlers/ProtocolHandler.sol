// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AircraftRegistry} from "../../../src/assets/AircraftRegistry.sol";
import {AssetRegistry} from "../../../src/assets/AssetRegistry.sol";
import {ComponentRegistry} from "../../../src/assets/ComponentRegistry.sol";
import {DocumentRegistry} from "../../../src/documents/DocumentRegistry.sol";
import {CredentialRegistry} from "../../../src/identity/CredentialRegistry.sol";
import {IAircraftRegistry} from "../../../src/interfaces/IAircraftRegistry.sol";
import {IAssetRegistry} from "../../../src/interfaces/IAssetRegistry.sol";
import {IComponentRegistry} from "../../../src/interfaces/IComponentRegistry.sol";
import {ICredentialRegistry} from "../../../src/interfaces/ICredentialRegistry.sol";
import {IDocumentRegistry} from "../../../src/interfaces/IDocumentRegistry.sol";
import {IEscrow} from "../../../src/interfaces/IEscrow.sol";
import {IMaintenanceRegistry} from "../../../src/interfaces/IMaintenanceRegistry.sol";
import {MaintenanceRegistry} from "../../../src/maintenance/MaintenanceRegistry.sol";
import {Marketplace} from "../../../src/marketplace/Marketplace.sol";
import {AssetOwnership} from "../../../src/ownership/AssetOwnership.sol";
import {MockERC20} from "../../utils/mocks/MockERC20.sol";
import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";

/// @title ProtocolHandler
/// @author AeroAsset Protocol
/// @notice Drives the whole protocol through realistic randomized action sequences
///         for the invariant suite.
/// @dev Three rules govern this handler, all of them from `docs/invariants.md`:
///
///      1. **Bounded actors and ids.** Fuzzed values are mapped into a small fixed
///         actor set and into `1..count` id ranges. Unbounded fuzzing would spend
///         almost every call bouncing off "does not exist" reverts and never reach
///         deep protocol state.
///      2. **`fail_on_revert = false`, paired with per-action success counters.** A
///         suite where every action silently reverts passes vacuously; the counters
///         asserted at teardown are what catch that.
///      3. **Ghost variables mirror intent, not implementation.** Deposits, payouts
///         and terminal-state sets are tracked here so the assertions do not merely
///         read the contract's own storage back to itself.
contract ProtocolHandler is CommonBase, StdCheats, StdUtils {
    /*//////////////////////////////////////////////////////////////
                                 SYSTEM
    //////////////////////////////////////////////////////////////*/

    AssetRegistry internal immutable ASSETS;
    AssetOwnership internal immutable OWNERSHIP;
    AircraftRegistry internal immutable AIRCRAFT;
    ComponentRegistry internal immutable COMPONENTS;
    DocumentRegistry internal immutable DOCUMENTS;
    MaintenanceRegistry internal immutable MAINTENANCE;
    CredentialRegistry internal immutable CREDENTIALS;
    Marketplace internal immutable MARKET;
    MockERC20 internal immutable TOKEN;

    /*//////////////////////////////////////////////////////////////
                                FIXTURES
    //////////////////////////////////////////////////////////////*/

    /// @notice Bounded actor set every action is routed through.
    address[] public actors;
    /// @notice Verified organization each actor registers assets under.
    mapping(address actor => uint256 orgId) public orgOf;
    /// @notice Credentialed MRO used for maintenance records.
    uint256 public mroOrgId;
    /// @notice Address acting for the MRO.
    address public mroActor;
    /// @notice Account holding `ASSET_VERIFIER_ROLE` and `ORG_VERIFIER_ROLE`.
    address public verifier;

    /*//////////////////////////////////////////////////////////////
                               TRACKED IDS
    //////////////////////////////////////////////////////////////*/

    /// @notice Aircraft asset ids created so far.
    uint256[] public aircraftIds;
    /// @notice Component asset ids created so far.
    uint256[] public componentIds;
    /// @notice Listing ids created so far.
    uint256[] public listingIds;
    /// @notice Offer ids created so far.
    uint256[] public offerIds;
    /// @notice Escrow clones opened so far.
    address[] public escrows;

    /*//////////////////////////////////////////////////////////////
                                 GHOSTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Total measured amount ever deposited into any escrow.
    uint256 public ghostDeposited;
    /// @notice Total amount ever paid out of any escrow.
    uint256 public ghostPaidOut;
    /// @notice Number of times ownership changed hands.
    uint256 public ghostOwnerChanges;
    /// @notice Credentials observed in a terminal state, to prove none revives.
    mapping(uint256 credentialId => bool) public ghostTerminalCredential;
    /// @notice Listings observed in a terminal state, to prove none reactivates.
    mapping(uint256 listingId => bool) public ghostTerminalListing;

    /// @notice Successful invocations per action.
    mapping(bytes32 action => uint256 count) public callsOf;

    /// @notice Total successful invocations across all actions.
    /// @dev Asserted non-trivial in `afterInvariant`. Per-action minimums cannot be
    ///      asserted there — a single bounded sequence will not reliably reach all
    ///      sixteen actions — so per-action reachability is proved separately by a
    ///      deterministic test instead.
    uint256 public totalCalls;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Binds the handler to a fully wired protocol and its fixtures.
    /// @dev Fixtures are **constructor-injected, never settable**. An earlier version
    ///      exposed them as external setters, and Foundry — correctly — fuzzed those
    ///      like any other target function, overwriting the organization ids with
    ///      garbage so every subsequent action failed authorization and the suite
    ///      passed vacuously. Anything a handler must keep stable has to be
    ///      unreachable from the fuzzer.
    /// @param system The deployed module addresses, in a fixed order.
    /// @param actors_ The bounded actor set.
    /// @param orgIds_ Each actor's verified organization, index-aligned with actors.
    /// @param mroOrgId_ The credentialed MRO organization.
    /// @param mroActor_ The address acting for the MRO.
    /// @param verifier_ The account holding the verifier, issuer and arbitrator roles.
    /// @param seedAircraft Aircraft registered before the run starts.
    /// @param seedComponents Components registered before the run starts.
    constructor(
        address[9] memory system,
        address[] memory actors_,
        uint256[] memory orgIds_,
        uint256 mroOrgId_,
        address mroActor_,
        address verifier_,
        uint256[] memory seedAircraft,
        uint256[] memory seedComponents
    ) {
        ASSETS = AssetRegistry(system[0]);
        OWNERSHIP = AssetOwnership(system[1]);
        AIRCRAFT = AircraftRegistry(system[2]);
        COMPONENTS = ComponentRegistry(system[3]);
        DOCUMENTS = DocumentRegistry(system[4]);
        MAINTENANCE = MaintenanceRegistry(system[5]);
        CREDENTIALS = CredentialRegistry(system[6]);
        MARKET = Marketplace(system[7]);
        TOKEN = MockERC20(system[8]);

        actors = actors_;
        verifier = verifier_;
        mroOrgId = mroOrgId_;
        mroActor = mroActor_;

        for (uint256 i; i < actors_.length; ++i) {
            orgOf[actors_[i]] = orgIds_[i];
        }

        // Seeded so the dependency chain (install, list, offer, escrow) is reachable
        // from the very first call. Without it, a sequence would spend most of its
        // depth just creating the prerequisites and rarely reach settlement.
        for (uint256 i; i < seedAircraft.length; ++i) {
            aircraftIds.push(seedAircraft[i]);
        }
        for (uint256 i; i < seedComponents.length; ++i) {
            componentIds.push(seedComponents[i]);
        }
    }

    /*//////////////////////////////////////////////////////////////
                                 ACTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Registers an aircraft under a bounded actor's organization.
    /// @param actorSeed Selects the acting actor.
    /// @param serialSeed Distinguishes the serial number.
    function registerAircraft(uint256 actorSeed, uint256 serialSeed) external {
        address actor = _actor(actorSeed);

        IAircraftRegistry.AircraftParams memory params = IAircraftRegistry.AircraftParams({
            orgId: orgOf[actor],
            owner: actor,
            serialNumberHash: keccak256(abi.encode("msn", serialSeed, aircraftIds.length)),
            metadataHash: bytes32(0),
            uri: "",
            manufacturerOrgId: 0,
            manufacturerName: "Airbus",
            model: "A320",
            manufactureYear: 2015,
            category: IAircraftRegistry.AircraftCategory.COMMERCIAL_TRANSPORT,
            registrationMarkHash: bytes32(0)
        });

        vm.prank(actor);
        try AIRCRAFT.registerAircraft(params) returns (uint256 assetId) {
            aircraftIds.push(assetId);
            callsOf["registerAircraft"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Registers a component under a bounded actor's organization.
    /// @param actorSeed Selects the acting actor.
    /// @param serialSeed Distinguishes the serial number.
    /// @param kindSeed Selects the component kind.
    function registerComponent(uint256 actorSeed, uint256 serialSeed, uint256 kindSeed) external {
        address actor = _actor(actorSeed);

        IComponentRegistry.ComponentParams memory params = IComponentRegistry.ComponentParams({
            orgId: orgOf[actor],
            owner: actor,
            serialNumberHash: keccak256(abi.encode("esn", serialSeed, componentIds.length)),
            metadataHash: bytes32(0),
            uri: "",
            kind: IComponentRegistry.ComponentKind(bound(kindSeed, 1, 8)),
            partNumber: "PN-1"
        });

        vm.prank(actor);
        try COMPONENTS.registerComponent(params) returns (uint256 assetId) {
            componentIds.push(assetId);
            callsOf["registerComponent"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Fits a component to an aircraft.
    /// @param componentSeed Selects the component.
    /// @param aircraftSeed Selects the parent airframe.
    /// @param position The fitment position.
    function installComponent(uint256 componentSeed, uint256 aircraftSeed, uint16 position) external {
        if (componentIds.length == 0 || aircraftIds.length == 0) {
            return;
        }

        uint256 componentId = componentIds[bound(componentSeed, 0, componentIds.length - 1)];
        uint256 parentId = aircraftIds[bound(aircraftSeed, 0, aircraftIds.length - 1)];
        address owner = OWNERSHIP.ownerOf(componentId);

        vm.prank(owner);
        try COMPONENTS.installComponent(componentId, parentId, uint16(bound(position, 1, 4))) {
            callsOf["installComponent"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Removes a fitted component.
    /// @param componentSeed Selects the component.
    function removeComponent(uint256 componentSeed) external {
        if (componentIds.length == 0) {
            return;
        }

        uint256 componentId = componentIds[bound(componentSeed, 0, componentIds.length - 1)];
        address owner = OWNERSHIP.ownerOf(componentId);

        vm.prank(owner);
        try COMPONENTS.removeComponent(componentId) {
            callsOf["removeComponent"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Moves a component to another lifecycle status.
    /// @param componentSeed Selects the component.
    /// @param statusSeed Selects the target status.
    function setComponentStatus(uint256 componentSeed, uint256 statusSeed) external {
        if (componentIds.length == 0) {
            return;
        }

        uint256 componentId = componentIds[bound(componentSeed, 0, componentIds.length - 1)];
        address owner = OWNERSHIP.ownerOf(componentId);
        // Skip INSTALLED (2), which has its own entry point.
        uint256 raw = bound(statusSeed, 0, 3);
        IComponentRegistry.ComponentStatus target = raw == 0
            ? IComponentRegistry.ComponentStatus.UNINSTALLED
            : raw == 1
                ? IComponentRegistry.ComponentStatus.IN_REPAIR
                : raw == 2
                    ? IComponentRegistry.ComponentStatus.QUARANTINED
                    : IComponentRegistry.ComponentStatus.SCRAPPED;

        vm.prank(owner);
        try COMPONENTS.setComponentStatus(componentId, target) {
            callsOf["setComponentStatus"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Verifies an asset.
    /// @param assetSeed Selects the asset.
    function verifyAsset(uint256 assetSeed) external {
        uint256 assetId = _anyAsset(assetSeed);
        if (assetId == 0) {
            return;
        }

        vm.prank(verifier);
        try ASSETS.verifyAsset(assetId, 0) {
            callsOf["verifyAsset"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Moves an asset to another operational or terminal status.
    /// @param assetSeed Selects the asset.
    /// @param statusSeed Selects the target status.
    function setAssetStatus(uint256 assetSeed, uint256 statusSeed) external {
        uint256 assetId = _anyAsset(assetSeed);
        if (assetId == 0) {
            return;
        }

        address owner = OWNERSHIP.ownerOf(assetId);
        IAssetRegistry.AssetStatus target = IAssetRegistry.AssetStatus(bound(statusSeed, 1, 6));

        vm.prank(owner);
        try ASSETS.setAssetStatus(assetId, target) {
            callsOf["setAssetStatus"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Runs a full two-step direct ownership transfer.
    /// @param assetSeed Selects the asset.
    /// @param toSeed Selects the recipient.
    function transferAsset(uint256 assetSeed, uint256 toSeed) external {
        uint256 assetId = _anyAsset(assetSeed);
        if (assetId == 0) {
            return;
        }

        address from = OWNERSHIP.ownerOf(assetId);
        address to = _actor(toSeed);
        if (to == from) {
            return;
        }

        vm.prank(from);
        try OWNERSHIP.initiateTransfer(assetId, to, 0) {
            vm.prank(to);
            try OWNERSHIP.acceptTransfer(assetId) {
                ghostOwnerChanges += 1;
                callsOf["transferAsset"] += 1;
                totalCalls += 1;
            } catch {}
        } catch {}
    }

    /// @notice Registers a document against an asset.
    /// @param assetSeed Selects the asset.
    /// @param hashSeed Distinguishes the document hash.
    function registerDocument(uint256 assetSeed, uint256 hashSeed) external {
        uint256 assetId = _anyAsset(assetSeed);
        if (assetId == 0) {
            return;
        }

        address owner = OWNERSHIP.ownerOf(assetId);

        vm.prank(owner);
        try DOCUMENTS.registerDocument(
            assetId,
            0,
            IDocumentRegistry.DocumentType.LOGBOOK,
            keccak256(abi.encode("doc", hashSeed, assetId, block.timestamp)),
            uint40(block.timestamp),
            ""
        ) {
            callsOf["registerDocument"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Records a maintenance event through the three-way gate.
    /// @param assetSeed Selects the asset.
    function recordMaintenance(uint256 assetSeed) external {
        uint256 assetId = _anyAsset(assetSeed);
        if (assetId == 0) {
            return;
        }

        vm.prank(mroActor);
        try MAINTENANCE.recordMaintenance(
            assetId,
            mroOrgId,
            IMaintenanceRegistry.MaintenanceType.A_CHECK,
            uint40(block.timestamp),
            0,
            keccak256(abi.encode("wp", assetId, block.timestamp))
        ) {
            callsOf["recordMaintenance"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Revokes the MRO's maintenance credential.
    /// @dev Deliberately one-way: `INV-CRED-03` asserts a revoked credential never
    ///      becomes valid again, so the handler must be able to reach that state.
    /// @param issuerSeed Gates how often this fires, so it does not dominate.
    function revokeMaintenanceCredential(uint256 issuerSeed) external {
        if (bound(issuerSeed, 0, 9) != 0) {
            return;
        }

        uint256 credentialId =
            CREDENTIALS.validCredentialOfType(mroOrgId, ICredentialRegistry.CredentialType.MAINTENANCE_AUTHORITY);
        if (credentialId == 0) {
            return;
        }

        vm.prank(verifier);
        try CREDENTIALS.revokeCredential(credentialId) {
            ghostTerminalCredential[credentialId] = true;
            callsOf["revokeCredential"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Lists an asset for sale.
    /// @param assetSeed Selects the asset.
    /// @param priceSeed Selects the price.
    function createListing(uint256 assetSeed, uint256 priceSeed) external {
        uint256 assetId = _anyAsset(assetSeed);
        if (assetId == 0) {
            return;
        }

        address owner = OWNERSHIP.ownerOf(assetId);
        uint128 price = uint128(bound(priceSeed, 1e6, 1_000_000e6));

        vm.prank(owner);
        try MARKET.createListing(assetId, address(TOKEN), price, uint40(block.timestamp + 60 days)) returns (
            uint256 listingId
        ) {
            listingIds.push(listingId);
            callsOf["createListing"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Cancels a listing.
    /// @param listingSeed Selects the listing.
    function cancelListing(uint256 listingSeed) external {
        if (listingIds.length == 0) {
            return;
        }

        uint256 listingId = listingIds[bound(listingSeed, 0, listingIds.length - 1)];
        address seller = MARKET.getListing(listingId).seller;

        vm.prank(seller);
        try MARKET.cancelListing(listingId) {
            ghostTerminalListing[listingId] = true;
            callsOf["cancelListing"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Bids on a listing.
    /// @param listingSeed Selects the listing.
    /// @param buyerSeed Selects the bidder.
    function makeOffer(uint256 listingSeed, uint256 buyerSeed) external {
        if (listingIds.length == 0) {
            return;
        }

        uint256 listingId = listingIds[bound(listingSeed, 0, listingIds.length - 1)];
        address buyer = _actor(buyerSeed);
        uint128 price = MARKET.getListing(listingId).price;

        vm.prank(buyer);
        try MARKET.makeOffer(listingId, price, uint40(block.timestamp + 5 days)) returns (uint256 offerId) {
            offerIds.push(offerId);
            callsOf["makeOffer"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Accepts an offer, opening an escrow.
    /// @param offerSeed Selects the offer.
    function acceptOffer(uint256 offerSeed) external {
        if (offerIds.length == 0) {
            return;
        }

        uint256 offerId = offerIds[bound(offerSeed, 0, offerIds.length - 1)];
        uint256 listingId = MARKET.getOffer(offerId).listingId;
        address seller = MARKET.getListing(listingId).seller;

        vm.prank(seller);
        try MARKET.acceptOffer(offerId) returns (uint256, address escrow) {
            escrows.push(escrow);
            callsOf["acceptOffer"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Funds an open escrow.
    /// @param escrowSeed Selects the escrow.
    function fundEscrow(uint256 escrowSeed) external {
        address escrow = _anyEscrow(escrowSeed);
        if (escrow == address(0)) {
            return;
        }

        IEscrow e = IEscrow(escrow);
        address buyer = e.getTerms().buyer;
        uint128 price = e.getTerms().price;

        TOKEN.mint(buyer, price);
        vm.prank(buyer);
        TOKEN.approve(escrow, price);

        vm.prank(buyer);
        try e.fund() {
            ghostDeposited += price;
            callsOf["fundEscrow"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Releases a funded escrow.
    /// @param escrowSeed Selects the escrow.
    function releaseEscrow(uint256 escrowSeed) external {
        address escrow = _anyEscrow(escrowSeed);
        if (escrow == address(0)) {
            return;
        }

        IEscrow e = IEscrow(escrow);
        uint256 deposited = e.depositedAmount();

        vm.prank(e.getTerms().buyer);
        try e.release() {
            ghostPaidOut += deposited;
            ghostOwnerChanges += 1;
            ghostTerminalListing[e.getTerms().listingId] = true;
            callsOf["releaseEscrow"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Disputes a funded escrow.
    /// @param escrowSeed Selects the escrow.
    function disputeEscrow(uint256 escrowSeed) external {
        address escrow = _anyEscrow(escrowSeed);
        if (escrow == address(0)) {
            return;
        }

        IEscrow e = IEscrow(escrow);

        vm.prank(e.getTerms().seller);
        try e.raiseDispute() {
            callsOf["disputeEscrow"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Resolves a disputed escrow.
    /// @param escrowSeed Selects the escrow.
    /// @param forSeller Which party wins.
    function resolveDispute(uint256 escrowSeed, bool forSeller) external {
        address escrow = _anyEscrow(escrowSeed);
        if (escrow == address(0)) {
            return;
        }

        IEscrow e = IEscrow(escrow);
        uint256 deposited = e.depositedAmount();

        vm.prank(verifier);
        try e.resolveDispute(forSeller) {
            ghostPaidOut += deposited;
            if (forSeller) {
                ghostOwnerChanges += 1;
            }
            callsOf["resolveDispute"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Claims a timeout refund.
    /// @param escrowSeed Selects the escrow.
    function claimTimeout(uint256 escrowSeed) external {
        address escrow = _anyEscrow(escrowSeed);
        if (escrow == address(0)) {
            return;
        }

        IEscrow e = IEscrow(escrow);
        uint256 deposited = e.depositedAmount();

        try e.claimTimeout() {
            ghostPaidOut += deposited;
            callsOf["claimTimeout"] += 1;
            totalCalls += 1;
        } catch {}
    }

    /// @notice Advances the clock so deadlines can actually elapse.
    /// @param secondsSeed How far to jump.
    function warpTime(uint256 secondsSeed) external {
        vm.warp(block.timestamp + bound(secondsSeed, 1 hours, 45 days));
        callsOf["warpTime"] += 1;
        totalCalls += 1;
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Number of aircraft created.
    /// @return The count.
    function aircraftCount() external view returns (uint256) {
        return aircraftIds.length;
    }

    /// @notice Number of components created.
    /// @return The count.
    function componentCount() external view returns (uint256) {
        return componentIds.length;
    }

    /// @notice Number of listings created.
    /// @return The count.
    function listingCount() external view returns (uint256) {
        return listingIds.length;
    }

    /// @notice Number of escrows opened.
    /// @return The count.
    function escrowCount() external view returns (uint256) {
        return escrows.length;
    }

    /// @notice Number of actors in the bounded set.
    /// @return The count.
    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @notice Maps a fuzzed seed into the bounded actor set.
    /// @param seed The fuzzed value.
    /// @return The selected actor.
    function _actor(uint256 seed) internal view returns (address) {
        return actors[bound(seed, 0, actors.length - 1)];
    }

    /// @notice Selects any tracked asset, aircraft or component.
    /// @param seed The fuzzed value.
    /// @return The asset id, or 0 if none exist yet.
    function _anyAsset(uint256 seed) internal view returns (uint256) {
        uint256 total = aircraftIds.length + componentIds.length;
        if (total == 0) {
            return 0;
        }

        uint256 index = bound(seed, 0, total - 1);
        return index < aircraftIds.length ? aircraftIds[index] : componentIds[index - aircraftIds.length];
    }

    /// @notice Selects any tracked escrow.
    /// @param seed The fuzzed value.
    /// @return The escrow address, or zero if none exist yet.
    function _anyEscrow(uint256 seed) internal view returns (address) {
        if (escrows.length == 0) {
            return address(0);
        }
        return escrows[bound(seed, 0, escrows.length - 1)];
    }
}
