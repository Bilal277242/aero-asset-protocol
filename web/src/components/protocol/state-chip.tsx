import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * The four-value state indicator.
 *
 * Most systems ship good / warning / bad. This protocol needs a fourth, because it has
 * states that are none of those: **true on-chain but not yet recorded**. A listing past
 * its expiry still reads ACTIVE in storage until somebody pays gas; a transfer offer past
 * its deadline still has a non-zero `pendingOwner`; a failed payout sits claimable and
 * silent.
 *
 * Colouring those amber says "be careful". Colouring them green is a lie. They get their
 * own value.
 *
 * Every chip carries a **text label**, so state is never encoded by colour alone.
 */
export type StateTone = "confirmed" | "blocked" | "adverse" | "unrecorded" | "neutral";

const TONE: Record<StateTone, string> = {
  confirmed: "border-confirmed/45 bg-confirmed-bg text-confirmed",
  blocked: "border-blocked/45 bg-blocked-bg text-blocked",
  adverse: "border-adverse/45 bg-adverse-bg text-adverse",
  unrecorded: "border-unrecorded/45 bg-unrecorded-bg text-unrecorded",
  neutral: "border-rule bg-sunken text-ink-2",
};

const DOT: Record<StateTone, string> = {
  confirmed: "bg-confirmed",
  blocked: "bg-blocked",
  adverse: "bg-adverse",
  unrecorded: "bg-unrecorded",
  neutral: "bg-ink-3",
};

export function StateChip({
  tone = "neutral",
  children,
  hint,
  className,
}: {
  tone?: StateTone;
  children: React.ReactNode;
  /** Rendered as a `title`, for the "why is it this state" question. */
  hint?: string;
  className?: string;
}) {
  return (
    <span
      title={hint}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xs border px-1.5 py-0.5",
        "font-mono text-3xs uppercase whitespace-nowrap",
        TONE[tone],
        hint && "cursor-help",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT[tone])} aria-hidden="true" />
      {children}
    </span>
  );
}

/**
 * The sentence that always accompanies an `unrecorded` state.
 *
 * Kept as one component so the phrasing cannot drift between screens. Users learn this
 * concept once; it must read identically everywhere they meet it.
 */
export function UnrecordedNote({ what, className }: { what: string; className?: string }) {
  return (
    <p className={cn("text-xs leading-relaxed text-unrecorded", className)}>
      <strong className="font-medium">True by time, not yet written to the chain.</strong>{" "}
      {what} Anyone can pay the gas to record it, which is why this state is visible rather
      than hidden.
    </p>
  );
}
