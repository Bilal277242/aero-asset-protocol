// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IFeeManager
/// @author AeroAsset Protocol
/// @notice Interface for the protocol's centralized fee configuration and calculation.
/// @dev Layer L4, immutable. **This contract never holds, receives or moves tokens.**
///      It answers "how much is the fee" and "where does it go"; the escrow performs
///      the transfer. A fee module with no custody has no drain risk and no reentrancy
///      surface, which is worth more than the convenience of routing funds through it.
interface IFeeManager {
    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a fee rate changes.
    /// @param feeType The fee category.
    /// @param oldBps The previous rate in basis points.
    /// @param newBps The new rate in basis points.
    event FeeBpsChanged(bytes32 indexed feeType, uint16 oldBps, uint16 newBps);

    /// @notice Emitted when the treasury address changes.
    /// @param oldTreasury The previous treasury.
    /// @param newTreasury The new treasury.
    event TreasuryChanged(address indexed oldTreasury, address indexed newTreasury);

    /// @notice Emitted when a settlement token is allowed or disallowed.
    /// @param token The token address.
    /// @param allowed True when the token becomes usable for settlement.
    event TokenAllowanceChanged(address indexed token, bool allowed);

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when a proposed fee exceeds the hard-coded maximum.
    /// @dev `MAX_FEE_BPS` is a `constant`, and this contract is not upgradeable, so
    ///      there is no path by which the protocol can ever charge more.
    /// @param requested The rejected rate.
    /// @param maximum The hard cap.
    error FeeExceedsMaximum(uint16 requested, uint16 maximum);

    /// @notice Thrown when a settlement token is not on the allowlist.
    /// @param token The offending token.
    error TokenNotAllowed(address token);

    /*//////////////////////////////////////////////////////////////
                                FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the fee rate for a category.
    /// @dev Restricted to `FEE_MANAGER_ROLE`. Capped by `MAX_FEE_BPS`.
    /// @param feeType The fee category.
    /// @param newBps The new rate in basis points.
    function setFeeBps(bytes32 feeType, uint16 newBps) external;

    /// @notice Sets the address that receives protocol fees.
    /// @dev Restricted to `FEE_MANAGER_ROLE`. Must be non-zero.
    /// @param newTreasury The new treasury address.
    function setTreasury(address newTreasury) external;

    /// @notice Adds or removes a settlement token from the allowlist.
    /// @dev Restricted to `PROTOCOL_ADMIN_ROLE`, i.e. timelocked. The allowlist is
    ///      how fee-on-transfer and rebasing tokens are kept out of the protocol
    ///      (`docs/security-model.md` T-A5).
    /// @param token The token address.
    /// @param allowed True to allow, false to disallow.
    function setTokenAllowed(address token, bool allowed) external;

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the fee rate for a category.
    /// @dev An unconfigured category returns 0, meaning no fee. This fails safe: a
    ///      mistyped fee-type constant costs the protocol revenue rather than
    ///      overcharging a user, and `Verify.s.sol` asserts the expected rates
    ///      post-deployment.
    /// @param feeType The fee category.
    /// @return The rate in basis points.
    function feeBps(bytes32 feeType) external view returns (uint16);

    /// @notice Computes the fee owed on an amount.
    /// @dev Rounds **down**, which favours the payer. The caller derives the
    ///      counterparty's proceeds as `amount - fee`, so the two always sum exactly
    ///      to `amount` with no rounding leak in either direction (`INV-ESC-04`).
    /// @param feeType The fee category.
    /// @param amount The gross amount.
    /// @return fee The fee owed.
    function quote(bytes32 feeType, uint256 amount) external view returns (uint256 fee);

    /// @notice Returns the address that receives protocol fees.
    /// @return The treasury address.
    function treasury() external view returns (address);

    /// @notice Reports whether a token may be used for settlement.
    /// @param token The token address.
    /// @return True if the token is allowlisted.
    function isTokenAllowed(address token) external view returns (bool);

    /// @notice Reverts unless a token may be used for settlement.
    /// @param token The token address.
    function requireTokenAllowed(address token) external view;

    /// @notice The hard cap on any fee rate, in basis points.
    /// @return The maximum rate.
    function MAX_FEE_BPS() external view returns (uint16);
}
