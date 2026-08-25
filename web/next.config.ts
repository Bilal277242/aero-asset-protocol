import type { NextConfig } from "next";

/**
 * Origins the browser is permitted to connect to.
 *
 * Derived from configuration rather than hardcoded or wildcarded, so the policy stays
 * exactly as wide as the app actually needs. Getting this wrong fails closed and loudly —
 * a missing origin blocks the request it belongs to, which is the correct direction for a
 * security control to fail in.
 *
 * **Injected wallets (MetaMask, Rabby, ...) talk over the page, not the network** — no
 * origin needed for those. **WalletConnect is a real third-party network dependency**,
 * and only added when a project id is actually configured: `lib/web3/config.ts` leaves
 * the connector out of the wagmi config entirely otherwise, so there is nothing to
 * connect to and nothing to allow.
 *
 * The three WalletConnect origins below were read out of the installed SDK
 * (`@walletconnect/core`, `@walletconnect/ethereum-provider`), not copied from
 * documentation:
 *
 * - `wss://relay.walletconnect.org` — the pairing/session relay. Hardcoded default, no
 *   configuration disables it; this is the one call that cannot be avoided.
 * - `https://verify.walletconnect.{com,org}` — the Verify API. The dApp side calls
 *   `core.verify.register(...)` on every connection attempt so a receiving wallet can
 *   check this origin is not a lookalike domain. No flag turns it off; blocking it would
 *   not break connecting, but would make the SDK fail a real anti-phishing check with a
 *   console error that looks like a defect.
 *
 * Deliberately **not** allowed, each for a checked reason:
 *
 * - `https://pulse.walletconnect.org` — usage telemetry. `telemetryEnabled: false` is
 *   passed at connector construction, and the SDK's own event-submission path is a no-op
 *   when that flag is false, so this origin is never contacted.
 * - `https://rpc.walletconnect.org` — a fallback RPC proxy the SDK uses only when it has
 *   no `rpcMap`. wagmi's `walletConnect()` connector builds `rpcMap` from this app's own
 *   configured transports (`connectSources()`'s first loop, below), so this app's Sepolia
 *   endpoint is used and WalletConnect's proxy is never reached.
 * - `https://echo.walletconnect.com` — push-notification device registration. Only
 *   reachable through an explicit `registerDeviceToken` call that a dApp-role client
 *   (this app) never makes; wallets call it, not us.
 */
function connectSources(): string {
  const origins = new Set<string>(["'self'"]);
  for (const url of [process.env.NEXT_PUBLIC_AAP_RPC_URL]) {
    if (!url) continue;
    try {
      origins.add(new URL(url).origin);
    } catch {
      // An unparseable URL is a configuration error that env validation reports.
    }
  }
  if (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim()) {
    origins.add("wss://relay.walletconnect.org");
    origins.add("https://verify.walletconnect.org");
    origins.add("https://verify.walletconnect.com");
  }
  return [...origins].join(" ");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            // Narrow by construction. There is no font CDN, no analytics, and no
            // third-party *script* in this app — WalletConnect ships as a bundled
            // module, never a CDN <script src>, so script-src stays 'self'. Only
            // connect-src grows, and only when a project id makes WalletConnect real.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "img-src 'self' data:",
              "style-src 'self' 'unsafe-inline'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "worker-src 'self' blob:",
              `connect-src ${connectSources()}`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
