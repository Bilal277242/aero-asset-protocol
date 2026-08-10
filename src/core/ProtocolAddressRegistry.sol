// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IProtocolAddressRegistry} from "../interfaces/IProtocolAddressRegistry.sol";
import {IRoleManager} from "../interfaces/IRoleManager.sol";
import {AddressNotRegistered, MissingRole, ZeroAddress} from "../libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../libraries/ProtocolRoles.sol";

/// @title ProtocolAddressRegistry
/// @author AeroAsset Protocol
/// @notice Central address book that every AeroAsset module uses to resolve its peers.
/// @dev Without this indirection, upgrading or redeploying any one module would mean
///      redeploying and re-wiring everything downstream of it. See
///      `docs/architecture.md` §D3.
///
///      Deliberately **not upgradeable**: the contract is a mapping plus an
///      authorization check, and its immutability is what lets every other module
///      treat it as a fixed anchor. The *entries* rotate; the anchor does not.
///
///      There is intentionally no batch setter. A batch would iterate a
///      caller-supplied array, which the protocol's "no unbounded loop in a
///      state-changing function" rule forbids without exception. Deployment scripts
///      call {setAddress} once per key.
contract ProtocolAddressRegistry is IProtocolAddressRegistry {
    /// @notice The authorization authority consulted for every write.
    /// @dev Immutable rather than resolved through this registry itself, which would
    ///      be circular. Replacing the role manager is a protocol migration, not a
    ///      routine rotation — see `docs/security-model.md` §4.
    IRoleManager public immutable ROLE_MANAGER;

    /// @notice Address stored for each registry key.
    /// @dev Public so an operator can read a raw entry without the revert behaviour of
    ///      {getAddress}. Prefer {getAddress} on any path where a missing peer is a bug.
    mapping(bytes32 key => address value) public addresses;

    /// @notice Restricts a function to holders of `PROTOCOL_ADMIN_ROLE`.
    /// @dev Reverts with the protocol's `MissingRole` so every authorization failure
    ///      in the protocol decodes identically in a trace.
    modifier onlyProtocolAdmin() {
        _onlyProtocolAdmin();
        _;
    }

    /// @notice Deploys the address registry bound to a role manager.
    /// @param roleManager The protocol's `RoleManager`. Must be non-zero.
    constructor(address roleManager) {
        if (roleManager == address(0)) {
            revert ZeroAddress();
        }
        ROLE_MANAGER = IRoleManager(roleManager);
    }

    /// @inheritdoc IProtocolAddressRegistry
    function setAddress(bytes32 key, address newAddress) external onlyProtocolAdmin {
        if (newAddress == address(0)) {
            revert ZeroAddress();
        }

        address oldAddress = addresses[key];
        addresses[key] = newAddress;

        emit ProtocolAddressSet(key, oldAddress, newAddress);
    }

    /// @inheritdoc IProtocolAddressRegistry
    function getAddress(bytes32 key) external view returns (address) {
        address value = addresses[key];
        if (value == address(0)) {
            revert AddressNotRegistered(key);
        }
        return value;
    }

    /// @inheritdoc IProtocolAddressRegistry
    function tryGetAddress(bytes32 key) external view returns (address) {
        return addresses[key];
    }

    /// @inheritdoc IProtocolAddressRegistry
    function isRegistered(bytes32 key) external view returns (bool) {
        return addresses[key] != address(0);
    }

    /// @notice Reverts unless the caller holds `PROTOCOL_ADMIN_ROLE`.
    /// @dev Held in a function rather than inline in the modifier so the check is
    ///      emitted once in bytecode instead of being inlined at every call site.
    function _onlyProtocolAdmin() private view {
        if (!ROLE_MANAGER.hasRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE, msg.sender)) {
            revert MissingRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE, msg.sender);
        }
    }
}
