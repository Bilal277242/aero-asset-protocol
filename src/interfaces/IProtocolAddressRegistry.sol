// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IProtocolAddressRegistry
/// @author AeroAsset Protocol
/// @notice Interface for the protocol's central address book.
/// @dev See `docs/architecture.md` §D3. Modules resolve peers through this registry
///      instead of storing hardcoded addresses.
interface IProtocolAddressRegistry {
    /// @notice Emitted whenever a key's address is set or rotated.
    /// @dev Both the previous and the new address are emitted so a monitoring system
    ///      can detect an unexpected rotation without holding prior state.
    /// @param key The address-registry key that changed.
    /// @param oldAddress The address previously stored, or `address(0)` if unset.
    /// @param newAddress The address now stored.
    event ProtocolAddressSet(bytes32 indexed key, address indexed oldAddress, address indexed newAddress);

    /// @notice Sets or rotates the address stored for `key`.
    /// @dev Restricted to `PROTOCOL_ADMIN_ROLE`, i.e. timelocked in production.
    ///      `newAddress` must be non-zero: clearing an entry would silently brick every
    ///      module that resolves it, so rotation is supported and deletion is not.
    /// @param key The address-registry key to write.
    /// @param newAddress The address to store. Must be non-zero.
    function setAddress(bytes32 key, address newAddress) external;

    /// @notice Resolves `key`, reverting if it has never been set.
    /// @dev Use this on any path where a missing peer is a bug. Reverting with
    ///      `AddressNotRegistered` names the missing key, which turns a
    ///      misconfigured deployment into a diagnosable failure rather than an
    ///      inscrutable call to `address(0)`.
    /// @param key The address-registry key to resolve.
    /// @return The address stored for `key`.
    function getAddress(bytes32 key) external view returns (address);

    /// @notice Resolves `key`, returning `address(0)` if it has never been set.
    /// @dev Use this only where absence is a legitimate, handled state.
    /// @param key The address-registry key to resolve.
    /// @return The address stored for `key`, or `address(0)`.
    function tryGetAddress(bytes32 key) external view returns (address);

    /// @notice Reports whether `key` currently resolves to a non-zero address.
    /// @param key The address-registry key to test.
    /// @return True if an address is registered for `key`.
    function isRegistered(bytes32 key) external view returns (bool);
}
