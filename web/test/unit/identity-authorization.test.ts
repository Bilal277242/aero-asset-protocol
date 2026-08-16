import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import {
  deriveCredentialActions,
  deriveOrgActions,
  canIssueCredential,
  type IdentityViewer,
} from "@/lib/api/identity-actions";
import {
  PROTOCOL_ROLES,
  emptyRoleSet,
  type ProtocolRole,
  type RoleSet,
} from "@/lib/api/role-catalog";
import type { CredentialView, OrgView } from "@/lib/api/identity";
import { CredentialStatus, OrganizationStatus } from "@/lib/contracts/generated/enums";

/**
 * Organization and credential authorization, asserted against the contracts' real rules.
 *
 * Everything here was read out of `OrganizationRegistry.sol` and `CredentialRegistry.sol`.
 * The rules that would be wrong if assumed:
 *
 *   verifyOrganization      PENDING only — a suspended org needs `reactivateOrganization`
 *   reactivateOrganization  SUSPENDED only
 *   rejectOrganization      PENDING only
 *   suspendOrganization     VERIFIED only
 *   revokeOrganization      VERIFIED or SUSPENDED — never PENDING, which is rejected
 *   reject/suspend/revoke   NOT pause-gated: they strictly reduce privilege
 *   suspendCredential       ACTIVE only
 *   reinstateCredential     SUSPENDED only, and refused once `expiresAt` has passed
 *   revokeCredential        ACTIVE or SUSPENDED
 *   expireCredential        permissionless, `expiresAt != 0 && expiresAt <= now`
 */

const ADMIN = "0x00000000000000000000000000000000000000a1" as Address;
const NEW_ADMIN = "0x00000000000000000000000000000000000000a2" as Address;
const STRANGER = "0x0000000000000000000000000000000000000f00" as Address;

const NOW = 2_000_000n;

const viewer = (address: Address | undefined, ...roles: ProtocolRole[]): IdentityViewer => ({
  address,
  isConnected: address !== undefined,
  roles: {
    ...emptyRoleSet(),
    ...Object.fromEntries(roles.map((r) => [r, true])),
  } as RoleSet,
});

function org(over: Partial<OrgView> = {}): OrgView {
  return {
    orgId: 1n,
    admin: ADMIN,
    registeredAt: 1_000_000,
    verifiedAt: 1_000_100,
    orgType: 1,
    status: OrganizationStatus.VERIFIED,
    nameHash: "0x11" as Hex,
    metadataHash: "0x22" as Hex,
    metadataURI: "ipfs://profile",
    pendingAdmin: null,
    isVerified: true,
    ...over,
  };
}

function credential(over: Partial<CredentialView> = {}): CredentialView {
  return {
    credentialId: 1n,
    issuerOrgId: 2n,
    subjectOrgId: 1n,
    subject: ADMIN,
    issuedAt: 1_000_000,
    expiresAt: 3_000_000,
    credType: 1,
    status: CredentialStatus.ACTIVE,
    credentialHash: "0x33" as Hex,
    isValid: true,
    isLapsed: false,
    ...over,
  };
}

const orgAction = (o: OrgView, v: IdentityViewer, id: string, paused = false) => {
  const found = deriveOrgActions(o, v, paused).find((a) => a.id === id);
  if (!found) throw new Error(`no organization action "${id}"`);
  return found;
};

const credAction = (c: CredentialView, v: IdentityViewer, id: string, paused = false) => {
  const found = deriveCredentialActions(c, v, paused, NOW).find((a) => a.id === id);
  if (!found) throw new Error(`no credential action "${id}"`);
  return found;
};

// ───────────────────────────────────────── role list is not stale ────

describe("protocol roles", () => {
  /**
   * The frontend keeps its own list of role names to build `keccak256` identifiers from.
   * If a role is added to the library and not here, every check for it silently answers
   * false and its controls disappear — a failure that looks exactly like "not authorized".
   * This reads the contract library so drift is caught rather than discovered.
   */
  it("matches ProtocolRoles.sol exactly", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../../src/libraries/ProtocolRoles.sol", import.meta.url)),
      "utf8",
    );
    const declared = [...source.matchAll(/keccak256\("aeroasset\.role\.([A-Z_]+)"\)/g)].map(
      (m) => m[1],
    );

    expect(declared.length).toBeGreaterThan(0);
    expect([...declared].sort()).toEqual([...PROTOCOL_ROLES].sort());
  });
});

