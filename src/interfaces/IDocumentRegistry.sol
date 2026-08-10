// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IDocumentRegistry
/// @author AeroAsset Protocol
/// @notice Interface, types, events and errors for the aviation document registry.
/// @dev Layer L3. **Document payloads are never stored on-chain** (roadmap §11): the
///      chain records a `keccak256` commitment plus an off-chain URI, and nothing else.
///
///      Records are append-only. A document is never edited — it is superseded by a
///      new document or revoked. That is what makes the registry usable as an audit
///      trail rather than a mutable file store.
///
///      **Non-claim.** Registering a document records that an identified party
///      asserted a document with this hash existed at this time. The protocol makes no
///      representation about the document's contents, authenticity, or acceptance by
///      any civil aviation authority.
interface IDocumentRegistry {
    /*//////////////////////////////////////////////////////////////
                                  TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Category of aviation document.
    enum DocumentType {
        /// @notice Reserved sentinel. Never valid as an argument.
        UNSPECIFIED,
        /// @notice Certificate of airworthiness.
        AIRWORTHINESS_CERTIFICATE,
        /// @notice Certificate of registration.
        REGISTRATION_CERTIFICATE,
        /// @notice Maintenance work package or release document.
        MAINTENANCE_RECORD,
        /// @notice Airworthiness directive compliance evidence.
        AD_COMPLIANCE,
        /// @notice Service bulletin compliance evidence.
        SB_COMPLIANCE,
        /// @notice Aircraft, engine or component logbook.
        LOGBOOK,
        /// @notice Weight and balance report.
        WEIGHT_AND_BALANCE,
        /// @notice Lease agreement.
        LEASE_AGREEMENT,
        /// @notice Bill of sale.
        BILL_OF_SALE,
        /// @notice Inspection report.
        INSPECTION_REPORT,
        /// @notice Any document outside the enumerated categories.
        OTHER
    }

    /// @notice Lifecycle state of a document record.
    enum DocumentStatus {
        /// @notice Reserved sentinel, and the value of any unregistered id.
        NONE,
        /// @notice Current.
        ACTIVE,
        /// @notice Replaced by a later document for the same asset.
        SUPERSEDED,
        /// @notice Withdrawn by its controller or by the protocol admin.
        REVOKED
    }

    /// @notice A registered document reference.
    /// @dev Packed to two slots. There is deliberately no `recordedAt`: the block
    ///      timestamp is already in the event, and storing it would cost a field for
    ///      data no on-chain logic reads.
    /// @param assetId The asset the document describes.
    /// @param issuerOrgId The organization that registered it, or 0 when registered
    ///        by the asset owner acting personally.
    /// @param supersededById The document that replaced this one, or 0.
    /// @param issuedAt Real-world issuance date, supplied by the caller.
    /// @param docType Category of document.
    /// @param status Current lifecycle state.
    /// @param documentHash `keccak256` commitment to the document bytes. Unique
    ///        protocol-wide.
    struct Document {
        uint64 assetId;
        uint64 issuerOrgId;
        uint64 supersededById;
        uint40 issuedAt;
        DocumentType docType;
        DocumentStatus status;
        bytes32 documentHash;
    }

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a document reference is registered.
    /// @param documentId The newly minted document id.
    /// @param assetId The asset the document describes.
    /// @param issuerOrgId The registering organization, or 0.
    /// @param docType The category of document.
    /// @param documentHash The commitment to the document bytes.
    /// @param uri The off-chain location.
    event DocumentRegistered(
        uint256 indexed documentId,
        uint256 indexed assetId,
        uint256 indexed issuerOrgId,
        DocumentType docType,
        bytes32 documentHash,
        string uri
    );

    /// @notice Emitted when a document is replaced by a later one.
    /// @param documentId The superseded document.
    /// @param supersededById The document that replaced it.
    event DocumentSuperseded(uint256 indexed documentId, uint256 indexed supersededById);

    /// @notice Emitted when a document is withdrawn.
    /// @param documentId The revoked document.
    /// @param by The account that revoked it.
    event DocumentRevoked(uint256 indexed documentId, address indexed by);

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when a document id does not exist.
    /// @param documentId The offending id.
    error DocumentNotFound(uint256 documentId);

    /// @notice Thrown when a document commitment is already registered.
    /// @dev Uniqueness makes the hash a usable lookup key and stops the same evidence
    ///      being counted twice against an asset.
    /// @param documentHash The commitment already taken.
    /// @param existingDocumentId The document already holding it.
    error DocumentHashTaken(bytes32 documentHash, uint256 existingDocumentId);

    /// @notice Thrown when an action requires an `ACTIVE` document.
    /// @param documentId The document id.
    /// @param status Its actual status.
    error DocumentNotActive(uint256 documentId, DocumentStatus status);

    /// @notice Thrown when two documents that must describe one asset do not.
    /// @param documentId The document id.
    /// @param expectedAssetId The asset expected.
    /// @param actualAssetId The asset the document actually describes.
    error DocumentAssetMismatch(uint256 documentId, uint256 expectedAssetId, uint256 actualAssetId);

    /// @notice Thrown when `UNSPECIFIED` is supplied as a document type.
    /// @param provided The offending value.
    error InvalidDocumentType(DocumentType provided);

    /// @notice Thrown when a caller-supplied issuance date is in the future.
    /// @param issuedAt The offending date.
    /// @param nowTs The block timestamp it was compared against.
    error IssuedAtInFuture(uint40 issuedAt, uint40 nowTs);

    /// @notice Thrown when the caller may not act on a document or asset.
    /// @param assetId The asset id.
    /// @param caller The unauthorized caller.
    error NotDocumentController(uint256 assetId, address caller);

    /// @notice Thrown when a document would supersede itself.
    /// @param documentId The offending id.
    error SelfSupersede(uint256 documentId);

    /*//////////////////////////////////////////////////////////////
                                FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Registers a document reference against an asset.
    /// @dev Callable by the asset owner (with `issuerOrgId == 0`) or by an address
    ///      acting for `issuerOrgId`. A caller may **not** attribute a document to an
    ///      organization it does not act for — that is exactly the forgery this
    ///      registry must not enable. Record the real-world issuer in the off-chain
    ///      metadata instead.
    /// @param assetId The asset the document describes. Must exist and be non-terminal.
    /// @param issuerOrgId The attributing organization, or 0 for owner registration.
    /// @param docType Category of document. Must not be `UNSPECIFIED`.
    /// @param documentHash Commitment to the document bytes. Non-zero and unused.
    /// @param issuedAt Real-world issuance date. Must not be in the future.
    /// @param uri Off-chain location. May be empty.
    /// @return documentId The newly minted document id.
    function registerDocument(
        uint256 assetId,
        uint256 issuerOrgId,
        DocumentType docType,
        bytes32 documentHash,
        uint40 issuedAt,
        string calldata uri
    ) external returns (uint256 documentId);

