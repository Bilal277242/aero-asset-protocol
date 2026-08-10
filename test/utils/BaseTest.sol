// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

/// @title BaseTest
/// @author AeroAsset Protocol
/// @notice Shared test harness for every AeroAsset suite: named actors, labelled
///         addresses and assertion helpers used across unit, fuzz and invariant tests.
/// @dev Concrete suites inherit this and override {setUp}, calling `super.setUp()`
///      first so the actor set and labels are always available.
abstract contract BaseTest is Test {
    /*//////////////////////////////////////////////////////////////
                                 ACTORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Holds `DEFAULT_ADMIN_ROLE`; stands in for the production multisig.
    address internal protocolAdmin;
    /// @notice Verifies organizations and promotes them out of the pending state.
    address internal orgVerifier;
    /// @notice Issues and revokes aviation credentials.
    address internal credentialIssuer;
    /// @notice Approved maintenance organization used in provenance tests.
    address internal mro;
    /// @notice Resolves escrow disputes in the controlled-arbitrator model.
    address internal arbitrator;
    /// @notice Receives protocol fees.
    address internal treasury;

    /// @notice Generic unprivileged actors used for access-control negative tests.
    address internal alice;
    address internal bob;
    address internal carol;
    /// @notice Actor that is never granted any role, in any suite.
    address internal attacker;

    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Deterministic starting timestamp (2025-01-01T00:00:00Z).
    /// @dev Foundry starts at timestamp 1; credential expiry and listing deadlines
    ///      are absolute unix times, so tests warp to a realistic epoch to avoid
    ///      underflow when subtracting durations from `block.timestamp`.
    uint256 internal constant GENESIS_TIMESTAMP = 1_735_689_600;

    /// @notice Deterministic starting block height.
    uint256 internal constant GENESIS_BLOCK = 21_525_890;

    /*//////////////////////////////////////////////////////////////
                                  SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Creates and labels the shared actor set and warps to a realistic epoch.
    function setUp() public virtual {
        protocolAdmin = _actor("protocolAdmin");
        orgVerifier = _actor("orgVerifier");
        credentialIssuer = _actor("credentialIssuer");
        mro = _actor("mro");
        arbitrator = _actor("arbitrator");
        treasury = _actor("treasury");

        alice = _actor("alice");
        bob = _actor("bob");
        carol = _actor("carol");
        attacker = _actor("attacker");

        vm.warp(GENESIS_TIMESTAMP);
        vm.roll(GENESIS_BLOCK);
    }

    /*//////////////////////////////////////////////////////////////
                                 HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Derives a deterministic, labelled EOA from `name`.
    /// @dev Uses `makeAddr` so traces show the name instead of a raw address.
    /// @param name Human-readable actor name, also used as the trace label.
    /// @return account The derived address, funded with 100 ether.
    function _actor(string memory name) internal returns (address account) {
        account = makeAddr(name);
        vm.deal(account, 100 ether);
    }

    /// @notice Asserts that `account` is not one of the protocol's privileged actors.
    /// @dev Used to constrain fuzzed callers in access-control tests so a fuzzer
    ///      cannot accidentally produce a legitimately authorized address.
    /// @param account The fuzzed address under test.
    function _assumeUnprivileged(address account) internal view {
        vm.assume(account != address(0));
        vm.assume(account != protocolAdmin);
        vm.assume(account != orgVerifier);
        vm.assume(account != credentialIssuer);
        vm.assume(account != mro);
        vm.assume(account != arbitrator);
        vm.assume(account != treasury);
    }

    /// @notice Excludes addresses that break low-level calls or token transfers.
    /// @dev Filters the zero address, precompiles (0x01-0x09) and the Foundry
    ///      cheatcode/console addresses, all of which behave abnormally as
    ///      transfer recipients and produce false-positive fuzz failures.
    /// @param account The fuzzed address under test.
    function _assumeSafeRecipient(address account) internal pure {
        vm.assume(account != address(0));
        vm.assume(uint160(account) > 9);
        vm.assume(account != 0x7109709ECfa91a80626fF3989D68f67F5b1DD12D); // VM
        vm.assume(account != 0x000000000000000000636F6e736F6c652e6c6f67); // console
        vm.assume(account != 0x4e59b44847b379578588920cA78FbF26c0B4956C); // CREATE2 deployer
    }
}
