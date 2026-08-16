"use client";

import { useConnection, useSwitchChain } from "wagmi";
import { CHAIN_ID } from "@/config/env";
import { chain, TARGET_CHAIN_ID } from "@/lib/web3/config";
import { explainError } from "@/lib/web3/errors/explain";

/**
 * Network validation.
 *
 * Reads always work regardless of what the wallet is pointed at, because they go through
 * this app's own client rather than the wallet's. Only writes care — so a wrong network
 * disables writes and explains why, instead of blocking the whole interface.
 *
 * Not every wallet can switch programmatically: hardware wallets and some smart-account
 * wallets refuse, and `switchChain` is simply absent. That case gets instructions rather
 * than a button that does nothing.
 */
export function useNetworkGuard() {
  const connection = useConnection();
  const { switchChain, isPending, error } = useSwitchChain();

  const isConnected = connection.isConnected;
  const currentChainId = connection.chainId;
  const isCorrectNetwork = !isConnected || currentChainId === CHAIN_ID;

  const canSwitch = typeof switchChain === "function";

  return {
    isConnected,
    currentChainId,
    expectedChainId: CHAIN_ID,
    expectedChainName: chain.name,
    isCorrectNetwork,
    /** True only when connected *and* on the wrong chain — the state that blocks writes. */
    isWrongNetwork: isConnected && !isCorrectNetwork,
    canSwitch,
    isSwitching: isPending,
    switchToExpected: () => {
      if (canSwitch) switchChain({ chainId: TARGET_CHAIN_ID });
    },
    error: error ? explainError(error) : null,
  };
}
