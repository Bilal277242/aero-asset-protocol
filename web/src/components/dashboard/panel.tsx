"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/data/states";
import { BlockStamp } from "@/components/protocol/chain-value";
import type { ExplainedError } from "@/lib/web3/errors/explain";

/**
 * The wrapper every dashboard panel goes through.
 *
 * Loading, empty and error are handled here rather than in each panel, because a state
 * that has to be remembered at nine call sites is a state that will be missing at one of
 * them. A panel body only ever runs with data present.
 *
 * Every panel also carries the block it was read at. On a dashboard that is not a detail —
 * figures from different heights would silently disagree, and "as of when?" must always
 * be answerable.
 */
export function Panel<T>({
  title,
  description,
  state,
  emptyWhen,
  emptyTitle,
  emptyDescription,
  skeleton,
  actions,
  className,
  children,
}: {
  title: string;
  description?: string;
  state: {
    data: T | undefined;
    isLoading: boolean;
    isError: boolean;
    error: ExplainedError | null;
    blockNumber: bigint | undefined;
    refetch: () => void;
  };
  /** Data arrived, but there is nothing in it worth showing. */
  emptyWhen?: (data: T) => boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  skeleton?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: (data: T) => React.ReactNode;
}) {
  const isEmpty = state.data !== undefined && emptyWhen?.(state.data) === true;

  return (
    <section className={cn("flex flex-col rounded border border-rule bg-panel", className)}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-rule-2 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="font-mono text-sm font-semibold tracking-tight text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-ink-2">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {state.blockNumber !== undefined && !state.isLoading && (
            <BlockStamp blockNumber={state.blockNumber.toString()} />
          )}
        </div>
      </header>

      <div className="flex-1 p-4">
        {state.isLoading ? (
          (skeleton ?? <DefaultSkeleton />)
        ) : state.isError || !state.data ? (
          <ErrorState
            kind={state.error?.tone === "infrastructure" ? "infrastructure" : "protocol"}
            title={state.error?.title ?? "Could not load this panel"}
            cause={state.error?.cause}
            remedy={state.error?.remedy}
            detail={state.error?.detail}
            onRetry={state.refetch}
          />
        ) : isEmpty ? (
          <EmptyState
            title={emptyTitle ?? "Nothing recorded yet"}
            description={emptyDescription}
          />
        ) : (
          children(state.data)
        )}
      </div>
    </section>
  );
}

function DefaultSkeleton() {
  return (
    <div className="grid gap-2.5" role="status" aria-label="Loading">
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

/**
 * A single headline figure.
 *
 * `caveat` exists because several protocol counters are cumulative rather than current —
 * `listingCount()` is the highest id ever minted, not the number of live listings. A
 * figure whose meaning is not what a reader assumes needs the correction attached to it,
 * not in a footnote.
 */
export function Metric({
  label,
  value,
  caveat,
  tone = "neutral",
  href,
}: {
  label: string;
  value: React.ReactNode;
  caveat?: string;
  tone?: "neutral" | "confirmed" | "blocked" | "adverse" | "unrecorded";
  href?: string;
}) {
  const toneClass = {
    neutral: "text-ink",
    confirmed: "text-confirmed",
    blocked: "text-blocked",
    adverse: "text-adverse",
    unrecorded: "text-unrecorded",
  }[tone];

  const body = (
    <>
      <span className="label-key block">{label}</span>
      <span
        className={cn(
          "mt-0.5 block font-mono text-2xl font-bold tabular-nums tracking-tight",
          toneClass,
        )}
      >
        {value}
      </span>
      {caveat && <span className="mt-0.5 block text-2xs leading-snug text-ink-3">{caveat}</span>}
    </>
  );

  if (href) {
    return (
      <a href={href} className="block bg-panel p-3 transition-colors hover:bg-sunken">
        {body}
      </a>
    );
  }
  return <div className="bg-panel p-3">{body}</div>;
}

/** A horizontal proportion bar. Used where a count divides into known categories. */
export function Distribution({
  segments,
  total,
}: {
  segments: { label: string; count: number; tone: "confirmed" | "blocked" | "adverse" | "unrecorded" | "neutral" }[];
  total: number;
}) {
  const colour = {
    confirmed: "bg-confirmed",
    blocked: "bg-blocked",
    adverse: "bg-adverse",
    unrecorded: "bg-unrecorded",
    neutral: "bg-ink-3",
  };

  return (
    <div className="grid gap-2">
      <div className="flex h-1.5 w-full overflow-hidden rounded-xs bg-sunken" role="presentation">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <div
              key={s.label}
              className={colour[s.tone]}
              style={{ width: `${total > 0 ? (s.count / total) * 100 : 0}%` }}
            />
          ))}
      </div>
      <dl className="grid gap-1">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-3 text-xs">
            <dt className="flex items-center gap-1.5 text-ink-2">
              <span className={cn("size-1.5 rounded-full", colour[s.tone])} aria-hidden="true" />
              {s.label}
            </dt>
            <dd className="font-mono tabular-nums text-ink">{s.count}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
