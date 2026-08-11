// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IAssetOwnership
/// @author AeroAsset Protocol
/// @notice Interface, types, events and errors for the protocol's authoritative
///         ownership ledger.
/// @dev Sub-layer L2a — the lowest module in the asset layer. It is deliberately
///      **asset-agnostic**: it tracks ownership of opaque `uint256` ids and imports no
///      asset, marketplace or escrow type. That is what keeps the L2 call graph a DAG
///      (`AssetOwnership` ← `AssetRegistry` ← specialization registries) with no cycle.
///
///      **Non-claim.** Ownership recorded here is protocol state. It is **not** legal
///      title to an aircraft, engine or component under the law of any jurisdiction,
///      and the protocol makes no representation that it corresponds to registered
///      ownership with any civil aviation authority.
interface IAssetOwnership {
    /*//////////////////////////////////////////////////////////////
                                  TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Ownership state for a single asset id.
    /// @dev Packed to three slots. There is deliberately no `transferLocked` boolean:
    ///      the lock is exactly `lockedBy != address(0)`, so a flag and a holder
    ///      cannot disagree.
    /// @param owner Current owner. Non-zero for every existing asset.
    /// @param since Unix time the current owner acquired the asset.
    /// @param transferFrozen True while the asset's status is terminal. Mirrored here
    ///        by `AssetRegistry` so this module never has to read upward.
    /// @param pendingOwner Proposed owner of an in-flight direct transfer, or zero.
    /// @param offerExpiresAt Deadline for accepting the in-flight transfer, or zero
    ///        for an offer that does not expire.
    /// @param lockedBy The settlement contract currently holding the asset under
    ///        lock, or zero when unlocked.
    struct OwnershipRecord {
        address owner;
        uint40 since;
        bool transferFrozen;
        address pendingOwner;
        uint40 offerExpiresAt;
        address lockedBy;
    }

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when an asset's ownership record is first created.
    /// @param assetId The asset id.
    /// @param owner The initial owner.
    event OwnershipInitialized(uint256 indexed assetId, address indexed owner);

    /// @notice Emitted when a direct two-step transfer is proposed.
    /// @param assetId The asset id.
    /// @param from The current owner.
    /// @param to The proposed owner, who must accept.
    /// @param expiresAt Acceptance deadline, or 0 for none.
    event OwnershipTransferStarted(uint256 indexed assetId, address indexed from, address indexed to, uint40 expiresAt);

    /// @notice Emitted whenever ownership actually changes hands.
    /// @dev `reason` discriminates the path so an indexer can distinguish a
    ///      peer-to-peer transfer from a marketplace settlement without correlating
    ///      against escrow events. See `docs/events.md`.
    /// @param assetId The asset id.
    /// @param from The previous owner.
    /// @param to The new owner.
    /// @param reason `"DIRECT"` or `"SETTLEMENT"`.
    event OwnershipTransferred(uint256 indexed assetId, address indexed from, address indexed to, bytes32 reason);

    /// @notice Emitted when a proposed transfer is abandoned before acceptance.
    /// @param assetId The asset id.
    /// @param cancelledBy The account that cancelled it.
    event OwnershipTransferCancelled(uint256 indexed assetId, address indexed cancelledBy);

    /// @notice Emitted when an asset is locked for, or released from, settlement.
    /// @param assetId The asset id.
    /// @param lockedBy The settlement contract taking the lock, or zero on release.
    /// @param by The account that changed the lock.
    event TransferLockChanged(uint256 indexed assetId, address indexed lockedBy, address indexed by);

    /// @notice Emitted when an asset's transferability is frozen.
    /// @dev Mirrors a terminal status in `AssetRegistry` (`INV-OWN-06`).
    /// @param assetId The asset id.
    event TransferFrozen(uint256 indexed assetId);

    /// @notice Emitted when a frozen asset is returned to a transferable state.
    /// @dev Reachable only through `AssetRegistry`, either when an owner returns a
    ///      `RETIRED` asset to service or when a timelocked admin corrects an
    ///      erroneous terminal status.
    /// @param assetId The asset id.
    event TransferUnfrozen(uint256 indexed assetId);

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when an asset has no ownership record.
    /// @param assetId The offending id.
    error OwnershipNotFound(uint256 assetId);

    /// @notice Thrown when an ownership record already exists for an id.
    /// @param assetId The offending id.
    error OwnershipAlreadyInitialized(uint256 assetId);

    /// @notice Thrown when the caller is not the asset's owner.
    /// @param assetId The asset id.
    /// @param caller The unauthorized caller.
    /// @param owner The actual owner.
    error NotAssetOwner(uint256 assetId, address caller, address owner);

    /// @notice Thrown when accepting or cancelling a transfer that was never proposed.
    /// @param assetId The asset id.
    error NoPendingTransfer(uint256 assetId);

    /// @notice Thrown when the caller is not the proposed incoming owner.
    /// @param assetId The asset id.
    /// @param caller The unauthorized caller.
    /// @param pendingOwner The address that may accept.
    error NotPendingOwner(uint256 assetId, address caller, address pendingOwner);

    /// @notice Thrown when a transfer targets the current owner.
    /// @param assetId The asset id.
    error TransferToCurrentOwner(uint256 assetId);

    /// @notice Thrown when accepting a transfer offer whose deadline has passed.
    /// @param assetId The asset id.
    /// @param expiresAt The deadline that passed.
    error TransferOfferExpired(uint256 assetId, uint40 expiresAt);

    /// @notice Thrown when an action is blocked by a settlement lock.
    /// @dev A funded escrow locks the asset so the seller cannot transfer it away
    ///      from under the buyer. See `docs/threat-model.md` T-05.
    /// @param assetId The asset id.
    /// @param lockedBy The settlement contract holding the lock.
    error AssetTransferLocked(uint256 assetId, address lockedBy);

    /// @notice Thrown when locking an asset that is already locked by someone else.
    /// @param assetId The asset id.
    /// @param lockedBy The settlement contract already holding the lock.
    error AssetAlreadyLocked(uint256 assetId, address lockedBy);

    /// @notice Thrown when releasing or settling under a lock the caller does not hold.
    /// @dev The core of the T-04 mitigation: an escrow may only settle an asset it
    ///      itself locked, so holding `SETTLEMENT_ROLE` alone is not sufficient.
    /// @param assetId The asset id.
    /// @param caller The account attempting the action.
    /// @param lockedBy The settlement contract that actually holds the lock.
    error NotLockHolder(uint256 assetId, address caller, address lockedBy);

    /// @notice Thrown when an asset's transfers are frozen by a terminal status.
    /// @param assetId The asset id.
    error AssetTransferFrozen(uint256 assetId);

    /// @notice Thrown when a settlement names an owner that is no longer current.
    /// @dev Closes the "sell it twice" race: settlement asserts who it believes owns
    ///      the asset and fails loudly if that changed. See `docs/threat-model.md` T-05.
    /// @param assetId The asset id.
    /// @param expectedOwner The owner the settlement expected.
    /// @param actualOwner The current owner.
    error UnexpectedOwner(uint256 assetId, address expectedOwner, address actualOwner);

    /*//////////////////////////////////////////////////////////////
                          PROTOCOL-INTERNAL WRITES
    //////////////////////////////////////////////////////////////*/

