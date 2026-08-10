// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @author AeroAsset Protocol
/// @notice A well-behaved ERC-20 standing in for the settlement token.
/// @dev Six decimals, matching USDC — the protocol's expected default. Tests that
///      exercise misbehaving tokens (fee-on-transfer, returns-false, reentrant) get
///      their own dedicated mocks in Phase 7, where funds actually move.
contract MockERC20 is ERC20 {
    /// @notice Deploys the token.
    /// @param name_ Token name.
    /// @param symbol_ Token symbol.
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    /// @notice Returns the token's decimals.
    /// @return Always 6, matching USDC.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mints tokens to an account.
    /// @dev Unrestricted; this is a test fixture, never deployed to a real network.
    /// @param to The recipient.
    /// @param amount The amount to mint.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
