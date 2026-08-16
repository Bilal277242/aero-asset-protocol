import { formatUnits, parseUnits } from "viem";

/**
 * Settlement amounts.
 *
 * Nothing here converts through a `number`. A `uint128` price does not survive a round
 * trip through a double, and "close enough" is not something a settlement figure gets to
 * be. All arithmetic is `bigint`; all formatting is string manipulation on viem's exact
 * output.
 */

/** `1,250.00` — grouped, at least two decimals, no trailing noise. */
export function formatFixed(value: bigint, decimals: number): string {
  const raw = formatUnits(value, decimals);
  const [whole = "0", fraction = ""] = raw.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  if (decimals === 0) return grouped;

  const trimmed = fraction.replace(/0+$/, "");
  const shown = trimmed.length < 2 ? trimmed.padEnd(2, "0") : trimmed;
  return `${grouped}.${shown}`;
}

export function formatAmount(value: bigint, decimals: number, symbol?: string): string {
  const n = formatFixed(value, decimals);
  return symbol ? `${n} ${symbol}` : n;
}

/**
 * Parses user input into base units.
 *
 * Returns null rather than throwing or coercing, so a form can report a specific problem
 * instead of silently submitting a wrong number.
 */
export function parseAmount(input: string, decimals: number): bigint | null {
  const cleaned = input.trim().replace(/,/g, "");
  if (cleaned === "") return null;
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;

  const [, fraction = ""] = cleaned.split(".");
  // More precision than the token has would be silently truncated by parseUnits.
  if (fraction.length > decimals) return null;

  try {
    const value = parseUnits(cleaned as `${number}`, decimals);
    return value >= 0n ? value : null;
  } catch {
    return null;
  }
}

/**
 * Splits a gross price into the protocol fee and the seller's proceeds.
 *
 * Proceeds are subtracted rather than computed, so `fee + proceeds === price` holds
 * exactly. `Escrow` does the same for the same reason: two independent roundings
 * eventually disagree by a base unit.
 */
export function splitPrice(price: bigint, fee: bigint): { fee: bigint; proceeds: bigint } {
  return { fee, proceeds: price - fee };
}

/** Basis points applied exactly, matching `FeeManager.quote`. */
export function applyBps(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / 10_000n;
}
