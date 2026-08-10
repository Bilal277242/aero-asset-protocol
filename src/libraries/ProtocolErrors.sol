// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Thrown when an address argument that must be non-zero is `address(0)`.
error ZeroAddress();

/// @notice Thrown when a `bytes32` hash argument that must be non-zero is `bytes32(0)`.
/// @dev A zero hash is indistinguishable from an unset storage slot, so it is never a
///      valid commitment anywhere in the protocol.
error ZeroHash();

/// @notice Thrown when an identifier is outside the valid range `1..count`.
/// @param id The offending identifier.
error InvalidId(uint256 id);

/// @notice Thrown when `account` lacks the role required to perform an action.
/// @dev Names the requirement rather than the caller's current roles, so an operator
///      reading a failed transaction learns exactly what must be granted.
/// @param role The `RoleManager` role identifier that was required.
/// @param account The caller that lacked it.
error MissingRole(bytes32 role, address account);

/// @notice Thrown when a value exceeds the width of the packed storage field it targets.
/// @dev Raised by the protocol's `SafeCast` boundaries. Reverting rather than
///      truncating is what makes the `uint256` public API and `uint64` storage
///      representation safe to mix. See `docs/asset-model.md` §0.
/// @param value The value that could not be narrowed.
/// @param max The maximum representable value for the target field.
error ValueTooLarge(uint256 value, uint256 max);

/// @notice Thrown when a required `ProtocolAddressRegistry` entry has never been set.
/// @param key The address-registry key that resolved to `address(0)`.
error AddressNotRegistered(bytes32 key);

/// @notice Thrown when a function restricted to one specific contract is called by another.
/// @dev Used for contract-to-contract authorization that is resolved through the
///      address registry rather than through a role.
/// @param expected The only address permitted to make the call.
/// @param actual The address that actually made it.
error UnexpectedCaller(address expected, address actual);
