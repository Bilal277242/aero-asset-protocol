// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IRoleManager} from "../interfaces/IRoleManager.sol";
import {MissingRole, ZeroAddress} from "../libraries/ProtocolErrors.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";

/// @title RoleManager
/// @author AeroAsset Protocol
/// @notice The single authorization authority for the entire AeroAsset Protocol.
/// @dev Every module queries this contract rather than inheriting its own
///      `AccessControl`. With sixteen contracts, per-contract role state would mean
///      sixteen places to audit, sixteen places to rotate a compromised key, and a
///      real chance of drift between them. One instance means one revocation path.
///      `Ownable` is not used anywhere in the protocol. See `docs/architecture.md` §D4.
///
///      This contract is deliberately **not upgradeable**. Immutability is itself a
///      security property for the contract that gates all other authorization: it
///      removes the admin key from the threat model for authorization logic entirely.
///
///      `DEFAULT_ADMIN_ROLE` is the admin of every other role and is held only by
///      `ProtocolTimelock`, so every grant and revoke — including revoking a
///      compromised verifier — passes through the timelock delay and is publicly
///      visible before it takes effect. See `docs/roles.md`.
contract RoleManager is AccessControlEnumerable, IRoleManager {
    /// @notice Thrown when a revocation would leave the protocol with no admin.
    /// @dev Removing the last `DEFAULT_ADMIN_ROLE` member would permanently freeze
    ///      every upgrade, every role change and every unpause, with no recovery path.
    ///      OpenZeppelin permits it; this protocol does not.
    error LastProtocolAdmin();

    /// @notice Thrown when re-administering `DEFAULT_ADMIN_ROLE` is attempted.
    /// @dev It must remain self-administered, or the timelock could be routed around.
    error CannotReadministerDefaultAdmin();

    /// @notice Deploys the role manager and seeds the initial protocol admin.
    /// @dev `initialAdmin` should be `ProtocolTimelock` in production. A deployment
    ///      script may temporarily seed a deployer EOA, but must transfer to the
    ///      timelock and renounce before the deployment is considered valid —
    ///      `Verify.s.sol` asserts `getRoleMemberCount(DEFAULT_ADMIN_ROLE) == 1` and
    ///      that the sole member is the timelock (`INV-SYS-01`).
    /// @param initialAdmin The account granted `DEFAULT_ADMIN_ROLE`. Must be non-zero.
    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) {
            revert ZeroAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
    }

    /// @inheritdoc IRoleManager
    function checkRole(bytes32 role, address account) external view {
        if (!hasRole(role, account)) {
            revert MissingRole(role, account);
        }
    }

    /// @notice Narrows which role may grant and revoke `role`.
    /// @dev Restricted to `DEFAULT_ADMIN_ROLE`, i.e. the timelock. Exists so a
    ///      protocol contract can administer exactly one role without being handed
    ///      `DEFAULT_ADMIN_ROLE`: `EscrowFactory` must grant `SETTLEMENT_ROLE` to each
    ///      clone it deploys, and granting requires holding that role's admin. Scoping
    ///      the admin to `ESCROW_FACTORY_ROLE` gives the factory that one power and
    ///      nothing else.
    ///
    ///      `DEFAULT_ADMIN_ROLE` itself cannot be re-administered — allowing that
    ///      would let the timelock be routed around, which the last-admin protection
    ///      exists to prevent.
    /// @param role The role whose admin is being changed.
    /// @param adminRole The role that will administer it.
    function setRoleAdmin(bytes32 role, bytes32 adminRole) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (role == DEFAULT_ADMIN_ROLE) {
            revert CannotReadministerDefaultAdmin();
        }

        _setRoleAdmin(role, adminRole);
    }

    /// @notice Removes `role` from `account`, refusing to remove the final admin.
    /// @dev Overrides the OpenZeppelin internal so the guard applies uniformly to
    ///      `revokeRole` and `renounceRole` alike — guarding only the external
    ///      `revokeRole` would leave `renounceRole` as an open path to the same
    ///      unrecoverable state.
    /// @param role The role being removed.
    /// @param account The account losing the role.
    /// @return True if the account held the role and it was removed.
    function _revokeRole(bytes32 role, address account) internal override(AccessControlEnumerable) returns (bool) {
        if (role == DEFAULT_ADMIN_ROLE && hasRole(role, account) && getRoleMemberCount(role) == 1) {
            revert LastProtocolAdmin();
        }
        return super._revokeRole(role, account);
    }
}
