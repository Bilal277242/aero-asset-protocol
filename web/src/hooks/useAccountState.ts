"use client";

import { useConnect, useConnection, useConnectors, useDisconnect, usePublicClient } from "wagmi";
import { useEffect, useMemo, useState } from "react";
import { explainError } from "@/lib/web3/errors/explain";

/**
 * Account state, in the shape the interface actually needs.
 *
 * wagmi's own hook exposes six overlapping booleans; components need one status and an
 * address. Wrapping it here also means the rest of the app never imports wagmi directly,
 * which is what keeps chain access confined to this layer.
 */
export type AccountStatus = "disconnected" | "connecting" | "reconnecting" | "connected";

export function useAccountState() {
  const connection = useConnection();
  const connectors = useConnectors();
  const { connect, isPending: isConnecting, error: connectError, reset } = useConnect();
  const { disconnect } = useDisconnect();

  const status: AccountStatus = connection.isConnected
    ? "connected"
    : connection.isReconnecting
      ? "reconnecting"
      : connection.isConnecting || isConnecting
        ? "connecting"
        : "disconnected";

  /**
   * One entry per discovered browser wallet. EIP-6963 makes `injected()` report each
   * extension separately, so a user with several installed picks rather than getting
   * whichever one won the race to define `window.ethereum`.
   *
   * Kept apart from WalletConnect below because the two are not interchangeable in the
   * UI: an injected connector opens the extension's own popup the instant `connect()` is
   * called, where WalletConnect instead needs a pairing URI shown *before* connecting can
   * mean anything — `ConnectButton` renders them as two distinct sections for exactly
   * this reason, not merely for grouping.
   */
  const injectedConnectors = useMemo(
    () => connectors.filter((c) => c.type === "injected" || c.id === "injected"),
    [connectors],
  );

  /**
   * At most one — `lib/web3/config.ts` never configures more than a single WalletConnect
   * connector — and `null` exactly when `WALLETCONNECT_PROJECT_ID` was unset at build
   * time, which `ConnectButton` uses to decide whether to render that section at all.
   */
  const walletConnectConnector = useMemo(
    () => connectors.find((c) => c.type === "walletConnect") ?? null,
    [connectors],
  );

  /**
   * Whether any browser wallet is actually installed.
   *
   * `injected()` always contributes a generic fallback connector whether or not a wallet
   * exists, so a non-empty connector list is not evidence of one. Without this check a
   * visitor with no extension clicks "Injected" and gets a provider-not-found error
   * instead of being told to install a wallet. Scoped to `injectedConnectors` rather than
   * every configured connector, so a configured WalletConnect connector — which always
   * reports an id other than `"injected"` — cannot make this true for a visitor with no
   * browser extension at all.
   *
   * Resolved after mount: `window.ethereum` does not exist during server rendering, and
   * reading it during hydration would produce a mismatch.
   */
  const [walletDetected, setWalletDetected] = useState<boolean | null>(null);
  useEffect(() => {
    // EIP-6963 discovery contributes a connector per installed wallet; anything other
    // than the generic `injected` fallback means one is genuinely present. The legacy
    // `window.ethereum` probe covers wallets that predate the standard.
    const discovered = injectedConnectors.some((c) => c.id !== "injected");
    const legacy = "ethereum" in window && window.ethereum !== undefined;
    setWalletDetected(discovered || legacy);
  }, [injectedConnectors]);

  /**
   * Whether the connected address is a smart-contract wallet (Safe, another ERC-4337
   * account, …) rather than an EOA — read the same way `lib/api/admin.ts` already
   * classifies role holders: bytecode present at the address, nothing more, nothing
   * connector-specific. Every write in this app already goes through the standard
   * `eth_sendTransaction`/simulate path regardless of what kind of account submits it, so
   * nothing downstream needs to branch on this. It exists so the UI can say, honestly,
   * that a transaction from this account may need another signer's confirmation before it
   * is mined — a Safe connected over WalletConnect is the case this was written for, but
   * the check itself has nothing to do with WalletConnect and applies identically to an
   * injected connector.
   *
   * Three states, not two: `null` both before the check has run and while it is
   * re-running for a newly connected address, so the UI never asserts "this is an EOA"
   * on a guess.
   */
  const publicClient = usePublicClient();
  const [isContract, setIsContract] = useState<boolean | null>(null);
  useEffect(() => {
    const address = connection.address;
    if (!address || !publicClient) {
      setIsContract(null);
      return;
    }
    let cancelled = false;
    setIsContract(null);
    publicClient
      .getCode({ address })
      .then((code) => {
        if (!cancelled) setIsContract((code?.length ?? 0) > 0);
      })
      .catch(() => {
        if (!cancelled) setIsContract(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connection.address, publicClient]);

  const allSelectable = useMemo(
    () => [...injectedConnectors, ...(walletConnectConnector ? [walletConnectConnector] : [])],
    [injectedConnectors, walletConnectConnector],
  );

  return {
    /** `null` until resolved on the client. */
    walletDetected,
    status,
    address: connection.address,
    chainId: connection.chainId,
    connector: connection.connector,
    isConnected: connection.isConnected,
    /** `null` until resolved; see the field's own doc comment above for why. */
    isContract,

    injectedConnectors,
    walletConnectConnector,
    connect: (connectorId: string) => {
      const connector = allSelectable.find((c) => c.uid === connectorId || c.id === connectorId);
      if (connector) connect({ connector });
    },
    /** Clears local connection state. It cannot revoke access — only the wallet can. */
    disconnect: () => disconnect(),

    isConnecting: status === "connecting",
    error: connectError ? explainError(connectError) : null,
    resetError: reset,
  };
}
