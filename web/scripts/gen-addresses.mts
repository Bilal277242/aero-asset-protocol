import { readdir, readFile, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { getAddress, keccak256, toHex } from "viem";
import { BANNER, BROADCAST_DIR, DEPLOYMENTS_DIR, GENERATED_DIR } from "./shared.mts";

/** Address-book keys, mirroring `src/libraries/ProtocolAddressKeys.sol`. */
const ADDRESS_KEYS = [
  "ROLE_MANAGER",
  "PROTOCOL_TIMELOCK",
  "ORGANIZATION_REGISTRY",
  "CREDENTIAL_REGISTRY",
  "ASSET_REGISTRY",
  "ASSET_OWNERSHIP",
  "AIRCRAFT_REGISTRY",
  "COMPONENT_REGISTRY",
  "DOCUMENT_REGISTRY",
  "MAINTENANCE_REGISTRY",
  "ASSET_PASSPORT",
  "MARKETPLACE",
  "FEE_MANAGER",
  "ESCROW_FACTORY",
] as const;

/** Artifact keys that are implementations behind a proxy — never call these directly. */
const IMPLEMENTATION_SUFFIX = "Impl";

/**
 * Snapshots `../deployments/<chainId>.json` into committed TypeScript.
 *
 * ## Why this is committed when `deployments/` is git-ignored
 *
 * That directory is ignored because it is regenerated per chain, not because it is
 * secret — every address in it is public and Etherscan-verified. Committing the derived
 * snapshot is the only thing that lets CI or a Vercel build produce a working app.
 *
 * The snapshot is a cache, not the source of truth. At runtime the app resolves every
 * module through `ProtocolAddressRegistry` and, on any mismatch, uses the on-chain value
 * and shows a drift banner. That mirrors architecture decision D3: modules rotate, the
 * registry is authoritative.
 *
 * ## Implementations are excluded on purpose
 *
 * `deployments/*.json` records both proxies and their implementations. Calling an
 * implementation directly reads empty storage and returns plausible zeroes — during
 * seeding I did exactly this and got `assetCount = 0` from a registry holding four
 * assets. Only proxy addresses reach the generated file.
 */
export async function genAddresses(): Promise<{ summary: string }> {
  const existing = await pathExists(DEPLOYMENTS_DIR);
  if (!existing) {
    return { summary: "skipped (no ../deployments — keeping committed snapshot)" };
  }

  const files = (await readdir(DEPLOYMENTS_DIR)).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    return { summary: "skipped (no artifacts — keeping committed snapshot)" };
  }

  const chains: string[] = [];
  const skipped: number[] = [];

  for (const file of files) {
    const chainId = Number(file.replace(".json", ""));
    if (!Number.isFinite(chainId)) continue;

    const raw = JSON.parse(await readFile(resolve(DEPLOYMENTS_DIR, file), "utf8")) as Record<
      string,
      string
    >;

    const deployedAtBlock = await earliestBlock(chainId);

    // No broadcast receipts means nothing was ever sent for this chain, so the artifact
    // is simulation or test debris rather than a deployment. `Gate5Regression` writes a
    // real-looking `deployments/31337.json` by calling `DeployCore.run()`, and shipping
    // that as a "supported chain" would point the app at addresses that hold no code.
    // A genuine local anvil deploy via `--broadcast` does leave receipts and is kept.
    if (deployedAtBlock === 0n) {
      skipped.push(chainId);
      continue;
    }

    const entries = Object.entries(raw)
      .filter(([key]) => !key.endsWith(IMPLEMENTATION_SUFFIX))
      .map(([key, value]) => `      ${key}: ${JSON.stringify(getAddress(value))},`)
      .sort();

    chains.push(`  ${chainId}: {
    chainId: ${chainId},
    deployedAtBlock: ${deployedAtBlock}n,
    addresses: {
${entries.join("\n")}
    },
  },`);
  }

  const keyEntries = ADDRESS_KEYS.map(
    (k) => `  ${k}: ${JSON.stringify(keccak256(toHex(`aeroasset.address.${k}`)))},`,
  ).join("\n");

  const body = `${BANNER}
import type { Address } from "viem";

/**
 * Snapshot of the deployed address book. A cache, not the source of truth — the app
 * reconciles it against \`ProtocolAddressRegistry\` at runtime and the registry wins.
 *
 * Implementation addresses are deliberately excluded: calling an implementation instead
 * of its proxy reads empty storage and silently returns zeroes.
 */
export const deployments = {
${chains.join("\n")}
} as const;

export type SupportedChainId = keyof typeof deployments;

export function isSupportedChain(id: number): id is SupportedChainId {
  return id in deployments;
}

/** \`keccak256("aeroasset.address.<NAME>")\`, mirroring ProtocolAddressKeys.sol. */
export const ADDRESS_KEYS = {
${keyEntries}
} as const satisfies Record<string, \`0x\${string}\`>;

/** Maps an address-book key to the artifact key holding the same address. */
export const KEY_TO_ARTIFACT = {
  ROLE_MANAGER: "roleManager",
  PROTOCOL_TIMELOCK: "protocolTimelock",
  ORGANIZATION_REGISTRY: "organizationRegistry",
  CREDENTIAL_REGISTRY: "credentialRegistry",
  ASSET_REGISTRY: "assetRegistry",
  ASSET_OWNERSHIP: "assetOwnership",
  AIRCRAFT_REGISTRY: "aircraftRegistry",
  COMPONENT_REGISTRY: "componentRegistry",
  DOCUMENT_REGISTRY: "documentRegistry",
  MAINTENANCE_REGISTRY: "maintenanceRegistry",
  ASSET_PASSPORT: "assetPassport",
  MARKETPLACE: "marketplace",
  FEE_MANAGER: "feeManager",
  ESCROW_FACTORY: "escrowFactory",
} as const satisfies Record<keyof typeof ADDRESS_KEYS, string>;

export type AddressBook = Record<keyof typeof ADDRESS_KEYS, Address>;
`;

  if (chains.length === 0) {
    return { summary: "skipped (no chain had broadcast receipts)" };
  }

  await writeFile(resolve(GENERATED_DIR, "addresses.ts"), body, "utf8");
  const note = skipped.length > 0 ? ` (ignored ${skipped.join(", ")}: no receipts)` : "";
  return { summary: `${chains.length} chain(s)${note}` };
}

/**
 * Earliest block containing a deployment receipt, used as the `fromBlock` floor for
 * every log scan. Without it, every historical query starts at genesis.
 */
async function earliestBlock(chainId: number): Promise<bigint> {
  let earliest: bigint | null = null;

  try {
    for (const scriptDir of await readdir(BROADCAST_DIR)) {
      const runPath = resolve(BROADCAST_DIR, scriptDir, String(chainId), "run-latest.json");
      if (!(await pathExists(runPath))) continue;

      const run = JSON.parse(await readFile(runPath, "utf8")) as {
        receipts?: { blockNumber?: string | number }[];
      };
      for (const receipt of run.receipts ?? []) {
        const value = receipt.blockNumber;
        if (value === undefined) continue;
        const block = typeof value === "string" ? BigInt(value) : BigInt(Math.floor(value));
        if (earliest === null || block < earliest) earliest = block;
      }
    }
  } catch {
    // broadcast/ absent (fresh clone). Fall through to 0.
  }

  return earliest ?? 0n;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
