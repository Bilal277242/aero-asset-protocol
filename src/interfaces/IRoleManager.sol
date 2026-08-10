// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/IAccessControlEnumerable.sol";

/// @title IRoleManager
/// @author AeroAsset Protocol
/// @notice Interface for the protocol's single authorization authority.
/// @dev Modules depend on this interface rather than on the concrete {RoleManager} so
///      the authority can be replaced during a migration without recompiling every
///      consumer. Consumers should call {hasRole} and revert with their own
///      `MissingRole` error, which keeps revert formatting uniform across the protocol.
interface IRoleManager is IAccessControlEnumerable {
    /// @notice Reverts unless `account` holds `role`.
    /// @dev Convenience for callers that would otherwise branch on {hasRole}. Uses the
    ///      protocol's `MissingRole(bytes32,address)` error, not OpenZeppelin's
    ///      `AccessControlUnauthorizedAccount`, so every authorization failure in the
    ///      protocol decodes identically in a trace.
    /// @param role The role identifier required.
    /// @param account The account to check.
    function checkRole(bytes32 role, address account) external view;
}
