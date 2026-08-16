import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { toFunctionSelector } from "viem";
import { CONTRACTS, GENERATED_DIR, banner, readArtifact, stableJson } from "./shared.mts";

type AbiError = { type: string; name?: string; inputs?: { type: string; name?: string }[] };

/**
 * Collects every custom error across all sixteen ABIs into one decoding table.
 *
 * The protocol declares 116 of them and uses no `require`-with-string anywhere, so this
 * table is the difference between a user seeing `ComponentIsInstalled(4, 3)` — which
 * names the engine and the airframe it is bolted to — and seeing "Transaction failed".
 *
 * Deduplicated by full signature, because shared errors such as `ZeroAddress()` and
 * `MissingRole(bytes32,address)` appear in almost every contract.
 */
export async function genErrors(): Promise<{ count: number }> {
  const bySignature = new Map<string, AbiError>();
  const owners = new Map<string, Set<string>>();

  for (const name of CONTRACTS) {
    const { abi } = await readArtifact(name);
    for (const item of abi as AbiError[]) {
      if (item.type !== "error" || !item.name) continue;
      const signature = `${item.name}(${(item.inputs ?? []).map((i) => i.type).join(",")})`;
      if (!bySignature.has(signature)) bySignature.set(signature, item);
      if (!owners.has(signature)) owners.set(signature, new Set());
      owners.get(signature)?.add(name);
    }
  }

  const signatures = [...bySignature.keys()].sort();
  const entries = signatures.map((s) => bySignature.get(s));

  const contents = [
    banner("every {type:'error'} entry across the sixteen deployed ABIs"),
    "/**",
    " * Every custom error the protocol can revert with, as one ABI.",
    " *",
    " * Pass this to viem's `decodeErrorResult` or `BaseError.walk` to turn a raw revert",
    " * into a named error with typed arguments.",
    " */",
    `export const protocolErrorAbi = ${stableJson(entries)} as const;`,
    "",
    "/** Signatures, for coverage checks against the copy table. */",
    `export const protocolErrorSignatures = ${stableJson(signatures)} as const;`,
    "",
    "/** Which contracts declare each error. Useful when an error name is ambiguous. */",
    `export const protocolErrorOwners: Record<string, string[]> = ${stableJson(
      Object.fromEntries(signatures.map((s) => [s, [...(owners.get(s) ?? [])].sort()])),
    )};`,
    "",
    "/**",
    " * Four-byte selector to error name.",
    " *",
    " * The fallback for when a revert arrives with its arguments already discarded. viem",
    " * decodes against the ABI of the contract that was *called*, so an error declared",
    " * elsewhere — every `AssetPassport` revert, for instance — surfaces as a bare",
    " * selector with no payload. This still names it.",
    " */",
    `export const protocolErrorSelectors: Record<string, string> = ${stableJson(
      Object.fromEntries(
        signatures.map((s) => [toFunctionSelector(s), s.slice(0, s.indexOf("("))]),
      ),
    )};`,
    "",
  ].join("\n");

  await writeFile(resolve(GENERATED_DIR, "errors.ts"), contents, "utf8");
  return { count: signatures.length };
}
