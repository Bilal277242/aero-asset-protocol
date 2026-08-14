import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BANNER, CONTRACTS, GENERATED_DIR, INTERFACES, readArtifact } from "./shared.mts";

type AbiError = { type: "error"; name: string; inputs: { name: string; type: string }[] };

/**
 * Collects every custom error across the protocol into one ABI fragment.
 *
 * The protocol uses custom errors exclusively — there is no `require`-with-string
 * anywhere in `src/`. Without this, every revert renders as "execution reverted" and the
 * UI cannot tell a user whether they are unverified, locked, too early, or simply not
 * the buyer.
 *
 * One combined fragment because errors cross contract boundaries: `Escrow.release` can
 * surface `AssetTransferFrozen` from `AssetOwnership` through a nested call, so decoding
 * against the escrow's ABI alone is not enough.
 */
export async function genErrors(): Promise<{ count: number }> {
  const byName = new Map<string, AbiError>();

  for (const name of [...CONTRACTS, ...INTERFACES]) {
    const artifact = await readArtifact(name);
    if (!artifact) continue;

    for (const entry of artifact.abi) {
      const e = entry as Partial<AbiError>;
      if (e.type !== "error" || !e.name) continue;

      const signature = `${e.name}(${(e.inputs ?? []).map((i) => i.type).join(",")})`;
      const existing = byName.get(e.name);
      if (existing) {
        const existingSig = `${existing.name}(${existing.inputs.map((i) => i.type).join(",")})`;
        if (existingSig !== signature) {
          throw new Error(`error ${e.name} has two signatures: ${existingSig} vs ${signature}`);
        }
        continue;
      }
      byName.set(e.name, entry as AbiError);
    }
  }

  const names = [...byName.keys()].sort();
  const fragments = names.map((n) => byName.get(n)!);

  const body = `${BANNER}
/**
 * Every custom error the protocol can revert with, as one ABI fragment.
 *
 * Pass this to viem's error decoding so a nested revert from another module still
 * resolves to a named error rather than opaque bytes.
 */
export const protocolErrorAbi = ${JSON.stringify(fragments, null, 2)} as const;

/** Every error name, for exhaustiveness checks on the message map. */
export const KNOWN_ERROR_NAMES = [
${names.map((n) => `  ${JSON.stringify(n)},`).join("\n")}
] as const;

export type KnownErrorName = (typeof KNOWN_ERROR_NAMES)[number];
`;

  await writeFile(resolve(GENERATED_DIR, "errors.ts"), body, "utf8");
  return { count: names.length };
}
