// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ICredentialRegistry} from "../../../src/interfaces/ICredentialRegistry.sol";
import {IOrganizationRegistry} from "../../../src/interfaces/IOrganizationRegistry.sol";
import {ProtocolCast} from "../../../src/libraries/ProtocolCast.sol";
import {DeadlineInPast, ZeroHash} from "../../../src/libraries/ProtocolErrors.sol";
import {ProtocolTestBase} from "../../utils/ProtocolTestBase.sol";

/// @title CredentialRegistryTest
/// @author AeroAsset Protocol
/// @notice Functional, lifecycle, validity, event, negative and fuzz coverage for
///         {CredentialRegistry}. Access control lives in the sibling
///         `CredentialRegistryAccess.t.sol`.
contract CredentialRegistryTest is ProtocolTestBase {
    /// @dev Aliases keep the assertions readable.
    ICredentialRegistry.CredentialType internal constant MAINTENANCE =
    ICredentialRegistry.CredentialType.MAINTENANCE_AUTHORITY;
    ICredentialRegistry.CredentialType internal constant INSPECTION =
    ICredentialRegistry.CredentialType.INSPECTION_AUTHORITY;

    /// @dev Commitment to a fixture off-chain credential document.
    bytes32 internal constant CRED_HASH = keccak256("EASA Part-145 approval scan");

    /// @dev A verified MRO used as the subject of most credentials here.
    uint256 internal subjectOrg;

    function setUp() public override {
        super.setUp();
        subjectOrg = _verifiedMro();
    }

    /// @notice Issues a maintenance credential to `subjectOrg` expiring in `ttl`.
    /// @param ttl Seconds until expiry, or 0 for a credential that never expires.
    /// @return The new credential id.
    function _issue(uint256 ttl) internal returns (uint256) {
        uint40 expiry = ttl == 0 ? uint40(0) : ProtocolCast.toUint40(block.timestamp + ttl);

        vm.prank(credentialIssuer);
        return credentialRegistry.issueCredential(0, address(0), subjectOrg, MAINTENANCE, expiry, CRED_HASH);
    }

    /*//////////////////////////////////////////////////////////////
                                ISSUANCE
    //////////////////////////////////////////////////////////////*/

    /// @notice Issuance mints a dense id and lands in `ACTIVE`.
    function test_Issue_LandsInActive() public {
        uint40 expiry = uint40(block.timestamp + 365 days);

        vm.expectEmit(true, true, true, true, address(credentialRegistry));
        emit ICredentialRegistry.CredentialIssued(1, 0, address(0), subjectOrg, MAINTENANCE, expiry, CRED_HASH);
        vm.expectEmit(true, true, true, true, address(credentialRegistry));
        emit ICredentialRegistry.CredentialStatusChanged(
            1, ICredentialRegistry.CredentialStatus.NONE, ICredentialRegistry.CredentialStatus.ACTIVE, credentialIssuer
        );

        uint256 credentialId = _issue(365 days);

        assertEq(credentialId, 1, "ids do not start at 1");
        assertEq(credentialRegistry.credentialCount(), 1, "count not incremented");

        ICredentialRegistry.Credential memory c = credentialRegistry.getCredential(credentialId);
        assertEq(c.issuerOrgId, 0, "wrong issuer");
        assertEq(c.subjectOrgId, subjectOrg, "wrong subject org");
        assertEq(c.subject, address(0), "wrong subject address");
        assertEq(uint8(c.credType), uint8(MAINTENANCE), "wrong type");
        assertEq(uint8(c.status), uint8(ICredentialRegistry.CredentialStatus.ACTIVE), "not ACTIVE");
        assertEq(c.issuedAt, uint40(block.timestamp), "wrong issuedAt");
        assertEq(c.expiresAt, expiry, "wrong expiresAt");
        assertEq(c.credentialHash, CRED_HASH, "wrong hash");
        assertEq(c.reserved, 0, "reserved field not zero");

        assertTrue(credentialRegistry.isValid(credentialId), "not valid after issuance");
    }

    /// @notice A credential may be issued to a bare address with no organization.
    function test_Issue_AddressOnlySubject() public {
        vm.prank(credentialIssuer);
        uint256 credentialId = credentialRegistry.issueCredential(subjectOrg, carol, 0, INSPECTION, 0, CRED_HASH);

        ICredentialRegistry.Credential memory c = credentialRegistry.getCredential(credentialId);
        assertEq(c.subject, carol, "wrong subject");
        assertEq(c.subjectOrgId, 0, "subject org should be unset");
        assertEq(c.issuerOrgId, subjectOrg, "issuer not recorded");
        assertTrue(credentialRegistry.isValid(credentialId), "address-subject credential invalid");
    }

    /// @notice A zero expiry means the credential never expires.
    function test_Issue_ZeroExpiryNeverExpires() public {
        uint256 credentialId = _issue(0);

        vm.warp(block.timestamp + 100 * 365 days);
        assertTrue(credentialRegistry.isValid(credentialId), "non-expiring credential expired");
    }

    /// @notice Ids are dense and monotonic.
    function test_Issue_IdsAreDenseAndMonotonic() public {
        uint256 orgB = _registerVerifiedOrg(bob, keccak256("B"), IOrganizationRegistry.OrganizationType.INSPECTOR);

        assertEq(_issue(365 days), 1, "id 1");
        vm.prank(credentialIssuer);
        assertEq(credentialRegistry.issueCredential(0, address(0), orgB, INSPECTION, 0, CRED_HASH), 2, "id 2");
        assertEq(credentialRegistry.credentialCount(), 2, "wrong count");
    }

    /*//////////////////////////////////////////////////////////////
                           ISSUANCE VALIDATION
    //////////////////////////////////////////////////////////////*/

    /// @notice The `UNSPECIFIED` sentinel is rejected as a credential type.
    function test_RevertWhen_CredentialTypeUnspecified() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                ICredentialRegistry.InvalidCredentialType.selector, ICredentialRegistry.CredentialType.UNSPECIFIED
            )
        );
        vm.prank(credentialIssuer);
        credentialRegistry.issueCredential(
            0, address(0), subjectOrg, ICredentialRegistry.CredentialType.UNSPECIFIED, 0, CRED_HASH
        );
    }

    /// @notice A zero credential hash is rejected.
    function test_RevertWhen_CredentialHashIsZero() public {
        vm.expectRevert(ZeroHash.selector);
        vm.prank(credentialIssuer);
        credentialRegistry.issueCredential(0, address(0), subjectOrg, MAINTENANCE, 0, bytes32(0));
    }

    /// @notice A credential must be about someone.
    function test_RevertWhen_SubjectIsEmpty() public {
        vm.expectRevert(ICredentialRegistry.InvalidCredentialSubject.selector);
        vm.prank(credentialIssuer);
        credentialRegistry.issueCredential(0, address(0), 0, MAINTENANCE, 0, CRED_HASH);
    }

    /// @notice An expiry in the past is rejected.
    function test_RevertWhen_ExpiryInPast() public {
        uint40 past = uint40(block.timestamp - 1);

        vm.expectRevert(abi.encodeWithSelector(DeadlineInPast.selector, past, uint40(block.timestamp)));
        vm.prank(credentialIssuer);
        credentialRegistry.issueCredential(0, address(0), subjectOrg, MAINTENANCE, past, CRED_HASH);
    }

    /// @notice An expiry at exactly the current timestamp is rejected.
    /// @dev `isValid` uses `expiresAt > now`, so accepting this would mint a
    ///      credential that is invalid in the very block it was created.
    function test_RevertWhen_ExpiryIsNow() public {
        uint40 now_ = uint40(block.timestamp);

        vm.expectRevert(abi.encodeWithSelector(DeadlineInPast.selector, now_, now_));
        vm.prank(credentialIssuer);
        credentialRegistry.issueCredential(0, address(0), subjectOrg, MAINTENANCE, now_, CRED_HASH);
    }

    /// @notice The subject organization must be verified.
    function test_RevertWhen_SubjectOrganizationNotVerified() public {
        uint256 pendingOrg = _registerOrg(bob, keccak256("Pending"), IOrganizationRegistry.OrganizationType.MRO);

        vm.expectRevert(abi.encodeWithSelector(ICredentialRegistry.SubjectOrganizationNotVerified.selector, pendingOrg));
        vm.prank(credentialIssuer);
        credentialRegistry.issueCredential(0, address(0), pendingOrg, MAINTENANCE, 0, CRED_HASH);
    }

    /// @notice A suspended subject organization cannot receive a credential.
    function test_RevertWhen_SubjectOrganizationSuspended() public {
        vm.prank(orgVerifier);
        orgRegistry.suspendOrganization(subjectOrg);

        vm.expectRevert(abi.encodeWithSelector(ICredentialRegistry.SubjectOrganizationNotVerified.selector, subjectOrg));
        vm.prank(credentialIssuer);
        credentialRegistry.issueCredential(0, address(0), subjectOrg, MAINTENANCE, 0, CRED_HASH);
    }

    /// @notice A nonexistent subject organization is rejected.
    function test_RevertWhen_SubjectOrganizationUnknown() public {
        vm.expectRevert(abi.encodeWithSelector(ICredentialRegistry.SubjectOrganizationNotVerified.selector, 999));
        vm.prank(credentialIssuer);
        credentialRegistry.issueCredential(0, address(0), 999, MAINTENANCE, 0, CRED_HASH);
    }

    /// @notice A nonexistent issuing organization is rejected.
    function test_RevertWhen_IssuerOrganizationUnknown() public {
        vm.expectRevert(abi.encodeWithSelector(IOrganizationRegistry.OrganizationNotFound.selector, uint256(999)));
        vm.prank(credentialIssuer);
        credentialRegistry.issueCredential(999, address(0), subjectOrg, MAINTENANCE, 0, CRED_HASH);
    }

    /// @notice An unverified organization may still be recorded as the issuer.
    /// @dev The `CREDENTIAL_ISSUER_ROLE` gate is the real authorization; `issuerOrgId`
    ///      is provenance. Requiring the issuer be verified would make it impossible
    ///      to record a credential issued by an authority that is not itself a
    ///      participant.
    function test_Issue_AllowsPendingIssuerOrganization() public {
        uint256 pendingIssuer =
            _registerOrg(bob, keccak256("Authority"), IOrganizationRegistry.OrganizationType.INSPECTOR);

        vm.prank(credentialIssuer);
        uint256 credentialId =
            credentialRegistry.issueCredential(pendingIssuer, address(0), subjectOrg, MAINTENANCE, 0, CRED_HASH);

        assertEq(credentialRegistry.getCredential(credentialId).issuerOrgId, pendingIssuer, "issuer not recorded");
    }

    /*//////////////////////////////////////////////////////////////
                        ONE VALID CREDENTIAL RULE
    //////////////////////////////////////////////////////////////*/

    /// @notice An organization cannot hold two valid credentials of the same type.
    /// @dev This is what makes {validCredentialOfType} an O(1), always-correct lookup.
    function test_RevertWhen_DuplicateValidCredential() public {
        uint256 first = _issue(365 days);

        vm.expectRevert(
            abi.encodeWithSelector(
                ICredentialRegistry.DuplicateValidCredential.selector, subjectOrg, MAINTENANCE, first
            )
        );
        _issue(365 days);
    }

    /// @notice Credentials of different types coexist freely.
    function test_Issue_DifferentTypesCoexist() public {
        uint256 maintenanceId = _issue(365 days);

        vm.prank(credentialIssuer);
        uint256 inspectionId = credentialRegistry.issueCredential(0, address(0), subjectOrg, INSPECTION, 0, CRED_HASH);

        assertTrue(credentialRegistry.isValid(maintenanceId), "maintenance credential invalidated");
        assertTrue(credentialRegistry.isValid(inspectionId), "inspection credential invalid");
        assertEq(credentialRegistry.validCredentialOfType(subjectOrg, MAINTENANCE), maintenanceId, "wrong lookup");
        assertEq(credentialRegistry.validCredentialOfType(subjectOrg, INSPECTION), inspectionId, "wrong lookup");
    }

    /// @notice A lapsed credential does not block reissuance, with no expiry tx needed.
    /// @dev Renewal after a lapse must not require someone to first pay gas to record
    ///      an expiry that has already happened in real time.
    function test_Issue_AfterLapseWithoutRecordingExpiry() public {
        uint256 first = _issue(30 days);
        vm.warp(block.timestamp + 31 days);

        // Still stored as ACTIVE — nobody has called expireCredential.
        assertEq(
            uint8(credentialRegistry.getCredential(first).status),
            uint8(ICredentialRegistry.CredentialStatus.ACTIVE),
            "status was mutated by time"
        );
        assertFalse(credentialRegistry.isValid(first), "lapsed credential still valid");

        uint256 second = _issue(365 days);
        assertEq(credentialRegistry.validCredentialOfType(subjectOrg, MAINTENANCE), second, "index not replaced");
    }

    /// @notice Revoking frees the slot for a replacement.
    function test_Issue_AfterRevocation() public {
        uint256 first = _issue(365 days);
        vm.prank(credentialIssuer);
        credentialRegistry.revokeCredential(first);

        assertEq(credentialRegistry.validCredentialOfType(subjectOrg, MAINTENANCE), 0, "index not cleared");

        uint256 second = _issue(365 days);
        assertEq(credentialRegistry.validCredentialOfType(subjectOrg, MAINTENANCE), second, "index not set");
    }

    /// @notice Address-only credentials are exempt from the uniqueness rule.
    /// @dev They are not indexed, so there is no O(1) slot to contend for.
    function test_Issue_AddressSubjectsAreNotDeduplicated() public {
        vm.startPrank(credentialIssuer);
        uint256 a = credentialRegistry.issueCredential(0, carol, 0, MAINTENANCE, 0, CRED_HASH);
        uint256 b = credentialRegistry.issueCredential(0, carol, 0, MAINTENANCE, 0, CRED_HASH);
        vm.stopPrank();

        assertTrue(credentialRegistry.isValid(a), "first invalid");
        assertTrue(credentialRegistry.isValid(b), "second invalid");
        assertEq(credentialRegistry.validCredentialOfType(0, MAINTENANCE), 0, "address subjects must not be indexed");
    }

    /*//////////////////////////////////////////////////////////////
                                VALIDITY
    //////////////////////////////////////////////////////////////*/

    /// @notice Validity is computed from status *and* expiry, never status alone.
    /// @dev A credential sitting at `ACTIVE` past its expiry is the exact trap this
    ///      registry exists to prevent consumers falling into (INV-CRED-02).
    function test_IsValid_ChecksExpiryNotJustStatus() public {
        uint256 credentialId = _issue(1 days);
        assertTrue(credentialRegistry.isValid(credentialId), "not valid before expiry");

        vm.warp(block.timestamp + 1 days);
        assertFalse(credentialRegistry.isValid(credentialId), "valid at exactly expiresAt");
        assertEq(
            uint8(credentialRegistry.getCredential(credentialId).status),
            uint8(ICredentialRegistry.CredentialStatus.ACTIVE),
            "stored status changed without a transaction"
        );
    }

    /// @notice A suspended credential is not valid.
    function test_IsValid_FalseWhenSuspended() public {
        uint256 credentialId = _issue(365 days);

        vm.prank(credentialIssuer);
        credentialRegistry.suspendCredential(credentialId);

        assertFalse(credentialRegistry.isValid(credentialId), "suspended credential is valid");
        assertEq(credentialRegistry.validCredentialOfType(subjectOrg, MAINTENANCE), 0, "index not cleared");
    }

    /// @notice `isValid` is false for unknown ids rather than reverting.
    function testFuzz_IsValid_UnknownIdIsFalse(uint256 credentialId) public view {
        assertFalse(credentialRegistry.isValid(credentialId), "unknown credential reported valid");
    }

    /// @notice `requireValid` reverts with the stored status for diagnosis.
    function test_RequireValid_RevertReasons() public {
        vm.expectRevert(abi.encodeWithSelector(ICredentialRegistry.CredentialNotFound.selector, uint256(1)));
        credentialRegistry.requireValid(1);

        uint256 credentialId = _issue(1 days);
        credentialRegistry.requireValid(credentialId);

        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(
            abi.encodeWithSelector(
                ICredentialRegistry.CredentialNotValid.selector,
                credentialId,
                ICredentialRegistry.CredentialStatus.ACTIVE
            )
        );
        credentialRegistry.requireValid(credentialId);
    }

    /// @notice `isValid`, `requireValid` and `hasValidCredentialOfType` never disagree.
    function testFuzz_ValidityAccessorsAgree(uint40 ttl, uint40 elapsed) public {
        ttl = uint40(bound(ttl, 1, 3650 days));
        elapsed = uint40(bound(elapsed, 0, 7300 days));

        uint256 credentialId = _issue(ttl);
        vm.warp(block.timestamp + elapsed);

        bool valid = credentialRegistry.isValid(credentialId);
        assertEq(credentialRegistry.hasValidCredentialOfType(subjectOrg, MAINTENANCE), valid, "type lookup disagrees");

        if (valid) {
            credentialRegistry.requireValid(credentialId);
            assertEq(
                credentialRegistry.validCredentialOfType(subjectOrg, MAINTENANCE), credentialId, "wrong id returned"
            );
        } else {
            vm.expectRevert();
            credentialRegistry.requireValid(credentialId);
            assertEq(credentialRegistry.validCredentialOfType(subjectOrg, MAINTENANCE), 0, "stale id returned");
        }
    }

    /*//////////////////////////////////////////////////////////////
                                LIFECYCLE
    //////////////////////////////////////////////////////////////*/

    /// @notice Suspension and reinstatement round-trip, restoring the index.
    function test_SuspendAndReinstate() public {
        uint256 credentialId = _issue(365 days);

        vm.expectEmit(true, true, true, true, address(credentialRegistry));
        emit ICredentialRegistry.CredentialStatusChanged(
            credentialId,
            ICredentialRegistry.CredentialStatus.ACTIVE,
            ICredentialRegistry.CredentialStatus.SUSPENDED,
            credentialIssuer
        );
        vm.prank(credentialIssuer);
        credentialRegistry.suspendCredential(credentialId);
        assertFalse(credentialRegistry.isValid(credentialId), "suspended credential valid");

        vm.prank(credentialIssuer);
        credentialRegistry.reinstateCredential(credentialId);

        assertTrue(credentialRegistry.isValid(credentialId), "reinstated credential invalid");
        assertEq(credentialRegistry.validCredentialOfType(subjectOrg, MAINTENANCE), credentialId, "index not restored");
    }

    /// @notice A credential whose expiry passed while suspended cannot be reinstated.
    /// @dev Reinstatement must not resurrect authority that time has already ended.
    function test_RevertWhen_ReinstatingExpiredCredential() public {
        uint256 credentialId = _issue(10 days);
        vm.prank(credentialIssuer);
        credentialRegistry.suspendCredential(credentialId);

        vm.warp(block.timestamp + 11 days);
        uint40 expiry = credentialRegistry.getCredential(credentialId).expiresAt;

        vm.expectRevert(abi.encodeWithSelector(ICredentialRegistry.CredentialExpired.selector, credentialId, expiry));
        vm.prank(credentialIssuer);
        credentialRegistry.reinstateCredential(credentialId);
    }

    /// @notice Reinstatement cannot create a second valid credential of the same type.
    /// @dev Without this guard the O(1) index would silently point at one of two
    ///      simultaneously-valid credentials.
    function test_RevertWhen_ReinstatingWouldDuplicate() public {
        uint256 first = _issue(365 days);
        vm.prank(credentialIssuer);
        credentialRegistry.suspendCredential(first);

        uint256 second = _issue(365 days);

        vm.expectRevert(
            abi.encodeWithSelector(
                ICredentialRegistry.DuplicateValidCredential.selector, subjectOrg, MAINTENANCE, second
            )
        );
        vm.prank(credentialIssuer);
        credentialRegistry.reinstateCredential(first);
    }

    /// @notice Revocation is terminal — a revoked credential never becomes valid again.
    /// @dev Roadmap §16 / INV-CRED-03. Reissuance mints a new id.
    function test_Revoke_IsTerminal() public {
        uint256 credentialId = _issue(365 days);

        vm.prank(credentialIssuer);
        credentialRegistry.revokeCredential(credentialId);
        assertFalse(credentialRegistry.isValid(credentialId), "revoked credential valid");

        vm.expectRevert(
            abi.encodeWithSelector(
                ICredentialRegistry.InvalidCredentialTransition.selector,
                ICredentialRegistry.CredentialStatus.REVOKED,
                ICredentialRegistry.CredentialStatus.ACTIVE
            )
        );
        vm.prank(credentialIssuer);
        credentialRegistry.reinstateCredential(credentialId);

        uint256 replacement = _issue(365 days);
        assertTrue(replacement > credentialId, "reissuance did not mint a new id");
    }

    /// @notice A suspended credential can be revoked directly.
    function test_Revoke_FromSuspended() public {
        uint256 credentialId = _issue(365 days);
        vm.startPrank(credentialIssuer);
        credentialRegistry.suspendCredential(credentialId);
        credentialRegistry.revokeCredential(credentialId);
        vm.stopPrank();

        assertEq(
            uint8(credentialRegistry.getCredential(credentialId).status),
            uint8(ICredentialRegistry.CredentialStatus.REVOKED),
            "not revoked"
        );
    }

    /*//////////////////////////////////////////////////////////////
                                 EXPIRY
    //////////////////////////////////////////////////////////////*/

    /// @notice Anyone may record an expiry that has already occurred.
    function testFuzz_ExpireCredential_IsPermissionless(address caller) public {
        _assumeSafeRecipient(caller);
        uint256 credentialId = _issue(1 days);
        vm.warp(block.timestamp + 2 days);

        vm.prank(caller);
        credentialRegistry.expireCredential(credentialId);

        assertEq(
            uint8(credentialRegistry.getCredential(credentialId).status),
            uint8(ICredentialRegistry.CredentialStatus.EXPIRED),
            "not expired"
        );
        assertEq(credentialRegistry.validCredentialOfType(subjectOrg, MAINTENANCE), 0, "index not cleared");
    }

    /// @notice Expiry cannot be recorded before it has happened.
    function test_RevertWhen_ExpiringUnexpiredCredential() public {
        uint256 credentialId = _issue(365 days);
        uint40 expiry = credentialRegistry.getCredential(credentialId).expiresAt;

        vm.expectRevert(abi.encodeWithSelector(ICredentialRegistry.CredentialNotExpired.selector, credentialId, expiry));
        credentialRegistry.expireCredential(credentialId);
    }

    /// @notice A non-expiring credential can never be expired.
    function test_RevertWhen_ExpiringNonExpiringCredential() public {
        uint256 credentialId = _issue(0);

        vm.expectRevert(
            abi.encodeWithSelector(ICredentialRegistry.CredentialNotExpired.selector, credentialId, uint40(0))
        );
        credentialRegistry.expireCredential(credentialId);
    }

    /// @notice A suspended credential can also be expired.
    function test_Expire_FromSuspended() public {
        uint256 credentialId = _issue(1 days);
        vm.prank(credentialIssuer);
        credentialRegistry.suspendCredential(credentialId);

        vm.warp(block.timestamp + 2 days);
        credentialRegistry.expireCredential(credentialId);

        assertEq(
            uint8(credentialRegistry.getCredential(credentialId).status),
            uint8(ICredentialRegistry.CredentialStatus.EXPIRED),
            "not expired"
        );
    }

    /// @notice Expiry is terminal.
    function test_Expire_IsTerminal() public {
        uint256 credentialId = _issue(1 days);
        vm.warp(block.timestamp + 2 days);
        credentialRegistry.expireCredential(credentialId);

        vm.expectRevert(
            abi.encodeWithSelector(
                ICredentialRegistry.InvalidCredentialTransition.selector,
                ICredentialRegistry.CredentialStatus.EXPIRED,
                ICredentialRegistry.CredentialStatus.SUSPENDED
            )
        );
        vm.prank(credentialIssuer);
        credentialRegistry.suspendCredential(credentialId);
    }

    /*//////////////////////////////////////////////////////////////
                            TRANSITION TABLE
    //////////////////////////////////////////////////////////////*/

    /// @notice The legal transition set matches `docs/state-machines.md` §2 exactly.
    function test_TransitionTable_MatchesSpecification() public view {
        uint8 active = uint8(ICredentialRegistry.CredentialStatus.ACTIVE);
        uint8 suspended = uint8(ICredentialRegistry.CredentialStatus.SUSPENDED);
        uint8 expired = uint8(ICredentialRegistry.CredentialStatus.EXPIRED);
        uint8 revoked = uint8(ICredentialRegistry.CredentialStatus.REVOKED);

        for (uint8 from; from <= revoked; ++from) {
            for (uint8 to; to <= revoked; ++to) {
                bool expected = (from == active && (to == suspended || to == revoked || to == expired))
                    || (from == suspended && (to == active || to == revoked || to == expired));

                assertEq(
                    credentialRegistry.isValidTransition(
                        ICredentialRegistry.CredentialStatus(from), ICredentialRegistry.CredentialStatus(to)
                    ),
                    expected,
                    "transition table drifted from specification"
                );
            }
        }

        // Both terminal states are absorbing — the basis of INV-CRED-03.
        for (uint8 to; to <= revoked; ++to) {
            assertFalse(
                credentialRegistry.isValidTransition(
                    ICredentialRegistry.CredentialStatus.EXPIRED, ICredentialRegistry.CredentialStatus(to)
                ),
                "EXPIRED is not absorbing"
            );
            assertFalse(
                credentialRegistry.isValidTransition(
                    ICredentialRegistry.CredentialStatus.REVOKED, ICredentialRegistry.CredentialStatus(to)
                ),
                "REVOKED is not absorbing"
            );
        }
    }

    /*//////////////////////////////////////////////////////////////
                                  PAUSE
    //////////////////////////////////////////////////////////////*/

    /// @notice Pausing blocks issuance and reinstatement.
    function test_Pause_BlocksAuthorityGrantingActions() public {
        uint256 credentialId = _issue(365 days);
        vm.prank(credentialIssuer);
        credentialRegistry.suspendCredential(credentialId);

        vm.prank(pauser);
        credentialRegistry.pause();

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(credentialIssuer);
        credentialRegistry.reinstateCredential(credentialId);

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(credentialIssuer);
        credentialRegistry.issueCredential(0, address(0), subjectOrg, INSPECTION, 0, CRED_HASH);
    }

    /// @notice Authority-reducing actions stay available while paused.
    function test_Pause_AllowsAuthorityReducingActions() public {
        uint256 suspendable = _issue(365 days);
        vm.prank(credentialIssuer);
        uint256 expirable = credentialRegistry.issueCredential(
            0, address(0), subjectOrg, INSPECTION, uint40(block.timestamp + 1 days), CRED_HASH
        );

        vm.prank(pauser);
        credentialRegistry.pause();

        vm.prank(credentialIssuer);
        credentialRegistry.suspendCredential(suspendable);
        assertFalse(credentialRegistry.isValid(suspendable), "suspend blocked while paused");

        vm.prank(credentialIssuer);
        credentialRegistry.revokeCredential(suspendable);

        vm.warp(block.timestamp + 2 days);
        credentialRegistry.expireCredential(expirable);
        assertEq(
            uint8(credentialRegistry.getCredential(expirable).status),
            uint8(ICredentialRegistry.CredentialStatus.EXPIRED),
            "expire blocked while paused"
        );
    }

    /*//////////////////////////////////////////////////////////////
                        ORGANIZATION INTERACTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Revoking an organization does not retroactively void its credentials.
    /// @dev Protocol history is append-only. Consumers re-check organization status at
    ///      use time; that is Phase 5's job, not this registry's.
    function test_OrganizationRevocationDoesNotVoidCredential() public {
        uint256 credentialId = _issue(365 days);

        vm.prank(protocolAdmin);
        orgRegistry.revokeOrganization(subjectOrg);

        assertTrue(credentialRegistry.isValid(credentialId), "credential retroactively voided");
        assertFalse(orgRegistry.isVerified(subjectOrg), "organization still verified");
    }
}