// ─────────────────────────────────────────────── organizations ────

describe("organization actions", () => {
  it("hides every privileged control from an account holding no role", () => {
    const v = viewer(STRANGER);
    const visible = deriveOrgActions(org(), v, false).filter((a) => a.visible);
    expect(visible).toEqual([]);
  });

  it("hides admin controls from a non-admin, including a verifier", () => {
    const v = viewer(STRANGER, "ORG_VERIFIER");
    expect(orgAction(org(), v, "updateOrganization").visible).toBe(false);
    expect(orgAction(org(), v, "setOperator").visible).toBe(false);
    expect(orgAction(org(), v, "transferOrganizationAdmin").visible).toBe(false);
  });

  it("shows admin controls to the admin and no verifier controls", () => {
    const v = viewer(ADMIN);
    expect(orgAction(org(), v, "updateOrganization").visible).toBe(true);
    expect(orgAction(org(), v, "verifyOrganization").visible).toBe(false);
    expect(orgAction(org(), v, "revokeOrganization").visible).toBe(false);
  });

  it("offers verify only from PENDING", () => {
    const v = viewer(STRANGER, "ORG_VERIFIER");
    expect(orgAction(org({ status: OrganizationStatus.PENDING }), v, "verifyOrganization").enabled)
      .toBe(true);
    expect(orgAction(org({ status: OrganizationStatus.VERIFIED }), v, "verifyOrganization").enabled)
      .toBe(false);
    expect(orgAction(org({ status: OrganizationStatus.SUSPENDED }), v, "verifyOrganization").enabled)
      .toBe(false);
  });

  it("points a verifier at reactivate rather than verify for a suspended org", () => {
    const v = viewer(STRANGER, "ORG_VERIFIER");
    const suspended = org({ status: OrganizationStatus.SUSPENDED, isVerified: false });
    expect(orgAction(suspended, v, "verifyOrganization").reason).toMatch(/reactivate/i);
    expect(orgAction(suspended, v, "reactivateOrganization").enabled).toBe(true);
  });

  it("offers reactivate only from SUSPENDED", () => {
    const v = viewer(STRANGER, "ORG_VERIFIER");
    for (const status of [
      OrganizationStatus.PENDING,
      OrganizationStatus.VERIFIED,
      OrganizationStatus.REVOKED,
    ]) {
      expect(orgAction(org({ status }), v, "reactivateOrganization").enabled).toBe(false);
    }
  });

  it("offers suspend only from VERIFIED and reject only from PENDING", () => {
    const v = viewer(STRANGER, "ORG_VERIFIER");
    expect(orgAction(org({ status: OrganizationStatus.VERIFIED }), v, "suspendOrganization").enabled)
      .toBe(true);
    expect(orgAction(org({ status: OrganizationStatus.PENDING }), v, "suspendOrganization").enabled)
      .toBe(false);
    expect(orgAction(org({ status: OrganizationStatus.PENDING }), v, "rejectOrganization").enabled)
      .toBe(true);
    expect(orgAction(org({ status: OrganizationStatus.VERIFIED }), v, "rejectOrganization").enabled)
      .toBe(false);
  });

  it("never offers revoke on a PENDING record — that is rejection", () => {
    const v = viewer(STRANGER, "PROTOCOL_ADMIN");
    expect(orgAction(org({ status: OrganizationStatus.PENDING }), v, "revokeOrganization").enabled)
      .toBe(false);
    expect(orgAction(org({ status: OrganizationStatus.VERIFIED }), v, "revokeOrganization").enabled)
      .toBe(true);
    expect(orgAction(org({ status: OrganizationStatus.SUSPENDED }), v, "revokeOrganization").enabled)
      .toBe(true);
    expect(orgAction(org({ status: OrganizationStatus.REVOKED }), v, "revokeOrganization").enabled)
      .toBe(false);
  });

  it("marks revoke as timelocked so nobody expects it to execute from a wallet", () => {
    const v = viewer(STRANGER, "PROTOCOL_ADMIN");
    expect(orgAction(org(), v, "revokeOrganization").timelocked).toBe(true);
    expect(orgAction(org(), v, "revokeOrganization").roleLabel).toBe("PROTOCOL_ADMIN_ROLE");
  });

  it("keeps privilege-reducing actions available while the registry is paused", () => {
    const verifier = viewer(STRANGER, "ORG_VERIFIER");
    const admin = viewer(STRANGER, "PROTOCOL_ADMIN");

    expect(orgAction(org({ status: OrganizationStatus.PENDING }), verifier, "rejectOrganization", true).enabled)
      .toBe(true);
    expect(orgAction(org(), verifier, "suspendOrganization", true).enabled).toBe(true);
    expect(orgAction(org(), admin, "revokeOrganization", true).enabled).toBe(true);
  });

  it("blocks privilege-granting actions while the registry is paused", () => {
    const verifier = viewer(STRANGER, "ORG_VERIFIER");
    expect(orgAction(org({ status: OrganizationStatus.PENDING }), verifier, "verifyOrganization", true).enabled)
      .toBe(false);
    expect(orgAction(org({ status: OrganizationStatus.SUSPENDED }), verifier, "reactivateOrganization", true).enabled)
      .toBe(false);
    expect(orgAction(org(), viewer(ADMIN), "updateOrganization", true).enabled).toBe(false);
  });

  it("refuses every administrative write on a revoked record", () => {
    const revoked = org({ status: OrganizationStatus.REVOKED, isVerified: false });
    const v = viewer(ADMIN);
    expect(orgAction(revoked, v, "updateOrganization").enabled).toBe(false);
    expect(orgAction(revoked, v, "setOperator").enabled).toBe(false);
    expect(orgAction(revoked, v, "transferOrganizationAdmin").enabled).toBe(false);
  });

  it("offers accept only to the pending admin", () => {
    const pending = org({ pendingAdmin: NEW_ADMIN });
    expect(orgAction(pending, viewer(NEW_ADMIN), "acceptOrganizationAdmin").visible).toBe(true);
    expect(orgAction(pending, viewer(ADMIN), "acceptOrganizationAdmin").visible).toBe(false);
    expect(orgAction(pending, viewer(STRANGER), "acceptOrganizationAdmin").visible).toBe(false);
  });

  it("lets either side cancel a pending transfer, and nobody cancel a missing one", () => {
    const pending = org({ pendingAdmin: NEW_ADMIN });
    expect(orgAction(pending, viewer(ADMIN), "cancelOrganizationAdminTransfer").enabled).toBe(true);
    expect(orgAction(pending, viewer(NEW_ADMIN), "cancelOrganizationAdminTransfer").enabled).toBe(true);
    expect(orgAction(pending, viewer(STRANGER), "cancelOrganizationAdminTransfer").visible).toBe(false);
    expect(orgAction(org(), viewer(ADMIN), "cancelOrganizationAdminTransfer").visible).toBe(false);
  });

  it("compares addresses without case sensitivity", () => {
    const v = viewer(ADMIN.toUpperCase().replace("0X", "0x") as Address);
    expect(orgAction(org(), v, "updateOrganization").visible).toBe(true);
  });

  it("labels every role-gated action with the role it needs", () => {
    const v = viewer(STRANGER, "ORG_VERIFIER", "PROTOCOL_ADMIN");
    for (const a of deriveOrgActions(org(), v, false)) {
      if (a.role) expect(a.roleLabel).toBe(`${a.role}_ROLE`);
    }
  });
});

