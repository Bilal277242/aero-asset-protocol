// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ProtocolRoles
/// @author AeroAsset Protocol
/// @notice Canonical role identifiers recognised by {RoleManager}.
/// @dev Every identifier is `keccak256` of an `aeroasset.role.*` namespaced string
///      rather than a bare name such as `"ADMIN"`. Namespacing guarantees a constant
///      here can never collide with an unrelated protocol's role if a `RoleManager`
///      deployment is ever shared or forked. Roles are documented in `docs/roles.md`.
library ProtocolRoles {
    /// @notice Authorizes UUPS upgrades, address-registry writes, unpausing, and
    ///         terminal organization revocation.
    /// @dev The most powerful role in the protocol. On any production network it is
    ///      held exclusively by `ProtocolTimelock`, so every use is delayed and
    ///      publicly observable before it executes.
    bytes32 internal constant PROTOCOL_ADMIN_ROLE = keccak256("aeroasset.role.PROTOCOL_ADMIN");

    /// @notice Authorizes pausing — and deliberately **not** unpausing.
    /// @dev Unpausing requires {PROTOCOL_ADMIN_ROLE}. Halting the protocol during an
    ///      incident must be fast and low-trust; restarting it must be slow and
    ///      high-trust. A compromised pauser key can grief but cannot extract value.
    bytes32 internal constant PAUSER_ROLE = keccak256("aeroasset.role.PAUSER");

    /// @notice Authorizes organization verification, rejection, suspension and reactivation.
    bytes32 internal constant ORG_VERIFIER_ROLE = keccak256("aeroasset.role.ORG_VERIFIER");

    /// @notice Authorizes marking an asset verified, independently of its registration.
    bytes32 internal constant ASSET_VERIFIER_ROLE = keccak256("aeroasset.role.ASSET_VERIFIER");

    /// @notice Authorizes issuing, suspending, reinstating and revoking credentials.
    bytes32 internal constant CREDENTIAL_ISSUER_ROLE = keccak256("aeroasset.role.CREDENTIAL_ISSUER");

    /// @notice Authorizes resolving a disputed escrow to exactly one of buyer or seller.
    /// @dev Cannot alter amounts, pay a third party, or touch a non-disputed escrow.
    bytes32 internal constant ARBITRATOR_ROLE = keccak256("aeroasset.role.ARBITRATOR");

    /// @notice Authorizes fee-rate and treasury changes within the hard-coded fee cap.
    bytes32 internal constant FEE_MANAGER_ROLE = keccak256("aeroasset.role.FEE_MANAGER");

    /// @notice Machine role held by the specialized asset registries; authorizes
    ///         minting an asset id on behalf of an organization.
    /// @dev Granted only to `AircraftRegistry` and `ComponentRegistry`, which perform
    ///      their own organization-membership check before calling. It is a
    ///      protocol-internal trust delegation, never granted to an EOA.
    bytes32 internal constant ASSET_MINTER_ROLE = keccak256("aeroasset.role.ASSET_MINTER");

    /// @notice Machine role held by live escrow clones; authorizes settlement transfers.
    /// @dev Granted by `EscrowFactory` only to a clone address it just deployed, and
    ///      revoked when that escrow reaches a terminal state. This is the protocol's
    ///      highest-value authorization edge — see `docs/threat-model.md` T-04.
    bytes32 internal constant SETTLEMENT_ROLE = keccak256("aeroasset.role.SETTLEMENT");
}
