"use client";

import * as React from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Values that came from the chain.
 *
 * Every component in this file renders in monospace, and that is semantic rather than
 * decorative: it marks the boundary between what the protocol asserts and what this
 * interface is telling you. A reader can tell the two apart at a glance without being
 * taught the rule.
 */

/** Shortens hex in the middle. Never at the end — the tail is how addresses are checked. */
export function shortHex(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

export function AddressDisplay({
  address,
  explorerUrl,
  short = true,
  label,
  className,
}: {
  address: string;
  /** Full URL to the explorer entry. Omitted for addresses with nothing to link to. */
  explorerUrl?: string;
  short?: boolean;
  /** A human name shown before the address, e.g. "Treasury". */
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {label && <span className="text-xs text-ink-2">{label}</span>}
      <span className="font-mono text-xs text-ink" title={address}>
        {short ? shortHex(address) : address}
      </span>
      <CopyButton value={address} what="Address" />
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-ink-3 transition-colors hover:text-accent"
          aria-label="View on block explorer"
        >
          <ExternalLink className="size-3" />
        </a>
      )}
    </span>
  );
}

/** A `bytes32` commitment. Always shortened; the full value lives in the title and clipboard. */
export function HashDisplay({ hash, className }: { hash: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="font-mono text-xs text-ink-2" title={hash}>
        {shortHex(hash, 10, 6)}
      </span>
      <CopyButton value={hash} what="Hash" />
    </span>
  );
}

/**
 * A token amount.
 *
 * Takes a pre-formatted string, never a number. Settlement figures are `uint128` base
 * units and do not survive a round trip through a double — the formatting happens in the
 * domain layer with exact arithmetic, and this component only presents it.
 */
export function Amount({
  value,
  symbol,
  size = "sm",
  className,
}: {
  value: string;
  symbol?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono tabular-nums text-ink",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        size === "lg" && "text-lg font-semibold tracking-tight",
        className,
      )}
    >
      {value}
      {symbol && <span className="ml-1 font-normal text-ink-3">{symbol}</span>}
    </span>
  );
}

/**
 * "Read at block N".
 *
 * Not debug output. It is the honest answer to "as of when?", and stating it on every
 * record is most of what separates verification infrastructure from a listings site.
 */
export function BlockStamp({
  blockNumber,
  className,
}: {
  blockNumber: string | number | bigint;
  className?: string;
}) {
  return (
    <span className={cn("font-mono text-2xs text-ink-3", className)}>
      read at block {blockNumber.toString()}
    </span>
  );
}

export function CopyButton({ value, what = "Value" }: { value: string; what?: string }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true));
      }}
      className="text-ink-3 transition-colors hover:text-accent"
      aria-label={copied ? `${what} copied` : `Copy ${what.toLowerCase()}`}
    >
      {copied ? (
        <Check className="size-3 text-confirmed" />
      ) : (
        <Copy className="size-3" />
      )}
    </button>
  );
}
