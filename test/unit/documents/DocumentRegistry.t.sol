// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAssetRegistry} from "../../../src/interfaces/IAssetRegistry.sol";
import {IDocumentRegistry} from "../../../src/interfaces/IDocumentRegistry.sol";
import {IOrganizationRegistry} from "../../../src/interfaces/IOrganizationRegistry.sol";
import {MissingRole, ZeroHash} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../../../src/libraries/ProtocolRoles.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";

/// @title DocumentRegistryTest
/// @author AeroAsset Protocol
/// @notice Functional, attribution, lifecycle, negative and fuzz coverage for
///         {DocumentRegistry}.
contract DocumentRegistryTest is ProtocolTestBase {
    IDocumentRegistry.DocumentType internal constant AIRWORTHINESS =
    IDocumentRegistry.DocumentType.AIRWORTHINESS_CERTIFICATE;
    IDocumentRegistry.DocumentType internal constant LOGBOOK = IDocumentRegistry.DocumentType.LOGBOOK;

    bytes32 internal constant DOC_HASH = keccak256("airworthiness-cert-v1");

    /// @dev Verified organization administered by `alice`, owner of `assetId`.
    uint256 internal orgId;
    /// @dev Aircraft owned by `alice`.
    uint256 internal assetId;

    function setUp() public override {
        super.setUp();
        (orgId, assetId) = _defaultAircraft();
    }

    /*//////////////////////////////////////////////////////////////
                              REGISTRATION
    //////////////////////////////////////////////////////////////*/

    /// @notice The owner can register a document against their asset.
    function test_Register_ByOwner() public {
        uint40 issued = uint40(block.timestamp - 1 days);

        vm.expectEmit(true, true, true, true, address(documentRegistry));
        emit IDocumentRegistry.DocumentRegistered(1, assetId, 0, AIRWORTHINESS, DOC_HASH, "ipfs://doc");
        vm.prank(alice);
        uint256 documentId =
            documentRegistry.registerDocument(assetId, 0, AIRWORTHINESS, DOC_HASH, issued, "ipfs://doc");

        IDocumentRegistry.Document memory document = documentRegistry.getDocument(documentId);
        assertEq(document.assetId, assetId, "wrong asset");
        assertEq(document.issuerOrgId, 0, "issuer should be unset for owner registration");
        assertEq(uint8(document.docType), uint8(AIRWORTHINESS), "wrong type");
        assertEq(uint8(document.status), uint8(IDocumentRegistry.DocumentStatus.ACTIVE), "not ACTIVE");
        assertEq(document.documentHash, DOC_HASH, "wrong hash");
        assertEq(document.issuedAt, issued, "wrong issuedAt");
        assertEq(document.supersededById, 0, "superseded at registration");

        assertEq(documentRegistry.documentURI(documentId), "ipfs://doc", "wrong uri");
        assertEq(documentRegistry.documentCountOf(assetId), 1, "not indexed against the asset");
        assertEq(documentRegistry.documentIdOf(assetId, DOC_HASH), documentId, "hash index missing");
    }

    /// @notice An organization can register a document attributed to itself.
    function test_Register_ByIssuerOrg() public {
        uint256 inspectorOrg =
            _registerVerifiedOrg(bob, keccak256("Inspector Ltd"), IOrganizationRegistry.OrganizationType.INSPECTOR);

        vm.prank(bob);
        uint256 documentId = documentRegistry.registerDocument(
            assetId, inspectorOrg, IDocumentRegistry.DocumentType.INSPECTION_REPORT, DOC_HASH, 0, ""
        );

        assertEq(documentRegistry.getDocument(documentId).issuerOrgId, inspectorOrg, "issuer not recorded");
    }

    /// @notice A caller cannot attribute a document to an organization it does not control.
    /// @dev The core forgery guard: otherwise anyone could claim a regulator issued
    ///      their paperwork. The real-world issuer belongs in off-chain metadata.
    function test_RevertWhen_AttributingToForeignOrg() public {
        uint256 foreignOrg =
            _registerVerifiedOrg(bob, keccak256("EASA"), IOrganizationRegistry.OrganizationType.INSPECTOR);

        vm.expectRevert(
            abi.encodeWithSelector(IOrganizationRegistry.NotActingForOrganization.selector, foreignOrg, alice)
        );
        vm.prank(alice);
        documentRegistry.registerDocument(assetId, foreignOrg, AIRWORTHINESS, DOC_HASH, 0, "");
    }

    /// @notice A stranger with no organization cannot register against someone's asset.
    function testFuzz_RevertWhen_StrangerRegisters(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != alice);

        vm.expectRevert(abi.encodeWithSelector(IDocumentRegistry.NotDocumentController.selector, assetId, caller));
        vm.prank(caller);
        documentRegistry.registerDocument(assetId, 0, AIRWORTHINESS, DOC_HASH, 0, "");
    }

    /// @notice Document commitments are unique protocol-wide.
    function test_RevertWhen_HashAlreadyRegistered() public {
        uint256 first = _registerDocument(assetId, alice, AIRWORTHINESS, DOC_HASH);

        vm.expectRevert(abi.encodeWithSelector(IDocumentRegistry.DocumentHashTaken.selector, DOC_HASH, first));
        _registerDocument(assetId, alice, LOGBOOK, DOC_HASH);
    }

    /// @notice A zero commitment and the `UNSPECIFIED` sentinel are rejected.
    function test_RevertWhen_RegistrationInvalid() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IDocumentRegistry.InvalidDocumentType.selector, IDocumentRegistry.DocumentType.UNSPECIFIED
            )
        );
        _registerDocument(assetId, alice, IDocumentRegistry.DocumentType.UNSPECIFIED, DOC_HASH);

        vm.expectRevert(ZeroHash.selector);
        _registerDocument(assetId, alice, AIRWORTHINESS, bytes32(0));
    }

    /// @notice A future issuance date is rejected.
    /// @dev A document cannot have been issued before it exists.
    function test_RevertWhen_IssuedAtInFuture() public {
        uint40 future = uint40(block.timestamp + 1);

        vm.expectRevert(
            abi.encodeWithSelector(IDocumentRegistry.IssuedAtInFuture.selector, future, uint40(block.timestamp))
        );
        vm.prank(alice);
        documentRegistry.registerDocument(assetId, 0, AIRWORTHINESS, DOC_HASH, future, "");
    }

    /// @notice Documents cannot be registered against a terminal asset.
    function test_RevertWhen_AssetIsTerminal() public {
        vm.prank(alice);
        assetRegistry.setAssetStatus(assetId, IAssetRegistry.AssetStatus.DESTROYED);

        vm.expectRevert(
            abi.encodeWithSelector(IAssetRegistry.AssetTerminal.selector, assetId, IAssetRegistry.AssetStatus.DESTROYED)
        );
        _registerDocument(assetId, alice, AIRWORTHINESS, DOC_HASH);
    }

    /// @notice Documents cannot be registered against an unknown asset.
    function test_RevertWhen_AssetUnknown() public {
        vm.expectRevert(abi.encodeWithSelector(IAssetRegistry.AssetNotFound.selector, uint256(999)));
        _registerDocument(999, alice, AIRWORTHINESS, DOC_HASH);
    }

    /*//////////////////////////////////////////////////////////////
                               SUPERSEDING
    //////////////////////////////////////////////////////////////*/

    /// @notice Superseding links the old document to its replacement.
    function test_Supersede_LinksDocuments() public {
        uint256 oldDoc = _registerDocument(assetId, alice, AIRWORTHINESS, DOC_HASH);
        uint256 newDoc = _registerDocument(assetId, alice, AIRWORTHINESS, keccak256("v2"));

        vm.expectEmit(true, true, true, true, address(documentRegistry));
        emit IDocumentRegistry.DocumentSuperseded(oldDoc, newDoc);
        vm.prank(alice);
        documentRegistry.supersedeDocument(oldDoc, newDoc);

        IDocumentRegistry.Document memory document = documentRegistry.getDocument(oldDoc);
        assertEq(uint8(document.status), uint8(IDocumentRegistry.DocumentStatus.SUPERSEDED), "not SUPERSEDED");
        assertEq(document.supersededById, newDoc, "replacement not linked");
        // The replacement is untouched.
        assertEq(
            uint8(documentRegistry.getDocument(newDoc).status),
            uint8(IDocumentRegistry.DocumentStatus.ACTIVE),
            "replacement disturbed"
        );
    }

    /// @notice A document cannot be superseded by one describing a different asset.
    /// @dev Otherwise the provenance chain would silently jump between aircraft.
    function test_RevertWhen_SupersedingAcrossAssets() public {
        uint256 otherAsset = _registerAircraft(orgId, alice, alice, keccak256("MSN-OTHER"));
        uint256 oldDoc = _registerDocument(assetId, alice, AIRWORTHINESS, DOC_HASH);
        uint256 foreignDoc = _registerDocument(otherAsset, alice, AIRWORTHINESS, keccak256("other"));

        vm.expectRevert(
            abi.encodeWithSelector(IDocumentRegistry.DocumentAssetMismatch.selector, foreignDoc, assetId, otherAsset)
        );
        vm.prank(alice);
        documentRegistry.supersedeDocument(oldDoc, foreignDoc);
    }

    /// @notice A document cannot supersede itself.
    function test_RevertWhen_SelfSupersede() public {
        uint256 documentId = _registerDocument(assetId, alice, AIRWORTHINESS, DOC_HASH);

        vm.expectRevert(abi.encodeWithSelector(IDocumentRegistry.SelfSupersede.selector, documentId));
        vm.prank(alice);
        documentRegistry.supersedeDocument(documentId, documentId);
    }

    /// @notice Only `ACTIVE` documents participate in superseding.
    function test_RevertWhen_SupersedingInactiveDocument() public {
        uint256 oldDoc = _registerDocument(assetId, alice, AIRWORTHINESS, DOC_HASH);
        uint256 newDoc = _registerDocument(assetId, alice, AIRWORTHINESS, keccak256("v2"));
        uint256 thirdDoc = _registerDocument(assetId, alice, AIRWORTHINESS, keccak256("v3"));

        vm.startPrank(alice);
        documentRegistry.supersedeDocument(oldDoc, newDoc);

        vm.expectRevert(
            abi.encodeWithSelector(
                IDocumentRegistry.DocumentNotActive.selector, oldDoc, IDocumentRegistry.DocumentStatus.SUPERSEDED
            )
        );
        documentRegistry.supersedeDocument(oldDoc, thirdDoc);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                                REVOCATION
    //////////////////////////////////////////////////////////////*/

    /// @notice The controller can revoke a document.
    function test_Revoke_ByController() public {
        uint256 documentId = _registerDocument(assetId, alice, AIRWORTHINESS, DOC_HASH);

        vm.expectEmit(true, true, true, true, address(documentRegistry));
        emit IDocumentRegistry.DocumentRevoked(documentId, alice);
        vm.prank(alice);
        documentRegistry.revokeDocument(documentId);

        assertEq(
            uint8(documentRegistry.getDocument(documentId).status),
            uint8(IDocumentRegistry.DocumentStatus.REVOKED),
            "not REVOKED"
        );
    }

    /// @notice The protocol admin can revoke any document.
    function test_Revoke_ByProtocolAdmin() public {
        uint256 documentId = _registerDocument(assetId, alice, AIRWORTHINESS, DOC_HASH);

        vm.prank(protocolAdmin);
        documentRegistry.revokeDocument(documentId);

        assertEq(
            uint8(documentRegistry.getDocument(documentId).status),
            uint8(IDocumentRegistry.DocumentStatus.REVOKED),
            "admin revoke failed"
        );
    }

    /// @notice Revocation is terminal.
    function test_Revoke_IsTerminal() public {
        uint256 documentId = _registerDocument(assetId, alice, AIRWORTHINESS, DOC_HASH);
        vm.prank(alice);
        documentRegistry.revokeDocument(documentId);

        vm.expectRevert(
            abi.encodeWithSelector(
                IDocumentRegistry.DocumentNotActive.selector, documentId, IDocumentRegistry.DocumentStatus.REVOKED
            )
        );
        vm.prank(alice);
        documentRegistry.revokeDocument(documentId);
    }

    /// @notice Revocation stays available while paused.
    /// @dev Withdrawing a document strictly reduces what the registry asserts.
    function test_Revoke_WorksWhilePaused() public {
        uint256 documentId = _registerDocument(assetId, alice, AIRWORTHINESS, DOC_HASH);

        vm.prank(pauser);
        documentRegistry.pause();

        vm.prank(alice);
        documentRegistry.revokeDocument(documentId);
        assertEq(
            uint8(documentRegistry.getDocument(documentId).status),
            uint8(IDocumentRegistry.DocumentStatus.REVOKED),
            "revoke blocked while paused"
        );
    }

    /// @notice A stranger cannot revoke.
    function testFuzz_RevertWhen_StrangerRevokes(address caller) public {
        _assumeUnprivileged(caller);
        vm.assume(caller != alice);
        uint256 documentId = _registerDocument(assetId, alice, AIRWORTHINESS, DOC_HASH);

        vm.expectRevert(abi.encodeWithSelector(IDocumentRegistry.NotDocumentController.selector, assetId, caller));
        vm.prank(caller);
        documentRegistry.revokeDocument(documentId);
    }

    /*//////////////////////////////////////////////////////////////
                              APPEND-ONLY
    //////////////////////////////////////////////////////////////*/

    /// @notice A document's identifying fields never change after registration.
    /// @dev INV-DOC-02: the registry is an audit trail, not a mutable file store.
    function test_DocumentFieldsAreImmutable() public {
        uint256 documentId = _registerDocument(assetId, alice, AIRWORTHINESS, DOC_HASH);
        IDocumentRegistry.Document memory before = documentRegistry.getDocument(documentId);

        uint256 newDoc = _registerDocument(assetId, alice, AIRWORTHINESS, keccak256("v2"));
        vm.startPrank(alice);
        documentRegistry.supersedeDocument(documentId, newDoc);
        documentRegistry.revokeDocument(documentId);
        vm.stopPrank();

        IDocumentRegistry.Document memory afterChanges = documentRegistry.getDocument(documentId);
        assertEq(afterChanges.assetId, before.assetId, "assetId mutated");
        assertEq(afterChanges.issuerOrgId, before.issuerOrgId, "issuer mutated");
        assertEq(afterChanges.documentHash, before.documentHash, "hash mutated");
        assertEq(afterChanges.issuedAt, before.issuedAt, "issuedAt mutated");
        assertEq(uint8(afterChanges.docType), uint8(before.docType), "docType mutated");
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Pagination clamps to the available range.
    function test_DocumentsOf_Pagination() public {
        for (uint256 i; i < 4; ++i) {
            _registerDocument(assetId, alice, LOGBOOK, keccak256(abi.encode("doc", i)));
        }

        assertEq(documentRegistry.documentCountOf(assetId), 4, "wrong count");
        assertEq(documentRegistry.documentsOf(assetId, 0, 2).length, 2, "first page");
        assertEq(documentRegistry.documentsOf(assetId, 2, 10).length, 2, "clamped tail");
        assertEq(documentRegistry.documentsOf(assetId, 4, 10).length, 0, "past the end");
        assertEq(documentRegistry.documentsOf(assetId, 0, 0).length, 0, "zero limit");
    }

    /// @notice Superseded and revoked documents remain in the per-asset index.
    /// @dev Removing them would destroy the audit trail the registry exists to keep.
    function test_IndexRetainsInactiveDocuments() public {
        uint256 documentId = _registerDocument(assetId, alice, AIRWORTHINESS, DOC_HASH);
        vm.prank(alice);
        documentRegistry.revokeDocument(documentId);

        assertEq(documentRegistry.documentCountOf(assetId), 1, "revoked document dropped from index");
        assertEq(documentRegistry.documentsOf(assetId, 0, 10)[0], documentId, "wrong id retained");
    }

    /// @notice A replacement document must itself be `ACTIVE`.
    /// @dev Otherwise a revoked document could be installed as the head of a
    ///      provenance chain, which is worse than leaving the old one current.
    function test_RevertWhen_ReplacementIsNotActive() public {
        uint256 oldDoc = _registerDocument(assetId, alice, AIRWORTHINESS, DOC_HASH);
        uint256 revokedDoc = _registerDocument(assetId, alice, AIRWORTHINESS, keccak256("revoked"));

        vm.startPrank(alice);
        documentRegistry.revokeDocument(revokedDoc);

        vm.expectRevert(
            abi.encodeWithSelector(
                IDocumentRegistry.DocumentNotActive.selector, revokedDoc, IDocumentRegistry.DocumentStatus.REVOKED
            )
        );
        documentRegistry.supersedeDocument(oldDoc, revokedDoc);
        vm.stopPrank();
    }

    /// @notice The global document counter is dense and monotonic.
    function test_DocumentCount_IsDenseAndMonotonic() public {
        assertEq(documentRegistry.documentCount(), 0, "counter not zero at genesis");

        for (uint256 i = 1; i <= 3; ++i) {
            assertEq(_registerDocument(assetId, alice, LOGBOOK, keccak256(abi.encode("d", i))), i, "id not monotonic");
            assertEq(documentRegistry.documentCount(), i, "counter not incremented");
        }
    }

    /// @notice Reading an unknown document reverts.
    function testFuzz_RevertWhen_GettingUnknownDocument(uint256 documentId) public {
        vm.assume(documentId != 0);
        vm.expectRevert(abi.encodeWithSelector(IDocumentRegistry.DocumentNotFound.selector, documentId));
        documentRegistry.getDocument(documentId);
    }

    /*//////////////////////////////////////////////////////////////
                                  PAUSE
    //////////////////////////////////////////////////////////////*/

    /// @notice Pausing blocks registration and superseding.
    function test_Pause_BlocksWrites() public {
        uint256 documentId = _registerDocument(assetId, alice, AIRWORTHINESS, DOC_HASH);
        uint256 newDoc = _registerDocument(assetId, alice, AIRWORTHINESS, keccak256("v2"));

        vm.prank(pauser);
        documentRegistry.pause();

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        _registerDocument(assetId, alice, LOGBOOK, keccak256("v3"));

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(alice);
        documentRegistry.supersedeDocument(documentId, newDoc);
    }

    /// @notice Only `PAUSER_ROLE` may pause.
    function testFuzz_RevertWhen_UnauthorizedPause(address caller) public {
        _assumeUnprivileged(caller);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PAUSER_ROLE, caller));
        vm.prank(caller);
        documentRegistry.pause();
    }
}
