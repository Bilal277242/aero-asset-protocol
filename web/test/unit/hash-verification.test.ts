import { describe, expect, it } from "vitest";
import { keccak256, toBytes, type Hex } from "viem";
import { classifyHash } from "@/lib/api/hash-check";

/**
 * Document hash verification.
 *
 * The live seed cannot exercise the matching path — its commitments are
 * `keccak256(abi.encode(...))` of a tuple, not of any file's bytes, so no file on earth
 * hashes to them. That is fine for seed data and useless for confirming the success case,
 * which is exactly why the outcome logic is a pure function over four inputs rather than
 * something only a browser with the right PDF can reach.
 *
 * The case worth keeping honest is `inconsistent`: a hash that matches the record's stored
 * field but which `documentIdOf` resolves elsewhere. Collapsing the two questions into one
 * boolean would render that as a green tick — the one outcome a verification tool must
 * never get wrong.
 */

const A = keccak256(toBytes("certificate-of-airworthiness-rev-A"));
const B = keccak256(toBytes("certificate-of-airworthiness-rev-B"));

describe("hashing", () => {
  it("hashes file bytes the way the verifier does", () => {
    // The component reads the file to a Uint8Array and hashes those exact bytes. Same
    // input, same digest — and a one-byte change is a completely different digest.
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    expect(keccak256(bytes)).toMatch(/^0x[0-9a-f]{64}$/);

    const altered = new Uint8Array(bytes);
    altered[7] = 0x36;
    expect(keccak256(altered)).not.toBe(keccak256(bytes));
  });

  it("produces a lowercase digest", () => {
    // The comparison lowercases both sides rather than relying on this, but if viem ever
    // returned mixed case a naive `===` elsewhere would start failing silently.
    expect(A).toBe(A.toLowerCase());
  });
});

describe("classifyHash", () => {
  it("verifies when the file matches and the registry agrees", () => {
    expect(
      classifyHash({ computed: A, expected: A, documentId: 7n, resolved: 7n }),
    ).toEqual({ kind: "verified" });
  });

  it("ignores hex case on both sides", () => {
    const upper = ("0x" + A.slice(2).toUpperCase()) as Hex;
    expect(
      classifyHash({ computed: upper, expected: A, documentId: 7n, resolved: 7n }),
    ).toEqual({ kind: "verified" });
  });

  it("flags a match the registry resolves to a different document", () => {
    expect(
      classifyHash({ computed: A, expected: A, documentId: 7n, resolved: 9n }),
    ).toEqual({ kind: "inconsistent", resolvedTo: 9n });
  });

  it("flags a match the registry resolves to nothing", () => {
    expect(
      classifyHash({ computed: A, expected: A, documentId: 7n, resolved: null }),
    ).toEqual({ kind: "inconsistent", resolvedTo: null });
  });

  it("reports a mismatch that is registered elsewhere on the same asset", () => {
    expect(
      classifyHash({ computed: B, expected: A, documentId: 7n, resolved: 4n }),
    ).toEqual({ kind: "mismatch-known", resolvedTo: 4n });
  });

  it("reports a mismatch that is not registered against the asset at all", () => {
    expect(
      classifyHash({ computed: B, expected: A, documentId: 7n, resolved: null }),
    ).toEqual({ kind: "mismatch-unknown" });
  });

  it("treats a zero resolution as no resolution", () => {
    // `documentIdOf` returns 0 for an unused hash. The reader maps that to null, but a
    // zero arriving here must not be read as "document #0".
    expect(
      classifyHash({ computed: B, expected: A, documentId: 7n, resolved: 0n }),
    ).toEqual({ kind: "mismatch-unknown" });
  });

  it("never reports verified on differing bytes, whatever the registry says", () => {
    for (const resolved of [null, 0n, 7n, 9n]) {
      const outcome = classifyHash({ computed: B, expected: A, documentId: 7n, resolved });
      expect(outcome.kind).not.toBe("verified");
    }
  });
});
