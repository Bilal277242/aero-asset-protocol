// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ICredentialRegistry} from "../../../src/interfaces/ICredentialRegistry.sol";
import {MissingRole} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolRoles} from "../../../src/libraries/ProtocolRoles.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";

/// @title CredentialRegistryAccessTest
/// @author AeroAsset Protocol
/// @notice Access-control coverage for {CredentialRegistry}. Implements the negative
///         half of the matrix in `docs/permissions.md` §L1.
contract CredentialRegistryAccessTest is ProtocolTestBase {
    /// @dev Verified MRO used as the credential subject.
    uint256 internal subjectOrg;
    /// @dev A live maintenance-authority credential held by `subjectOrg`.
    uint256 internal credentialId;

    ICredentialRegistry.CredentialType internal constant MAINTENANCE =
    ICredentialRegistry.CredentialType.MAINTENANCE_AUTHORITY;

    function setUp() public override {
        super.setUp();
        (subjectOrg, credentialId) = _credentialedMro();
    }

    /*//////////////////////////////////////////////////////////////
                              ROLE GATES
    //////////////////////////////////////////////////////////////*/

    /// @notice Only `CREDENTIAL_ISSUER_ROLE` may issue.
    function testFuzz_RevertWhen_UnauthorizedIssue(address caller) public {
        _assumeUnprivileged(caller);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.CREDENTIAL_ISSUER_ROLE, caller));
        vm.prank(caller);
        credentialRegistry.issueCredential(
            0, address(0), subjectOrg, ICredentialRegistry.CredentialType.INSPECTION_AUTHORITY, 0, keccak256("x")
        );
    }

    /// @notice Only `CREDENTIAL_ISSUER_ROLE` may suspend.
    function testFuzz_RevertWhen_UnauthorizedSuspend(address caller) public {
        _assumeUnprivileged(caller);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.CREDENTIAL_ISSUER_ROLE, caller));
        vm.prank(caller);
        credentialRegistry.suspendCredential(credentialId);
    }

    /// @notice Only `CREDENTIAL_ISSUER_ROLE` may reinstate.
    function testFuzz_RevertWhen_UnauthorizedReinstate(address caller) public {
        _assumeUnprivileged(caller);
        vm.prank(credentialIssuer);
        credentialRegistry.suspendCredential(credentialId);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.CREDENTIAL_ISSUER_ROLE, caller));
        vm.prank(caller);
        credentialRegistry.reinstateCredential(credentialId);
    }

    /// @notice Only `CREDENTIAL_ISSUER_ROLE` may revoke.
    function testFuzz_RevertWhen_UnauthorizedRevoke(address caller) public {
        _assumeUnprivileged(caller);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.CREDENTIAL_ISSUER_ROLE, caller));
        vm.prank(caller);
        credentialRegistry.revokeCredential(credentialId);
    }

    /// @notice The subject organization cannot manage its own credentials.
    /// @dev Self-issuance would make the credential layer meaningless: an MRO could
    ///      grant itself maintenance authority.
    function test_RevertWhen_SubjectManagesOwnCredential() public {
        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.CREDENTIAL_ISSUER_ROLE, mro));
        vm.prank(mro);
        credentialRegistry.issueCredential(
            subjectOrg,
            address(0),
            subjectOrg,
            ICredentialRegistry.CredentialType.INSPECTION_AUTHORITY,
            0,
            keccak256("x")
        );

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.CREDENTIAL_ISSUER_ROLE, mro));
        vm.prank(mro);
        credentialRegistry.revokeCredential(credentialId);
    }

    /// @notice An organization verifier cannot issue credentials.
    /// @dev The two compliance duties are separated so one compromised key cannot both
    ///      verify a fake organization and credential it.
    function test_RevertWhen_OrgVerifierIssues() public {
        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.CREDENTIAL_ISSUER_ROLE, orgVerifier));
        vm.prank(orgVerifier);
        credentialRegistry.issueCredential(
            0, address(0), subjectOrg, ICredentialRegistry.CredentialType.INSPECTION_AUTHORITY, 0, keccak256("x")
        );
    }

    /// @notice Revoking the issuer role takes effect on the very next call.
    function test_RoleRevocationIsImmediate() public {
        vm.prank(protocolAdmin);
        roleManager.revokeRole(ProtocolRoles.CREDENTIAL_ISSUER_ROLE, credentialIssuer);

        vm.expectRevert(
            abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.CREDENTIAL_ISSUER_ROLE, credentialIssuer)
        );
        vm.prank(credentialIssuer);
        credentialRegistry.revokeCredential(credentialId);
    }

    /*//////////////////////////////////////////////////////////////
                              PAUSE GATES
    //////////////////////////////////////////////////////////////*/

    /// @notice Only `PAUSER_ROLE` may pause.
    function testFuzz_RevertWhen_UnauthorizedPause(address caller) public {
        _assumeUnprivileged(caller);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PAUSER_ROLE, caller));
        vm.prank(caller);
        credentialRegistry.pause();
    }

    /// @notice The pauser cannot unpause.
    function test_RevertWhen_PauserUnpauses() public {
        vm.prank(pauser);
        credentialRegistry.pause();

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PROTOCOL_ADMIN_ROLE, pauser));
        vm.prank(pauser);
        credentialRegistry.unpause();
    }

    /*//////////////////////////////////////////////////////////////
                          UPGRADE AUTHORIZATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Only `PROTOCOL_ADMIN_ROLE` may upgrade the registry.
    function testFuzz_RevertWhen_UnauthorizedUpgrade(address caller) public {
        _assumeUnprivileged(caller);

        vm.expectRevert(abi.encodeWithSelector(MissingRole.selector, ProtocolRoles.PROTOCOL_ADMIN_ROLE, caller));
        vm.prank(caller);
        credentialRegistry.upgradeToAndCall(credentialRegistryImpl, "");
    }
}
