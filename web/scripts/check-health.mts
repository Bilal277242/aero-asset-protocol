/**
 * Smoke-checks the chain plumbing against a live deployment, with no React involved.
 *
 *   npx tsx scripts/check-health.mts
 *
 * Reads the same env as the app. Exists because a failure here is a chain, ABI or
 * address problem, and a failure after this is a React problem — separating the two
 * saves a lot of guessing.
 */
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { readProtocolHealth } from "../src/lib/contracts/health.ts";

const here = dirname(fileURLToPath(import.meta.url));

async function loadEnv(): Promise<Record<string, string>> {
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = await readFile(resolve(here, "..", file), "utf8");
      const out: Record<string, string> = {};
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m?.[1] && m[2] !== undefined) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
      return out;
    } catch {
      /* try next */
    }
  }
  return {};
}

const env = { ...(await loadEnv()), ...process.env } as Record<string, string>;

const rpc = env.NEXT_PUBLIC_AAP_RPC_URL;
const registry = env.NEXT_PUBLIC_AAP_ADDRESS_REGISTRY;
const token = env.NEXT_PUBLIC_AAP_SETTLEMENT_TOKEN;
const chainId = Number(env.NEXT_PUBLIC_AAP_CHAIN_ID ?? 11155111);

if (!rpc || !registry || !token) {
  console.error("Missing env. Copy .env.example to .env.local and fill it in.");
  process.exit(1);
}

const client = createPublicClient({
  chain: sepolia,
  transport: http(rpc, { batch: true }),
  batch: { multicall: true },
});

const health = await readProtocolHealth(
  client,
  chainId,
  registry as `0x${string}`,
  token as `0x${string}`,
);

const drift = health.book.drift;

console.log(`block            ${health.blockNumber}`);
console.log(
  `address drift    ${drift.length === 0 ? "none — snapshot matches the registry" : ""}`,
);
for (const d of drift) {
  console.log(`  DRIFT ${d.key}: snapshot ${d.snapshot} vs on-chain ${d.onChain}`);
}
console.log(`unset keys       ${health.book.unset.length === 0 ? "none" : health.book.unset.join(", ")}`);
console.log(`any paused       ${health.anyPaused}`);
console.log(`fee bps          ${health.fees.marketplaceBps} (cap ${health.fees.maxBps})`);
console.log(`treasury         ${health.fees.treasury}`);
console.log(`token allowed    ${health.fees.settlementTokenAllowed}`);
console.log("counts");
for (const [k, v] of Object.entries(health.counts)) console.log(`  ${k.padEnd(14)} ${v}`);
console.log("resolved addresses");
for (const [k, v] of Object.entries(health.book.addresses)) console.log(`  ${k.padEnd(22)} ${v}`);
