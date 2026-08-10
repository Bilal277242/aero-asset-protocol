// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ValueTooLarge} from "./ProtocolErrors.sol";

/// @title ProtocolCast
/// @author AeroAsset Protocol
/// @notice Checked narrowing casts used at the boundary between the protocol's
///         `uint256` public API and its packed storage representation.
/// @dev The protocol deliberately exposes `uint256` identifiers while storing them as
///      `uint64`, and exposes `uint256` timestamps while storing `uint40`
///      (`docs/asset-model.md` §0). That split is only safe if every narrowing write
///      reverts rather than truncating — a silently truncated id would alias an
///      unrelated record.
///
///      OpenZeppelin's `SafeCast` does the same job but reverts with its own error
///      type. These helpers revert with the protocol's `ValueTooLarge`, so every
///      failure in the protocol decodes uniformly in a trace.
library ProtocolCast {
    /// @notice Narrows a `uint256` to `uint64`, reverting on overflow.
    /// @param value The value to narrow.
    /// @return The value as a `uint64`.
    function toUint64(uint256 value) internal pure returns (uint64) {
        if (value > type(uint64).max) {
            revert ValueTooLarge(value, type(uint64).max);
        }
        // Safe: the guard above rejects every value that would truncate. Suppressing
        // here rather than at each call site is the point of this library existing.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(value);
    }

    /// @notice Narrows a `uint256` to `uint40`, reverting on overflow.
    /// @param value The value to narrow.
    /// @return The value as a `uint40`.
    function toUint40(uint256 value) internal pure returns (uint40) {
        if (value > type(uint40).max) {
            revert ValueTooLarge(value, type(uint40).max);
        }
        // Safe: the guard above rejects every value that would truncate.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint40(value);
    }
}