    /// @notice Creates the ownership record for a newly registered asset.
    /// @dev Callable **only** by the address registered as `ASSET_REGISTRY`. This is
    ///      the single downward call that makes registration and ownership creation
    ///      atomic, which is what makes `INV-OWN-01` (every asset has exactly one
    ///      non-zero owner) hold with no window.
    /// @param assetId The newly minted asset id.
    /// @param owner The initial owner. Must be non-zero.
    function initializeOwnership(uint256 assetId, address owner) external;

    /// @notice Freezes an asset's transferability.
    /// @dev Callable **only** by the address registered as `ASSET_REGISTRY`, which
    ///      calls it in the same transaction as the terminal status change that caused
    ///      it. The mirror exists so this module never reads upward into
    ///      `AssetRegistry`.
    /// @param assetId The asset id.
    function freezeTransfers(uint256 assetId) external;

    /// @notice Returns a frozen asset to a transferable state.
    /// @dev Callable **only** by `ASSET_REGISTRY`, in the same transaction as the
    ///      status change that justifies it, so the mirror cannot drift.
    ///
    ///      This exists because an irreversible freeze reachable by one unprivileged
    ///      transaction is a larger risk than a recoverable one. `RETIRED` is a
    ///      reversible real-world state — stored airframes return to service — and an
    ///      erroneous `DESTROYED` would otherwise permanently orphan an asset's entire
    ///      provenance chain with no recourse for anyone, including the timelock.
    /// @param assetId The asset id.
    function unfreezeTransfers(uint256 assetId) external;