// ──────────────────────────────────────────────── credentials ────

describe("credential actions", () => {
  it("hides issuer controls from an account without the role", () => {
    const visible = deriveCredentialActions(credential(), viewer(STRANGER), false, NOW).filter(
      (a) => a.visible,
    );
    expect(visible).toEqual([]);
    expect(canIssueCredential(viewer(STRANGER), false).visible).toBe(false);
  });

  it("offers suspend only from ACTIVE", () => {
    const v = viewer(STRANGER, "CREDENTIAL_ISSUER");
    expect(credAction(credential(), v, "suspendCredential").enabled).toBe(true);
    for (const status of [
      CredentialStatus.SUSPENDED,
      CredentialStatus.REVOKED,
      CredentialStatus.EXPIRED,
    ]) {
      expect(credAction(credential({ status }), v, "suspendCredential").enabled).toBe(false);
    }
  });

  it("offers reinstate only from SUSPENDED", () => {
    const v = viewer(STRANGER, "CREDENTIAL_ISSUER");
    expect(credAction(credential({ status: CredentialStatus.SUSPENDED }), v, "reinstateCredential").enabled)
      .toBe(true);
    expect(credAction(credential(), v, "reinstateCredential").enabled).toBe(false);
    expect(credAction(credential({ status: CredentialStatus.REVOKED }), v, "reinstateCredential").enabled)
      .toBe(false);
  });

  it("refuses reinstatement once the deadline has passed, and says why", () => {
    const v = viewer(STRANGER, "CREDENTIAL_ISSUER");
    const lapsedWhileSuspended = credential({
      status: CredentialStatus.SUSPENDED,
      expiresAt: Number(NOW) - 1,
      isValid: false,
    });
    const a = credAction(lapsedWhileSuspended, v, "reinstateCredential");
    expect(a.enabled).toBe(false);
    expect(a.reason).toMatch(/issue a new credential/i);
  });

  it("treats the deadline second itself as expired, matching expireCredential's `<=`", () => {
    const v = viewer(STRANGER, "CREDENTIAL_ISSUER");
    const atDeadline = credential({
      status: CredentialStatus.SUSPENDED,
      expiresAt: Number(NOW),
      isValid: false,
    });
    expect(credAction(atDeadline, v, "reinstateCredential").enabled).toBe(false);

    const oneSecondLeft = credential({
      status: CredentialStatus.SUSPENDED,
      expiresAt: Number(NOW) + 1,
      isValid: false,
    });
    expect(credAction(oneSecondLeft, v, "reinstateCredential").enabled).toBe(true);
  });

  it("treats a zero expiry as never expiring", () => {
    const v = viewer(STRANGER, "CREDENTIAL_ISSUER");
    const perpetual = credential({ status: CredentialStatus.SUSPENDED, expiresAt: 0, isValid: false });
    expect(credAction(perpetual, v, "reinstateCredential").enabled).toBe(true);
  });

  it("offers revoke from ACTIVE or SUSPENDED but never from a terminal state", () => {
    const v = viewer(STRANGER, "CREDENTIAL_ISSUER");
    expect(credAction(credential(), v, "revokeCredential").enabled).toBe(true);
    expect(credAction(credential({ status: CredentialStatus.SUSPENDED }), v, "revokeCredential").enabled)
      .toBe(true);
    expect(credAction(credential({ status: CredentialStatus.REVOKED }), v, "revokeCredential").enabled)
      .toBe(false);
    expect(credAction(credential({ status: CredentialStatus.EXPIRED }), v, "revokeCredential").enabled)
      .toBe(false);
  });

  it("keeps suspend and revoke available while the registry is paused", () => {
    const v = viewer(STRANGER, "CREDENTIAL_ISSUER");
    expect(credAction(credential(), v, "suspendCredential", true).enabled).toBe(true);
    expect(credAction(credential(), v, "revokeCredential", true).enabled).toBe(true);
    expect(credAction(credential({ status: CredentialStatus.SUSPENDED }), v, "reinstateCredential", true).enabled)
      .toBe(false);
    expect(canIssueCredential(viewer(STRANGER, "CREDENTIAL_ISSUER"), true).enabled).toBe(false);
  });

  it("offers recording an expiry to anyone connected, with no role at all", () => {
    const lapsed = credential({ isLapsed: true, isValid: false, expiresAt: Number(NOW) - 1 });
    const a = credAction(lapsed, viewer(STRANGER), "expireCredential");
    expect(a.visible).toBe(true);
    expect(a.enabled).toBe(true);
    expect(a.role).toBeNull();
    expect(a.roleLabel).toBeNull();
  });

  it("hides recording an expiry when nothing has lapsed", () => {
    expect(credAction(credential(), viewer(STRANGER), "expireCredential").visible).toBe(false);
    expect(
      credAction(credential({ status: CredentialStatus.EXPIRED, isValid: false }), viewer(STRANGER), "expireCredential")
        .visible,
    ).toBe(false);
  });

  it("asks a disconnected visitor to connect rather than pretending the button works", () => {
    const lapsed = credential({ isLapsed: true, isValid: false });
    const a = credAction(lapsed, viewer(undefined), "expireCredential");
    expect(a.enabled).toBe(false);
    expect(a.reason).toMatch(/connect/i);
  });

  it("labels every issuer action with CREDENTIAL_ISSUER_ROLE", () => {
    const v = viewer(STRANGER, "CREDENTIAL_ISSUER");
    for (const a of deriveCredentialActions(credential(), v, false, NOW)) {
      if (a.role) expect(a.roleLabel).toBe("CREDENTIAL_ISSUER_ROLE");
    }
    expect(canIssueCredential(v, false).roleLabel).toBe("CREDENTIAL_ISSUER_ROLE");
  });
});
