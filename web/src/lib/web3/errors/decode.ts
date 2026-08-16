import { decodeErrorResult, type Hex } from "viem";
import { protocolErrorAbi, protocolErrorSelectors } from "@/lib/contracts/generated/errors";

/**
 * Turns any thrown value into a structured description of what the chain said.
 *
 * The protocol uses custom errors exclusively — there is no `require`-with-string
 * anywhere in `src/` — so a revert always carries a name and typed arguments. Reaching
 * them means walking the error chain rather than reading `error.message`, which is where
 * a raw hex blob usually ends up.
 *
 * **Structural, never `instanceof`.** A bundler that ends up with two copies of viem —
 * one pulled by wagmi, one direct — breaks every `instanceof BaseError` check silently,
 * and every revert then degrades to "something went wrong". That is exactly what
 * happened here the first time. Walking `.cause` and reading well-known field names
 * survives duplication.
 */

export type DecodedError =
  | { kind: "user-rejected" }
  | { kind: "no-wallet" }
  | {
      kind: "revert";
      name: string;
      args: readonly unknown[];
      signature: string;
      /**
       * False when only the four-byte selector survived, so the error is named but its
       * arguments are unknown. Copy that interpolates arguments must not run.
       */
      argsAvailable: boolean;
    }
  | { kind: "revert-unknown"; data?: Hex; reason?: string }
  | { kind: "rpc"; detail: string }
  | { kind: "network"; detail: string }
  | { kind: "unknown"; detail: string };

/** Every node in an error's `cause` chain, outermost first. */
function* chain(error: unknown): Generator<Record<string, unknown>> {
  let current: unknown = error;
  let depth = 0;
  while (current && typeof current === "object" && depth < 16) {
    yield current as Record<string, unknown>;
    current = (current as { cause?: unknown }).cause;
    depth += 1;
  }
}

export function decodeError(error: unknown): DecodedError {
  if (error === null || error === undefined) {
    return { kind: "unknown", detail: "No error provided" };
  }

  const nodes = [...chain(error)];

  // ── A rejection is a decision, not a failure ─────────────────────────────
  for (const node of nodes) {
    const name = String(node.name ?? "");
    const code = node.code;
    if (name === "UserRejectedRequestError" || code === 4001 || code === "ACTION_REJECTED") {
      return { kind: "user-rejected" };
    }
  }
  if (/user (rejected|denied)|request rejected/i.test(messageOf(error))) {
    return { kind: "user-rejected" };
  }

  // ── Already-decoded revert ───────────────────────────────────────────────
  for (const node of nodes) {
    const data = node.data;
    if (data && typeof data === "object" && "errorName" in data) {
      const named = data as { errorName?: string; args?: readonly unknown[] };
      if (named.errorName) {
        return {
          kind: "revert",
          name: named.errorName,
          args: named.args ?? [],
          signature: `${named.errorName}(${(named.args ?? []).length} args)`,
          argsAvailable: true,
        };
      }
    }
  }

  // ── Raw revert payload, decoded against every contract ───────────────────
  const candidates = revertDataCandidates(nodes, messageOf(error));

  for (const candidate of candidates) {
    const decoded = decodeAgainstProtocol(candidate);
    if (decoded) return decoded;
  }

  // Selector only. Common: viem decodes against the ABI of the contract that was
  // *called*, so an error declared elsewhere — every `AssetPassport` revert, for
  // instance — arrives with its arguments already discarded. Naming it is most of the
  // value, and the table spans all sixteen contracts.
  for (const candidate of candidates) {
    const name = protocolErrorSelectors[candidate.slice(0, 10).toLowerCase()];
    if (name) {
      return { kind: "revert", name, args: [], signature: name, argsAvailable: false };
    }
  }

  for (const node of nodes) {
    if (typeof node.reason === "string" && node.reason) {
      return { kind: "revert-unknown", reason: node.reason };
    }
  }
  if (candidates[0]) return { kind: "revert-unknown", data: candidates[0] };

  // ── Wallet plumbing ──────────────────────────────────────────────────────
  for (const node of nodes) {
    const name = String(node.name ?? "");
    if (name === "ProviderNotFoundError" || name === "ConnectorNotFoundError") {
      return { kind: "no-wallet" };
    }
  }

  // ── Infrastructure ───────────────────────────────────────────────────────
  const message = messageOf(error);
  if (NETWORK_PATTERNS.test(message)) return { kind: "network", detail: shortest(nodes, message) };

  for (const node of nodes) {
    if (typeof node.code === "number" || String(node.name ?? "").includes("Rpc")) {
      return { kind: "rpc", detail: shortest(nodes, message) };
    }
  }

  return { kind: "unknown", detail: shortest(nodes, message) };
}

/** Decodes 4-byte selector + arguments against every error the protocol can emit. */
export function decodeAgainstProtocol(data: Hex): DecodedError | null {
  try {
    const result = decodeErrorResult({ abi: protocolErrorAbi, data });
    return {
      kind: "revert",
      name: result.errorName,
      args: (result.args ?? []) as readonly unknown[],
      signature: `${result.errorName}(${(result.args ?? []).length} args)`,
      argsAvailable: true,
    };
  } catch {
    return null;
  }
}

/**
 * Every place a revert payload might hide, longest first.
 *
 * Providers and viem versions disagree about where the bytes land — `raw`, `data`,
 * `signature`, or only interpolated into the message. Sorting by length puts the full
 * payload ahead of the bare selector, so arguments are recovered whenever they exist.
 */
function revertDataCandidates(nodes: Record<string, unknown>[], message: string): Hex[] {
  const found = new Set<string>();

  const consider = (value: unknown) => {
    if (typeof value !== "string") return;
    if (!/^0x[0-9a-fA-F]{8,}$/.test(value)) return;
    found.add(value.toLowerCase());
  };

  for (const node of nodes) {
    consider(node.raw);
    consider(node.signature);
    if (typeof node.data === "string") consider(node.data);
  }
  for (const match of message.matchAll(/0x[0-9a-fA-F]{8,}/g)) consider(match[0]);

  return [...found].sort((a, b) => b.length - a.length) as Hex[];
}

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as { message?: unknown; shortMessage?: unknown };
    return `${String(e.shortMessage ?? "")} ${String(e.message ?? "")}`.trim();
  }
  return String(error);
}

/** Prefer viem's one-line summary over its multi-paragraph message. */
function shortest(nodes: Record<string, unknown>[], fallback: string): string {
  for (const node of nodes) {
    if (typeof node.shortMessage === "string" && node.shortMessage) return node.shortMessage;
  }
  for (const node of nodes) {
    if (typeof node.details === "string" && node.details) return node.details;
  }
  return fallback.split("\n")[0] ?? fallback;
}

const NETWORK_PATTERNS =
  /fetch failed|network( request)? (failed|error)|timeout|timed out|ECONNREFUSED|ENOTFOUND|rate.?limit|too many requests|HTTP request failed|status code (429|500|502|503|504)/i;
