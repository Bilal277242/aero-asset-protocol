import { describe, expect, it } from "vitest";
import { keccak256, stringToHex } from "viem";
import { bytes32Label, decodeBytes32String, shortHex } from "@/lib/format/bytes32";
import { commitment, normaliseSalt } from "@/lib/format/salt";
import { duration, formatDate, formatDateTime, relative } from "@/lib/format/time";

describe("decodeBytes32String", () => {
  it("round-trips a short label", () => {
    expect(decodeBytes32String(stringToHex("A320-214", { size: 32 }))).toBe("A320-214");
  });

  it("round-trips a label that fills all 32 bytes", () => {
    const full = "0123456789abcdef0123456789abcdef";
    expect(full.length).toBe(32);
    expect(decodeBytes32String(stringToHex(full, { size: 32 }))).toBe(full);
  });

  it("returns null for zero", () => {
    expect(decodeBytes32String(`0x${"0".repeat(64)}`)).toBeNull();
  });

  it("returns null for a hash rather than mojibake", () => {
    // The same `bytes32` type carries both labels and commitments. Decoding a hash as
    // text is worse than showing hex, because it looks like a real value.
    expect(decodeBytes32String(keccak256(stringToHex("MSN-7421")))).toBeNull();
  });

  it("falls back to shortened hex in bytes32Label", () => {
    const hash = keccak256(stringToHex("MSN-7421"));
    expect(bytes32Label(hash)).toBe(shortHex(hash));
    expect(bytes32Label(null)).toBe("—");
  });
});

describe("normaliseSalt", () => {
  it("treats an empty field as the zero salt", () => {
    expect(normaliseSalt("")).toBe(`0x${"0".repeat(64)}`);
    expect(normaliseSalt("   ")).toBe(`0x${"0".repeat(64)}`);
  });

  it("reads a decimal the way a script writes bytes32(uint256(n))", () => {
    expect(normaliseSalt("1")).toBe(`0x${"0".repeat(63)}1`);
    expect(normaliseSalt("255")).toBe(`0x${"0".repeat(62)}ff`);
  });

  it("left-pads short hex, matching Solidity literal widening", () => {
    expect(normaliseSalt("0x01")).toBe(`0x${"0".repeat(63)}1`);
    expect(normaliseSalt("0X0A")).toBe(`0x${"0".repeat(62)}0a`);
  });

  it("rejects what it cannot interpret rather than guessing", () => {
    expect(() => normaliseSalt("0xzz")).toThrow(/valid hex/);
    expect(() => normaliseSalt(`0x${"1".repeat(65)}`)).toThrow(/longer than 32 bytes/);
    expect(() => normaliseSalt("my-secret")).toThrow(/hex or a decimal/);
  });
});

describe("commitment", () => {
  it("reproduces the seeded serial commitment on Sepolia asset #1", () => {
    // `SeedSepolia.s.sol` registers `keccak256(abi.encode(bytes32("MSN-7421"), salt))`
    // with the default `SEED_SALT` of 1. This exact value is on-chain, so a change to
    // the encoding here fails loudly instead of silently reporting "no match" to every
    // user who types the right serial.
    expect(commitment("MSN-7421", normaliseSalt("1"), "bytes32")).toBe(
      "0x3f539148a3554fbf2d148e8850f449d4a63bf273cc87b3c052f0bce187661033",
    );
  });

  it("gives a different answer for the string encoding", () => {
    // `abi.encode(string)` is an offset, a length and padded data; `abi.encode(bytes32)`
    // is 32 bytes inline. Same characters, different commitment — which is why the tool
    // asks rather than assumes.
    const salt = normaliseSalt("1");
    expect(commitment("MSN-7421", salt, "string")).not.toBe(
      commitment("MSN-7421", salt, "bytes32"),
    );
  });

  it("changes completely with the salt", () => {
    expect(commitment("MSN-7421", normaliseSalt("1"), "bytes32")).not.toBe(
      commitment("MSN-7421", normaliseSalt("2"), "bytes32"),
    );
  });
});

describe("time", () => {
  it("formats a uint40 second count as a UTC date", () => {
    expect(formatDate(1_755_129_600)).toBe("2025-08-14");
    expect(formatDateTime(1_755_129_600)).toBe("2025-08-14 00:00 UTC");
  });

  it("renders an unset timestamp as a dash, not the epoch", () => {
    // `verifiedAt` and `removedAt` are 0 until they happen. "1970-01-01" would read as
    // a real date on a maintenance record.
    expect(formatDate(0)).toBe("—");
    expect(formatDateTime(0)).toBe("—");
  });

  it("describes deadlines relative to a supplied clock", () => {
    expect(relative(1000n + 86_400n * 6n, 1000n)).toBe("in 6 days");
    expect(relative(1000n, 1000n + 3600n)).toBe("1 hour ago");
    expect(relative(1000n, 1000n)).toBe("in under a minute");
    expect(relative(1000n, 1010n)).toBe("just now");
  });

  it("describes a backdating gap", () => {
    expect(duration(86_400 * 45)).toBe("45 days");
    expect(duration(86_400 * 400)).toBe("1.1 years");
  });
});
