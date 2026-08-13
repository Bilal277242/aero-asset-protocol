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
///
///      **Scope of the policy** (`docs/storage-model.md` §2), stated here because it was
///      previously inferable only by reading every call site (audit AAP-21):
///
///      - **Caller-supplied values are always cast through this library.** They are the
///        ones an attacker or a mistake can push out of range.
///      - **`block.timestamp` is cast directly and deliberately.** It is not
///        caller-supplied and cannot exceed `uint40` before the year 36812, so a checked
///        cast would add a branch — on registration, transfer and settlement paths — for
///        a condition that cannot arise.
///
///      The practical consequence is that `grep -rn 'uint40('` over `src/` is
///      reviewable: every hit should be `block.timestamp`, and anything else is a bug.
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

    /// @notice Narrows a `uint256` to `uint128`, reverting on overflow.
    /// @dev Used for prices and fee amounts. `uint128` holds 3.4 × 10³⁸ base units —
    ///      far beyond any settlement token's total supply — while letting a price and
    ///      an identifier share a storage slot.
    /// @param value The value to narrow.
    /// @return The value as a `uint128`.
    function toUint128(uint256 value) internal pure returns (uint128) {
        if (value > type(uint128).max) {
            revert ValueTooLarge(value, type(uint128).max);
        }
        // Safe: the guard above rejects every value that would truncate.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint128(value);
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
