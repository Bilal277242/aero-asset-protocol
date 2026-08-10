// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAssetRegistry} from "../../../src/interfaces/IAssetRegistry.sol";
import {ICredentialRegistry} from "../../../src/interfaces/ICredentialRegistry.sol";
import {IDocumentRegistry} from "../../../src/interfaces/IDocumentRegistry.sol";
import {IMaintenanceRegistry} from "../../../src/interfaces/IMaintenanceRegistry.sol";
import {IOrganizationRegistry} from "../../../src/interfaces/IOrganizationRegistry.sol";
import {ZeroHash} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";

/// @title MaintenanceRegistryTest
/// @author AeroAsset Protocol
/// @notice Coverage for {MaintenanceRegistry}, centred on the three-way authorization
///         gate: verified organization, `MRO` type, and a valid maintenance credential.
contract MaintenanceRegistryTest is ProtocolTestBase {
    IMaintenanceRegistry.MaintenanceType internal constant C_CHECK = IMaintenanceRegistry.MaintenanceType.C_CHECK;

    bytes32 internal constant WORK_PACKAGE = keccak256("work-package");

    /// @dev Verified organization administered by `alice`, owner of `assetId`.
    uint256 internal ownerOrg;
    /// @dev Aircraft owned by `alice`.
    uint256 internal assetId;
    /// @dev Verified MRO administered by `mro`, holding a maintenance credential.
    uint256 internal mroOrg;
    /// @dev The MRO's maintenance-authority credential.
    uint256 internal credentialId;

    function setUp() public override {
        super.setUp();
        (ownerOrg, assetId) = _defaultAircraft();
        (mroOrg, credentialId) = _credentialedMro();
    }

    /*//////////////////////////////////////////////////////////////
                                RECORDING
    //////////////////////////////////////////////////////////////*/

    /// @notice A credentialed MRO can record maintenance.
    /// @dev The credential relied upon is emitted but not stored — it is the audit
    ///      trail, and no later on-chain logic reads it.
    function test_Record_ByCredentialedMro() public {
        uint40 performed = uint40(block.timestamp - 2 days);

        vm.expectEmit(true, true, true, true, address(maintenanceRegistry));
        emit IMaintenanceRegistry.MaintenanceRecorded(
            1, assetId, mroOrg, C_CHECK, performed, credentialId, 0, WORK_PACKAGE
        );
        vm.prank(mro);
        uint256 recordId = maintenanceRegistry.recordMaintenance(assetId, mroOrg, C_CHECK, performed, 0, WORK_PACKAGE);

        IMaintenanceRegistry.MaintenanceRecord memory record = maintenanceRegistry.getMaintenanceRecord(recordId);
        assertEq(record.assetId, assetId, "wrong asset");
        assertEq(record.performedByOrgId, mroOrg, "wrong MRO");
        assertEq(record.documentId, 0, "document set");
        assertEq(record.performedAt, performed, "wrong performedAt");
        assertEq(uint8(record.mType), uint8(C_CHECK), "wrong type");
        assertEq(record.recordHash, WORK_PACKAGE, "wrong hash");

        assertEq(maintenanceRegistry.maintenanceCountOf(assetId), 1, "not indexed");
    }

    /// @notice The asset owner cannot record maintenance on their own aircraft.
    /// @dev Ownership is not maintenance authority. A verified airline signing off its
    ///      own heavy checks is exactly what the gate exists to prevent.
    function test_RevertWhen_OwnerRecordsOwnMaintenance() public {
        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.NotActingForOrganization.selector, mroOrg, alice));
        vm.prank(alice);
        maintenanceRegistry.recordMaintenance(assetId, mroOrg, C_CHECK, uint40(block.timestamp), 0, WORK_PACKAGE);
    }

    /// @notice Gate 2: a verified non-MRO organization is rejected.
    function test_RevertWhen_OrgIsNotMro() public {
        // `ownerOr` is an AIRLINE, verified, and `alice` acts for it.
        vm.expectRevert(
            abi.encodeWithSelector(
                IMaintenanceRegistry.NotAuthorizedMro.selector, ownerOrg, IOrganizationRegistry.OrganizationType.AIRLINE
            )
        );
        vm.prank(alice);
        maintenanceRegistry.recordMaintenance(assetId, ownerOrg, C_CHECK, uint40(block.timestamp), 0, WORK_PACKAGE);
    }

    /// @notice Gate 3: an MRO without a maintenance credential is rejected.
    function test_RevertWhen_MroHasNoCredential() public {
        uint256 bareMro =
            _registerVerifiedOrg(bob, keccak256("Uncredentialed MRO"), IOrganizationRegistry.OrganizationType.MRO);

        vm.expectRevert(abi.encodeWithSelector(IMaintenanceRegistry.NoValidMaintenanceCredential.selector, bareMro));
        vm.prank(bob);
        maintenanceRegistry.recordMaintenance(assetId, bareMro, C_CHECK, uint40(block.timestamp), 0, WORK_PACKAGE);
    }

    /// @notice Gate 1: a suspended organization loses the ability to record.
    function test_RevertWhen_MroSuspended() public {
        vm.prank(orgVerifier);
        orgRegistry.suspendOrganization(mroOrg);

        vm.expectRevert(
            abi.encodeWithSelector(
                IOrganizationRegistry.OrganizationNotVerified.selector,
                mroOrg,
                IOrganizationRegistry.OrganizationStatus.SUSPENDED
            )
        );
        vm.prank(mro);
        maintenanceRegistry.recordMaintenance(assetId, mroOrg, C_CHECK, uint40(block.timestamp), 0, WORK_PACKAGE);
    }

    /// @notice A revoked credential immediately blocks further recording.
    function test_RevertWhen_CredentialRevoked() public {
        vm.prank(credentialIssuer);
        credentialRegistry.revokeCredential(credentialId);

        vm.expectRevert(abi.encodeWithSelector(IMaintenanceRegistry.NoValidMaintenanceCredential.selector, mroOrg));
        vm.prank(mro);
        maintenanceRegistry.recordMaintenance(assetId, mroOrg, C_CHECK, uint40(block.timestamp), 0, WORK_PACKAGE);
    }

    /// @notice A lapsed credential blocks recording with no expiry transaction needed.
    /// @dev The exact trap `isValid` exists to close: the stored status still reads
    ///      `ACTIVE`, but the credential is past its expiry.
    function test_RevertWhen_CredentialLapsedByTime() public {
        vm.warp(block.timestamp + 366 days);

        assertEq(
            uint8(credentialRegistry.getCredential(credentialId).status),
            uint8(ICredentialRegistry.CredentialStatus.ACTIVE),
            "stored status changed without a transaction"
        );

        vm.expectRevert(abi.encodeWithSelector(IMaintenanceRegistry.NoValidMaintenanceCredential.selector, mroOrg));
        vm.prank(mro);
        maintenanceRegistry.recordMaintenance(assetId, mroOrg, C_CHECK, uint40(block.timestamp), 0, WORK_PACKAGE);
    }

    /// @notice An MRO operator can record on the organization's behalf.
    function test_Record_ByOrganizationOperator() public {
        vm.prank(mro);
        orgRegistry.setOperator(mroOrg, carol, true);

        uint256 recordId = _recordMaintenance(assetId, mroOrg, carol, 0);
        assertEq(maintenanceRegistry.getMaintenanceRecord(recordId).performedByOrgId, mroOrg, "wrong MRO");
    }

    /*//////////////////////////////////////////////////////////////
                                VALIDATION
    //////////////////////////////////////////////////////////////*/

    /// @notice The `UNSPECIFIED` sentinel and a zero record hash are rejected.
    function test_RevertWhen_RecordInvalid() public {
        vm.startPrank(mro);

        vm.expectRevert(
            abi.encodeWithSelector(
                IMaintenanceRegistry.InvalidMaintenanceType.selector, IMaintenanceRegistry.MaintenanceType.UNSPECIFIED
            )
        );
        maintenanceRegistry.recordMaintenance(
            assetId, mroOrg, IMaintenanceRegistry.MaintenanceType.UNSPECIFIED, uint40(block.timestamp), 0, WORK_PACKAGE
        );

        vm.expectRevert(ZeroHash.selector);
        maintenanceRegistry.recordMaintenance(assetId, mroOrg, C_CHECK, uint40(block.timestamp), 0, bytes32(0));
        vm.stopPrank();
    }

    /// @notice Future-dated and zero work dates are rejected.
    /// @dev INV-MNT-03: maintenance cannot be recorded before it happened.
    function testFuzz_RevertWhen_PerformedAtInvalid(uint40 performedAt) public {
        vm.assume(performedAt == 0 || performedAt > block.timestamp);

        vm.expectRevert(
            abi.encodeWithSelector(
                IMaintenanceRegistry.PerformedAtInFuture.selector, performedAt, uint40(block.timestamp)
            )
        );
        vm.prank(mro);
        maintenanceRegistry.recordMaintenance(assetId, mroOrg, C_CHECK, performedAt, 0, WORK_PACKAGE);
    }

    /// @notice Maintenance cannot be recorded against a terminal asset.
    function test_RevertWhen_AssetIsTerminal() public {
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.RETIRED);

        vm.expectRevert(
            abi.encodeWithSelector(IAssetRegistry.AssetTerminal.selector, assetId, IAssetRegistry.AssetStatus.RETIRED)
        );
        vm.prank(mro);
        maintenanceRegistry.recordMaintenance(assetId, mroOrg, C_CHECK, uint40(block.timestamp), 0, WORK_PACKAGE);
    }

    /*//////////////////////////////////////////////////////////////
                          SUPPORTING DOCUMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice A record may cite a supporting document for the same asset.
    function test_Record_WithSupportingDocument() public {
        uint256 documentId =
            _registerDocument(assetId, alice, IDocumentRegistry.DocumentType.MAINTENANCE_RECORD, keccak256("wp"));

        uint256 recordId = _recordMaintenance(assetId, mroOrg, mro, documentId);

        assertEq(maintenanceRegistry.getMaintenanceRecord(recordId).documentId, documentId, "document not linked");
    }

    /// @notice A record cannot cite a document belonging to a different asset.
    /// @dev Otherwise evidence could be laundered between aircraft.
    function test_RevertWhen_DocumentDescribesDifferentAsset() public {
        uint256 otherAsset = _registerAircraft(ownerOrg, alice, alice, keccak256("MSN-OTHER"));
        uint256 foreignDoc = _registerDocument(
            otherAsset, alice, IDocumentRegistry.DocumentType.MAINTENANCE_RECORD, keccak256("foreign")
        );

        vm.expectRevert(
            abi.encodeWithSelector(IDocumentRegistry.DocumentAssetMismatch.selector, foreignDoc, assetId, otherAsset)
        );
        vm.prank(mro);
        maintenanceRegistry.recordMaintenance(
            assetId, mroOrg, C_CHECK, uint40(block.timestamp), foreignDoc, WORK_PACKAGE
        );
    }

    /// @notice A record cannot cite a revoked document.
    function test_RevertWhen_DocumentRevoked() public {
        uint256 documentId =
            _registerDocument(assetId, alice, IDocumentRegistry.DocumentType.MAINTENANCE_RECORD, keccak256("wp"));
        vm.prank(alice);
        documentRegistry.revokeDocument(documentId);

        vm.expectRevert(
            abi.encodeWithSelector(
                IDocumentRegistry.DocumentNotActive.selector, documentId, IDocumentRegistry.DocumentStatus.REVOKED
            )
        );
        vm.prank(mro);
        maintenanceRegistry.recordMaintenance(
            assetId, mroOrg, C_CHECK, uint40(block.timestamp), documentId, WORK_PACKAGE
        );
    }

    /*//////////////////////////////////////////////////////////////
                               APPEND-ONLY
    //////////////////////////////////////////////////////////////*/

    /// @notice Records survive revocation of the organization and credential.
    /// @dev INV-MNT-01/02: history is append-only. Retroactively voiding provenance
    ///      would make the registry useless as an audit trail. The credential relied
    ///      upon was emitted, so an auditor can still pin the record to it.
    function test_RecordsSurviveLaterRevocation() public {
        uint256 recordId = _recordMaintenance(assetId, mroOrg, mro, 0);
        IMaintenanceRegistry.MaintenanceRecord memory before = maintenanceRegistry.getMaintenanceRecord(recordId);

        vm.prank(credentialIssuer);
        credentialRegistry.revokeCredential(credentialId);
        vm.prank(protocolAdmin);
        orgRegistry.revokeOrganization(mroOrg);

        IMaintenanceRegistry.MaintenanceRecord memory afterRevocation =
            maintenanceRegistry.getMaintenanceRecord(recordId);
        assertEq(afterRevocation.assetId, before.assetId, "assetId mutated");
        assertEq(afterRevocation.performedByOrgId, before.performedByOrgId, "MRO mutated");
        assertEq(afterRevocation.recordHash, before.recordHash, "hash mutated");
        assertEq(afterRevocation.performedAt, before.performedAt, "performedAt mutated");
        assertEq(maintenanceRegistry.maintenanceCountOf(assetId), 1, "history lost");
    }

    /// @notice The record count only ever grows.
    function test_HistoryIsAppendOnly() public {
        for (uint256 i; i < 3; ++i) {
            _recordMaintenance(assetId, mroOrg, mro, 0);
            assertEq(maintenanceRegistry.maintenanceCount(), i + 1, "count not monotonic");
        }
        assertEq(maintenanceRegistry.maintenanceCountOf(assetId), 3, "asset history wrong");
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice `canRecordMaintenance` agrees with what the write path actually does.
    /// @dev Lets a client avoid spending gas on a transaction that would revert.
    function test_CanRecordMaintenance_MatchesWritePath() public {
        assertTrue(maintenanceRegistry.canRecordMaintenance(mroOrg, mro), "credentialed MRO rejected");
        assertFalse(maintenanceRegistry.canRecordMaintenance(ownerOrg, alice), "non-MRO accepted");
        assertFalse(maintenanceRegistry.canRecordMaintenance(mroOrg, attacker), "stranger accepted");

        vm.prank(credentialIssuer);
        credentialRegistry.suspendCredential(credentialId);
        assertFalse(maintenanceRegistry.canRecordMaintenance(mroOrg, mro), "suspended credential accepted");
    }

    /// @notice Pagination clamps to the available range.
    function test_MaintenanceOf_Pagination() public {
        for (uint256 i; i < 4; ++i) {
            _recordMaintenance(assetId, mroOrg, mro, 0);
        }

        assertEq(maintenanceRegistry.maintenanceOf(assetId, 0, 2).length, 2, "first page");
        assertEq(maintenanceRegistry.maintenanceOf(assetId, 2, 10).length, 2, "clamped tail");
        assertEq(maintenanceRegistry.maintenanceOf(assetId, 4, 10).length, 0, "past the end");
        assertEq(maintenanceRegistry.maintenanceOf(assetId, 0, 0).length, 0, "zero limit");
    }

    /// @notice Reading an unknown record reverts.
    function testFuzz_RevertWhen_GettingUnknownRecord(uint256 recordId) public {
        vm.assume(recordId != 0);
        vm.expectRevert(abi.encodeWithSelector(IMaintenanceRegistry.MaintenanceRecordNotFound.selector, recordId));
        maintenanceRegistry.getMaintenanceRecord(recordId);
    }

    /*//////////////////////////////////////////////////////////////
                                  PAUSE
    //////////////////////////////////////////////////////////////*/

    /// @notice Pausing blocks recording.
    function test_Pause_BlocksRecording() public {
        vm.prank(pauser);
        maintenanceRegistry.pause();

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(mro);
        maintenanceRegistry.recordMaintenance(assetId, mroOrg, C_CHECK, uint40(block.timestamp), 0, WORK_PACKAGE);
    }
}
