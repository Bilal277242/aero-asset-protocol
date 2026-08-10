// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IFeeManager} from "../interfaces/IFeeManager.sol";
import {IRoleManager} from "../interfaces/IRoleManager.sol";
import {MissingRole, ZeroAddress} from "../libraries/ProtocolErrors.sol";
import {ProtocolFeeTypes} from "../libraries/ProtocolFeeTypes.sol";
import {ProtocolRoles} from "../libraries/ProtocolRoles.sol";

/// @title FeeManager
/// @author AeroAsset Protocol
/// @notice Centralized fee configuration and calculation for the protocol.
/// @dev Layer L4, deliberately **not upgradeable**. Two properties follow from that
///      and are the reason for it:
///
///      1. `MAX_FEE_BPS` is a `constant` in immutable code, so no admin action and no
///         upgrade can ever make the protocol charge more than the published cap
///         (`INV-FEE-01`).
///      2. This contract **never holds, receives or moves tokens**. It answers how
///         much the fee is and where it goes; the escrow performs the transfer. A fee
///         module with no custody has no drain risk and no reentrancy surface at all,
///         which is worth more than the convenience of routing funds through it.
///
///      Fee rates live in ordinary sequential storage — there is no upgrade to stay
///      layout-compatible with.
contract FeeManager is IFeeManager {
    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Basis-point denominator.
    uint16 internal constant BPS_DENOMINATOR = 10_000;

    /// @inheritdoc IFeeManager
    /// @dev 10%. A hard ceiling, not an expected rate — real marketplace fees are
    ///      expected to sit well under 1% of an aircraft's value. It exists so a
    ///      compromised `FEE_MANAGER_ROLE` cannot set a confiscatory rate.
    uint16 public constant MAX_FEE_BPS = 1000;

    /// @notice Fee category applied to marketplace settlements.
    /// @dev Re-exported from {ProtocolFeeTypes} so operators can read it off the
    ///      deployed contract; the library remains the single definition.
    bytes32 public constant FEE_TYPE_MARKETPLACE = ProtocolFeeTypes.MARKETPLACE;

    /*//////////////////////////////////////////////////////////////
                                  STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice The authorization authority consulted for every write.
    IRoleManager public immutable ROLE_MANAGER;

    /// @notice Fee rate in basis points, by category.
    /// @dev Unconfigured categories read 0, meaning no fee. See {feeBps}.
    mapping(bytes32 feeType => uint16 bps) private _feeBps;

    /// @notice The address that receives protocol fees.
    address private _treasury;

    /// @notice Settlement-token allowlist.
    mapping(address token => bool allowed) private _allowedTokens;

    /*//////////////////////////////////////////////////////////////
                                MODIFIERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Restricts a function to holders of `role`.
    /// @param role The required role identifier.
    modifier onlyRole(bytes32 role) {
        _checkRole(role);
        _;
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the fee manager.
    /// @param roleManager The protocol `RoleManager`. Must be non-zero.
    /// @param initialTreasury The initial fee recipient. Must be non-zero.
    constructor(address roleManager, address initialTreasury) {
        if (roleManager == address(0) || initialTreasury == address(0)) {
            revert ZeroAddress();
        }

        ROLE_MANAGER = IRoleManager(roleManager);
        _treasury = initialTreasury;

        emit TreasuryChanged(address(0), initialTreasury);
    }

    /*//////////////////////////////////////////////////////////////
                              CONFIGURATION
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IFeeManager
    function setFeeBps(bytes32 feeType, uint16 newBps) external onlyRole(ProtocolRoles.FEE_MANAGER_ROLE) {
        if (newBps > MAX_FEE_BPS) {
            revert FeeExceedsMaximum(newBps, MAX_FEE_BPS);
        }

        uint16 oldBps = _feeBps[feeType];
        _feeBps[feeType] = newBps;

        emit FeeBpsChanged(feeType, oldBps, newBps);
    }

    /// @inheritdoc IFeeManager
    function setTreasury(address newTreasury) external onlyRole(ProtocolRoles.FEE_MANAGER_ROLE) {
        if (newTreasury == address(0)) {
            revert ZeroAddress();
        }

        address oldTreasury = _treasury;
        _treasury = newTreasury;

        emit TreasuryChanged(oldTreasury, newTreasury);
    }

    /// @inheritdoc IFeeManager
    function setTokenAllowed(address token, bool allowed) external onlyRole(ProtocolRoles.PROTOCOL_ADMIN_ROLE) {
        if (token == address(0)) {
            revert ZeroAddress();
        }

        _allowedTokens[token] = allowed;

        emit TokenAllowanceChanged(token, allowed);
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IFeeManager
    function feeBps(bytes32 feeType) public view returns (uint16) {
        return _feeBps[feeType];
    }

    /// @inheritdoc IFeeManager
    function quote(bytes32 feeType, uint256 amount) external view returns (uint256 fee) {
        // Rounds down. The caller derives proceeds as `amount - fee`, so the two sum
        // to exactly `amount` and no dust is created or destroyed.
        fee = (amount * _feeBps[feeType]) / BPS_DENOMINATOR;
    }

    /// @inheritdoc IFeeManager
    function treasury() external view returns (address) {
        return _treasury;
    }

    /// @inheritdoc IFeeManager
    function isTokenAllowed(address token) public view returns (bool) {
        return _allowedTokens[token];
    }

    /// @inheritdoc IFeeManager
    function requireTokenAllowed(address token) external view {
        if (!_allowedTokens[token]) {
            revert TokenNotAllowed(token);
        }
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @notice Reverts unless the caller holds `role`.
    /// @dev Held in a function rather than inline in the modifier so the check is
    ///      emitted once in bytecode instead of at every call site.
    /// @param role The required role identifier.
    function _checkRole(bytes32 role) private view {
        if (!ROLE_MANAGER.hasRole(role, msg.sender)) {
            revert MissingRole(role, msg.sender);
        }
    }
}
