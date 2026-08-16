import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  documentStatusLabel,
  documentTypeLabel,
  maintenanceTypeLabel,
  DocumentStatus,
  DocumentType,
  MaintenanceType,
} from "@/lib/contracts/generated/enums";

/**
 * Enum members are positional, and a stale copy fails silently.
 *
 * `documentTypeLabel[7]` is "Weight and balance" only because `WEIGHT_AND_BALANCE` is the
 * eighth member of the Solidity enum. Insert a member above it and every label below
 * shifts by one — the UI keeps rendering confidently, just wrongly, and a bill of sale
 * starts displaying as a lease agreement. Nothing throws.
 *
 * Codegen derives these from the compiled AST, so this cannot drift while `npm run
 * codegen` is run. That is exactly the assumption worth testing: this reads the interface
 * source and asserts the committed output still agrees with it, catching both a forgotten
 * regeneration and a label map missing an entry.
 */

const source = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../src/interfaces/${path}`, import.meta.url)), "utf8");

/**
 * Pulls the members of one enum out of a Solidity interface, in declaration order.
 *
 * Comments are stripped first: every member here carries a NatSpec line above it, and
 * `@notice Certificate of airworthiness.` contains words that would otherwise be read as
 * members.
 */
function enumMembers(sol: string, name: string): string[] {
  const stripped = sol.replace(/\/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const match = stripped.match(new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`));
  if (!match?.[1]) throw new Error(`No enum ${name} found`);
  return match[1]
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}

const cases = [
  {
    name: "DocumentType",
    file: "IDocumentRegistry.sol",
    generated: DocumentType as Record<string, number>,
    labels: documentTypeLabel,
  },
  {
    name: "DocumentStatus",
    file: "IDocumentRegistry.sol",
    generated: DocumentStatus as Record<string, number>,
    labels: documentStatusLabel,
  },
  {
    name: "MaintenanceType",
    file: "IMaintenanceRegistry.sol",
    generated: MaintenanceType as Record<string, number>,
    labels: maintenanceTypeLabel,
  },
] as const;

describe.each(cases)("$name", ({ name, file, generated, labels }) => {
  const declared = enumMembers(source(file), name);

  it("has every member the interface declares, at the same index", () => {
    expect(declared.length).toBeGreaterThan(1);
    declared.forEach((member, index) => {
      expect(generated[member], `${name}.${member}`).toBe(index);
    });
  });

  it("declares no member the interface does not", () => {
    expect(Object.keys(generated).sort()).toEqual([...declared].sort());
  });

  it("has a display label for every member", () => {
    declared.forEach((member, index) => {
      expect(labels[index], `label for ${name}.${member}`).toBeTruthy();
    });
  });
});

describe("record semantics", () => {
  /**
   * `UNSPECIFIED` is a reserved sentinel the contracts reject as an argument, so every
   * type picker filters it out by key `"0"`. That filter is only correct while the
   * sentinel really is first.
   */
  it("keeps UNSPECIFIED at index 0 for both type enums", () => {
    expect(DocumentType.UNSPECIFIED).toBe(0);
    expect(MaintenanceType.UNSPECIFIED).toBe(0);
  });

  /**
   * `DocumentStatus.NONE` is both the sentinel and the value of any unregistered id,
   * which is how `_requireExists` detects a miss. A document that legitimately read NONE
   * would be indistinguishable from one that does not exist.
   */
  it("keeps DocumentStatus.NONE at 0, where absence is detected", () => {
    expect(DocumentStatus.NONE).toBe(0);
    expect(DocumentStatus.ACTIVE).toBeGreaterThan(0);
  });
});
