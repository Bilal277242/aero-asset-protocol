// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {OrganizationRegistry} from "../../src/identity/OrganizationRegistry.sol";
import {IOrganizationRegistry} from "../../src/interfaces/IOrganizationRegistry.sol";
import {MissingRole, ZeroAddress} from "../../src/libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../../src/libraries/ProtocolRoles.sol";
import {ProtocolTestBase} from "../utils/ProtocolTestBase.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC1967} from "@openzeppelin/contracts/interfaces/IERC1967.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";

/// @notice Minimal V2 implementation used to prove upgrades preserve namespaced state.
/// @dev Adds a function without adding storage, which is the common case for a
///      registry upgrade that fixes logic rather than extending the data model.
contract OrganizationRegistryV2 is OrganizationRegistry {
    /// @notice Marker distinguishing this implementation from V1.
    /// @return Always 2.
    function version() external pure returns (uint256) {
        return 2;
    }
}

/// @title UpgradeSafetyTest
/// @author AeroAsset Protocol
/// @notice Covers UUPS upgrade authorization, initializer protection and storage
///         preservation across an upgrade.
/// @dev Addresses `docs/threat-model.md` T-01, T-09 and T-10.
contract UpgradeSafetyTest is ProtocolTestBase {
    /*//////////////////////////////////////////////////////////////
                        INITIALIZER PROTECTION
    //////////////////////////////////////////////////////////////*/

    /// @notice The implementation contract cannot be initialized directly.
    /// @dev An uninitialized UUPS implementation can be seized by anyone and then
    ///      upgraded to arbitrary code. `_disableInitializers()` in the shared base
    ///      constructor closes this; this test proves it for the real implementation.
    function test_RevertWhen_InitializingImplementationDirectly() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        OrganizationRegistry(orgRegistryImpl).initialize(address(roleManager), address(addressRegistry));
    }

    /// @notice The proxy cannot be re-initialized after deployment.
    function test_RevertWhen_ReinitializingProxy() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        orgRegistry.initialize(address(roleManager), address(addressRegistry));
    }

    /// @notice Initialization rejects zero dependencies.
    function test_RevertWhen_InitializedWithZeroDependencies() public {
        OrganizationRegistry fresh = new OrganizationRegistry();

        // The implementation has initializers disabled, so reaching the zero-address
        // guard requires a proxy. Deploy one with empty init data, then initialize.
        bytes memory emptyInit = "";
        address proxy = address(new ERC1967ProxyHarness(address(fresh), emptyInit));

        vm.expectRevert(ZeroAddress.selector);
        OrganizationRegistry(proxy).initialize(address(0), address(addressRegistry));

        vm.expectRevert(ZeroAddress.selector);
        OrganizationRegistry(proxy).initialize(address(roleManager), address(0));
    }

    /*//////////////////////////////////////////////////////////////
                         UPGRADE AUTHORIZATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Only `PROTOCOL_ADMIN_ROLE` may upgrade a registry.
    function testFuzz_RevertWhen_UnauthorizedUpgrade(address caller) public {
        _assumeUnprivileged(caller);
        address v2 = address(new OrganizationRegistryV2());

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PROTOCOL_ADMIN_ROLE, caller));
        vm.prank(caller);
        orgRegistry.upgradeToAndCall(v2, "");
    }

    /// @notice Holding an unrelated protocol role does not authorize an upgrade.
    function test_RevertWhen_VerifierUpgrades() public {
        address v2 = address(new OrganizationRegistryV2());

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PROTOCOL_ADMIN_ROLE, orgVerifier));
        vm.prank(orgVerifier);
        orgRegistry.upgradeToAndCall(v2, "");
    }

    /// @notice Upgrading to the zero address is rejected.
    function test_RevertWhen_UpgradingToZeroAddress() public {
        vm.expectRevert();
        vm.prank(protocolAdmin);
        orgRegistry.upgradeToAndCall(address(0), "");
    }

    /*//////////////////////////////////////////////////////////////
                          STORAGE PRESERVATION
    //////////////////////////////////////////////////////////////*/

    /// @notice A real upgrade preserves every field of pre-existing state.
    /// @dev This is the practical check behind ERC-7201: state written by V1 must be
    ///      readable, unchanged, through V2 at the same namespace.
    function test_Upgrade_PreservesNamespacedState() public {
        uint256 orgA =
            _registerVerifiedOrg(alice, keccak256("Preserved Airline"), IOrganizationRegistry.OrganizationType.AIRLINE);
        uint256 orgB = _registerOrg(bob, keccak256("Pending MRO"), IOrganizationRegistry.OrganizationType.MRO);

        vm.prank(alice);
        orgRegistry.setOperator(orgA, carol, true);
        vm.prank(alice);
        orgRegistry.transferOrganizationAdmin(orgA, bob);

        IOrganizationRegistry.Organization memory before = orgRegistry.getOrganization(orgA);
        uint256 countBefore = orgRegistry.organizationCount();

        address v2 = address(new OrganizationRegistryV2());
        vm.expectEmit(true, true, true, true, address(orgRegistry));
        emit IERC1967.Upgraded(v2);
        vm.prank(protocolAdmin);
        orgRegistry.upgradeToAndCall(v2, "");

        assertEq(OrganizationRegistryV2(address(orgRegistry)).version(), 2, "upgrade did not take effect");

        IOrganizationRegistry.Organization memory afterUpgrade = orgRegistry.getOrganization(orgA);
        assertEq(afterUpgrade.admin, before.admin, "admin changed");
        assertEq(afterUpgrade.registeredAt, before.registeredAt, "registeredAt changed");
        assertEq(afterUpgrade.verifiedAt, before.verifiedAt, "verifiedAt changed");
        assertEq(uint8(afterUpgrade.orgType), uint8(before.orgType), "orgType changed");
        assertEq(uint8(afterUpgrade.status), uint8(before.status), "status changed");
        assertEq(afterUpgrade.nameHash, before.nameHash, "nameHash changed");
        assertEq(afterUpgrade.metadataHash, before.metadataHash, "metadataHash changed");

        assertEq(orgRegistry.organizationCount(), countBefore, "counter changed");
        assertEq(orgRegistry.metadataURI(orgA), ORG_METADATA_URI, "uri side table changed");
        assertTrue(orgRegistry.isOperator(orgA, carol), "operator mapping changed");
        assertEq(orgRegistry.pendingAdmin(orgA), bob, "pending admin changed");
        assertEq(orgRegistry.organizationIdByNameHash(keccak256("Preserved Airline")), orgA, "name index changed");
        assertEq(
            uint8(orgRegistry.getOrganization(orgB).status),
            uint8(IOrganizationRegistry.OrganizationStatus.PENDING),
            "second record changed"
        );
    }

    /// @notice The module's own configuration survives an upgrade.
    function test_Upgrade_PreservesModuleWiring() public {
        address v2 = address(new OrganizationRegistryV2());
        vm.prank(protocolAdmin);
        orgRegistry.upgradeToAndCall(v2, "");

        assertEq(address(orgRegistry.roleManager()), address(roleManager), "role manager lost");
        assertEq(address(orgRegistry.addressRegistry()), address(addressRegistry), "address registry lost");
    }

    /// @notice Pause state survives an upgrade.
    /// @dev A registry that silently unpaused itself mid-incident would be a serious
    ///      failure; `PausableUpgradeable` keeps its own namespace, so it must not.
    function test_Upgrade_PreservesPauseState() public {
        vm.prank(pauser);
        orgRegistry.pause();

        address v2 = address(new OrganizationRegistryV2());
        vm.prank(protocolAdmin);
        orgRegistry.upgradeToAndCall(v2, "");

        assertTrue(orgRegistry.paused(), "pause state lost across upgrade");
    }

    /// @notice Operations continue to work normally after an upgrade.
    function test_Upgrade_LeavesRegistryFunctional() public {
        address v2 = address(new OrganizationRegistryV2());
        vm.prank(protocolAdmin);
        orgRegistry.upgradeToAndCall(v2, "");

        uint256 orgId =
            _registerVerifiedOrg(alice, keccak256("Post Upgrade"), IOrganizationRegistry.OrganizationType.LESSOR);
        assertTrue(orgRegistry.isActingFor(orgId, alice), "registry broken after upgrade");
    }
}

/// @notice Bare ERC-1967 proxy used to reach initializer guards on a fresh proxy.
/// @dev Declared locally rather than imported so the test can deploy a proxy with
///      empty initialization data, which the OZ constructor otherwise treats as a
///      valid no-op path.
contract ERC1967ProxyHarness {
    /// @notice Deploys a proxy pointing at `implementation`.
    /// @param implementation The implementation to delegate to.
    /// @param data Optional initialization calldata.
    constructor(address implementation, bytes memory data) {
        ERC1967Utils.upgradeToAndCall(implementation, data);
    }

    /// @notice Delegates every call to the current implementation.
    fallback() external payable {
        address impl = ERC1967Utils.getImplementation();
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
