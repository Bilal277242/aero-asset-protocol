import type { NextConfig } from "next";

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
            // The file-verification tool hashes documents locally and they must never
            // leave the browser. `connect-src` is limited to the RPC endpoint, so even a
            // bug cannot exfiltrate a document. `metadataURI` values are user-supplied
            // and are rendered as links, never fetched — this enforces that.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "img-src 'self' data:",
              "style-src 'self' 'unsafe-inline'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              // The hashing worker is bundled and served from this origin; `blob:` covers
              // the dev-server variant. It has no network permission of its own beyond
              // `connect-src`, which is the point.
              "worker-src 'self' blob:",
              `connect-src 'self' ${process.env.NEXT_PUBLIC_AAP_RPC_URL ?? ""}`,
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
