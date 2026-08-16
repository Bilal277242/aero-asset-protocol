import type { NextConfig } from "next";

/**
 * Origins the browser is permitted to connect to.
 *
 * Derived from the configured RPC endpoint rather than hardcoded or wildcarded, so the
 * policy stays exactly as wide as the app actually needs. Getting this wrong fails
 * closed and loudly — a missing origin blocks every read, which is the correct direction
 * for a security control to fail in.
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
  // Injected wallets talk over the page, not the network, so no wallet origin is needed.
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
            // Narrow by construction. There is no font CDN, no analytics and no
            // third-party script in this app, which is what lets connect-src stay
            // limited to this origin and the RPC endpoint.
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
