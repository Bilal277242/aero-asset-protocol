"use client";

import { ExternalLink } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { StateChip } from "@/components/protocol/state-chip";
import { ErrorState } from "@/components/data/states";
import type { TxState } from "@/hooks/useContractWrite";

/**
 * Transaction status.
 *
 * Every phase gets its own treatment. Two are worth calling out:
 *
 * - **rejected** is not an error. The user declined, nothing was submitted, nothing was
 *   charged. Rendering it in red teaches people to fear a control they used correctly.
 * - **blocked** means the protocol would refuse. Caught in simulation, so the wallet
 *   never opened and no gas was spent — the message explains the precondition instead.
 */
export function TransactionStatus({ tx }: { tx: TxState }) {
  if (tx.phase === "idle") return null;

  if (tx.phase === "blocked" && tx.error) {
    return (
      <ErrorState
        kind="protocol"
        title={tx.error.title}
        cause={tx.error.cause}
        remedy={tx.error.remedy}
        detail={tx.error.detail}
      />
    );
  }

  if (tx.phase === "rejected") {
    return (
      <div className="rounded-sm bg-sunken shadow-inset-sm p-3">
        <p className="text-sm font-medium text-ink">Signature declined</p>
        <p className="mt-0.5 text-xs text-ink-2">
          Nothing was submitted and nothing was charged. You can try again whenever you like.
        </p>
      </div>
    );
  }

  if (tx.phase === "failed" && tx.error) {
    return (
      <ErrorState
        kind={tx.error.tone === "infrastructure" ? "infrastructure" : "protocol"}
        title={tx.error.title}
        cause={tx.error.cause}
        remedy={tx.error.remedy}
        detail={tx.error.detail}
      />
    );
  }

  if (tx.phase === "success") {
    return (
      <div className="rounded border border-confirmed/40 bg-confirmed-bg p-3">
        <div className="flex items-center gap-2">
          <StateChip tone="confirmed">Confirmed</StateChip>
          {tx.explorerUrl && <ExplorerLink url={tx.explorerUrl} />}
        </div>
        <p className="mt-1.5 text-xs text-ink-2">
          The transaction is included in a block and the protocol state has changed.
        </p>
      </div>
    );
  }

  const label: Record<string, { title: string; detail: string }> = {
    simulating: {
      title: "Checking whether this will succeed",
      detail: "Simulating against the current state before opening your wallet, so a refusal costs nothing.",
    },
    "awaiting-signature": {
      title: "Waiting for your signature",
      detail: "Approve or reject the request in your wallet. Read it before you approve.",
    },
    pending: {
      title: "Submitted, waiting to be mined",
      detail: "The transaction is in the mempool. This usually takes a few seconds.",
    },
    confirming: {
      title: "Replacement detected, following it",
      detail: "The transaction was sped up or replaced, so this is now tracking the new hash.",
    },
  };

  const current = label[tx.phase];
  if (!current) return null;

  return (
    <div className="rounded-md bg-panel shadow-raised p-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        <Spinner className="size-3.5 text-accent" />
        <p className="text-sm font-medium text-ink">{current.title}</p>
        {tx.explorerUrl && <ExplorerLink url={tx.explorerUrl} />}
      </div>
      <p className="mt-1 text-xs text-ink-2">{current.detail}</p>
    </div>
  );
}

function ExplorerLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="ml-auto inline-flex items-center gap-1 text-xs text-accent hover:underline"
    >
      Explorer
      <ExternalLink className="size-3" aria-hidden="true" />
    </a>
  );
}
