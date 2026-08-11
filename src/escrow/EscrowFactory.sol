// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IEscrow} from "../interfaces/IEscrow.sol";
import {IEscrowFactory} from "../interfaces/IEscrowFactory.sol";
import {IProtocolAddressRegistry} from "../interfaces/IProtocolAddressRegistry.sol";
import {IRoleManager} from "../interfaces/IRoleManager.sol";
import {ProtocolAddressKeys} from "../libraries/ProtocolAddressKeys.sol";
import {UnexpectedCaller, ZeroAddress} from "../libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../libraries/ProtocolRoles.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

/// @title EscrowFactory
/// @author AeroAsset Protocol
/// @notice Deploys one immutable {Escrow} clone per accepted trade.
/// @dev Layer L4, **immutable**. This contract is the single grantor of
///      `SETTLEMENT_ROLE`, which is the protocol's highest-value privilege
///      (`docs/threat-model.md` T-04). Three things bound that power:
///
///      1. It grants only to an address produced by `Clones.cloneDeterministic` in the
///         same transaction, verified against the address predicted beforehand. It
///         cannot be induced to grant to an arbitrary address.
///      2. It is immutable, so that logic can never be replaced.
///      3. It holds `ESCROW_FACTORY_ROLE`, which administers `SETTLEMENT_ROLE` and
///         **nothing else** — not `DEFAULT_ADMIN_ROLE`. Handing a factory blanket
///         admin to solve the grant problem would have been a far larger compromise
///         than the one it fixes.
///
///      Escrows are never revoked by the factory; each clone renounces its own role on
///      reaching a terminal state, so no admin key is involved in disarming one.
contract EscrowFactory is IEscrowFactory {
    /*//////////////////////////////////////////////////////////////
                                IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice The protocol's authorization authority.
    IRoleManager public immutable ROLE_MANAGER;

    /// @notice The protocol's address book.
    IProtocolAddressRegistry public immutable ADDRESS_REGISTRY;

    /// @notice The shared {Escrow} implementation every clone delegates to.
    address public immutable ESCROW_IMPLEMENTATION;

    /*//////////////////////////////////////////////////////////////
                                  STATE
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IEscrowFactory
    uint256 public escrowCount;

    /// @notice Deployed escrow by id.
    mapping(uint256 escrowId => address escrow) private _escrows;

    /// @inheritdoc IEscrowFactory
    mapping(address account => bool) public isEscrow;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the factory.
    /// @param roleManager The protocol `RoleManager`. Must be non-zero.
    /// @param addressRegistry The protocol `ProtocolAddressRegistry`. Must be non-zero.
    /// @param escrowImplementation The shared `Escrow` implementation. Must be non-zero.
    constructor(address roleManager, address addressRegistry, address escrowImplementation) {
        if (roleManager == address(0) || addressRegistry == address(0) || escrowImplementation == address(0)) {
            revert ZeroAddress();
        }

        ROLE_MANAGER = IRoleManager(roleManager);
        ADDRESS_REGISTRY = IProtocolAddressRegistry(addressRegistry);
        ESCROW_IMPLEMENTATION = escrowImplementation;
    }

    /*//////////////////////////////////////////////////////////////
                                FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IEscrowFactory
    function openEscrow(EscrowTerms calldata terms) external returns (uint256 escrowId, address escrow) {
        // Resolved live, so a rotated-out marketplace loses this privilege on the very
        // next call rather than retaining it until someone remembers to revoke.
        address marketplace = ADDRESS_REGISTRY.getAddress(ProtocolAddressKeys.MARKETPLACE);
        if (msg.sender != marketplace) {
            revert UnexpectedCaller(marketplace, msg.sender);
        }

        unchecked {
            escrowId = ++escrowCount;
        }

        bytes32 salt = keccak256(abi.encode(escrowId));
        address predicted = Clones.predictDeterministicAddress(ESCROW_IMPLEMENTATION, salt, address(this));

        escrow = Clones.cloneDeterministic(ESCROW_IMPLEMENTATION, salt);
        // Defence in depth before granting the protocol's most dangerous role: prove
        // the address about to be privileged is exactly the one just created.
        if (escrow != predicted) {
            revert CloneAddressMismatch(predicted, escrow);
        }

        _escrows[escrowId] = escrow;
        isEscrow[escrow] = true;

        // Granted before initialization so the clone is fully armed the moment it
        // becomes reachable, and revoked by the clone itself on terminal state.
        ROLE_MANAGER.grantRole(ProtocolRoles.SETTLEMENT_ROLE, escrow);
        IEscrow(escrow).initialize(escrowId, terms);

        emit EscrowOpened(escrowId, escrow, terms.listingId, terms.buyer, terms.seller, terms.price, terms.feeAmount);
    }

    /// @inheritdoc IEscrowFactory
    function escrowOf(uint256 escrowId) external view returns (address) {
        address escrow = _escrows[escrowId];
        if (escrow == address(0)) {
            revert EscrowNotFound(escrowId);
        }
        return escrow;
    }

    /// @notice Predicts the address the next escrow will be deployed at.
    /// @dev Exposed for operators verifying a deployment before it happens.
    /// @param escrowId The escrow id to predict for.
    /// @return The address a clone with that id would occupy.
    function predictEscrowAddress(uint256 escrowId) external view returns (address) {
        return Clones.predictDeterministicAddress(ESCROW_IMPLEMENTATION, keccak256(abi.encode(escrowId)), address(this));
    }
}
