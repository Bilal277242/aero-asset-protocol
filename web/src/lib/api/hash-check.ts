import type { Hex } from "viem";

/**
 * What a document hash comparison actually established.
 *
 * Pure, and deliberately in its own module with no chain or configuration dependency —
 * this is the logic behind a verification verdict, and it must be reasonable about, and
 * testable, without an RPC endpoint in scope. (`./roles` and `./role-catalog` were split
 * for the same reason; a pure decision buried in a module full of readers is a decision
 * nobody can test cheaply.)
 *
 * Two independent questions, kept apart on purpose. **Does the file match the commitment
 * stored on this record?** — a local comparison. And **does the registry itself resolve
 * that hash to this document?** — `documentIdOf`, asked of the chain.
 *
 * A single boolean would collapse them, and the case it would hide is the one that
 * matters: a hash matching the stored field but resolving elsewhere, or nowhere, means the
 * record and its reverse index disagree. That must be visible, not rendered as a tick.
 */
export type HashOutcome =
  /** The file is the one committed to, and the registry agrees it belongs to this record. */
  | { kind: "verified" }
  /** Matches this record's stored hash, but the registry resolves it elsewhere. */
  | { kind: "inconsistent"; resolvedTo: bigint | null }
  /** Different bytes. The hash is registered against this asset under another document. */
  | { kind: "mismatch-known"; resolvedTo: bigint }
  /** Different bytes, and this hash is not registered against this asset at all. */
  | { kind: "mismatch-unknown" };

export function classifyHash(args: {
  computed: Hex;
  /** The commitment stored on the record being viewed. */
  expected: Hex;
  documentId: bigint;
  /** `documentIdOf(assetId, computed)`, or null when the registry resolves nothing. */
  resolved: bigint | null;
}): HashOutcome {
  // Case-insensitive because a hex string's case carries no meaning here, and a comparison
  // that depended on it would pass or fail on where the value came from.
  const matches = args.computed.toLowerCase() === args.expected.toLowerCase();

  if (matches) {
    return args.resolved === args.documentId
      ? { kind: "verified" }
      : { kind: "inconsistent", resolvedTo: args.resolved };
  }

  // `documentIdOf` answers 0 for an unused hash; the reader maps that to null, but a zero
  // arriving here must never be read as "document #0".
  return args.resolved !== null && args.resolved > 0n
    ? { kind: "mismatch-known", resolvedTo: args.resolved }
    : { kind: "mismatch-unknown" };
}
