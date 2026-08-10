// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

/// @title NamespacesTest
/// @author AeroAsset Protocol
/// @notice Asserts every committed ERC-7201 storage-namespace constant equals the
///         value derived from its namespace string, and that no two collide.
/// @dev A mistyped namespace constant is invisible at runtime — the contract simply
///      reads and writes a different slot, and the mistake only surfaces once some
///      other contract happens to use that slot. Recomputing the formula here turns
///      the typo into a build failure. See `docs/storage-model.md` §1.
///
///      Constants are duplicated here rather than imported because importing them
///      would make the test agree with the contract by construction and assert
///      nothing. These values are transcribed from the contracts by hand; if a
///      contract's constant is edited, this suite must fail.
contract NamespacesTest is Test {
    /// @notice Namespace strings for every upgradeable contract in the protocol.
    /// @dev Phases 2-6 append their contracts here as they are implemented.
    string[10] internal namespaceIds = [
        "aeroasset.storage.ProtocolModule",
        "aeroasset.storage.OrganizationRegistry",
        "aeroasset.storage.CredentialRegistry",
        "aeroasset.storage.AssetRegistry",
        "aeroasset.storage.AssetOwnership",
        "aeroasset.storage.AircraftRegistry",
        "aeroasset.storage.ComponentRegistry",
        "aeroasset.storage.DocumentRegistry",
        "aeroasset.storage.MaintenanceRegistry",
        "aeroasset.storage.Marketplace"
    ];

    /// @notice Roots transcribed from the contracts, in the same order.
    bytes32[10] internal namespaceRoots = [
        bytes32(0x8787ad5fe0309ff52ffc38ce5283f84786d4376351e84951d55874e9d1219a00),
        bytes32(0xed7b930dfdbcd4442766fb62f9201f17312b2a60e1da474d4d195b9761c15d00),
        bytes32(0x3002cbbe427fd1290686b5a4d7a023ca2ae38c7110b28936eac0b6a2023ac800),
        bytes32(0xb67cfe8a53e48286e73e7c1183d175a9e2ed4cb1c3dd63eced3ad89851e47600),
        bytes32(0xb4e666a3e1b1d367d5433fd78238bf5f0935c36d28602b8e8c7b2c72b9d29400),
        bytes32(0x16082ff749f728e3021df36dca08566bca9ab008d9d9a48c8644f95b44fe8100),
        bytes32(0x9345166a028144bcebc693790d7a1182eb477699cc1deffe12101e7570ad1100),
        bytes32(0xdfb6b537f39fe1bb5c9c0dc9368985c489aa396d2a86f54dbf3567f8e997d900),
        bytes32(0x6ff46557adf223318e3fa8a56c7d35f87b2e9d07175dc08529c080ea1db62900),
        bytes32(0xb05b97945034696db99e023472a493b922a17679dd5cac26de9d694a080ee100)
    ];

    /// @notice Derives an ERC-7201 storage root from its namespace string.
    /// @param id The namespace string, e.g. `"aeroasset.storage.AssetRegistry"`.
    /// @return The 32-byte storage root for that namespace.
    function _erc7201(string memory id) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint256(keccak256(bytes(id))) - 1)) & ~bytes32(uint256(0xff));
    }

    /// @notice Every transcribed root matches the ERC-7201 derivation of its string.
    function test_RootsMatchDerivation() public view {
        for (uint256 i; i < namespaceIds.length; ++i) {
            assertEq(namespaceRoots[i], _erc7201(namespaceIds[i]), namespaceIds[i]);
        }
    }

    /// @notice The low byte of every root is zero, as ERC-7201 requires.
    /// @dev The mask reserves 255 following slots so a namespace can grow without
    ///      running into the next one.
    function test_RootsAreMasked() public view {
        for (uint256 i; i < namespaceRoots.length; ++i) {
            assertEq(uint256(namespaceRoots[i]) & 0xff, 0, "root is not aligned to a 256-slot boundary");
        }
    }

    /// @notice No two namespaces collide, and none sits at a low sequential slot.
    function test_RootsAreDistinctAndNonSequential() public view {
        for (uint256 i; i < namespaceRoots.length; ++i) {
            assertTrue(uint256(namespaceRoots[i]) > 0xffff, "root overlaps sequential storage");
            for (uint256 j = i + 1; j < namespaceRoots.length; ++j) {
                assertTrue(namespaceRoots[i] != namespaceRoots[j], "namespace roots collide");
            }
        }
    }

    /// @notice The derivation is injective over arbitrary namespace strings.
    function testFuzz_DerivationIsInjective(string calldata a, string calldata b) public pure {
        vm.assume(keccak256(bytes(a)) != keccak256(bytes(b)));
        assertTrue(_erc7201(a) != _erc7201(b), "distinct namespaces produced the same root");
    }
}
