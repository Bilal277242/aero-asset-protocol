/**
 * Time formatting.
 *
 * Every timestamp in the protocol is a `uint40` of seconds, compared on-chain against
 * `block.timestamp`. These helpers take `now` explicitly rather than reaching for
 * `Date.now()` so callers stay honest about which clock they mean — ESLint bans the
 * browser clock inside the domain layer for the same reason.
 */

export function formatDate(seconds: number | bigint): string {
  const ms = Number(seconds) * 1000;
  if (!Number.isFinite(ms) || ms === 0) return "—";
  return new Date(ms).toISOString().slice(0, 10);
}

export function formatDateTime(seconds: number | bigint): string {
  const ms = Number(seconds) * 1000;
  if (!Number.isFinite(ms) || ms === 0) return "—";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/** "in 6 days" / "3 hours ago". Coarse on purpose — precision here implies certainty. */
export function relative(target: number | bigint, now: number | bigint): string {
  const delta = Number(target) - Number(now);
  const abs = Math.abs(delta);
  const suffix = delta >= 0 ? "" : " ago";
  const prefix = delta >= 0 ? "in " : "";

  const units: [number, string][] = [
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];

  for (const [size, name] of units) {
    if (abs >= size) {
      const n = Math.floor(abs / size);
      return `${prefix}${n} ${name}${n === 1 ? "" : "s"}${suffix}`;
    }
  }
  return delta >= 0 ? "in under a minute" : "just now";
}

/** Human duration for a gap, e.g. backdating distance. */
export function duration(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs >= 86400 * 365) return `${(abs / (86400 * 365)).toFixed(1)} years`;
  if (abs >= 86400) return `${Math.round(abs / 86400)} days`;
  if (abs >= 3600) return `${Math.round(abs / 3600)} hours`;
  return `${Math.round(abs / 60)} minutes`;
}
