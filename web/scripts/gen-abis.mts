import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { CONTRACTS, GENERATED_DIR, banner, camel, readArtifact, stableJson } from "./shared.mts";

/**
 * Emits one module per contract ABI, each `as const`.
 *
 * The `as const` is load-bearing rather than stylistic: without it viem cannot infer
 * return types, and `getPassport` degrades from a seventeen-field named struct to
 * `unknown`. Every downstream type in the domain layer depends on it.
 */
export async function genAbis(): Promise<{ count: number }> {
  const dir = resolve(GENERATED_DIR, "abis");
  await mkdir(dir, { recursive: true });

  const indexLines: string[] = [banner("out/<Contract>.sol/<Contract>.json")];

  for (const name of CONTRACTS) {
    const { abi } = await readArtifact(name);
    const ident = `${camel(name)}Abi`;

    await writeFile(
      resolve(dir, `${camel(name)}.ts`),
      `${banner(`out/${name}.sol/${name}.json`)}export const ${ident} = ${stableJson(abi)} as const;\n`,
      "utf8",
    );

    indexLines.push(`export { ${ident} } from "./${camel(name)}";`);
  }

  await writeFile(resolve(dir, "index.ts"), indexLines.join("\n") + "\n", "utf8");
  return { count: CONTRACTS.length };
}
