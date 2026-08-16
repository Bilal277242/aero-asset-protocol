/**
 * Smoke-checks the chain layer against live Sepolia.
 *
 *   npx tsx scripts/check-chain.mts
 *
 * Exercises the real modules the app uses — generated ABIs, address-book resolution and
 * the error decoder — with no React in the way. When something later breaks in the UI,
 * this says whether the data layer is implicated.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  http,
  keccak256,
  toHex,
  encodeErrorResult,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";

import { protocolAddressRegistryAbi } from "../src/lib/contracts/generated/abis/protocolAddressRegistry.ts";
import { assetPassportAbi } from "../src/lib/contracts/generated/abis/assetPassport.ts";
import { marketplaceAbi } from "../src/lib/contracts/generated/abis/marketplace.ts";
import { protocolErrorAbi } from "../src/lib/contracts/generated/errors.ts";
import { ADDRESS_BOOK_KEYS } from "../src/lib/contracts/generated/addresses.ts";
import { assetKindLabel, assetStatusLabel } from "../src/lib/contracts/generated/enums.ts";
import { decodeAgainstProtocol } from "../src/lib/web3/errors/decode.ts";
import { explainDecoded } from "../src/lib/web3/errors/explain.ts";

const here = dirname(fileURLToPath(import.meta.url));

const env: Record<string, string> = {};
for (const line of (await readFile(resolve(here, "..", ".env.local"), "utf8")).split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const rpc = env.AAP_RPC_URL || env.NEXT_PUBLIC_AAP_RPC_URL;
const registry = env.NEXT_PUBLIC_AAP_ADDRESS_REGISTRY as Address;

const client = createPublicClient({
  chain: sepolia,
  transport: http(rpc, { batch: true }),
  batch: { multicall: true },
});

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
};

console.log(`\nblock ${await client.getBlockNumber()}\n`);

// ── 1 · Address book resolves through the registry ─────────────────────────
console.log("address book");
const results = await client.multicall({
  contracts: ADDRESS_BOOK_KEYS.map((key) => ({
    address: registry,
    abi: protocolAddressRegistryAbi,
    functionName: "tryGetAddress" as const,
    args: [keccak256(toHex(`aeroasset.address.${key}`))],
  })),
  allowFailure: true,
});

const book: Record<string, Address> = {};
ADDRESS_BOOK_KEYS.forEach((key, i) => {
  const entry = results[i];
  const ok = entry?.status === "success" && entry.result !== `0x${"0".repeat(40)}`;
  if (ok) book[key] = entry.result as Address;
});
check(`resolved ${Object.keys(book).length}/${ADDRESS_BOOK_KEYS.length} keys`, Object.keys(book).length === ADDRESS_BOOK_KEYS.length);

// ── 2 · A real aggregate read, decoded through generated ABI types ─────────
console.log("\nreads");
const passport = (await client.readContract({
  address: book.ASSET_PASSPORT as Address,
  abi: assetPassportAbi,
  functionName: "getPassport",
  args: [1n],
})) as { kind: number; status: number; verified: boolean; owner: Address };

check(
  "getPassport(1) decoded",
  passport.owner?.startsWith("0x") === true,
  `${assetKindLabel[passport.kind]} / ${assetStatusLabel[passport.status]} / verified=${passport.verified}`,
);

const listingCount = await client.readContract({
  address: book.MARKETPLACE as Address,
  abi: marketplaceAbi,
  functionName: "listingCount",
});
check("listingCount()", typeof listingCount === "bigint", String(listingCount));

// ── 3 · Effective status, which is the whole point of the domain layer ─────
const stored = (await client.readContract({
  address: book.MARKETPLACE as Address,
  abi: marketplaceAbi,
  functionName: "getListing",
  args: [3n],
})) as { status: number };
const effective = await client.readContract({
  address: book.MARKETPLACE as Address,
  abi: marketplaceAbi,
  functionName: "isListingActive",
  args: [3n],
});
check(
  "listing 3: stored status disagrees with effective status",
  stored.status === 1 && effective === false,
  `stored=ACTIVE(${stored.status}) isListingActive=${effective}`,
);

// ── 4 · A real revert, decoded and explained ──────────────────────────────
console.log("\nerror handling");
let liveDecodeOk = false;
let liveExplained = "";
try {
  await client.readContract({
    address: book.ASSET_PASSPORT as Address,
    abi: assetPassportAbi,
    functionName: "getPassport",
    args: [9999n],
  });
} catch (err) {
  const explained = explainDecoded(
    // Reuse the app's decoder on a genuine on-chain revert.
    (await import("../src/lib/web3/errors/decode.ts")).decodeError(err),
  );
  liveDecodeOk = explained.title !== "Something went wrong";
  liveExplained = `${explained.title} — ${explained.detail ?? ""}`;
}
check("live revert decoded and explained", liveDecodeOk, liveExplained);

// Synthetic reverts for errors that are awkward to trigger on demand.
for (const [name, args] of [
  ["ComponentIsInstalled", [4n, 3n]],
  ["SellerNoLongerOwner", [1n, "0x4eaDF30c01FB8456BCCa506cF436936Eb6eAFF70", "0xabb020a5A0C5f325CB068E90C915de2E46628145"]],
  ["EnforcedPause", []],
] as const) {
  const data = encodeErrorResult({ abi: protocolErrorAbi, errorName: name, args: args as never });
  const decoded = decodeAgainstProtocol(data);
  const explained = decoded ? explainDecoded(decoded) : null;
  check(
    `${name} -> copy`,
    !!explained && explained.title !== "Something went wrong",
    explained?.title ?? "",
  );
}

console.log(
  `\n${failures === 0 ? "PASS" : `FAIL (${failures})`} — ${protocolErrorAbi.length} decodable errors\n`,
);
process.exit(failures === 0 ? 0 : 1);
