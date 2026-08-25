"use client";

import * as React from "react";
import type { Connector } from "wagmi";
import { explainError, type ExplainedError } from "@/lib/web3/errors/explain";

/**
 * Structural, not `@walletconnect/ethereum-provider`'s own type: `connector.getProvider()`
 * is typed `Promise<unknown>` at the point a `Connector` comes out of `useConnectors()` —
 * wagmi does not (and cannot, since the same array holds every configured connector type
 * at once) narrow it back to the specific provider a `walletConnect()` connector produces.
 * This names only the one event this hook listens for.
 */
type DisplayUriProvider = {
  on(event: "display_uri", listener: (uri: string) => void): void;
  removeListener?(event: "display_uri", listener: (uri: string) => void): void;
  off?(event: "display_uri", listener: (uri: string) => void): void;
};

/**
 * Starts a WalletConnect pairing and surfaces the URI it produces.
 *
 * The pairing URI is not a return value of `connect()` — the SDK emits it mid-flight, on
 * a `display_uri` event, while `connect()` itself stays pending until a wallet approves
 * the session or the pairing expires. So this listens first and connects second: the
 * listener has to be attached before the connection attempt starts, or the one and only
 * `display_uri` event for that attempt fires into nothing.
 *
 * This is the one place in the application a component-facing hook reaches
 * `connector.getProvider()` directly rather than going through `useAccountState`'s
 * `connect`. It stays a separate hook rather than folding into `useAccountState` because
 * its job is a single pairing attempt's lifecycle (start, emit a URI, clean up on
 * unmount), not the account's ambient state — mixing the two would make `useAccountState`
 * responsible for a UI flow it has no other reason to know about.
 *
 * `getProvider()` is safe to call every time this mounts: wagmi's `walletConnect()`
 * connector caches the underlying `EthereumProvider` instance for the connector's whole
 * lifetime, so repeated calls (retrying after "back", re-opening the dialog) return the
 * same provider rather than opening a second relay connection.
 */
export function useWalletConnectPairing(
  connector: Connector,
  connect: (connectorId: string) => void,
): { uri: string | null; error: ExplainedError | null } {
  const [uri, setUri] = React.useState<string | null>(null);
  const [error, setError] = React.useState<ExplainedError | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let provider: DisplayUriProvider | null = null;
    const handleUri = (nextUri: string) => {
      if (!cancelled) setUri(nextUri);
    };

    void (async () => {
      try {
        provider = (await connector.getProvider()) as DisplayUriProvider;
        if (cancelled) return;
        provider.on("display_uri", handleUri);
        connect(connector.uid);
      } catch (err) {
        if (!cancelled) setError(explainError(err));
      }
    })();

    return () => {
      cancelled = true;
      provider?.removeListener?.("display_uri", handleUri);
      provider?.off?.("display_uri", handleUri);
    };
    // Deliberately depends only on `connector`, not `connect`: `connect` is a fresh
    // arrow function on every render of the caller, and re-running this effect for that
    // reason alone would restart an in-flight pairing attempt each time the component
    // holding it re-renders — including from the `uri` update this same effect produces.
  }, [connector]);

  return { uri, error };
}
