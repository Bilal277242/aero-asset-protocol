import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BANNER, GENERATED_DIR, INTERFACES, readArtifact, type AstNode } from "./shared.mts";

/**
 * Extracts every `EnumDefinition` from the interface ASTs.
 *
 * Generated rather than hand-written because an off-by-one is silent and severe: a UI
 * that renders `ListingStatus[2]` as "CANCELLED" instead of "SOLD" is wrong in a way no
 * type checker catches and no reviewer notices. The compiler is the only reliable source.
 */
export async function genEnums(): Promise<{ count: number }> {
  const found = new Map<string, string[]>();

  for (const iface of INTERFACES) {
    const artifact = await readArtifact(iface);
    if (!artifact?.ast) continue;
    collect(artifact.ast as AstNode, found);
  }

  const names = [...found.keys()].sort();
  const blocks = names.map((name) => {
    const members = found.get(name) ?? [];
    const entries = members.map((m, i) => `  ${m}: ${i},`).join("\n");
    const labels = members
      .map((m, i) => `  ${i}: ${JSON.stringify(toLabel(m))},`)
      .join("\n");

    return `export const ${name} = {
${entries}
} as const;
export type ${name} = (typeof ${name})[keyof typeof ${name}];

export const ${lower(name)}Label: Record<number, string> = {
${labels}
};`;
  });

  const body = `${BANNER}
/**
 * Solidity enums, extracted from the compiler's AST.
 *
 * Values are positional and must never be reordered by hand — regenerate instead.
 */

${blocks.join("\n\n")}
`;

  await writeFile(resolve(GENERATED_DIR, "enums.ts"), body, "utf8");
  return { count: names.length };
}

function collect(node: unknown, into: Map<string, string[]>): void {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, into);
    return;
  }
  if (!node || typeof node !== "object") return;

  const n = node as AstNode;
  if (n.nodeType === "EnumDefinition" && n.name) {
    const members = (n.members ?? []).map((m) => m.name).filter((m): m is string => !!m);
    // Same enum can appear in several artifacts; identical definitions are expected.
    const existing = into.get(n.name);
    if (existing && existing.join() !== members.join()) {
      throw new Error(
        `enum ${n.name} defined twice with different members: [${existing}] vs [${members}]`,
      );
    }
    into.set(n.name, members);
  }

  for (const value of Object.values(node as Record<string, unknown>)) {
    collect(value, into);
  }
}

/** `UNDER_MAINTENANCE` -> `Under maintenance`. */
function toLabel(member: string): string {
  const words = member.toLowerCase().split("_");
  const [first = "", ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
