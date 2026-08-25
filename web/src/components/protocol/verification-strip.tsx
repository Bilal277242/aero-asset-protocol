import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { BlockStamp } from "./chain-value";
import { NonClaim, type NonClaimVariant } from "./non-claim";

/**
 * The signature component of the system. It appears on every record and does more work
 * than anything else here.
 *
 * Three bands, always in this order:
 *
 *   1. **What it is**        — name, id, classification, state
 *   2. **What the chain says, and at which height** — the attested fields
 *   3. **What none of it claims** — the qualifiers for this record type
 *
 * The order is the argument. A reader meets the claim, then its provenance, then its
 * limits — and the limits are attached to the claim rather than exiled to a footer.
 * Band three is not optional and is never dropped for space.
 */
export function VerificationStrip({
  title,
  identifier,
  classification,
  state,
  fields,
  blockNumber,
  nonClaims,
  className,
}: {
  title: React.ReactNode;
  /** e.g. "ASSET #1" — always monospace, always beside the name. */
  identifier?: string;
  classification?: React.ReactNode;
  state?: React.ReactNode;
  fields: { label: string; value: React.ReactNode }[];
  blockNumber?: string | number | bigint;
  nonClaims?: NonClaimVariant[];
  className?: string;
}) {
  return (
    <section
      className={cn("overflow-hidden rounded-md bg-panel shadow-raised", className)}
      aria-label="Record summary"
    >
      {/* Band 1 — what it is */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule-2 px-4 py-3">
        <h2 className="font-mono text-md font-semibold tracking-tight text-ink">{title}</h2>
        {identifier && <span className="font-mono text-xs text-ink-3">{identifier}</span>}
        {classification}
        {state}
      </header>

      {/* Band 2 — what the chain asserts */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 px-4 py-3 tablet:grid-cols-2 laptop:grid-cols-3">
        {fields.map((f) => (
          <div key={f.label} className="min-w-0">
            <span className="label-key block">{f.label}</span>
            <span className="block truncate text-sm text-ink">{f.value}</span>
          </div>
        ))}
        {blockNumber !== undefined && (
          <div className="min-w-0">
            <span className="label-key block">As of</span>
            <BlockStamp blockNumber={blockNumber} className="block text-xs" />
          </div>
        )}
      </div>

      {/* Band 3 — what none of it claims.
          `NonClaim display="block"` already renders a paragraph, so it is placed directly
          rather than wrapped: a <p> inside a <p> is invalid HTML and React will refuse to
          hydrate it. */}
      {nonClaims && nonClaims.length > 0 && (
        <footer className="grid gap-1.5 border-t border-rule-2 bg-sunken px-4 py-2.5">
          {nonClaims.map((v) => (
            <NonClaim
              key={v}
              variant={v}
              display="block"
              className="border-0 bg-transparent p-0"
            />
          ))}
        </footer>
      )}
    </section>
  );
}
