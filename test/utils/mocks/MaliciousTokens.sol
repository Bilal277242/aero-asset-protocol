// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IEscrow} from "../../../src/interfaces/IEscrow.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title FeeOnTransferToken
/// @author AeroAsset Protocol
/// @notice A token that silently delivers less than it was asked to transfer.
/// @dev The exact class of token `docs/threat-model.md` T-08 covers. The allowlist is
///      meant to keep these out, but the escrow must fail loudly rather than trust
///      that policy — this mock proves the measured balance delta does that.
contract FeeOnTransferToken is ERC20 {
    /// @notice Proportion of every transfer burned in transit, in basis points.
    uint256 public constant TRANSFER_FEE_BPS = 100;

    /// @notice Deploys the token.
    constructor() ERC20("Fee On Transfer", "FOT") {}

    /// @notice Mints tokens to an account.
    /// @param to The recipient.
    /// @param amount The amount to mint.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Moves tokens, burning a slice in transit.
    /// @param from The sender.
    /// @param to The recipient.
    /// @param value The requested amount.
    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }

        uint256 fee = (value * TRANSFER_FEE_BPS) / 10_000;
        super._update(from, to, value - fee);
        super._update(from, address(0), fee);
    }
}

/// @title ReturnsFalseToken
/// @author AeroAsset Protocol
/// @notice A token whose `transfer` returns `false` instead of reverting.
/// @dev `SafeERC20` must turn this into a revert. A bare `token.transfer(...)` would
///      ignore it and continue as though the seller had been paid.
contract ReturnsFalseToken is ERC20 {
    /// @notice When true, `transfer` reports failure without reverting.
    bool public failTransfers;

    /// @notice Deploys the token.
    constructor() ERC20("Returns False", "RFT") {}

    /// @notice Mints tokens to an account.
    /// @param to The recipient.
    /// @param amount The amount to mint.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Arms or disarms the silent-failure behaviour.
    /// @param fail True to make transfers report failure.
    function setFailTransfers(bool fail) external {
        failTransfers = fail;
    }

    /// @notice Moves tokens, or silently reports failure when armed.
    /// @param to The recipient.
    /// @param value The amount.
    /// @return True on success, false when armed to fail.
    function transfer(address to, uint256 value) public override returns (bool) {
        if (failTransfers) {
            return false;
        }
        return super.transfer(to, value);
    }
}

/// @title ReentrantToken
/// @author AeroAsset Protocol
/// @notice A token that calls back into the escrow during a transfer.
/// @dev Models an ERC-777-style callback or a malicious allowlisted token. The escrow
///      must be safe against this twice over: its status is already terminal before
///      any transfer, and `ReentrancyGuardTransient` is a second independent layer.
contract ReentrantToken is ERC20 {
    /// @notice The escrow to re-enter.
    IEscrow public target;
    /// @notice Which escrow function to call back into.
    bytes4 public reentrantSelector;
    /// @notice True once a re-entry has been attempted, so it happens only once.
    bool public attempted;
    /// @notice True if the re-entrant call succeeded — it never should.
    bool public reentrySucceeded;

    /// @notice Deploys the token.
    constructor() ERC20("Reentrant", "RE") {}

    /// @notice Mints tokens to an account.
    /// @param to The recipient.
    /// @param amount The amount to mint.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Arms the callback.
    /// @param target_ The escrow to re-enter.
    /// @param selector The escrow function to call.
    function arm(address target_, bytes4 selector) external {
        target = IEscrow(target_);
        reentrantSelector = selector;
        attempted = false;
        reentrySucceeded = false;
    }

    /// @notice Moves tokens, attempting one re-entry into the escrow on the way.
    /// @param from The sender.
    /// @param to The recipient.
    /// @param value The amount.
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);

        if (address(target) != address(0) && !attempted) {
            attempted = true;
            // Deliberately swallow the outcome: the assertion is that it failed, and
            // reverting here would mask which layer stopped it.
            (bool ok,) = address(target).call(abi.encodeWithSelector(reentrantSelector));
            reentrySucceeded = ok;
        }
    }
}

/// @title BlacklistingToken
/// @author AeroAsset Protocol
/// @notice A token that reverts on transfers to or from a blocked account.
/// @dev Models USDC, which is the protocol's intended settlement token and implements
///      an administrative blacklist. This is the case that motivated audit finding
///      AAP-13: an unconditional push to a blocked recipient reverts the whole
///      settlement, so a party that cannot receive could otherwise make the escrow's
///      terminal transition permanently impossible.
contract BlacklistingToken is ERC20 {
    /// @notice Thrown when a blocked account is party to a transfer.
    /// @param account The blocked account.
    error Blacklisted(address account);

    /// @notice Accounts that can neither send nor receive.
    mapping(address account => bool blocked) public blocked;

    /// @notice Deploys the token.
    constructor() ERC20("Blacklisting USD", "bUSD") {}

    /// @notice Mints tokens to an account.
    /// @param to The recipient.
    /// @param amount The amount to mint.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Blocks or unblocks an account.
    /// @param account The account to change.
    /// @param isBlocked True to block.
    function setBlocked(address account, bool isBlocked) external {
        blocked[account] = isBlocked;
    }

    /// @notice Reverts if either party to a transfer is blocked.
    /// @param from The sender, or zero when minting.
    /// @param to The recipient, or zero when burning.
    /// @param value The amount moved.
    function _update(address from, address to, uint256 value) internal override {
        if (blocked[from]) {
            revert Blacklisted(from);
        }
        if (blocked[to]) {
            revert Blacklisted(to);
        }
        super._update(from, to, value);
    }
}
