// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AircraftRegistry} from "../src/assets/AircraftRegistry.sol";
import {AssetRegistry} from "../src/assets/AssetRegistry.sol";
import {ComponentRegistry} from "../src/assets/ComponentRegistry.sol";
import {DocumentRegistry} from "../src/documents/DocumentRegistry.sol";
import {OrganizationRegistry} from "../src/identity/OrganizationRegistry.sol";
import {IAircraftRegistry} from "../src/interfaces/IAircraftRegistry.sol";
import {IComponentRegistry} from "../src/interfaces/IComponentRegistry.sol";
import {IDocumentRegistry} from "../src/interfaces/IDocumentRegistry.sol";
import {IOrganizationRegistry} from "../src/interfaces/IOrganizationRegistry.sol";
import {DeploymentBase} from "./DeploymentBase.s.sol";
import {console} from "forge-std/console.sol";

/// @title SeedSepolia
/// @author AeroAsset Protocol
/// @notice Populates a deployed protocol with demonstrable data for the web UI.
/// @dev **Testnet only.** This registers a verified organization, two verified aircraft
///      each with an installed engine, and a document per aircraft — enough for the
///      marketplace and passport pages to have something real to render.
///
///      It is idempotent by salt, not by state: every run derives fresh commitments from
///      `SEED_SALT`, so re-running with the same salt reverts on `OrganizationNameTaken`
///      or `SerialNumberTaken` rather than silently double-seeding. Bump the salt to seed
///      a second set.
///
///      **Maintenance records are deliberately not seeded.** Recording maintenance needs
///      an MRO holding a valid `MAINTENANCE_AUTHORITY` credential, and issuing that
///      credential requires `CREDENTIAL_ISSUER_ROLE` — which correct separation of duties
///      puts on a different key from the deployer. Seeding it would need a second
///      broadcast key. See {seedMaintenanceInstructions} for the manual path.
///
///      The caller must hold `ORG_VERIFIER_ROLE` and `ASSET_VERIFIER_ROLE`, since the
///      whole point is to leave assets *listable* and `createListing` rejects an
///      unverified asset.
contract SeedSepolia is DeploymentBase {
    /// @notice Thrown when the broadcaster cannot verify what it registers.
    /// @param role The role that is missing.
    /// @param account The broadcasting account.
    error SeederMissingRole(bytes32 role, address account);

    /// @notice Emitted per aircraft so the operator can copy ids straight into the UI.
    /// @param assetId The aircraft asset id.
    /// @param engineAssetId The engine installed on it.
    /// @param documentId The airworthiness document registered against it.
    event SeededAircraft(uint256 assetId, uint256 engineAssetId, uint256 documentId);

    /// @notice Registers one org, two aircraft with engines, and a document each.
    /// @dev Split from `run()` so a test can drive it without file I/O, exactly as the
    ///      deploy stages do.
    /// @param a The deployed protocol addresses.
    /// @param owner The account that will own the seeded assets.
    /// @param salt Distinguishes this seed run's commitments from any other.
    /// @return orgId The verified organization.
    /// @return aircraftIds The two aircraft asset ids.
    function seed(ProtocolAddresses memory a, address owner, bytes32 salt)
        public
        returns (uint256 orgId, uint256[2] memory aircraftIds)
    {
        OrganizationRegistry orgs = OrganizationRegistry(a.organizationRegistry);
        AssetRegistry assets = AssetRegistry(a.assetRegistry);
        AircraftRegistry aircraft = AircraftRegistry(a.aircraftRegistry);
        ComponentRegistry components = ComponentRegistry(a.componentRegistry);
        DocumentRegistry documents = DocumentRegistry(a.documentRegistry);

        orgId = orgs.registerOrganization(
            IOrganizationRegistry.OrganizationType.AIRLINE,
            keccak256(abi.encode("Meridian Air Transport", salt)),
            keccak256(abi.encode("org-profile", salt)),
            "ipfs://seed/meridian-air-transport.json"
        );
        orgs.verifyOrganization(orgId);

        aircraftIds[0] = _seedOne(
            assets, aircraft, components, documents, orgId, owner, salt, "A320-214", 2018, "MSN-7421", "ESN-CFM-1"
        );
        aircraftIds[1] = _seedOne(
            assets, aircraft, components, documents, orgId, owner, salt, "B737-800", 2015, "MSN-3388", "ESN-CFM-2"
        );
    }

    /// @notice Registers one aircraft, fits an engine, and files a document.
    /// @dev Extracted because two inline copies would exceed the stack.
    /// @return assetId The aircraft asset id.
    function _seedOne(
        AssetRegistry assets,
        AircraftRegistry aircraft,
        ComponentRegistry components,
        DocumentRegistry documents,
        uint256 orgId,
        address owner,
        bytes32 salt,
        bytes32 model,
        uint16 year,
        bytes32 msn,
        bytes32 esn
    ) private returns (uint256 assetId) {
        assetId = aircraft.registerAircraft(
            IAircraftRegistry.AircraftParams({
                orgId: orgId,
                owner: owner,
                // Salted, as `docs/security-model.md` §7 requires: an unsalted MSN
                // commitment is brute-forceable in seconds.
                serialNumberHash: keccak256(abi.encode(msn, salt)),
                metadataHash: keccak256(abi.encode(model, salt)),
                uri: "ipfs://seed/aircraft.json",
                manufacturerOrgId: 0,
                manufacturerName: "Airbus",
                model: model,
                manufactureYear: year,
                category: IAircraftRegistry.AircraftCategory.COMMERCIAL_TRANSPORT,
                registrationMarkHash: keccak256(abi.encode("tail", model, salt))
            })
        );
        assets.verifyAsset(assetId, orgId);

        uint256 engineId = components.registerComponent(
            IComponentRegistry.ComponentParams({
                orgId: orgId,
                owner: owner,
                serialNumberHash: keccak256(abi.encode(esn, salt)),
                metadataHash: keccak256(abi.encode(esn, "meta", salt)),
                uri: "ipfs://seed/engine.json",
                kind: IComponentRegistry.ComponentKind.ENGINE,
                partNumber: "CFM56-5B4"
            })
        );
        components.installComponent(engineId, assetId, 1);

        // `issuerOrgId` is the seeded org, so the caller must act for it — which it does,
        // being the org's admin.
        uint256 documentId = documents.registerDocument(
            assetId,
            orgId,
            IDocumentRegistry.DocumentType.AIRWORTHINESS_CERTIFICATE,
            keccak256(abi.encode("airworthiness-certificate", model, salt)),
            uint40(block.timestamp - 30 days),
            "ipfs://seed/airworthiness.pdf"
        );

        emit SeededAircraft(assetId, engineId, documentId);
    }

    /// @notice Seeds a recorded deployment.
    /// @dev Fails fast if the broadcaster cannot verify, rather than registering assets
    ///      that can never be listed.
    function run() external {
        ProtocolAddresses memory a = _loadAll();
        bytes32 salt = vm.envOr("SEED_SALT", bytes32(uint256(1)));

        address seeder = _startBroadcast();
        _requireSeederRoles(a, seeder);

        (uint256 orgId, uint256[2] memory aircraftIds) = seed(a, seeder, salt);
        vm.stopBroadcast();

        console.log("orgId      ", orgId);
        console.log("aircraft #1", aircraftIds[0]);
        console.log("aircraft #2", aircraftIds[1]);
    }

    /// @notice Reverts unless the broadcaster can verify organizations and assets.
    /// @param a The deployed protocol addresses.
    /// @param seeder The broadcasting account.
    function _requireSeederRoles(ProtocolAddresses memory a, address seeder) private view {
        bytes32 orgVerifier = keccak256("aeroasset.role.ORG_VERIFIER");
        bytes32 assetVerifier = keccak256("aeroasset.role.ASSET_VERIFIER");

        (bool okOrg, bytes memory orgData) =
            a.roleManager.staticcall(abi.encodeWithSignature("hasRole(bytes32,address)", orgVerifier, seeder));
        (bool okAsset, bytes memory assetData) =
            a.roleManager.staticcall(abi.encodeWithSignature("hasRole(bytes32,address)", assetVerifier, seeder));

        if (!okOrg || !abi.decode(orgData, (bool))) {
            revert SeederMissingRole(orgVerifier, seeder);
        }
        if (!okAsset || !abi.decode(assetData, (bool))) {
            revert SeederMissingRole(assetVerifier, seeder);
        }
    }
}
