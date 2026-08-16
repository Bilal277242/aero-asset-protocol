import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ENUM_SOURCES, GENERATED_DIR, banner, readArtifact, type AstNode } from "./shared.mts";

/**
 * Emits every protocol enum, with a display-label map alongside.
 *
 * Enums come from the artifact **AST**, not the ABI, because the ABI only ever says
 * `uint8`. Transcribing them by hand is how an interface ends up rendering "Sold" where
 * the chain said "Cancelled" — an off-by-one that no type checker can catch and no test
 * will notice unless it happens to assert on that exact member.
 */
export async function genEnums(): Promise<{ count: number }> {
  const found = new Map<string, string[]>();

  for (const name of ENUM_SOURCES) {
    const artifact = await readArtifact(name);
    walk(artifact.ast?.nodes ?? [], found);
  }

  const names = [...found.keys()].sort();
  if (names.length === 0) {
    throw new Error(
      "No enums found in the interface ASTs. Either `forge build` produced artifacts " +
        "without `ast` output, or ENUM_SOURCES is out of date. Emitting an empty enum " +
        "file would silently break every status label in the app.",
    );
  }
  const out: string[] = [banner("artifact AST EnumDefinition nodes")];

  for (const enumName of names) {
    const members = found.get(enumName) ?? [];

    out.push(`export const ${enumName} = {`);
    members.forEach((m, i) => out.push(`  ${m}: ${i},`));
    out.push(`} as const;`);
    out.push(`export type ${enumName} = (typeof ${enumName})[keyof typeof ${enumName}];`);
    out.push("");

    out.push(`export const ${lower(enumName)}Label: Record<number, string> = {`);
    members.forEach((m, i) => out.push(`  ${i}: ${JSON.stringify(humanize(m))},`));
    out.push(`};`);
    out.push("");
  }

  await writeFile(resolve(GENERATED_DIR, "enums.ts"), out.join("\n"), "utf8");
  return { count: names.length };
}

function walk(nodes: AstNode[], into: Map<string, string[]>): void {
  for (const node of nodes) {
    if (node.nodeType === "EnumDefinition" && node.name) {
      const members = (node.members ?? [])
        .map((m) => m.name)
        .filter((n): n is string => typeof n === "string");
      // Identical enums are declared in both an interface and its implementation;
      // keeping the first is fine because they are the same definition.
      if (!into.has(node.name)) into.set(node.name, members);
    }
    if (node.nodes) walk(node.nodes, into);
  }
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Aviation initialisms that must not be sentence-cased.
 *
 * An explicit set rather than a length heuristic: "JET" is three characters and is not
 * an initialism, so `BUSINESS_JET` was rendering as "Business JET". Guessing from length
 * gets aviation vocabulary wrong in both directions.
 */
const INITIALISMS = new Set(["AD", "SB", "APU", "MRO", "UAS", "ETOPS"]);

/** `AD_COMPLIANCE` -> `AD compliance`; `A_CHECK` -> `A check`; `BUSINESS_JET` -> `Business jet`. */
function humanize(member: string): string {
  return member
    .split("_")
    .map((w, i) => {
      // Single letters are check designations (A, B, C, D) and stay capitalised.
      if (w.length === 1 || INITIALISMS.has(w)) return w;
      const lowered = w.toLowerCase();
      return i === 0 ? lowered.charAt(0).toUpperCase() + lowered.slice(1) : lowered;
    })
    .join(" ");
}
