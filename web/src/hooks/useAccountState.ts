"use client";

import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
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
   * One entry per discovered wallet. EIP-6963 makes `injected()` report each extension
   * separately, so a user with several installed picks rather than getting whichever one
   * won the race to define `window.ethereum`.
   */
  const available = useMemo(
    () => connectors.filter((c) => c.type === "injected" || c.id === "injected"),
    [connectors],
  );

  /**
   * Whether any wallet is actually installed.
   *
   * `injected()` always contributes a generic fallback connector whether or not a wallet
   * exists, so a non-empty connector list is not evidence of one. Without this check a
   * visitor with no extension clicks "Injected" and gets a provider-not-found error
   * instead of being told to install a wallet.
   *
   * Resolved after mount: `window.ethereum` does not exist during server rendering, and
   * reading it during hydration would produce a mismatch.
   */
  const [walletDetected, setWalletDetected] = useState<boolean | null>(null);
  useEffect(() => {
    // EIP-6963 discovery contributes a connector per installed wallet; anything other
    // than the generic `injected` fallback means one is genuinely present. The legacy
    // `window.ethereum` probe covers wallets that predate the standard.
    const discovered = connectors.some((c) => c.id !== "injected");
    const legacy = "ethereum" in window && window.ethereum !== undefined;
    setWalletDetected(discovered || legacy);
  }, [connectors]);

  return {
    /** `null` until resolved on the client. */
    walletDetected,
    status,
    address: connection.address,
    chainId: connection.chainId,
    connector: connection.connector,
    isConnected: connection.isConnected,

    connectors: available,
    connect: (connectorId: string) => {
      const connector = available.find((c) => c.uid === connectorId || c.id === connectorId);
      if (connector) connect({ connector });
    },
    /** Clears local connection state. It cannot revoke access — only the wallet can. */
    disconnect: () => disconnect(),

    isConnecting: status === "connecting",
    error: connectError ? explainError(connectError) : null,
    resetError: reset,
  };
}
