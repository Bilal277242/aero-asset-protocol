"use client";

import * as React from "react";
import { useConnection, usePublicClient, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type { Abi, Address, Hex } from "viem";
import { CHAIN_ID, explorerTx } from "@/config/env";
import { TARGET_CHAIN_ID } from "@/lib/web3/config";
import { explainError, type ExplainedError } from "@/lib/web3/errors/explain";
import { useNetworkGuard } from "./useNetworkGuard";

/**
 * The transaction lifecycle.
 *
 * Seven states, because collapsing them loses information the user needs:
 *
 *   idle → simulating → awaiting-signature → pending → confirming → success
 *                    ↘ blocked            ↘ rejected / failed
 *
 * `simulating` and `blocked` are the pair that matter most. The protocol declares over a
 * hundred typed errors and a great many preconditions, so almost every failure can be
 * detected *before* the wallet opens. A user who never sees a reverted transaction is not
 * lucky — they are being told no by the interface instead of by the chain, at no cost.
 */
export type TxPhase =
  | "idle"
  | "simulating"
  | "blocked"
  | "awaiting-signature"
  | "rejected"
  | "pending"
  | "confirming"
  | "success"
  | "failed";

export type TxState = {
  phase: TxPhase;
  hash: Hex | undefined;
  explorerUrl: string | undefined;
  error: ExplainedError | null;
  /** Confirmations observed so far. */
  confirmations: number;
  isBusy: boolean;
};

export type WriteRequest = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  /** Query key prefixes to invalidate once the receipt lands. */
  invalidates?: readonly (readonly unknown[])[];
};

const IDLE: TxState = {
  phase: "idle",
  hash: undefined,
  explorerUrl: undefined,
  error: null,
  confirmations: 0,
  isBusy: false,
};

export function useContractWrite() {
  const [state, setState] = React.useState<TxState>(IDLE);
  const connection = useConnection();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const network = useNetworkGuard();

  const reset = React.useCallback(() => setState(IDLE), []);

  const execute = React.useCallback(
    async (request: WriteRequest): Promise<Hex | null> => {
      const account = connection.address;

      if (!account) {
        setState({
          ...IDLE,
          phase: "blocked",
          error: {
            tone: "blocked",
            title: "No wallet connected",
            remedy: "Connect a wallet to submit a transaction.",
          },
        });
        return null;
      }

      if (network.isWrongNetwork) {
        setState({
          ...IDLE,
          phase: "blocked",
          error: {
            tone: "blocked",
            title: `Wrong network`,
            cause: `Your wallet is on chain ${network.currentChainId}; this protocol is deployed on ${network.expectedChainName}.`,
            remedy: network.canSwitch
              ? "Switch networks and try again."
              : "Switch to Sepolia in your wallet, then try again.",
          },
        });
        return null;
      }

      if (!publicClient) {
        setState({
          ...IDLE,
          phase: "blocked",
          error: {
            tone: "infrastructure",
            title: "No connection to the network",
            remedy: "Reload the page and try again.",
          },
        });
        return null;
      }

      // ── 1 · Simulate ────────────────────────────────────────────────────
      // Catches every precondition the protocol enforces, decoded to a named error,
      // before the wallet is ever opened.
      setState({ ...IDLE, phase: "simulating", isBusy: true });
      try {
        // No chain override: the public client is already bound to the target chain, and
        // passing one here would let a caller simulate somewhere the app cannot write.
        await publicClient.simulateContract({
          account,
          address: request.address,
          abi: request.abi,
          functionName: request.functionName,
          args: request.args,
        });
      } catch (err) {
        setState({ ...IDLE, phase: "blocked", error: explainError(err) });
        return null;
      }

      // ── 2 · Sign ────────────────────────────────────────────────────────
      setState({ ...IDLE, phase: "awaiting-signature", isBusy: true });
      let hash: Hex;
      try {
        hash = await writeContractAsync({
          address: request.address,
          abi: request.abi,
          functionName: request.functionName,
          args: request.args,
          // Pinned explicitly: a wallet that silently switched networks between the
          // guard check and the signature must fail rather than write to another chain.
          chainId: TARGET_CHAIN_ID,
        });
      } catch (err) {
        const explained = explainError(err);
        setState({
          ...IDLE,
          phase: explained.tone === "rejected" ? "rejected" : "failed",
          error: explained,
        });
        return null;
      }

      // ── 3 · Wait ────────────────────────────────────────────────────────
      setState({
        ...IDLE,
        phase: "pending",
        hash,
        explorerUrl: explorerTx(hash),
        isBusy: true,
      });

      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 1,
          onReplaced: (replacement) => {
            // A sped-up or cancelled transaction gets a new hash. Following it beats
            // waiting forever on one that will never be mined.
            setState((s) => ({
              ...s,
              hash: replacement.transaction.hash,
              explorerUrl: explorerTx(replacement.transaction.hash),
              phase: "confirming",
            }));
          },
        });

        if (receipt.status === "reverted") {
          setState({
            ...IDLE,
            phase: "failed",
            hash,
            explorerUrl: explorerTx(hash),
            error: {
              tone: "failed",
              title: "The transaction reverted on-chain",
              cause:
                "It passed simulation but failed when mined, which usually means the protocol's state changed in between.",
              remedy: "Refresh and try again — the precondition that held a moment ago may not hold now.",
              detail: hash,
            },
          });
          return null;
        }

        for (const key of request.invalidates ?? []) {
          void queryClient.invalidateQueries({ queryKey: ["aeroasset", CHAIN_ID, ...key] });
        }

        setState({
          ...IDLE,
          phase: "success",
          hash,
          explorerUrl: explorerTx(hash),
          confirmations: 1,
        });
        return hash;
      } catch (err) {
        // The transaction may well be mined; only the wait failed.
        setState({
          ...IDLE,
          phase: "failed",
          hash,
          explorerUrl: explorerTx(hash),
          error: {
            ...explainError(err),
            remedy:
              "The transaction may still confirm. Check it on the explorer before resubmitting — resubmitting could execute it twice.",
          },
        });
        return null;
      }
    },
    [connection.address, network, publicClient, queryClient, writeContractAsync],
  );

  return { ...state, execute, reset };
}
