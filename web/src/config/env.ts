import { deployments, type Deployment } from "@/lib/contracts/generated/addresses";

/**
 * Runtime configuration, validated once at module load.
 *
 * Exactly one contract address comes from the environment: `ProtocolAddressRegistry`.
 * Every other module is resolved *through* it at runtime, so a redeploy that forgets to
 * re-run codegen surfaces as a drift banner rather than a silently dead app.
 *
 * Failing at boot is deliberate. A misconfigured app that renders and then produces
 * confusing empty states is worse than one that refuses to start and says which variable
 * is missing.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing ${name}. Copy web/.env.example to web/.env.local and fill it in.`,
    );
  }
  return value;
}

const CHAIN_ID_RAW = String(process.env.NEXT_PUBLIC_AAP_CHAIN_ID ?? "11155111");

// Indexed through a widened record rather than a type predicate: the predicate narrows
// to a literal union, which is correct but makes the lookup unreadable at every call
// site. A plain undefined check does the same job and reports the same error.
const resolved: Deployment | undefined = (
  deployments as unknown as Record<string, Deployment | undefined>
)[CHAIN_ID_RAW];

if (!resolved) {
  throw new Error(
    `Chain ${CHAIN_ID_RAW} has no committed deployment. Run \`npm run codegen\` after ` +
      `deploying to it, or set NEXT_PUBLIC_AAP_CHAIN_ID to a supported chain.`,
  );
}

export const CHAIN_ID = Number(CHAIN_ID_RAW);
export const DEPLOYMENT = resolved;

/** First block containing a deployment receipt. The floor for every log scan. */
export const DEPLOYED_AT_BLOCK = DEPLOYMENT.deployedAtBlock;

/** The committed snapshot. Superseded at runtime by live registry resolution. */
export const ADDRESS_SNAPSHOT = DEPLOYMENT.addresses;

export const ADDRESS_REGISTRY = required(
  "NEXT_PUBLIC_AAP_ADDRESS_REGISTRY",
  process.env.NEXT_PUBLIC_AAP_ADDRESS_REGISTRY,
) as `0x${string}`;

/**
 * Browser-visible RPC endpoint.
 *
 * Public and rate-limited by design. The keyed endpoint lives in `AAP_RPC_URL` without
 * the `NEXT_PUBLIC_` prefix, so it is only ever read on the server and never reaches the
 * client bundle.
 */
export const PUBLIC_RPC_URL = required(
  "NEXT_PUBLIC_AAP_RPC_URL",
  process.env.NEXT_PUBLIC_AAP_RPC_URL,
);

/**
 * The settlement token is not a protocol module — it is an allowlist entry in
 * `FeeManager`, validated against `isTokenAllowed` rather than assumed.
 */
export const SETTLEMENT_TOKEN = required(
  "NEXT_PUBLIC_AAP_SETTLEMENT_TOKEN",
  process.env.NEXT_PUBLIC_AAP_SETTLEMENT_TOKEN,
) as `0x${string}`;

export const EXPLORER_BASE = "https://sepolia.etherscan.io";

export const explorerTx = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`;
export const explorerAddress = (address: string) => `${EXPLORER_BASE}/address/${address}`;
