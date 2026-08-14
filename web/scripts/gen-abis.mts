import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { keccak256, toHex } from "viem";
import { BANNER, CONTRACTS, GENERATED_DIR, lowerFirst, readArtifact } from "./shared.mts";

/**
 * Emits one `<contract>.ts` per contract containing just its ABI, plus a manifest of
 * ABI hashes so drift is detectable without diffing thousands of lines.
 *
 * `as const` is not cosmetic — it is what gives viem full return-type inference. Without
 * it `getPassport` returns `unknown[]` instead of a typed 17-field struct, and every
 * field access becomes a cast.
 */
export async function genAbis(): Promise<{ count: number }> {
  const hashes: Record<string, string> = {};
  let count = 0;

  for (const name of CONTRACTS) {
    const artifact = await readArtifact(name);
    if (!artifact) {
      throw new Error(
        `missing artifact for ${name}. Run \`forge build\` in the repo root first.`,
      );
    }

    const abi = artifact.abi;
    const varName = `${lowerFirst(name)}Abi`;
    const body = `${BANNER}
export const ${varName} = ${JSON.stringify(abi, null, 2)} as const;
`;

    await writeFile(resolve(GENERATED_DIR, "abis", `${lowerFirst(name)}.ts`), body, "utf8");
    hashes[name] = keccak256(toHex(JSON.stringify(abi))).slice(0, 18);
    count += 1;
  }

  const index = `${BANNER}
${CONTRACTS.map((n) => `export { ${lowerFirst(n)}Abi } from "./${lowerFirst(n)}";`).join("\n")}
`;
  await writeFile(resolve(GENERATED_DIR, "abis", "index.ts"), index, "utf8");

  const manifest = `${BANNER}
/** Truncated keccak of each ABI, for detecting drift against a deployed protocol. */
export const abiHashes = ${JSON.stringify(hashes, null, 2)} as const;

export const generatedAt = ${JSON.stringify(new Date().toISOString().slice(0, 10))} as const;
`;
  await writeFile(resolve(GENERATED_DIR, "manifest.ts"), manifest, "utf8");

  return { count };
}