    /*//////////////////////////////////////////////////////////////
                             DIRECT TRANSFER
    //////////////////////////////////////////////////////////////*/

    /// @notice Proposes a direct transfer of an asset to a new owner.
    /// @dev Step one of two. A one-step push would let anyone be handed an aircraft
    ///      record they never acknowledged, and a mistyped address would destroy the
    ///      record permanently.
    /// @param assetId The asset id.
    /// @param to The proposed owner. Must be non-zero and not the current owner.
    /// @param expiresAt Acceptance deadline, or 0 for none. If non-zero it must be
    ///        strictly in the future.
    function initiateTransfer(uint256 assetId, address to, uint40 expiresAt) external;

    /// @notice Accepts a proposed direct transfer.
    /// @dev Step two of two. Callable only by the proposed incoming owner.
    /// @param assetId The asset id.
    function acceptTransfer(uint256 assetId) external;

    /// @notice Abandons a proposed direct transfer.
    /// @dev Callable by the current owner or the proposed incoming owner.
    /// @param assetId The asset id.
    function cancelTransfer(uint256 assetId) external;

    /*//////////////////////////////////////////////////////////////
                                SETTLEMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice Locks an asset for settlement, or releases a lock the caller holds.
    /// @dev Restricted to `SETTLEMENT_ROLE`. Taking a lock records the caller as its
    ///      holder; releasing requires the caller to be that holder. Locking clears
    ///      any in-flight direct transfer, so a seller cannot leave a pending offer
    ///      armed to fire the moment settlement releases.
    /// @param assetId The asset id.
    /// @param locked True to take the lock, false to release it.
    function setTransferLock(uint256 assetId, bool locked) external;

    /// @notice Moves ownership as the final step of an escrow settlement.
    /// @dev Restricted to `SETTLEMENT_ROLE` **and** to the contract currently holding
    ///      the asset's lock. Holding the role alone is not sufficient — see
    ///      `docs/threat-model.md` T-04. The lock is released as part of the transfer.
    /// @param assetId The asset id.
    /// @param from The owner the caller believes holds the asset. Must be current.
    /// @param to The buyer receiving the asset. Must be non-zero.
    function settleTransfer(uint256 assetId, address from, address to) external;

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the current owner of an asset.
    /// @param assetId The asset id.
    /// @return The owner, or `address(0)` if no record exists.
    function ownerOf(uint256 assetId) external view returns (address);

    /// @notice Reverts unless `account` owns the asset.
    /// @param assetId The asset id.
    /// @param account The account to check.
    function requireOwner(uint256 assetId, address account) external view;

    /// @notice Returns the full ownership record.
    /// @param assetId The asset id.
    /// @return The ownership record.
    function getOwnership(uint256 assetId) external view returns (OwnershipRecord memory);

    /// @notice Returns the settlement contract holding an asset's lock.
    /// @param assetId The asset id.
    /// @return The lock holder, or `address(0)` if unlocked.
    function lockHolderOf(uint256 assetId) external view returns (address);

    /// @notice Reports whether an asset can currently begin a transfer.
    /// @param assetId The asset id.
    /// @return True if the asset exists, is unlocked and is not frozen.
    function isTransferable(uint256 assetId) external view returns (bool);
}
