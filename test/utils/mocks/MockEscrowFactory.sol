// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IEscrowFactory} from "../../../src/interfaces/IEscrowFactory.sol";
import {IMarketplace} from "../../../src/interfaces/IMarketplace.sol";

/// @title MockEscrow
/// @author AeroAsset Protocol
/// @notice Stand-in for a Phase 7 `Escrow` clone.
/// @dev Holds the frozen trade terms and exposes the two settlement callbacks the
///      marketplace authorizes against. It moves no funds — Phase 6 is about intent,
///      not settlement — so this is deliberately not a fund-holding contract.
contract MockEscrow {
    /// @notice The marketplace that opened this escrow.
    IMarketplace public immutable MARKETPLACE;
    /// @notice The trade terms frozen at acceptance.
    IEscrowFactory.EscrowTerms public terms;

    /// @notice Records the terms and the marketplace to call back into.
    /// @param marketplace The marketplace address.
    /// @param terms_ The frozen trade terms.
    constructor(address marketplace, IEscrowFactory.EscrowTerms memory terms_) {
        MARKETPLACE = IMarketplace(marketplace);
        terms = terms_;
    }

    /// @notice Simulates a released escrow closing out its listing.
    function markSold() external {
        (bool ok, bytes memory data) =
            address(MARKETPLACE).call(abi.encodeWithSignature("markSold(uint256)", terms.listingId));
        if (!ok) {
            _bubble(data);
        }
    }

    /// @notice Simulates a cancelled or refunded escrow detaching from its listing.
    function clearEscrow() external {
        (bool ok, bytes memory data) =
            address(MARKETPLACE).call(abi.encodeWithSignature("clearEscrow(uint256)", terms.listingId));
        if (!ok) {
            _bubble(data);
        }
    }

    /// @notice Re-throws a bubbled revert so tests see the original custom error.
    /// @param data The returned revert data.
    function _bubble(bytes memory data) private pure {
        assembly ("memory-safe") {
            revert(add(data, 0x20), mload(data))
        }
    }
}

/// @title MockEscrowFactory
/// @author AeroAsset Protocol
/// @notice Stand-in for the Phase 7 `EscrowFactory`.
/// @dev Deploys a {MockEscrow} per accepted offer and records it, so Phase 6 can
///      exercise the full acceptance path and both settlement callbacks without the
///      real escrow existing yet. The authorization surface under test — the
///      marketplace requiring the caller to be *this listing's* escrow — is identical
///      to production.
contract MockEscrowFactory is IEscrowFactory {
    /// @notice The marketplace permitted to open escrows.
    address public immutable MARKETPLACE;

    /// @notice Escrows opened so far.
    uint256 public escrowCount;
    /// @notice Deployed escrow by id.
    mapping(uint256 escrowId => address escrow) public escrows;
    /// @notice Terms recorded per escrow id, for assertion in tests.
    mapping(uint256 escrowId => EscrowTerms) internal _terms;

    /// @notice Thrown when a caller other than the marketplace opens an escrow.
    error OnlyMarketplace();

    /// @notice Binds the factory to a marketplace.
    /// @param marketplace The marketplace address.
    constructor(address marketplace) {
        MARKETPLACE = marketplace;
    }

    /// @inheritdoc IEscrowFactory
    function openEscrow(EscrowTerms calldata terms) external returns (uint256 escrowId, address escrow) {
        if (msg.sender != MARKETPLACE) {
            revert OnlyMarketplace();
        }

        escrowId = ++escrowCount;
        escrow = address(new MockEscrow(MARKETPLACE, terms));

        escrows[escrowId] = escrow;
        _terms[escrowId] = terms;
    }

    /// @notice Returns the terms recorded for an escrow.
    /// @param escrowId The escrow id.
    /// @return The frozen trade terms.
    function termsOf(uint256 escrowId) external view returns (EscrowTerms memory) {
        return _terms[escrowId];
    }
}
