/**
 * Smoke-checks the passport domain reader against live data.
 *
 *   npx tsx scripts/check-passport.mts [assetId]
 *
 * Same purpose as check-health: prove the chain/ABI/decoding layer before React sits on
 * top of it, so a later failure is unambiguously a rendering problem.
 */
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAddressBook } from "../src/lib/contracts/addressBook.ts";
import {
  readAssetPage,
  readDocuments,
  readMaintenance,
  readPassport,
} from "../src/lib/domain/passport.ts";
import { bytes32Label } from "../src/lib/format/bytes32.ts";
import { assetKindLabel, assetStatusLabel } from "../src/generated/enums.ts";

const here = dirname(fileURLToPath(import.meta.url));

const raw = await readFile(resolve(here, "..", ".env.local"), "utf8");
const env: Record<string, string> = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const client = createPublicClient({
  chain: sepolia,
  transport: http(env.NEXT_PUBLIC_AAP_RPC_URL, { batch: true }),
  batch: { multicall: true },
});

const assetId = BigInt(process.argv[2] ?? "1");

const { addresses: book } = await resolveAddressBook(
  client,
  11155111,
  env.NEXT_PUBLIC_AAP_ADDRESS_REGISTRY as `0x${string}`,
);

const block = await client.getBlock();
const p = await readPassport(client, book, assetId, block.timestamp);

if (!p) {
  console.log(`asset ${assetId} not found`);
  process.exit(0);
}

console.log(`asset            #${p.assetId}`);
console.log(`kind             ${assetKindLabel[p.kind] ?? p.kind}`);
console.log(`status           ${assetStatusLabel[p.status] ?? p.status}${p.isTerminal ? " (terminal)" : ""}`);
console.log(`verified         ${p.verified}${p.verified ? ` at ${new Date(p.verifiedAt * 1000).toISOString().slice(0, 10)}` : ""}`);
console.log(`owner            ${p.owner}`);
console.log(`transfer state   ${JSON.stringify(p.transfer)}`);
console.log(`active listing   ${p.activeListingId ?? "none"}`);
console.log(`metadataURI      ${p.metadataURI ?? "—"}`);
console.log(`counts           components=${p.counts.components} documents=${p.counts.documents} maintenance=${p.counts.maintenance}`);
console.log(`registrar org    #${p.registrarOrgId} verified=${p.orgs.registrar?.verified}`);

if (p.aircraft) {
  console.log("aircraft");
  console.log(`  model          ${bytes32Label(p.aircraft.model)}`);
  console.log(`  manufacturer   ${bytes32Label(p.aircraft.manufacturerName)}`);
  console.log(`  year           ${p.aircraft.manufactureYear}`);
}
if (p.component) {
  console.log("component");
  console.log(`  partNumber     ${bytes32Label(p.component.partNumber)}`);
  console.log(`  parent         #${p.component.parentAssetId} installed=${p.component.isInstalled}`);
}

if (p.counts.components > 0n) {
  const ids = await readAssetPage(client, book, "components", assetId, 0n, 10n, p.blockNumber);
  console.log(`installed        ${ids.join(", ")}`);
}
if (p.counts.documents > 0n) {
  const ids = await readAssetPage(client, book, "documents", assetId, 0n, 10n, p.blockNumber);
  const docs = await readDocuments(client, book, ids, p.blockNumber);
  for (const d of docs) {
    console.log(`document #${d.documentId}  type=${d.docType} status=${d.status} hash=${d.documentHash.slice(0, 12)}… uri=${d.uri}`);
  }
}
if (p.counts.maintenance > 0n) {
  const ids = await readAssetPage(client, book, "maintenance", assetId, 0n, 10n, p.blockNumber);
  const recs = await readMaintenance(client, book, ids, p.blockNumber);
  for (const r of recs) {
    const gap = r.recordedAt - r.performedAt;
    console.log(`maintenance #${r.recordId}  performed=${r.performedAt} recorded=${r.recordedAt} gap=${gap}s`);
  }
}
