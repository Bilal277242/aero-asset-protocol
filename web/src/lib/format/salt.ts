import { encodeAbiParameters, keccak256, stringToHex, type Hex } from "viem";
import { ZERO_BYTES32 } from "./bytes32";

/**
 * Commitment arithmetic, matching what callers actually write in Solidity.
 *
 * `security-model.md` §7 specifies the form as `keccak256(abi.encode(serial, salt))`, and
 * the encoding of the first argument is not a detail: `abi.encode` of a `bytes32` is 32
 * bytes inline, while `abi.encode` of a `string` is an offset, a length and padded data.
 * The same characters produce different commitments, so the caller must say which they
 * used rather than the tool guessing.
 */
export type CommitmentEncoding = "bytes32" | "string";

export function commitment(
  value: string,
  salt: Hex,
  encoding: CommitmentEncoding,
): Hex {
  return encoding === "bytes32"
    ? keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "bytes32" }],
          [stringToHex(value, { size: 32 }), salt],
        ),
      )
    : keccak256(
        encodeAbiParameters([{ type: "string" }, { type: "bytes32" }], [value, salt]),
      );
}

/**
 * Parses a salt the way a person is likely to have written it down.
 *
 * Accepts `0x…` of up to 32 bytes (left-padded, matching how Solidity widens a literal),
 * or a plain decimal — `bytes32(uint256(1))` is by far the most common salt in a script
 * and reads as "1" in the operator's notes. An empty field is the *unprotected* case and
 * is returned as such, loudly, rather than rejected: it is a legitimate thing to check.
 */
export function normaliseSalt(input: string): Hex {
  const trimmed = input.trim();
  if (trimmed.length === 0) return ZERO_BYTES32 as Hex;

  if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
    const body = trimmed.slice(2);
    if (body.length === 0) return ZERO_BYTES32 as Hex;
    if (!/^[0-9a-fA-F]+$/.test(body)) throw new Error("Salt is not valid hex.");
    if (body.length > 64) throw new Error("Salt is longer than 32 bytes.");
    return `0x${body.padStart(64, "0").toLowerCase()}` as Hex;
  }

  if (/^\d+$/.test(trimmed)) {
    const n = BigInt(trimmed);
    if (n >= 1n << 256n) throw new Error("Salt does not fit in 32 bytes.");
    return `0x${n.toString(16).padStart(64, "0")}` as Hex;
  }

  throw new Error("Salt must be 0x-prefixed hex or a decimal number.");
}
