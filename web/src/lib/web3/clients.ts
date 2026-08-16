import { createPublicClient, http, type PublicClient } from "viem";
import { sepolia } from "viem/chains";
import { PUBLIC_RPC_URL } from "@/config/env";

/**
 * Read clients.
 *
 * Two of them, with different jobs and different credentials:
 *
 * - **`serverClient`** runs inside server components and route handlers, and uses the
 *   keyed endpoint from `AAP_RPC_URL`. That variable has no `NEXT_PUBLIC_` prefix, so
 *   Next.js will not inline it into the browser bundle. This is the only place the key
 *   is ever read.
 * - **`browserClient`** runs in the browser against a public, rate-limited endpoint.
 *
 * Writes never go through either: they use the wallet client that wagmi derives from the
 * connected account, so this application never holds, sees, or transmits a private key.
 */

let cachedServer: PublicClient | null = null;
let cachedBrowser: PublicClient | null = null;

export function serverClient(): PublicClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "serverClient() was called in the browser. It carries the keyed RPC endpoint and " +
        "must never run client-side — use browserClient() there.",
    );
  }
  if (!cachedServer) {
    cachedServer = createPublicClient({
      chain: sepolia,
      // Falls back to the public endpoint so a developer without the key still gets a
      // working app rather than a crash on first render.
      transport: http(process.env.AAP_RPC_URL || PUBLIC_RPC_URL, {
        batch: true,
        retryCount: 3,
      }),
      batch: { multicall: true },
    });
  }
  return cachedServer;
}

export function browserClient(): PublicClient {
  if (!cachedBrowser) {
    cachedBrowser = createPublicClient({
      chain: sepolia,
      transport: http(PUBLIC_RPC_URL, { batch: true, retryCount: 2 }),
      batch: { multicall: true },
    });
  }
  return cachedBrowser;
}

/** Whichever client is correct for the current execution context. */
export function readClient(): PublicClient {
  return typeof window === "undefined" ? serverClient() : browserClient();
}
