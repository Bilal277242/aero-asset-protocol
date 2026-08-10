// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IProtocolAddressRegistry} from "../interfaces/IProtocolAddressRegistry.sol";
import {IRoleManager} from "../interfaces/IRoleManager.sol";
import {MissingRole, ZeroAddress} from "../libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../libraries/ProtocolRoles.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/// @title ProtocolModuleUpgradeable
/// @author AeroAsset Protocol
/// @notice Shared base for every UUPS-upgradeable AeroAsset registry.
/// @dev Provides the four things every registry needs and none of them should
///      re-implement: role checks against the central {RoleManager}, peer resolution
///      through {ProtocolAddressRegistry}, an asymmetric pause, and an upgrade
///      authorization hook.
///
///      Storage uses ERC-7201 namespacing (`docs/storage-model.md` §1). Sequential
///      layout plus `__gap` arrays is a *convention* that fails silently when someone
///      inserts a variable or changes an inheritance order; a namespace cannot
///      collide with another namespace, so the failure mode is removed rather than
///      merely tested for.
///
///      No meta-transaction support in V1: `msg.sender` is used directly rather than
///      `_msgSender()`. The two are identical without an ERC-2771 forwarder, and
///      using one consistently avoids the appearance of trusted-forwarder support
///      that does not exist.
abstract contract ProtocolModuleUpgradeable is Initializable, UUPSUpgradeable, PausableUpgradeable {
    /// @notice Storage shared by every protocol module.
    /// @dev The role manager is cached here rather than resolved through the address
    ///      registry on each check. Replacing the role manager is a protocol
    ///      migration, not a routine rotation — roles are revoked *within* it — so
    ///      caching costs no freshness while saving an external call on every
    ///      authorized call. Peer *module* addresses are re-read every time instead,
    ///      because those genuinely do rotate. See `docs/security-model.md` §4.
    /// @param roleManager The protocol's authorization authority.
    /// @param addressRegistry The protocol's address book.
    /// @custom:storage-location erc7201:aeroasset.storage.ProtocolModule
    struct ProtocolModuleStorage {
        IRoleManager roleManager;
        IProtocolAddressRegistry addressRegistry;
    }

    /// @dev `keccak256(abi.encode(uint256(keccak256("aeroasset.storage.ProtocolModule")) - 1))
    ///      & ~bytes32(uint256(0xff))`. Asserted against the formula in
    ///      `test/upgrade/Namespaces.t.sol`, because a mistyped namespace constant is
    ///      invisible at runtime — the contract simply reads a different slot.
    bytes32 private constant _PROTOCOL_MODULE_STORAGE =
        0x8787ad5fe0309ff52ffc38ce5283f84786d4376351e84951d55874e9d1219a00;

    /// @notice Restricts a function to holders of `role` in the central role manager.
    /// @param role The required role identifier.
    modifier onlyRole(bytes32 role) {
        _checkRole(role, msg.sender);
        _;
    }

    /// @notice Disables initializers on the implementation contract.
    /// @dev An uninitialized UUPS implementation can be initialized by anyone and then
    ///      upgraded to arbitrary code — see `docs/threat-model.md` T-10. Placing this
    ///      in the shared base means every registry inherits the protection rather
    ///      than relying on each author remembering it;
    ///      `test/upgrade/InitializerProtection.t.sol` asserts it per implementation.
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the shared module state.
    /// @dev Must be called by every derived contract's initializer.
    /// @param roleManager_ The protocol `RoleManager`. Must be non-zero.
    /// @param addressRegistry_ The protocol `ProtocolAddressRegistry`. Must be non-zero.
    // Keeps OpenZeppelin's `__Contract_init` convention for upgradeable initializers,
    // which readers and audit tooling both expect, in preference to the lint's default.
    // forge-lint: disable-next-line(mixed-case-function)
    function __ProtocolModule_init(address roleManager_, address addressRegistry_) internal onlyInitializing {
        if (roleManager_ == address(0) || addressRegistry_ == address(0)) {
            revert ZeroAddress();
        }

        __Pausable_init();

        ProtocolModuleStorage storage $ = _protocolModuleStorage();
        $.roleManager = IRoleManager(roleManager_);
        $.addressRegistry = IProtocolAddressRegistry(addressRegistry_);
    }

    /*//////////////////////////////////////////////////////////////
                                  PAUSE
    //////////////////////////////////////////////////////////////*/

    /// @notice Halts state-changing operations on this module.
    /// @dev Restricted to `PAUSER_ROLE`, which deliberately **cannot** unpause.
    ///      Stopping the protocol during an incident must be fast and low-trust;
    ///      restarting it must be slow and high-trust. See `docs/roles.md` §2.
    function pause() external onlyRole(ProtocolRoles.PAUSER_ROLE) {
        _pause();
    }

    /// @notice Resumes state-changing operations on this module.
    /// @dev Restricted to `PROTOCOL_ADMIN_ROLE`, i.e. timelocked in production.
    function unpause() external onlyRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE) {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the role manager this module authorizes against.
    /// @return The protocol's `RoleManager`.
    function roleManager() public view returns (IRoleManager) {
        return _protocolModuleStorage().roleManager;
    }

    /// @notice Returns the address registry this module resolves peers through.
    /// @return The protocol's `ProtocolAddressRegistry`.
    function addressRegistry() public view returns (IProtocolAddressRegistry) {
        return _protocolModuleStorage().addressRegistry;
    }

    /// @notice Reports whether `account` holds `role`.
    /// @param role The role identifier to test.
    /// @param account The account to test.
    /// @return True if `account` holds `role`.
    function hasRole(bytes32 role, address account) public view returns (bool) {
        return _protocolModuleStorage().roleManager.hasRole(role, account);
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @notice Reverts unless `account` holds `role`.
    /// @param role The required role identifier.
    /// @param account The account to check.
    function _checkRole(bytes32 role, address account) internal view {
        if (!_protocolModuleStorage().roleManager.hasRole(role, account)) {
            revert MissingRole(role, account);
        }
    }

    /// @notice Resolves a peer module address, reverting if it has never been set.
    /// @dev Re-read on every call rather than cached, so a rotated-out module cannot
    ///      retain privileges it should have lost.
    /// @param key The address-registry key to resolve.
    /// @return The peer module's current address.
    function _resolve(bytes32 key) internal view returns (address) {
        return _protocolModuleStorage().addressRegistry.getAddress(key);
    }

    /// @notice Authorizes a UUPS upgrade.
    /// @dev Restricted to `PROTOCOL_ADMIN_ROLE`, which on production networks is held
    ///      only by `ProtocolTimelock`, so every upgrade is delayed and publicly
    ///      observable before it executes.
    /// @param newImplementation The implementation being upgraded to.
    function _authorizeUpgrade(address newImplementation)
        internal
        view
        override
        onlyRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE)
    {
        if (newImplementation == address(0)) {
            revert ZeroAddress();
        }
    }

    /// @notice Returns a pointer to this base contract's ERC-7201 storage struct.
    /// @return $ The shared module storage.
    function _protocolModuleStorage() private pure returns (ProtocolModuleStorage storage $) {
        assembly ("memory-safe") {
            $.slot := _PROTOCOL_MODULE_STORAGE
        }
    }
}
