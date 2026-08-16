"use client";

import * as React from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "./config";

/**
 * Chain providers.
 *
 * The query client is created inside a `useState` initialiser rather than at module
 * scope: on the server a module-level client would be shared across every request, which
 * leaks one user's cached reads into another's response.
 */
export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Chain state is not stale the moment it arrives; a block is ~12s.
            staleTime: 12_000,
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
