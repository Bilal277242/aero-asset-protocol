import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(here, "..", "..");
export const OUT_DIR = resolve(REPO_ROOT, "out");
export const DEPLOYMENTS_DIR = resolve(REPO_ROOT, "deployments");
export const GENERATED_DIR = resolve(here, "..", "src", "lib", "contracts", "generated");

/**
 * The sixteen deployed contracts.
 *
 * Listed explicitly rather than globbed: `out/` also holds every OpenZeppelin internal
 * and every test double, and a generated bindings directory that silently grows when a
 * dependency adds a file is worse than one that fails loudly when a name changes.
 */
export const CONTRACTS = [
  "ProtocolTimelock",
  "RoleManager",
  "ProtocolAddressRegistry",
  "OrganizationRegistry",
  "CredentialRegistry",
  "AssetOwnership",
  "AssetRegistry",
  "AircraftRegistry",
  "ComponentRegistry",
  "DocumentRegistry",
  "MaintenanceRegistry",
  "AssetPassport",
  "Marketplace",
  "FeeManager",
  "EscrowFactory",
  "Escrow",
] as const;

export type ContractName = (typeof CONTRACTS)[number];

/**
 * Where the enums actually live.
 *
 * A Foundry artifact's `ast` covers only its own source file, and every enum in this
 * protocol is declared on the interface rather than the implementation — so scanning
 * `AssetRegistry.sol` finds `AssetStatus` referenced but never defined. The interfaces
 * are the source of truth for enum member names.
 */
export const ENUM_SOURCES = [
  "IAssetRegistry",
  "IOrganizationRegistry",
  "ICredentialRegistry",
  "IAircraftRegistry",
  "IComponentRegistry",
  "IDocumentRegistry",
  "IMaintenanceRegistry",
  "IMarketplace",
  "IEscrow",
] as const;

/** camelCase identifier for a contract, e.g. `AssetPassport` → `assetPassport`. */
export function camel(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** SCREAMING_SNAKE key, e.g. `AssetPassport` → `ASSET_PASSPORT`. */
export function screamingSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
}

export type Artifact = {
  abi: unknown[];
  ast?: { nodes?: AstNode[] };
};

export type AstNode = {
  nodeType?: string;
  name?: string;
  canonicalName?: string;
  members?: { name?: string }[];
  nodes?: AstNode[];
};

export async function readArtifact(name: string): Promise<Artifact> {
  const path = resolve(OUT_DIR, `${name}.sol`, `${name}.json`);
  try {
    return JSON.parse(await readFile(path, "utf8")) as Artifact;
  } catch {
    throw new Error(
      `Missing artifact for ${name} at ${path}.\n` +
        `Run \`forge build\` in the repository root first — bindings are generated from ` +
        `compiled output, never hand-written.`,
    );
  }
}

/**
 * Standard header for every generated file.
 *
 * Deliberately pure ASCII. These files get opened by whatever editor and shell a
 * contributor happens to have, and a stray em-dash reading as mojibake in a generated
 * artifact invites someone to "fix" a file they should never hand-edit.
 */
export function banner(source: string): string {
  return [
    "// GENERATED FILE - DO NOT EDIT.",
    `// Produced by \`npm run codegen\` from ${source}.`,
    "// Re-run codegen after any contract change; CI fails on a diff.",
    "",
  ].join("\n");
}

export const stableJson = (value: unknown): string => JSON.stringify(value, null, 2);
