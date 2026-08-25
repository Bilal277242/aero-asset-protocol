"use client";

import * as React from "react";
import { Check, ExternalLink, X, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState } from "@/components/data/states";
import type { TxPhase, TxState } from "@/hooks/useContractWrite";

/**
 * The transaction lifecycle, made visible.
 *
 * Six stages are shown explicitly and none of them are hidden or collapsed:
 *
 *   1. **Action** — what you asked for, in plain language, with what it will do
 *   2. **Wallet confirmation** — the request is open in your wallet
 *   3. **Submitted** — signed and broadcast, hash available immediately
 *   4. **Pending** — in the mempool, waiting to be mined
 *   5. **Confirmed** — included in a block, state has changed
 *   6. **Failed** — with a decoded reason and a remedy
 *
 * A failure is never swallowed. Three distinct kinds are separated, because they call for
 * completely different responses: **blocked** (the protocol would refuse — caught in
 * simulation, no gas spent, no wallet opened), **rejected** (you declined; not an error at
 * all), and **failed** (something genuinely went wrong).
 */
const STAGES: { phase: TxPhase[]; label: string }[] = [
  { phase: ["simulating"], label: "Checking" },
  { phase: ["awaiting-signature"], label: "Your wallet" },
  { phase: ["pending", "confirming"], label: "Submitted" },
  { phase: ["success"], label: "Confirmed" },
];

export function TransactionDialog({
  open,
  onOpenChange,
  title,
  description,
  summary,
  tx,
  onConfirm,
  confirmLabel = "Confirm",
  confirmDisabled = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** What this will actually do — read before signing. */
  summary?: React.ReactNode;
  tx: TxState;
  onConfirm: () => void;
  confirmLabel?: string;
  /**
   * Holds the confirm button closed while the caller's own gate is unmet — a typed
   * confirmation phrase, an incomplete form. Distinct from `inFlight`, which disables it
   * because a transaction is already running.
   */
  confirmDisabled?: boolean;
  /** Form inputs, shown only before submission. */
  children?: React.ReactNode;
}) {
  const settled = tx.phase === "success";
  const stopped = tx.phase === "blocked" || tx.phase === "rejected" || tx.phase === "failed";
  const inFlight = tx.isBusy;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Never let a click-away lose sight of an in-flight transaction.
        if (!next && inFlight) return;
        onOpenChange(next);
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <DialogBody className="grid gap-4">
          {!settled && !stopped && children}

          {summary && !stopped && (
            <div className="rounded-sm bg-sunken shadow-inset-sm p-3">
              <p className="label-key mb-1.5">What this does</p>
              <div className="grid gap-1 text-xs text-ink-2">{summary}</div>
            </div>
          )}

          {tx.phase !== "idle" && <StageTrack tx={tx} />}

          {tx.phase === "rejected" && (
            <div className="rounded-sm bg-sunken shadow-inset-sm p-3">
              <p className="text-sm font-medium text-ink">Signature declined</p>
              <p className="mt-0.5 text-xs text-ink-2">
                You dismissed the request in your wallet. Nothing was submitted and nothing
                was charged.
              </p>
            </div>
          )}

          {(tx.phase === "blocked" || tx.phase === "failed") && tx.error && (
            <ErrorState
              kind={
                tx.error.tone === "infrastructure"
                  ? "infrastructure"
                  : tx.phase === "blocked"
                    ? "protocol"
                    : "protocol"
              }
              title={tx.error.title}
              cause={tx.error.cause}
              remedy={tx.error.remedy}
              detail={tx.error.detail}
            />
          )}

          {tx.hash && (
            <a
              href={tx.explorerUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 break-all font-mono text-2xs text-accent hover:underline"
            >
              {tx.hash}
              <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
            </a>
          )}
        </DialogBody>

        <DialogFooter>
          {settled ? (
            <Button variant="primary" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          ) : stopped ? (
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="secondary" disabled={inFlight} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={inFlight}
                disabled={confirmDisabled}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The six stages, with the current one named in full. */
function StageTrack({ tx }: { tx: TxState }) {
  const stopped = tx.phase === "blocked" || tx.phase === "rejected" || tx.phase === "failed";
  const activeIndex = STAGES.findIndex((s) => s.phase.includes(tx.phase));

  const detail: Partial<Record<TxPhase, string>> = {
    simulating:
      "Simulating against current protocol state. If this would be refused you will be told now, before your wallet opens and before any gas is spent.",
    "awaiting-signature":
      "The request is open in your wallet. Read what you are signing before approving.",
    pending: "Signed and broadcast. Waiting to be included in a block.",
    confirming: "The transaction was replaced or sped up. Now tracking the new hash.",
    success: "Included in a block. The protocol state has changed.",
  };

  return (
    <div className="grid gap-2.5">
      <ol className="flex items-center gap-1" aria-label="Transaction progress">
        {STAGES.map((stage, i) => {
          const done = !stopped && activeIndex > i;
          const current = activeIndex === i;
          return (
            <li key={stage.label} className="flex flex-1 items-center gap-1">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold",
                  done && "border-confirmed bg-confirmed text-ink-inv",
                  current && !stopped && "border-accent text-accent",
                  current && stopped && "border-adverse text-adverse",
                  !done && !current && "border-rule text-ink-3",
                )}
              >
                {done ? (
                  <Check className="size-3" aria-hidden="true" />
                ) : current && stopped ? (
                  <X className="size-3" aria-hidden="true" />
                ) : current ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  "hidden truncate text-2xs tablet:inline",
                  current ? "font-medium text-ink" : "text-ink-3",
                )}
              >
                {stage.label}
              </span>
              {i < STAGES.length - 1 && (
                <span
                  className={cn("h-px flex-1", done ? "bg-confirmed" : "bg-rule")}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>

      {/*
        The per-step labels are hidden below tablet to keep the track from wrapping, which
        leaves a phone showing five unlabelled circles mid-transaction. Naming the current
        step here restores what the track is actually communicating.
      */}
      {activeIndex >= 0 && STAGES[activeIndex] && (
        <p className="text-2xs font-medium text-ink tablet:hidden">
          Step {activeIndex + 1} of {STAGES.length} · {STAGES[activeIndex].label}
        </p>
      )}

      {tx.phase === "blocked" && (
        <p className="flex items-start gap-1.5 text-xs text-blocked">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Refused before signing. Your wallet never opened and no gas was spent.
        </p>
      )}

      {detail[tx.phase] && (
        <p className="text-xs leading-relaxed text-ink-2" role="status" aria-live="polite">
          {detail[tx.phase]}
        </p>
      )}
    </div>
  );
}
