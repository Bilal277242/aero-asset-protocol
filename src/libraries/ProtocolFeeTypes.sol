// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ProtocolFeeTypes
/// @author AeroAsset Protocol
/// @notice Canonical fee-category identifiers recognised by {FeeManager}.
/// @dev Shared so the module charging a fee and the module configuring it reference
///      one constant. An unconfigured category quotes zero, so a mismatch would cost
///      the protocol revenue silently rather than overcharging a user — but it would
///      still be a bug, and a single source removes the possibility.
library ProtocolFeeTypes {
    /// @notice Fee applied to a marketplace settlement, charged on the sale price.
    /// @dev The only category charged in V1. Roadmap §23's registration, verification
    ///      and subscription fees are deferred: no Phase 1-5 contract charges a fee,
    ///      and adding one would have meant reopening a completed phase.
    bytes32 internal constant MARKETPLACE = keccak256("aeroasset.fee.MARKETPLACE");
}
