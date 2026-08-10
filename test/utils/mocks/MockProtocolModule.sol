// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProtocolModuleUpgradeable} from "../../../src/core/ProtocolModuleUpgradeable.sol";

/// @title MockProtocolModule
/// @author AeroAsset Protocol
/// @notice Minimal concrete {ProtocolModuleUpgradeable} used to test the shared base
///         in isolation from any particular registry's business logic.
/// @dev Exposes the base's `internal` helpers so peer resolution and role gating can
///      be exercised directly. Phases 2-6 rely on both, so covering them here means a
///      regression in the base surfaces against this suite rather than as a confusing
///      failure inside whichever registry happens to use it next.
contract MockProtocolModule is ProtocolModuleUpgradeable {
    /// @notice Initializes the mock behind a proxy.
    /// @param roleManager_ The protocol `RoleManager`.
    /// @param addressRegistry_ The protocol `ProtocolAddressRegistry`.
    function initialize(address roleManager_, address addressRegistry_) external initializer {
        __ProtocolModule_init(roleManager_, addressRegistry_);
    }

    /// @notice Exposes {ProtocolModuleUpgradeable-_resolve}.
    /// @param key The address-registry key to resolve.
    /// @return The peer module's current address.
    function resolve(bytes32 key) external view returns (address) {
        return _resolve(key);
    }

    /// @notice A role-gated no-op used to exercise the `onlyRole` modifier.
    /// @param role The role required to call.
    /// @return Always true when the caller is authorized.
    function guarded(bytes32 role) external view onlyRole(role) returns (bool) {
        return true;
    }

    /// @notice A pause-gated no-op used to exercise `whenNotPaused` on the base.
    /// @return Always true while the module is unpaused.
    function guardedByPause() external view whenNotPaused returns (bool) {
        return true;
    }
}
