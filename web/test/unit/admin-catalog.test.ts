import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PRIVILEGED_ACTIONS,
  PAUSABLE_MODULES,
  SECTION_LABEL,
  actionsInSection,
} from "@/lib/api/admin-catalog";
import { PROTOCOL_ROLES } from "@/lib/api/role-catalog";

/**
 * The privileged-function inventory, checked against the contracts it claims to describe.
 *
 * An admin console's inventory is only useful if it is complete and accurate, and both
 * properties rot silently: add an `onlyRole` function to a contract and nothing here
 * fails, it just quietly stops being the full picture. So these tests read `src/` and
 * assert the catalog agrees with it.
 *
 * The role assignments matter most. A wrong `role` on an entry produces a console that
 * offers an action to the wrong people — they click, the contract refuses, and the
 * interface has wasted their gas estimate and their confidence.
 */

const src = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../src/${path}`, import.meta.url)), "utf8");

/** Every `onlyRole(ProtocolRoles.X_ROLE)` in a contract, with the function it guards. */
function guardedFunctions(sol: string): { fn: string; role: string }[] {
  const stripped = sol.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { fn: string; role: string }[] = [];

  // Matches both `function f(...) external onlyRole(R)` and the multi-line modifier form.
  const re = /function\s+(\w+)\s*\([^)]*\)([^{;]*)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const [, fn = "", modifiers = ""] = m;
    const role = /onlyRole\(ProtocolRoles\.(\w+)_ROLE\)/.exec(modifiers);
    if (role?.[1]) out.push({ fn, role: role[1] });
  }
  return out;
}

describe("catalog integrity", () => {
  it("gives every action a role the protocol actually defines", () => {
    const known = new Set<string>([...PROTOCOL_ROLES, "DEFAULT_ADMIN"]);
    for (const a of PRIVILEGED_ACTIONS) {
      expect(known.has(a.role), `${a.id} → ${a.role}`).toBe(true);
    }
  });

  it("uses unique ids", () => {
    const ids = PRIVILEGED_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("labels every section it uses", () => {
    for (const a of PRIVILEGED_ACTIONS) {
      expect(SECTION_LABEL[a.section], a.section).toBeTruthy();
    }
  });

  it("places every action in exactly one section", () => {
    const counted = (Object.keys(SECTION_LABEL) as (keyof typeof SECTION_LABEL)[]).reduce(
      (sum, s) => sum + actionsInSection(s).length,
      0,
    );
    expect(counted).toBe(PRIVILEGED_ACTIONS.length);
  });

  /**
   * A contract-only role can never be held by a wallet, so offering its action would be
   * offering something nobody can ever do. The console renders these as reference only,
   * and that depends on them never carrying a builder.
   */
  it("never marks a contract-only action as buildable", () => {
    for (const a of PRIVILEGED_ACTIONS.filter((x) => x.contractOnly)) {
      expect(a.buildable, a.id).toBeFalsy();
    }
  });

  it("treats every irreversible action as dangerous", () => {
    for (const a of PRIVILEGED_ACTIONS.filter((x) => x.irreversible)) {
      expect(a.danger, a.id).toBe(true);
    }
  });

  /**
   * An action the console will not build must say why, in the entry itself. Silence there
   * renders as a gap in the UI that reads like a bug rather than a decision — which is
   * what it looked like before this test existed.
   */
  it("explains every action it does not offer", () => {
    for (const a of PRIVILEGED_ACTIONS) {
      if (a.buildable) continue;
      expect(a.note, `${a.id} is not buildable and has no note`).toBeTruthy();
    }
  });

  it("marks nothing buildable that no wallet could execute", () => {
    for (const a of PRIVILEGED_ACTIONS.filter((x) => x.buildable)) {
      expect(a.contractOnly, a.id).toBeFalsy();
    }
  });
});

describe("against the contracts", () => {
  const cases = [
    { file: "identity/OrganizationRegistry.sol", contract: "OrganizationRegistry" },
    { file: "identity/CredentialRegistry.sol", contract: "CredentialRegistry" },
    { file: "assets/AssetRegistry.sol", contract: "AssetRegistry" },
    { file: "fees/FeeManager.sol", contract: "FeeManager" },
  ];

  it.each(cases)("catalogs every role-guarded function in $contract", ({ file, contract }) => {
    const guarded = guardedFunctions(src(file));
    expect(guarded.length).toBeGreaterThan(0);

    const catalogued = new Map(
      PRIVILEGED_ACTIONS.filter((a) => a.contract === contract).map((a) => [
        a.signature.replace(/\(.*/, ""),
        a.role,
      ]),
    );

    for (const { fn, role } of guarded) {
      expect(catalogued.has(fn), `${contract}.${fn} is guarded but not catalogued`).toBe(true);
      expect(catalogued.get(fn), `${contract}.${fn} role`).toBe(role);
    }
  });

  /**
   * `pause`, `unpause` and `_authorizeUpgrade` are inherited, so they appear in the base
   * rather than in any module — which is exactly why they are easy to leave out of an
   * inventory built by reading the modules.
   */
  it("catalogs the inherited module functions and their differing roles", () => {
    const guarded = guardedFunctions(src("core/ProtocolModuleUpgradeable.sol"));
    const byFn = new Map(guarded.map((g) => [g.fn, g.role]));

    expect(byFn.get("pause")).toBe("PAUSER");
    expect(byFn.get("unpause")).toBe("PROTOCOL_ADMIN");
    expect(byFn.get("_authorizeUpgrade")).toBe("PROTOCOL_ADMIN");

    const pause = PRIVILEGED_ACTIONS.find((a) => a.id === "pause");
    const unpause = PRIVILEGED_ACTIONS.find((a) => a.id === "unpause");
    expect(pause?.role).toBe("PAUSER");
    expect(unpause?.role).toBe("PROTOCOL_ADMIN");
  });

  it("lists exactly the modules that inherit the pausable base", () => {
    const modules = [
      "assets/AircraftRegistry.sol",
      "assets/AssetRegistry.sol",
      "assets/ComponentRegistry.sol",
      "documents/DocumentRegistry.sol",
      "identity/CredentialRegistry.sol",
      "identity/OrganizationRegistry.sol",
      "maintenance/MaintenanceRegistry.sol",
      "marketplace/MarketplaceBase.sol",
      "ownership/AssetOwnership.sol",
    ];

    for (const file of modules) {
      expect(src(file), file).toContain("ProtocolModuleUpgradeable");
    }
    expect(PAUSABLE_MODULES).toHaveLength(modules.length);
  });

  /**
   * `RoleManager` is deliberately immutable — it gates all other authorization, so
   * removing its admin key from the threat model is itself a security property
   * (architecture D4). A console that offered to pause or upgrade it would be describing
   * a protocol that does not exist.
   */
  it("does not claim RoleManager is pausable or upgradeable", () => {
    const sol = src("core/RoleManager.sol");
    expect(sol).not.toContain("ProtocolModuleUpgradeable");
    expect(sol).not.toContain("UUPSUpgradeable");
    expect(PAUSABLE_MODULES as readonly string[]).not.toContain("ROLE_MANAGER");
  });
});
