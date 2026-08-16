import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEPLOYMENTS_DIR, GENERATED_DIR, REPO_ROOT, banner, stableJson } from "./shared.mts";

/**
 * Emits the committed address snapshot.
 *
 * `deployments/` is git-ignored — it is regenerated per chain, not secret; every address
 * in it is on Etherscan. Committing the derived TypeScript is the only thing that makes a
 * CI or hosted build possible at all. Staleness is caught at runtime instead: the app
 * resolves all fourteen keys through `ProtocolAddressRegistry` at boot and raises a drift
 * banner if the snapshot disagrees, with the registry winning.
 *
 * When `deployments/` is absent the previous snapshot is kept rather than emptied, so a
 * CI checkout does not silently produce an app pointing at zero addresses.
 */

/** Maps the artifact's camelCase keys onto the protocol's address-book key names. */
const KEY_MAP: Record<string, string> = {
  roleManager: "ROLE_MANAGER",
  protocolTimelock: "PROTOCOL_TIMELOCK",
  organizationRegistry: "ORGANIZATION_REGISTRY",
  credentialRegistry: "CREDENTIAL_REGISTRY",
  assetRegistry: "ASSET_REGISTRY",
  assetOwnership: "ASSET_OWNERSHIP",
  aircraftRegistry: "AIRCRAFT_REGISTRY",
  componentRegistry: "COMPONENT_REGISTRY",
  documentRegistry: "DOCUMENT_REGISTRY",
  maintenanceRegistry: "MAINTENANCE_REGISTRY",
  assetPassport: "ASSET_PASSPORT",
  marketplace: "MARKETPLACE",
  escrowFactory: "ESCROW_FACTORY",
  feeManager: "FEE_MANAGER",
};

/** Not address-book keys, but needed by the app. */
const EXTRA_KEYS: Record<string, string> = {
  addressRegistry: "ADDRESS_REGISTRY",
  escrowImplementation: "ESCROW_IMPLEMENTATION",
};

export async function genAddresses(): Promise<{ summary: string }> {
  let files: string[];
  try {
    files = (await readdir(DEPLOYMENTS_DIR)).filter((f) => /^\d+\.json$/.test(f));
  } catch {
    return { summary: "skipped (no ../deployments — keeping committed snapshot)" };
  }
  if (files.length === 0) {
    return { summary: "skipped (no deployment artifacts — keeping committed snapshot)" };
  }

  const chains: Record<string, { addresses: Record<string, string>; deployedAtBlock: string }> = {};
  const skipped: string[] = [];

  for (const file of files) {
    const chainId = file.replace(".json", "");
    const raw = JSON.parse(await readFile(resolve(DEPLOYMENTS_DIR, file), "utf8")) as Record<
      string,
      string
    >;

    const addresses: Record<string, string> = {};
    for (const [artifactKey, bookKey] of Object.entries({ ...KEY_MAP, ...EXTRA_KEYS })) {
      const value = raw[artifactKey];
      if (typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)) {
        addresses[bookKey] = value;
      }
    }

    const deployedAtBlock = await earliestBroadcastBlock(chainId);

    // A chain with no broadcast receipts is test debris — an in-process run that wrote an
    // artifact without ever touching a network. Emitting it would give the app a phantom
    // deployment to point at.
    if (deployedAtBlock === null) {
      skipped.push(chainId);
      continue;
    }

    chains[chainId] = { addresses, deployedAtBlock: deployedAtBlock.toString() };
  }

  if (Object.keys(chains).length === 0) {
    return { summary: `skipped (no chain had broadcast receipts; ignored ${skipped.join(", ")})` };
  }

  const chainIds = Object.keys(chains);
  const bookKeys = [...new Set(Object.values(KEY_MAP))].sort();

  const contents = [
    banner("deployments/<chainId>.json + broadcast receipts"),
    `export const ADDRESS_BOOK_KEYS = ${stableJson(bookKeys)} as const;`,
    "export type AddressBookKey = (typeof ADDRESS_BOOK_KEYS)[number];",
    "",
    "export type AddressBook = Record<string, `0x${string}`>;",
    "",
    "export type Deployment = {",
    "  addresses: AddressBook;",
    "  /** First block containing a deployment receipt — the floor for every log scan. */",
    "  deployedAtBlock: bigint;",
    "};",
    "",
    "export const deployments = {",
    ...chainIds.map((id) => {
      const d = chains[id];
      if (!d) return "";
      const lines = Object.entries(d.addresses).map(
        ([k, v]) => `      ${k}: "${v}" as \`0x\${string}\`,`,
      );
      return [
        `  ${id}: {`,
        `    addresses: {`,
        ...lines,
        `    },`,
        `    deployedAtBlock: ${d.deployedAtBlock}n,`,
        `  },`,
      ].join("\n");
    }),
    "} as const satisfies Record<string, Deployment>;",
    "",
    "export type SupportedChainId = keyof typeof deployments;",
    "",
    "export function isSupportedChain(id: number | string): id is SupportedChainId {",
    "  return String(id) in deployments;",
    "}",
    "",
  ].join("\n");

  await writeFile(resolve(GENERATED_DIR, "addresses.ts"), contents, "utf8");

  const note = skipped.length > 0 ? ` (ignored ${skipped.join(", ")}: no receipts)` : "";
  return { summary: `${chainIds.length} chain(s)${note}` };
}

/** Lowest block number across this chain's broadcast receipts. */
async function earliestBroadcastBlock(chainId: string): Promise<bigint | null> {
  const broadcastDir = resolve(REPO_ROOT, "broadcast");
  let scripts: string[];
  try {
    scripts = await readdir(broadcastDir);
  } catch {
    return null;
  }

  let lowest: bigint | null = null;

  for (const script of scripts) {
    const runFile = resolve(broadcastDir, script, chainId, "run-latest.json");
    let text: string;
    try {
      text = await readFile(runFile, "utf8");
    } catch {
      continue;
    }
    for (const match of text.matchAll(/"blockNumber"\s*:\s*"(0x[0-9a-fA-F]+)"/g)) {
      const hex = match[1];
      if (!hex) continue;
      const value = BigInt(hex);
      if (lowest === null || value < lowest) lowest = value;
    }
  }

  return lowest;
}
