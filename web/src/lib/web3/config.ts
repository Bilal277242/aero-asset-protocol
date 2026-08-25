import { createConfig, http, injected } from "wagmi";
// Scoped subpath, not the `wagmi/connectors` barrel: that barrel re-exports every
// connector `@wagmi/connectors` ships — including `baseAccount`, which chains through
// `@base-org/account` and `@coinbase/cdp-sdk` into `@x402/*` packages that are not
// resolvable in this project (an experimental Coinbase payments SDK, unrelated to
// anything here). Webpack has to resolve every module a barrel touches before it can
// tree-shake the unused ones away, so importing the barrel broke the production build
// on a connector this app never configures. The scoped path resolves only
// `walletConnect` and its own dependency chain.
import { walletConnect } from "wagmi/connectors/walletConnect";
import { sepolia } from "wagmi/chains";
import { CHAIN_ID, PUBLIC_RPC_URL, WALLETCONNECT_PROJECT_ID } from "@/config/env";

/**
 * wagmi configuration.
 *
 * **Two connectors, and the second is conditional.** `injected()` covers every browser
 * extension wallet through EIP-6963 discovery — MetaMask, Rabby, and anything else that
 * announces itself on the page. `walletConnect()` is appended only when
 * `WALLETCONNECT_PROJECT_ID` is set; unset, the array is exactly what it was before this
 * connector existed, and the app is unchanged for anyone who has not configured one.
 *
 * That condition is not cosmetic. `walletConnect()`'s own `setup()` lifecycle hook runs
 * the moment this config is constructed — i.e. on every page load, for every visitor,
 * before anyone clicks anything — and opens a WebSocket to WalletConnect's relay so a
 * previously-connected session can restore on reload. Leaving the connector out when
 * unconfigured is what keeps that connection from being attempted at all, which is also
 * why `next.config.ts` only widens the CSP `connect-src` when this same variable is set.
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

/**
 * The dApp identity a wallet shows on its own approval screen when connecting over
 * WalletConnect — not something this app renders itself. `url` reads the live origin
 * rather than a fixed constant so it is correct on localhost, a preview deployment and
 * production alike without a second URL to keep in sync; WalletConnect's Verify check
 * (`next.config.ts`) reads `window.location.origin` directly for the security-relevant
 * comparison; this field is display-only. `icons` is empty because the repository does
 * not have a favicon or app icon yet — an invented path would just be a broken image on
 * someone's wallet, which is worse than nothing.
 */
function walletConnectMetadata() {
  return {
    name: "AeroAsset",
    description:
      "Verified registry, digital passport and escrowed settlement for aircraft, engines and components.",
    url: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
    icons: [] as string[],
  };
}

const connectors = [
  injected(),
  ...(WALLETCONNECT_PROJECT_ID
    ? [
        walletConnect({
          projectId: WALLETCONNECT_PROJECT_ID,
          metadata: walletConnectMetadata(),
          // This app renders its own pairing UI (`components/web3/connect-button.tsx`)
          // instead of WalletConnect's bundled modal. That modal ships as `@reown/appkit`,
          // a transitive dependency of the SDK pulled in whether or not it is used; this
          // flag is what keeps it from ever being imported, so its own third-party
          // origins (analytics, a wallet-icon CDN) never need a CSP entry and its
          // generic-crypto aesthetic never appears in a product that is deliberately not
          // that.
          showQrModal: false,
          // Usage analytics to WalletConnect's own telemetry endpoint. Off because this
          // app has no analytics anywhere else, and a connector should not add a first
          // one on a page nobody asked it to.
          telemetryEnabled: false,
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors,
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
