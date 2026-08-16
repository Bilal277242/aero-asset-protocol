import { createConfig, http, injected } from "wagmi";
import { sepolia } from "wagmi/chains";
import { CHAIN_ID, PUBLIC_RPC_URL } from "@/config/env";

/**
 * wagmi configuration.
 *
 * **Connectors are deliberately minimal.** `injected()` covers every browser extension
 * wallet through EIP-6963 discovery, which is the whole population that matters for a
 * testnet protocol interface. WalletConnect is not included: it needs a project id, a
 * relay origin in the Content-Security-Policy, and a third-party service in the request
 * path — none of which earns its place until somebody actually needs it.
 *
 * No connector here requests anything beyond account access. The app never calls
 * `wallet_requestPermissions`, never asks for a signature at connect time, and has no
 * code path that signs an arbitrary message.
 */
export const chain = sepolia;

/**
 * The chain id as a *literal* type.
 *
 * wagmi's write and switch actions accept only chain ids present in the config, so a
 * plain `number` is rejected. Exporting the literal keeps those call sites type-safe
 * rather than cast — and if a second chain is ever added, every one of them fails to
 * compile until it is considered.
 */
export const TARGET_CHAIN_ID = sepolia.id;

if (CHAIN_ID !== sepolia.id) {
  throw new Error(
    `Configured chain ${CHAIN_ID} does not match the compiled chain ${sepolia.id}. ` +
      `Supporting another network means adding it to the wagmi config as well as ` +
      `deploying the protocol there.`,
  );
}

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(PUBLIC_RPC_URL, {
      // Batching matters here: almost every page issues a dozen small reads that are
      // meaningless individually, and batching also keeps them at one block height.
      batch: true,
      retryCount: 2,
    }),
  },
  // Server-render safety: wagmi must not touch storage during SSR.
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
