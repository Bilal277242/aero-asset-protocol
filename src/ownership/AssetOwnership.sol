// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolModuleUpgradeable} from "../core/ProtocolModuleUpgradeable.sol";
import {IAssetOwnership} from "../interfaces/IAssetOwnership.sol";
import {ProtocolAddressKeys} from "../libraries/ProtocolAddressKeys.sol";
import {DeadlineInPast, UnexpectedCaller, ZeroAddress} from "../libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../libraries/ProtocolRoles.sol";

/// @title AssetOwnership
/// @author AeroAsset Protocol
/// @notice The protocol's authoritative record of who owns which asset.
/// @dev Sub-layer L2a. Deliberately asset-agnostic: it tracks ownership of opaque
///      `uint256` ids and imports no asset, marketplace or escrow type, which is what
///      keeps the L2 call graph acyclic.
///
///      Ownership is a custom registry rather than ERC-721 (`docs/architecture.md`
///      §D5). The cost is losing generic wallet and marketplace tooling; that cost is
///      the point, because an aircraft record must not be sellable on a third-party
///      marketplace outside the protocol's escrow layer.
///
///      Three properties carry the security weight here:
///
///      1. **Direct transfers are two-step.** A mistyped recipient in a one-step push
///         would permanently orphan an aircraft's entire provenance chain.
///      2. **Settlement requires holding the lock, not just the role.**
///         `SETTLEMENT_ROLE` alone cannot move an asset — the caller must be the
///         contract that locked it. See `docs/threat-model.md` T-04.
///      3. **Settlement asserts the current owner.** The caller names who it believes
///         owns the asset; if that changed, the call reverts rather than moving the
///         wrong party's property. This closes the "sell it twice" race (T-05).
///
///      **Non-claim.** Ownership recorded here is protocol state, not legal title
///      under the law of any jurisdiction, and not registered ownership with any civil
///      aviation authority.
contract AssetOwnership is ProtocolModuleUpgradeable, IAssetOwnership {
    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice ERC-7201 namespaced storage for this ledger.
    /// @param records Ownership records by asset id.
    /// @custom:storage-location erc7201:aeroasset.storage.AssetOwnership
    struct AssetOwnershipStorage {
        mapping(uint256 assetId => OwnershipRecord) records;
    }

    /// @dev `keccak256(abi.encode(uint256(keccak256("aeroasset.storage.AssetOwnership")) - 1))
    ///      & ~bytes32(uint256(0xff))`. Asserted in `test/upgrade/Namespaces.t.sol`.
    bytes32 private constant _ASSET_OWNERSHIP_STORAGE =
        0xb4e666a3e1b1d367d5433fd78238bf5f0935c36d28602b8e8c7b2c72b9d29400;

    /// @notice `reason` emitted for a peer-to-peer transfer.
    bytes32 internal constant REASON_DIRECT = "DIRECT";

    /// @notice `reason` emitted for a marketplace settlement.
    bytes32 internal constant REASON_SETTLEMENT = "SETTLEMENT";

    /*//////////////////////////////////////////////////////////////
                                MODIFIERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Restricts a function to the registered `AssetRegistry`.
    /// @dev Resolved live from the address registry rather than cached, so a rotated
    ///      registry loses this privilege on the very next call.
    modifier onlyAssetRegistry() {
        _onlyAssetRegistry();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                              INITIALIZATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Initializes the ledger behind its ERC-1967 proxy.
    /// @param roleManager_ The protocol `RoleManager`. Must be non-zero.
    /// @param addressRegistry_ The protocol `ProtocolAddressRegistry`. Must be non-zero.
    function initialize(address roleManager_, address addressRegistry_) external initializer {
        __ProtocolModule_init(roleManager_, addressRegistry_);
    }

    /*//////////////////////////////////////////////////////////////
                          PROTOCOL-INTERNAL WRITES
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IAssetOwnership
    /// @dev Not pause-gated: the only caller is `AssetRegistry.registerAsset`, which
    ///      is itself pause-gated. A second gate here would add nothing.
    function initializeOwnership(uint256 assetId, address owner) external onlyAssetRegistry {
        if (owner == address(0)) {
            revert ZeroAddress();
        }

        AssetOwnershipStorage storage $ = _s();
        OwnershipRecord storage record = $.records[assetId];
        if (record.owner != address(0)) {
            revert OwnershipAlreadyInitialized(assetId);
        }

        record.owner = owner;
        record.since = uint40(block.timestamp);

        emit OwnershipInitialized(assetId, owner);
    }

    /// @inheritdoc IAssetOwnership
    /// @dev Deliberately callable while paused. Freezing strictly reduces what can be
    ///      done with an asset, and a destroyed aircraft should be recordable as such
    ///      during an incident.
    function freezeTransfers(uint256 assetId) external onlyAssetRegistry {
        OwnershipRecord storage record = _requireExists(assetId);

        record.transferFrozen = true;

        emit TransferFrozen(assetId);
    }

    /// @inheritdoc IAssetOwnership
    /// @dev Pause-gated, unlike its counterpart: unfreezing *expands* what can be done
    ///      with an asset, so it must not run during an incident.
    ///
    ///      `AssetRegistry` is the only caller and reaches this on exactly two paths —
    ///      an owner returning a `RETIRED` asset to service, and a timelocked admin
    ///      correcting an erroneous terminal status. Keeping the entry point here
    ///      registry-only preserves `INV-OWN-06`: the frozen bit is written only where
    ///      the status it mirrors is written.
    function unfreezeTransfers(uint256 assetId) external whenNotPaused onlyAssetRegistry {
        OwnershipRecord storage record = _requireExists(assetId);

        record.transferFrozen = false;

        emit TransferUnfrozen(assetId);
    }

    /*//////////////////////////////////////////////////////////////
                             DIRECT TRANSFER
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IAssetOwnership
    function initiateTransfer(uint256 assetId, address to, uint40 expiresAt) external whenNotPaused {
        OwnershipRecord storage record = _requireExists(assetId);

        if (msg.sender != record.owner) {
            revert NotAssetOwner(assetId, msg.sender, record.owner);
        }
        if (to == address(0)) {
            revert ZeroAddress();
        }
        if (to == record.owner) {
            revert TransferToCurrentOwner(assetId);
        }
        if (record.transferFrozen) {
            revert AssetTransferFrozen(assetId);
        }
        if (record.lockedBy != address(0)) {
            revert AssetTransferLocked(assetId, record.lockedBy);
        }
        if (expiresAt != 0 && expiresAt <= block.timestamp) {
            revert DeadlineInPast(expiresAt, uint40(block.timestamp));
        }

        record.pendingOwner = to;
        record.offerExpiresAt = expiresAt;

        emit OwnershipTransferStarted(assetId, record.owner, to, expiresAt);
    }

    /// @inheritdoc IAssetOwnership
    function acceptTransfer(uint256 assetId) external whenNotPaused {
        OwnershipRecord storage record = _requireExists(assetId);

        address pending = record.pendingOwner;
        if (pending == address(0)) {
            revert NoPendingTransfer(assetId);
        }
        if (msg.sender != pending) {
            revert NotPendingOwner(assetId, msg.sender, pending);
        }
        if (record.transferFrozen) {
            revert AssetTransferFrozen(assetId);
        }
        // No lock check is needed here, and adding one would be dead code costing a
        // cold SLOAD on every acceptance: taking a lock clears the pending offer, so a
        // locked asset always fails the `NoPendingTransfer` guard above first. The
        // "lock implies no pending offer" property is asserted directly by
        // `test_Lock_ClearsPendingTransfer`.
        if (record.offerExpiresAt != 0 && record.offerExpiresAt <= block.timestamp) {
            revert TransferOfferExpired(assetId, record.offerExpiresAt);
        }

        _moveOwnership(assetId, record, pending, REASON_DIRECT);
    }

    /// @inheritdoc IAssetOwnership
    function cancelTransfer(uint256 assetId) external whenNotPaused {
        OwnershipRecord storage record = _requireExists(assetId);

        address pending = record.pendingOwner;
        if (pending == address(0)) {
            revert NoPendingTransfer(assetId);
        }
        // Either side of the proposed transfer may abandon it.
        if (msg.sender != record.owner && msg.sender != pending) {
            revert NotAssetOwner(assetId, msg.sender, record.owner);
        }

        _clearPendingTransfer(record);

        emit OwnershipTransferCancelled(assetId, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                                SETTLEMENT
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IAssetOwnership
    /// @dev Not pause-gated. Releasing a lock must remain possible while paused, or a
    ///      pause would strand an asset under a lock belonging to a cancelled escrow.
    function setTransferLock(uint256 assetId, bool locked) external onlyRole(ProtocolRoles.SETTLEMENT_ROLE) {
        OwnershipRecord storage record = _requireExists(assetId);
        address currentHolder = record.lockedBy;

        if (locked) {
            if (record.transferFrozen) {
                revert AssetTransferFrozen(assetId);
            }
            if (currentHolder != address(0)) {
                revert AssetAlreadyLocked(assetId, currentHolder);
            }

            record.lockedBy = msg.sender;
            // A pending direct transfer must not survive the lock: leaving one armed
            // would let the seller's offer fire the instant settlement releases.
            _clearPendingTransfer(record);

            emit TransferLockChanged(assetId, msg.sender, msg.sender);
        } else {
            if (currentHolder != msg.sender) {
                revert NotLockHolder(assetId, msg.sender, currentHolder);
            }

            record.lockedBy = address(0);

            emit TransferLockChanged(assetId, address(0), msg.sender);
        }
    }

    /// @inheritdoc IAssetOwnership
    function settleTransfer(uint256 assetId, address from, address to)
        external
        whenNotPaused
        onlyRole(ProtocolRoles.SETTLEMENT_ROLE)
    {
        OwnershipRecord storage record = _requireExists(assetId);

        // Holding SETTLEMENT_ROLE is not sufficient: the caller must be the contract
        // that locked this specific asset. See `docs/threat-model.md` T-04.
        if (record.lockedBy != msg.sender) {
            revert NotLockHolder(assetId, msg.sender, record.lockedBy);
        }
        if (to == address(0)) {
            revert ZeroAddress();
        }
        if (record.transferFrozen) {
            revert AssetTransferFrozen(assetId);
        }
        // The caller asserts who it believes owns the asset; a mismatch means the
        // world moved under the trade, so fail rather than move the wrong property.
        if (record.owner != from) {
            revert UnexpectedOwner(assetId, from, record.owner);
        }
        if (to == from) {
            revert TransferToCurrentOwner(assetId);
        }

        record.lockedBy = address(0);

        // Emitted in causal order: the lock is released, *then* ownership moves. The
        // reverse order made a naive log-order reconstruction report a transfer that
        // happened while the asset was still locked — a state that never existed
        // (audit AAP-23).
        emit TransferLockChanged(assetId, address(0), msg.sender);

        _moveOwnership(assetId, record, to, REASON_SETTLEMENT);
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IAssetOwnership
    function ownerOf(uint256 assetId) public view returns (address) {
        return _s().records[assetId].owner;
    }

    /// @inheritdoc IAssetOwnership
    function requireOwner(uint256 assetId, address account) external view {
        OwnershipRecord storage record = _requireExists(assetId);
        if (record.owner != account) {
            revert NotAssetOwner(assetId, account, record.owner);
        }
    }

    /// @inheritdoc IAssetOwnership
    function getOwnership(uint256 assetId) external view returns (OwnershipRecord memory) {
        return _requireExists(assetId);
    }

    /// @inheritdoc IAssetOwnership
    function lockHolderOf(uint256 assetId) external view returns (address) {
        return _s().records[assetId].lockedBy;
    }

    /// @inheritdoc IAssetOwnership
    function isTransferable(uint256 assetId) external view returns (bool) {
        OwnershipRecord storage record = _s().records[assetId];
        return record.owner != address(0) && !record.transferFrozen && record.lockedBy == address(0);
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @notice Writes an ownership change and clears any in-flight transfer offer.
    /// @param assetId The asset id.
    /// @param record Storage pointer to the ownership record.
    /// @param to The new owner.
    /// @param reason Discriminator emitted with the event.
    function _moveOwnership(uint256 assetId, OwnershipRecord storage record, address to, bytes32 reason) private {
        address from = record.owner;

        record.owner = to;
        record.since = uint40(block.timestamp);
        _clearPendingTransfer(record);

        emit OwnershipTransferred(assetId, from, to, reason);
    }

    /// @notice Clears a pending transfer offer if one is set.
    /// @dev Guarded so the common unset case costs no SSTORE.
    /// @param record Storage pointer to the ownership record.
    function _clearPendingTransfer(OwnershipRecord storage record) private {
        if (record.pendingOwner != address(0)) {
            record.pendingOwner = address(0);
            record.offerExpiresAt = 0;
        }
    }

    /// @notice Reverts unless the caller is the registered `AssetRegistry`.
    function _onlyAssetRegistry() private view {
        address registry = _resolve(ProtocolAddressKeys.ASSET_REGISTRY);
        if (msg.sender != registry) {
            revert UnexpectedCaller(registry, msg.sender);
        }
    }

    /// @notice Returns a storage pointer to an existing record, or reverts.
    /// @param assetId The asset id.
    /// @return record Storage pointer to the ownership record.
    function _requireExists(uint256 assetId) private view returns (OwnershipRecord storage record) {
        record = _s().records[assetId];
        if (record.owner == address(0)) {
            revert OwnershipNotFound(assetId);
        }
    }

    /// @notice Returns a pointer to this contract's ERC-7201 storage struct.
    /// @return $ The ledger storage.
    function _s() private pure returns (AssetOwnershipStorage storage $) {
        assembly ("memory-safe") {
            $.slot := _ASSET_OWNERSHIP_STORAGE
        }
    }
}
