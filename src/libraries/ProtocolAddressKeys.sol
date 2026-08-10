// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ProtocolAddressKeys
/// @author AeroAsset Protocol
/// @notice Canonical lookup keys for {ProtocolAddressRegistry}.
/// @dev Modules resolve their peers through these keys instead of holding hardcoded
///      addresses, so any single module can be redeployed without redeploying
///      everything downstream of it. See `docs/architecture.md` §D3.
library ProtocolAddressKeys {
    /// @notice Key for the protocol's central `RoleManager`.
    bytes32 internal constant ROLE_MANAGER = keccak256("aeroasset.address.ROLE_MANAGER");

    /// @notice Key for the `ProtocolTimelock` that holds `DEFAULT_ADMIN_ROLE`.
    bytes32 internal constant PROTOCOL_TIMELOCK = keccak256("aeroasset.address.PROTOCOL_TIMELOCK");

    /// @notice Key for the L1 `OrganizationRegistry` proxy.
    bytes32 internal constant ORGANIZATION_REGISTRY = keccak256("aeroasset.address.ORGANIZATION_REGISTRY");

    /// @notice Key for the L1 `CredentialRegistry` proxy.
    bytes32 internal constant CREDENTIAL_REGISTRY = keccak256("aeroasset.address.CREDENTIAL_REGISTRY");

    /// @notice Key for the L2 `AssetRegistry` proxy.
    bytes32 internal constant ASSET_REGISTRY = keccak256("aeroasset.address.ASSET_REGISTRY");

    /// @notice Key for the L2 `AssetOwnership` proxy.
    bytes32 internal constant ASSET_OWNERSHIP = keccak256("aeroasset.address.ASSET_OWNERSHIP");

    /// @notice Key for the L2 `AircraftRegistry` proxy.
    bytes32 internal constant AIRCRAFT_REGISTRY = keccak256("aeroasset.address.AIRCRAFT_REGISTRY");

    /// @notice Key for the L2 `ComponentRegistry` proxy.
    bytes32 internal constant COMPONENT_REGISTRY = keccak256("aeroasset.address.COMPONENT_REGISTRY");

    /// @notice Key for the L3 `DocumentRegistry` proxy.
    bytes32 internal constant DOCUMENT_REGISTRY = keccak256("aeroasset.address.DOCUMENT_REGISTRY");

    /// @notice Key for the L3 `MaintenanceRegistry` proxy.
    bytes32 internal constant MAINTENANCE_REGISTRY = keccak256("aeroasset.address.MAINTENANCE_REGISTRY");

    /// @notice Key for the L3 `AssetPassport` view aggregator.
    bytes32 internal constant ASSET_PASSPORT = keccak256("aeroasset.address.ASSET_PASSPORT");

    /// @notice Key for the L4 `Marketplace` proxy.
    bytes32 internal constant MARKETPLACE = keccak256("aeroasset.address.MARKETPLACE");

    /// @notice Key for the L4 immutable `EscrowFactory`.
    bytes32 internal constant ESCROW_FACTORY = keccak256("aeroasset.address.ESCROW_FACTORY");

    /// @notice Key for the L4 immutable `FeeManager`.
    bytes32 internal constant FEE_MANAGER = keccak256("aeroasset.address.FEE_MANAGER");
}
