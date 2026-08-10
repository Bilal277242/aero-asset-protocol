// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FeeManager} from "../../../src/fees/FeeManager.sol";
import {IFeeManager} from "../../../src/interfaces/IFeeManager.sol";
import {MissingRole, ZeroAddress} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolFeeTypes} from "../../../src/libraries/ProtocolFeeTypes.sol";
import {ProtocolRoles} from "../../../src/libraries/ProtocolRoles.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";

/// @title FeeManagerTest
/// @author AeroAsset Protocol
/// @notice Unit, cap, access-control and fuzz coverage for {FeeManager}.
contract FeeManagerTest is ProtocolTestBase {
    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTION
    //////////////////////////////////////////////////////////////*/

    /// @notice The constructor binds the role manager and seeds the treasury.
    function test_Constructor_SeedsState() public view {
        assertEq(address(feeManager.ROLE_MANAGER()), address(roleManager), "role manager not bound");
        assertEq(feeManager.treasury(), treasury, "treasury not seeded");
    }

    /// @notice The constructor rejects zero dependencies.
    function test_RevertWhen_ConstructedWithZeroArgs() public {
        vm.expectRevert(ZeroAddress.selector);
        new FeeManager(address(0), treasury);

        vm.expectRevert(ZeroAddress.selector);
        new FeeManager(address(roleManager), address(0));
    }

    /*//////////////////////////////////////////////////////////////
                               NO CUSTODY
    //////////////////////////////////////////////////////////////*/

    /// @notice The fee manager holds no tokens and has no way to receive any.
    /// @dev The reason it is safe for it to be permanently immutable: there is nothing
    ///      to drain and no external-call surface at all.
    function test_HoldsNoFunds() public {
        settlementToken.mint(address(this), 1000e6);

        assertEq(settlementToken.balanceOf(address(feeManager)), 0, "fee manager holds tokens");
        assertEq(address(feeManager).balance, 0, "fee manager holds ether");

        // No payable entry point exists, so a plain ether send must fail.
        (bool sent,) = address(feeManager).call{value: 1 ether}("");
        assertFalse(sent, "fee manager accepted ether");
    }

    /*//////////////////////////////////////////////////////////////
                                FEE RATES
    //////////////////////////////////////////////////////////////*/

    /// @notice Setting a rate emits both sides and takes effect immediately.
    function test_SetFeeBps() public {
        vm.expectEmit(true, true, true, true, address(feeManager));
        emit IFeeManager.FeeBpsChanged(ProtocolFeeTypes.MARKETPLACE, FIXTURE_FEE_BPS, 350);

        vm.prank(protocolAdmin);
        feeManager.setFeeBps(ProtocolFeeTypes.MARKETPLACE, 350);

        assertEq(feeManager.feeBps(ProtocolFeeTypes.MARKETPLACE), 350, "rate not applied");
    }

    /// @notice A rate above the hard cap is rejected.
    /// @dev `MAX_FEE_BPS` is a `constant` in a non-upgradeable contract, so there is
    ///      no path — admin or upgrade — by which the protocol charges more.
    function test_RevertWhen_FeeExceedsMaximum() public {
        uint16 max = feeManager.MAX_FEE_BPS();

        vm.expectRevert(abi.encodeWithSelector(IFeeManager.FeeExceedsMaximum.selector, max + 1, max));
        vm.prank(protocolAdmin);
        feeManager.setFeeBps(ProtocolFeeTypes.MARKETPLACE, max + 1);
    }

    /// @notice The cap itself is settable, and nothing above it is.
    function testFuzz_FeeCapIsAbsolute(uint16 bps) public {
        uint16 max = feeManager.MAX_FEE_BPS();

        if (bps <= max) {
            vm.prank(protocolAdmin);
            feeManager.setFeeBps(ProtocolFeeTypes.MARKETPLACE, bps);
            assertLe(feeManager.feeBps(ProtocolFeeTypes.MARKETPLACE), max, "INV-FEE-01 violated");
        } else {
            vm.expectRevert(abi.encodeWithSelector(IFeeManager.FeeExceedsMaximum.selector, bps, max));
            vm.prank(protocolAdmin);
            feeManager.setFeeBps(ProtocolFeeTypes.MARKETPLACE, bps);
        }
    }

    /// @notice An unconfigured fee category quotes zero rather than reverting.
    /// @dev Fails safe: a mistyped constant costs the protocol revenue rather than
    ///      overcharging a user.
    function test_UnknownFeeTypeQuotesZero() public view {
        bytes32 unknown = keccak256("aeroasset.fee.NEVER_CONFIGURED");

        assertEq(feeManager.feeBps(unknown), 0, "unknown type has a rate");
        assertEq(feeManager.quote(unknown, 1_000_000e6), 0, "unknown type charges a fee");
    }

    /*//////////////////////////////////////////////////////////////
                                 QUOTING
    //////////////////////////////////////////////////////////////*/

    /// @notice The quote applies the configured rate in basis points.
    function test_Quote_AppliesRate() public view {
        // 2% of 1,000,000 USDC.
        assertEq(feeManager.quote(ProtocolFeeTypes.MARKETPLACE, 1_000_000e6), 20_000e6, "wrong fee");
    }

    /// @notice Fee and proceeds always sum to exactly the gross amount.
    /// @dev INV-ESC-04. Rounding down favours the payer and creates no dust in either
    ///      direction, which is what lets the escrow assert exact conservation.
    function testFuzz_Quote_NoRoundingLeak(uint128 amount, uint16 bps) public {
        bps = uint16(bound(bps, 0, feeManager.MAX_FEE_BPS()));
        vm.prank(protocolAdmin);
        feeManager.setFeeBps(ProtocolFeeTypes.MARKETPLACE, bps);

        uint256 fee = feeManager.quote(ProtocolFeeTypes.MARKETPLACE, amount);
        uint256 proceeds = uint256(amount) - fee;

        assertEq(fee + proceeds, amount, "fee and proceeds do not sum to the gross amount");
        assertLe(fee, amount, "fee exceeds the gross amount");
    }

    /// @notice A zero rate produces a zero fee for any amount.
    function testFuzz_Quote_ZeroRate(uint128 amount) public {
        vm.prank(protocolAdmin);
        feeManager.setFeeBps(ProtocolFeeTypes.MARKETPLACE, 0);

        assertEq(feeManager.quote(ProtocolFeeTypes.MARKETPLACE, amount), 0, "zero rate charged a fee");
    }

    /*//////////////////////////////////////////////////////////////
                                 TREASURY
    //////////////////////////////////////////////////////////////*/

    /// @notice The treasury can be rotated and never set to zero.
    function test_SetTreasury() public {
        vm.expectEmit(true, true, true, true, address(feeManager));
        emit IFeeManager.TreasuryChanged(treasury, carol);
        vm.prank(protocolAdmin);
        feeManager.setTreasury(carol);
        assertEq(feeManager.treasury(), carol, "treasury not rotated");

        vm.expectRevert(ZeroAddress.selector);
        vm.prank(protocolAdmin);
        feeManager.setTreasury(address(0));
    }

    /*//////////////////////////////////////////////////////////////
                              TOKEN ALLOWLIST
    //////////////////////////////////////////////////////////////*/

    /// @notice Tokens can be allowed and disallowed.
    /// @dev The allowlist is how fee-on-transfer and rebasing tokens stay out of the
    ///      protocol (`docs/security-model.md` T-A5).
    function test_TokenAllowlist() public {
        assertTrue(feeManager.isTokenAllowed(address(settlementToken)), "fixture token not allowed");
        feeManager.requireTokenAllowed(address(settlementToken));

        vm.expectEmit(true, true, true, true, address(feeManager));
        emit IFeeManager.TokenAllowanceChanged(address(settlementToken), false);
        vm.prank(protocolAdmin);
        feeManager.setTokenAllowed(address(settlementToken), false);

        assertFalse(feeManager.isTokenAllowed(address(settlementToken)), "token still allowed");
        vm.expectRevert(abi.encodeWithSelector(IFeeManager.TokenNotAllowed.selector, address(settlementToken)));
        feeManager.requireTokenAllowed(address(settlementToken));
    }

    /// @notice An unlisted token is rejected.
    function testFuzz_RequireTokenAllowed(address token) public {
        vm.assume(token != address(settlementToken));

        vm.expectRevert(abi.encodeWithSelector(IFeeManager.TokenNotAllowed.selector, token));
        feeManager.requireTokenAllowed(token);
    }

    /// @notice The zero address cannot be allowlisted.
    function test_RevertWhen_AllowlistingZeroToken() public {
        vm.expectRevert(ZeroAddress.selector);
        vm.prank(protocolAdmin);
        feeManager.setTokenAllowed(address(0), true);
    }

    /*//////////////////////////////////////////////////////////////
                             ACCESS CONTROL
    //////////////////////////////////////////////////////////////*/

    /// @notice Only `FEE_MANAGER_ROLE` may set rates.
    function testFuzz_RevertWhen_UnauthorizedSetFeeBps(address caller) public {
        _assumeUnprivileged(caller);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.FEE_MANAGER_ROLE, caller));
        vm.prank(caller);
        feeManager.setFeeBps(ProtocolFeeTypes.MARKETPLACE, 100);
    }

    /// @notice Only `FEE_MANAGER_ROLE` may rotate the treasury.
    function testFuzz_RevertWhen_UnauthorizedSetTreasury(address caller) public {
        _assumeUnprivileged(caller);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.FEE_MANAGER_ROLE, caller));
        vm.prank(caller);
        feeManager.setTreasury(caller);
    }

    /// @notice The token allowlist requires `PROTOCOL_ADMIN_ROLE`, not the fee role.
    /// @dev Allowlisting is timelocked because a malicious token is a far larger
    ///      compromise than a mispriced fee.
    function test_RevertWhen_FeeRoleAllowlistsToken() public {
        vm.prank(protocolAdmin);
        roleManager.grantRole(ProtocolRoles.FEE_MANAGER_ROLE, carol);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PROTOCOL_ADMIN_ROLE, carol));
        vm.prank(carol);
        feeManager.setTokenAllowed(address(settlementToken), false);
    }

    /// @notice Revoking the fee role takes effect on the very next call.
    function test_RoleRevocationIsImmediate() public {
        vm.prank(protocolAdmin);
        roleManager.revokeRole(ProtocolRoles.FEE_MANAGER_ROLE, protocolAdmin);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.FEE_MANAGER_ROLE, protocolAdmin));
        vm.prank(protocolAdmin);
        feeManager.setFeeBps(ProtocolFeeTypes.MARKETPLACE, 100);
    }
}