    /// @notice Marks a document as replaced by a later one for the same asset.
    /// @dev Both documents must be `ACTIVE` and describe the same asset.
    /// @param documentId The document being replaced.
    /// @param supersededById The replacement document.
    function supersedeDocument(uint256 documentId, uint256 supersededById) external;

    /// @notice Withdraws a document.
    /// @dev Callable by the document's controller or by `PROTOCOL_ADMIN_ROLE`.
    ///      Terminal — a revoked document is never reinstated.
    /// @param documentId The document to revoke.
    function revokeDocument(uint256 documentId) external;

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the full record for a document.
    /// @param documentId The document id.
    /// @return The document record.
    function getDocument(uint256 documentId) external view returns (Document memory);

    /// @notice Returns the document holding a given commitment.
    /// @param documentHash The commitment to look up.
    /// @return The document id, or 0 if unused.
    function documentIdByHash(bytes32 documentHash) external view returns (uint256);

    /// @notice Returns a document's off-chain location.
    /// @param documentId The document id.
    /// @return The stored URI, which may be empty.
    function documentURI(uint256 documentId) external view returns (string memory);

    /// @notice Returns the number of documents registered against an asset.
    /// @param assetId The asset id.
    /// @return The count, including superseded and revoked documents.
    function documentCountOf(uint256 assetId) external view returns (uint256);

    /// @notice Returns a page of the documents registered against an asset.
    /// @dev Paginated: the per-asset document list is unbounded and no
    ///      state-changing path ever iterates it (`docs/security-model.md` §5).
    /// @param assetId The asset id.
    /// @param offset Index to start from.
    /// @param limit Maximum number of ids to return.
    /// @return ids The document ids in the requested page.
    function documentsOf(uint256 assetId, uint256 offset, uint256 limit) external view returns (uint256[] memory ids);

    /// @notice Returns the number of documents registered so far.
    /// @return The highest minted document id.
    function documentCount() external view returns (uint256);
}
