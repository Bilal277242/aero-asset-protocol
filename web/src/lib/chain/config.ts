import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { sepolia } from "viem/chains";
import { deployments, isSupportedChain, type SupportedChainId } from "@/generated/addresses";

/**
 * Runtime configuration.
 *
 * Exactly one contract address comes from the environment: `ProtocolAddressRegistry`.
 * Everything else is resolved *through* it at runtime, so a redeploy that forgets to
 * re-run codegen surfaces as a drift banner rather than a silently dead app.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing ${name}. Copy web/.env.example to web/.env.local and fill it in.`,
    );
  }
  return value;
}

export const CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_AAP_CHAIN_ID ?? String(sepolia.id),
);

if (!isSupportedChain(CHAIN_ID)) {
  throw new Error(
    `Chain ${CHAIN_ID} has no committed deployment. Run \`npm run codegen\` after deploying to it.`,
  );
}

export const chainId: SupportedChainId = CHAIN_ID;
export const chain = sepolia;

export const RPC_URL = required("NEXT_PUBLIC_AAP_RPC_URL", process.env.NEXT_PUBLIC_AAP_RPC_URL);

export const ADDRESS_REGISTRY = required(
  "NEXT_PUBLIC_AAP_ADDRESS_REGISTRY",
  process.env.NEXT_PUBLIC_AAP_ADDRESS_REGISTRY,
) as Address;

/**
 * The settlement token is not in the protocol address book — it is an allowlist entry in
 * `FeeManager`, not a module. Validated at boot against `isTokenAllowed`.
 */
export const SETTLEMENT_TOKEN = required(
  "NEXT_PUBLIC_AAP_SETTLEMENT_TOKEN",
  process.env.NEXT_PUBLIC_AAP_SETTLEMENT_TOKEN,
) as Address;

/** First block containing a deployment receipt — the floor for every log scan. */
export const DEPLOYED_AT_BLOCK = deployments[chainId].deployedAtBlock;

let cached: PublicClient | null = null;

/**
 * Shared read client.
 *
 * `batch.multicall` is on because nearly every page issues a dozen small reads that are
 * meaningless individually; batching them also keeps them at one block height, which
 * matters for the effective-status derivations.
 */
export function publicClient(): PublicClient {
  if (!cached) {
    cached = createPublicClient({
      chain,
      transport: http(RPC_URL, { batch: true }),
      batch: { multicall: true },
    });
  }
  return cached;
}
