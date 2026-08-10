// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolModuleUpgradeable} from "../core/ProtocolModuleUpgradeable.sol";
import {IAssetOwnership} from "../interfaces/IAssetOwnership.sol";
import {IAssetRegistry} from "../interfaces/IAssetRegistry.sol";
import {IDocumentRegistry} from "../interfaces/IDocumentRegistry.sol";
import {IOrganizationRegistry} from "../interfaces/IOrganizationRegistry.sol";
import {ProtocolAddressKeys} from "../libraries/ProtocolAddressKeys.sol";
import {ProtocolCast} from "../libraries/ProtocolCast.sol";
import {ZeroHash} from "../libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../libraries/ProtocolRoles.sol";

/// @title DocumentRegistry
/// @author AeroAsset Protocol
/// @notice References to aviation documents — airworthiness certificates, logbooks,
///         AD/SB compliance evidence, bills of sale.
/// @dev Layer L3. **No document payload is ever stored on-chain** (roadmap §11): the
///      chain holds a `keccak256` commitment and an off-chain URI.
///
///      Records are append-only. Documents are superseded or revoked, never edited, so
///      the registry remains usable as an audit trail.
///
///      A caller may only attribute a document to an organization it acts for.
///      Allowing arbitrary attribution would let anyone forge provenance by claiming a
///      regulator issued their paperwork; the real-world issuer belongs in the
///      off-chain metadata.
///
///      **Confidentiality caveat.** `documentHash` is a commitment, not encryption.
///      Anyone holding a candidate document can confirm a match. Callers needing
///      confidentiality against a determined observer must salt the preimage — see
///      `docs/security-model.md` §7.
///
///      **Non-claim.** Registration records that an identified party asserted a
///      document with this hash existed at this time. The protocol makes no
///      representation about its contents, authenticity, or acceptance by any civil
///      aviation authority.
contract DocumentRegistry is ProtocolModuleUpgradeable, IDocumentRegistry {
    using ProtocolCast for uint256;

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice ERC-7201 namespaced storage for this registry.
    /// @param documentCount Highest minted document id. Ids are dense from 1.
    /// @param documents Document records by id.
    /// @param documentURI Off-chain locations, kept out of the packed struct.
    /// @param documentIdByHash Reverse index enforcing commitment uniqueness.
    /// @param assetDocuments Per-asset document index. View-read only.
    /// @custom:storage-location erc7201:aeroasset.storage.DocumentRegistry
    struct DocumentRegistryStorage {
        uint256 documentCount;
        mapping(uint256 documentId => Document) documents;
        mapping(uint256 documentId => string) documentURI;
        mapping(bytes32 documentHash => uint256 documentId) documentIdByHash;
        mapping(uint256 assetId => uint256[]) assetDocuments;
    }

    /// @dev `keccak256(abi.encode(uint256(keccak256("aeroasset.storage.DocumentRegistry")) - 1))
    ///      & ~bytes32(uint256(0xff))`. Asserted in `test/upgrade/Namespaces.t.sol`.
    bytes32 private constant _DOCUMENT_REGISTRY_STORAGE =
        0xdfb6b537f39fe1bb5c9c0dc9368985c489aa396d2a86f54dbf3567f8e997d900;

    /*//////////////////////////////////////////////////////////////
                              INITIALIZATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Initializes the registry behind its ERC-1967 proxy.
    /// @param roleManager_ The protocol `RoleManager`. Must be non-zero.
    /// @param addressRegistry_ The protocol `ProtocolAddressRegistry`. Must be non-zero.
    function initialize(address roleManager_, address addressRegistry_) external initializer {
        __ProtocolModule_init(roleManager_, addressRegistry_);
    }

    /*//////////////////////////////////////////////////////////////
                                FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IDocumentRegistry
    function registerDocument(
        uint256 assetId,
        uint256 issuerOrgId,
        DocumentType docType,
        bytes32 documentHash,
        uint40 issuedAt,
        string calldata uri
    ) external whenNotPaused returns (uint256 documentId) {
        if (docType == DocumentType.UNSPECIFIED) {
            revert InvalidDocumentType(docType);
        }
        if (documentHash == bytes32(0)) {
            revert ZeroHash();
        }
        if (issuedAt > block.timestamp) {
            revert IssuedAtInFuture(issuedAt, uint40(block.timestamp));
        }

        DocumentRegistryStorage storage $ = _s();

        uint256 existing = $.documentIdByHash[documentHash];
        if (existing != 0) {
            revert DocumentHashTaken(documentHash, existing);
        }

        _requireLiveAsset(assetId);
        _requireController(assetId, issuerOrgId);

        // Cannot realistically overflow: one increment per registration transaction.
        unchecked {
            documentId = ++$.documentCount;
        }

        $.documents[documentId] = Document({
            assetId: assetId.toUint64(),
            issuerOrgId: issuerOrgId.toUint64(),
            supersededById: 0,
            issuedAt: issuedAt,
            docType: docType,
            status: DocumentStatus.ACTIVE,
            documentHash: documentHash
        });
        $.documentURI[documentId] = uri;
        $.documentIdByHash[documentHash] = documentId;
        $.assetDocuments[assetId].push(documentId);

        emit DocumentRegistered(documentId, assetId, issuerOrgId, docType, documentHash, uri);
    }

    /// @inheritdoc IDocumentRegistry
    function supersedeDocument(uint256 documentId, uint256 supersededById) external whenNotPaused {
        if (documentId == supersededById) {
            revert SelfSupersede(documentId);
        }

        Document storage document = _requireExists(documentId);
        Document storage replacement = _requireExists(supersededById);

        if (document.status != DocumentStatus.ACTIVE) {
            revert DocumentNotActive(documentId, document.status);
        }
        if (replacement.status != DocumentStatus.ACTIVE) {
            revert DocumentNotActive(supersededById, replacement.status);
        }
        // A document may only be replaced by one describing the same asset, or the
        // provenance chain would silently jump between aircraft.
        if (replacement.assetId != document.assetId) {
            revert DocumentAssetMismatch(supersededById, document.assetId, replacement.assetId);
        }

        _requireController(document.assetId, document.issuerOrgId);

        document.status = DocumentStatus.SUPERSEDED;
        document.supersededById = supersededById.toUint64();

        emit DocumentSuperseded(documentId, supersededById);
    }

    /// @inheritdoc IDocumentRegistry
    /// @dev Deliberately callable while paused: withdrawing a document strictly
    ///      reduces what the registry asserts.
    function revokeDocument(uint256 documentId) external {
        Document storage document = _requireExists(documentId);

        if (document.status == DocumentStatus.REVOKED) {
            revert DocumentNotActive(documentId, document.status);
        }
        // The protocol admin can withdraw any document; otherwise the usual
        // controller check applies.
        if (!hasRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE, msg.sender)) {
            _requireController(document.assetId, document.issuerOrgId);
        }

        document.status = DocumentStatus.REVOKED;

        emit DocumentRevoked(documentId, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IDocumentRegistry
    function getDocument(uint256 documentId) external view returns (Document memory) {
        return _requireExists(documentId);
    }

    /// @inheritdoc IDocumentRegistry
    function documentIdByHash(bytes32 documentHash) external view returns (uint256) {
        return _s().documentIdByHash[documentHash];
    }

    /// @inheritdoc IDocumentRegistry
    function documentURI(uint256 documentId) external view returns (string memory) {
        return _s().documentURI[documentId];
    }

    /// @inheritdoc IDocumentRegistry
    function documentCountOf(uint256 assetId) external view returns (uint256) {
        return _s().assetDocuments[assetId].length;
    }

    /// @inheritdoc IDocumentRegistry
    function documentsOf(uint256 assetId, uint256 offset, uint256 limit) external view returns (uint256[] memory ids) {
        uint256[] storage all = _s().assetDocuments[assetId];
        uint256 total = all.length;

        if (offset >= total) {
            return new uint256[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        uint256 size = end - offset;

        ids = new uint256[](size);
        for (uint256 i; i < size; ++i) {
            ids[i] = all[offset + i];
        }
    }

    /// @inheritdoc IDocumentRegistry
    function documentCount() external view returns (uint256) {
        return _s().documentCount;
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @notice Reverts unless the asset exists and is not terminal.
    /// @param assetId The asset id.
    function _requireLiveAsset(uint256 assetId) private view {
        IAssetRegistry assets = IAssetRegistry(_resolve(ProtocolAddressKeys.ASSET_REGISTRY));

        IAssetRegistry.Asset memory asset = assets.getAsset(assetId);
        if (asset.status == IAssetRegistry.AssetStatus.RETIRED || asset.status == IAssetRegistry.AssetStatus.DESTROYED)
        {
            revert IAssetRegistry.AssetTerminal(assetId, asset.status);
        }
    }

    /// @notice Reverts unless the caller controls documents for this asset.
    /// @dev Attribution rule: with a non-zero `issuerOrgId` the caller must act for
    ///      that organization; with zero it must be the asset's owner. A caller can
    ///      never attribute a document to an organization it does not control.
    /// @param assetId The asset id.
    /// @param issuerOrgId The attributing organization, or 0.
    function _requireController(uint256 assetId, uint256 issuerOrgId) private view {
        if (issuerOrgId != 0) {
            IOrganizationRegistry(_resolve(ProtocolAddressKeys.ORGANIZATION_REGISTRY))
                .requireActingFor(issuerOrgId, msg.sender);
            return;
        }

        address owner = IAssetOwnership(_resolve(ProtocolAddressKeys.ASSET_OWNERSHIP)).ownerOf(assetId);
        if (owner != msg.sender) {
            revert NotDocumentController(assetId, msg.sender);
        }
    }

    /// @notice Returns a storage pointer to an existing document, or reverts.
    /// @param documentId The document id.
    /// @return document Storage pointer to the record.
    function _requireExists(uint256 documentId) private view returns (Document storage document) {
        document = _s().documents[documentId];
        if (document.status == DocumentStatus.NONE) {
            revert DocumentNotFound(documentId);
        }
    }

    /// @notice Returns a pointer to this contract's ERC-7201 storage struct.
    /// @return $ The registry storage.
    function _s() private pure returns (DocumentRegistryStorage storage $) {
        assembly ("memory-safe") {
            $.slot := _DOCUMENT_REGISTRY_STORAGE
        }
    }
}
