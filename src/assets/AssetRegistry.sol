// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolModuleUpgradeable} from "../core/ProtocolModuleUpgradeable.sol";
import {IAssetOwnership} from "../interfaces/IAssetOwnership.sol";
import {IAssetRegistry} from "../interfaces/IAssetRegistry.sol";
import {IOrganizationRegistry} from "../interfaces/IOrganizationRegistry.sol";
import {ProtocolAddressKeys} from "../libraries/ProtocolAddressKeys.sol";
import {ProtocolCast} from "../libraries/ProtocolCast.sol";
import {ZeroAddress} from "../libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../libraries/ProtocolRoles.sol";

/// @title AssetRegistry
/// @author AeroAsset Protocol
/// @notice The generic aviation asset abstraction: aircraft, engines, APUs,
///         components, parts and equipment.
/// @dev Sub-layer L2b. Owns the protocol's single global asset-id space and calls
///      **down** into {AssetOwnership} (L2a) to create ownership records and to mirror
///      terminal-status freezes. It never reads upward and never calls a peer's
///      state-changing function sideways, so the L2 call graph stays acyclic.
///
///      Registration and verification are independent axes. `registerAsset` can never
///      set `verifiedAt` — only `ASSET_VERIFIER_ROLE` can, through {verifyAsset}. This
///      is roadmap §7's requirement and is asserted by `INV-ASSET-03`.
///
///      **Non-claim.** A verified flag records that an authorized protocol role
///      attested to an asset at a point in time. It is not an airworthiness
///      certification, not legal title, and not the position of any civil aviation
///      authority.
contract AssetRegistry is ProtocolModuleUpgradeable, IAssetRegistry {
    using ProtocolCast for uint256;

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice ERC-7201 namespaced storage for this registry.
    /// @param assetCount Highest minted asset id. Ids are dense from 1.
    /// @param assets Asset records by id.
    /// @param metadataURI Off-chain metadata locations, kept out of the packed struct.
    /// @param assetIdBySerialHash Reverse index enforcing serial-number uniqueness.
    /// @custom:storage-location erc7201:aeroasset.storage.AssetRegistry
    struct AssetRegistryStorage {
        uint256 assetCount;
        mapping(uint256 assetId => Asset) assets;
        mapping(uint256 assetId => string) metadataURI;
        mapping(bytes32 serialHash => uint256 assetId) assetIdBySerialHash;
    }

    /// @dev `keccak256(abi.encode(uint256(keccak256("aeroasset.storage.AssetRegistry")) - 1))
    ///      & ~bytes32(uint256(0xff))`. Asserted in `test/upgrade/Namespaces.t.sol`.
    bytes32 private constant _ASSET_REGISTRY_STORAGE =
        0xb67cfe8a53e48286e73e7c1183d175a9e2ed4cb1c3dd63eced3ad89851e47600;

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
                              REGISTRATION
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IAssetRegistry
    function registerAsset(
        uint256 orgId,
        address owner,
        AssetKind kind,
        bytes32 serialNumberHash,
        bytes32 metadataHash,
        string calldata uri
    ) external whenNotPaused returns (uint256 assetId) {
        _organizations().requireActingFor(orgId, msg.sender);
        assetId = _register(orgId, owner, kind, serialNumberHash, metadataHash, uri);
    }

    /// @inheritdoc IAssetRegistry
    function registerAssetFor(
        uint256 orgId,
        address owner,
        AssetKind kind,
        bytes32 serialNumberHash,
        bytes32 metadataHash,
        string calldata uri
    ) external whenNotPaused onlyRole(ProtocolRoles.ASSET_MINTER_ROLE) returns (uint256 assetId) {
        // The minter has already checked that the original caller may act for `orgId`;
        // re-checking that the organization is verified is cheap defence in depth
        // against a minter that is upgraded incorrectly.
        IOrganizationRegistry organizations = _organizations();
        if (!organizations.isVerified(orgId)) {
            revert IOrganizationRegistry.OrganizationNotVerified(orgId, organizations.getOrganization(orgId).status);
        }

        assetId = _register(orgId, owner, kind, serialNumberHash, metadataHash, uri);
    }

    /*//////////////////////////////////////////////////////////////
                                MUTATION
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IAssetRegistry
    function updateAssetMetadata(uint256 assetId, bytes32 metadataHash, string calldata uri) external whenNotPaused {
        AssetRegistryStorage storage $ = _s();
        Asset storage asset = _requireExists(assetId);

        if (asset.status == AssetStatus.RETIRED || asset.status == AssetStatus.DESTROYED) {
            revert AssetTerminal(assetId, asset.status);
        }
        // The owner has the economic interest in the record's accuracy; the registrar
        // organization retains write access so it can correct its own submissions.
        if (
            _ownership().ownerOf(assetId) != msg.sender
                && !_organizations().isActingFor(asset.registrarOrgId, msg.sender)
        ) {
            revert NotAssetController(assetId, msg.sender);
        }

        asset.metadataHash = metadataHash;
        $.metadataURI[assetId] = uri;

        emit AssetMetadataUpdated(assetId, metadataHash, uri);
    }

    /// @inheritdoc IAssetRegistry
    function setAssetStatus(uint256 assetId, AssetStatus newStatus) external whenNotPaused {
        Asset storage asset = _requireExists(assetId);
        AssetStatus from = asset.status;

        IAssetOwnership ownership = _ownership();
        ownership.requireOwner(assetId, msg.sender);
        if (!isValidTransition(from, newStatus)) {
            revert InvalidAssetTransition(from, newStatus);
        }

        // A terminal status freezes transfers, which would make an in-flight settlement
        // permanently unsettleable. The seller is still the owner while an escrow holds
        // the lock, so without this they could strand a funded buyer at will. A genuine
        // mid-trade loss is a dispute for the arbitrator, not a unilateral write.
        if (_isTerminal(newStatus)) {
            address lockHolder = ownership.lockHolderOf(assetId);
            if (lockHolder != address(0)) {
                revert AssetLockedBySettlement(assetId, lockHolder);
            }
        }

        _writeStatus(assetId, asset, from, newStatus);
    }

    /// @inheritdoc IAssetRegistry
    /// @dev The recovery path for an erroneous terminal status. Restricted to
    ///      `PROTOCOL_ADMIN_ROLE`, so on any production network every use is queued
    ///      behind the timelock delay and publicly visible before it lands.
    function recoverTerminalAsset(uint256 assetId, AssetStatus newStatus)
        external
        onlyRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE)
    {
        Asset storage asset = _requireExists(assetId);
        AssetStatus from = asset.status;

        if (!_isTerminal(from)) {
            revert AssetNotTerminal(assetId, from);
        }
        // Recovery restores an operational status; it is not a route into the other
        // terminal state, which would be a status change dressed up as a correction.
        if (newStatus == AssetStatus.NONE || _isTerminal(newStatus)) {
            revert InvalidAssetTransition(from, newStatus);
        }

        _writeStatus(assetId, asset, from, newStatus);

        emit AssetTerminalStatusRecovered(assetId, from, newStatus, msg.sender);
    }

    /// @inheritdoc IAssetRegistry
    function verifyAsset(uint256 assetId, uint256 verifierOrgId)
        external
        whenNotPaused
        onlyRole(ProtocolRoles.ASSET_VERIFIER_ROLE)
    {
        Asset storage asset = _requireExists(assetId);

        if (asset.verifiedAt != 0) {
            revert AssetAlreadyVerified(assetId);
        }
        if (asset.status == AssetStatus.RETIRED || asset.status == AssetStatus.DESTROYED) {
            revert AssetTerminal(assetId, asset.status);
        }
        if (verifierOrgId != 0) {
            IOrganizationRegistry organizations = _organizations();
            if (!organizations.isVerified(verifierOrgId)) {
                revert IOrganizationRegistry.OrganizationNotVerified(
                    verifierOrgId, organizations.getOrganization(verifierOrgId).status
                );
            }
        }

        asset.verifiedAt = uint40(block.timestamp);
        asset.verifierOrgId = verifierOrgId.toUint64();

        emit AssetVerificationChanged(assetId, verifierOrgId, true, msg.sender);
    }

    /// @inheritdoc IAssetRegistry
    /// @dev Deliberately callable while paused: withdrawing verification strictly
    ///      reduces the claims attached to an asset.
    function unverifyAsset(uint256 assetId) external onlyRole(ProtocolRoles.ASSET_VERIFIER_ROLE) {
        Asset storage asset = _requireExists(assetId);

        if (asset.verifiedAt == 0) {
            revert AssetNotVerified(assetId);
        }

        uint256 previousVerifier = asset.verifierOrgId;
        asset.verifiedAt = 0;
        asset.verifierOrgId = 0;

        emit AssetVerificationChanged(assetId, previousVerifier, false, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IAssetRegistry
    function getAsset(uint256 assetId) external view returns (Asset memory) {
        return _requireExists(assetId);
    }

    /// @inheritdoc IAssetRegistry
    function exists(uint256 assetId) public view returns (bool) {
        return _s().assets[assetId].status != AssetStatus.NONE;
    }

    /// @inheritdoc IAssetRegistry
    function isVerified(uint256 assetId) external view returns (bool) {
        return _s().assets[assetId].verifiedAt != 0;
    }

    /// @inheritdoc IAssetRegistry
    function isTerminal(uint256 assetId) external view returns (bool) {
        AssetStatus status = _s().assets[assetId].status;
        return status == AssetStatus.RETIRED || status == AssetStatus.DESTROYED;
    }

    /// @inheritdoc IAssetRegistry
    function requireKind(uint256 assetId, AssetKind kind) external view {
        Asset storage asset = _requireExists(assetId);
        if (asset.kind != kind) {
            revert InvalidAssetKind(assetId, kind, asset.kind);
        }
    }

    /// @inheritdoc IAssetRegistry
    function assetIdBySerialHash(bytes32 serialHash) external view returns (uint256) {
        return _s().assetIdBySerialHash[serialHash];
    }

    /// @inheritdoc IAssetRegistry
    function metadataURI(uint256 assetId) external view returns (string memory) {
        return _s().metadataURI[assetId];
    }

    /// @inheritdoc IAssetRegistry
    function assetCount() external view returns (uint256) {
        return _s().assetCount;
    }

    /// @notice Reports whether an owner-initiated status transition is permitted.
    /// @dev The legal set is expressed exactly once, here. A transition to the same
    ///      status is rejected as a no-op that would emit a misleading event.
    ///
    ///      **`RETIRED` is reversible; `DESTROYED` is not.** Retirement is a reversible
    ///      real-world state — stored airframes are routinely returned to service — and
    ///      modelling it as absorbing meant a returning aircraft had to be re-registered
    ///      under a new id, orphaning its entire document and maintenance provenance.
    ///      Destruction is genuinely absorbing and stays that way; correcting an
    ///      erroneous one is {recoverTerminalAsset}, behind the timelock.
    ///      See `docs/state-machines.md` §3.
    /// @param from The current status.
    /// @param to The proposed status.
    /// @return True if the transition is legal.
    function isValidTransition(AssetStatus from, AssetStatus to) public pure returns (bool) {
        if (from == AssetStatus.NONE || to == AssetStatus.NONE) {
            return false;
        }
        if (from == to) {
            return false;
        }
        if (from == AssetStatus.DESTROYED) {
            return false;
        }
        // Returning from retirement re-enters service; it must not hop straight to the
        // other terminal state, which would skip the operational record entirely.
        if (from == AssetStatus.RETIRED) {
            return to != AssetStatus.DESTROYED;
        }
        // Every operational status can reach every other, and either terminal status.
        return true;
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @notice Writes a status change and keeps the ownership freeze mirror in step.
    /// @dev Every status write in this contract funnels through here, so the mirror
    ///      cannot drift from the status it reflects (`INV-OWN-06`) — no individual
    ///      transition has to remember to freeze or unfreeze.
    /// @param assetId The asset id.
    /// @param asset Storage pointer to the record.
    /// @param from The current status.
    /// @param to The status to move to.
    function _writeStatus(uint256 assetId, Asset storage asset, AssetStatus from, AssetStatus to) private {
        asset.status = to;

        bool wasTerminal = _isTerminal(from);
        bool isNowTerminal = _isTerminal(to);

        if (isNowTerminal && !wasTerminal) {
            _ownership().freezeTransfers(assetId);
        } else if (wasTerminal && !isNowTerminal) {
            _ownership().unfreezeTransfers(assetId);
        }

        emit AssetStatusChanged(assetId, from, to);
    }

    /// @notice Reports whether a status freezes transfers.
    /// @param status The status to test.
    /// @return True for `RETIRED` and `DESTROYED`.
    function _isTerminal(AssetStatus status) private pure returns (bool) {
        return status == AssetStatus.RETIRED || status == AssetStatus.DESTROYED;
    }

    /// @notice Shared registration path for both entry points.
    /// @param orgId The registering organization, already authorized by the caller.
    /// @param owner The initial owner.
    /// @param kind The category of asset.
    /// @param serialNumberHash Commitment to the serial number, or 0.
    /// @param metadataHash Commitment to off-chain metadata.
    /// @param uri Off-chain metadata location.
    /// @return assetId The newly minted asset id.
    function _register(
        uint256 orgId,
        address owner,
        AssetKind kind,
        bytes32 serialNumberHash,
        bytes32 metadataHash,
        string calldata uri
    ) private returns (uint256 assetId) {
        if (kind == AssetKind.UNSPECIFIED) {
            revert UnspecifiedAssetKind(kind);
        }
        if (owner == address(0)) {
            revert ZeroAddress();
        }

        AssetRegistryStorage storage $ = _s();

        // A zero serial hash means "no serial recorded" and is not indexed: parts and
        // equipment legitimately lack one, and indexing zero would make every such
        // asset collide with every other.
        if (serialNumberHash != bytes32(0)) {
            uint256 existing = $.assetIdBySerialHash[serialNumberHash];
            if (existing != 0) {
                revert SerialNumberTaken(serialNumberHash, existing);
            }
        }

        // Cannot realistically overflow: one increment per registration transaction.
        unchecked {
            assetId = ++$.assetCount;
        }

        $.assets[assetId] = Asset({
            registrarOrgId: orgId.toUint64(),
            verifierOrgId: 0,
            registeredAt: uint40(block.timestamp),
            // Never set here. Roadmap §7 requires registration and verification be
            // independent, and INV-ASSET-03 asserts this exact field is zero on exit.
            verifiedAt: 0,
            kind: kind,
            status: AssetStatus.REGISTERED,
            serialNumberHash: serialNumberHash,
            metadataHash: metadataHash
        });

        if (serialNumberHash != bytes32(0)) {
            $.assetIdBySerialHash[serialNumberHash] = assetId;
        }
        $.metadataURI[assetId] = uri;

        // Downward call: ownership must exist from the same transaction the asset
        // does, so there is never a block in which an asset has no owner.
        _ownership().initializeOwnership(assetId, owner);

        emit AssetRegistered(assetId, orgId, owner, kind, serialNumberHash);
        emit AssetMetadataUpdated(assetId, metadataHash, uri);
    }

    /// @notice Resolves the ownership ledger.
    /// @return The current `AssetOwnership`.
    function _ownership() private view returns (IAssetOwnership) {
        return IAssetOwnership(_resolve(ProtocolAddressKeys.ASSET_OWNERSHIP));
    }

    /// @notice Resolves the organization registry.
    /// @return The current `OrganizationRegistry`.
    function _organizations() private view returns (IOrganizationRegistry) {
        return IOrganizationRegistry(_resolve(ProtocolAddressKeys.ORGANIZATION_REGISTRY));
    }

    /// @notice Returns a storage pointer to an existing asset, or reverts.
    /// @param assetId The asset id.
    /// @return asset Storage pointer to the record.
    function _requireExists(uint256 assetId) private view returns (Asset storage asset) {
        asset = _s().assets[assetId];
        if (asset.status == AssetStatus.NONE) {
            revert AssetNotFound(assetId);
        }
    }

    /// @notice Returns a pointer to this contract's ERC-7201 storage struct.
    /// @return $ The registry storage.
    function _s() private pure returns (AssetRegistryStorage storage $) {
        assembly ("memory-safe") {
            $.slot := _ASSET_REGISTRY_STORAGE
        }
    }
}
