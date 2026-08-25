import { describe, expect, it } from "vitest";
import { decodeError } from "@/lib/web3/errors/decode";
import { explainDecoded } from "@/lib/web3/errors/explain";

/**
 * Wallet rejection, decoded correctly regardless of which connector produced it.
 *
 * Injected wallets (MetaMask, Rabby, ...) reject a request with the EIP-1193 shape:
 * `{ code: 4001 }` or `{ code: "ACTION_REJECTED" }`, already covered before this file
 * existed. WalletConnect sessions reject through a completely different, SDK-specific
 * error table instead — `@walletconnect/utils`'s `getSdkError`, read directly out of the
 * installed package rather than assumed:
 *
 *   USER_REJECTED         { message: "User rejected.",         code: 5000 }
 *   USER_REJECTED_CHAINS  { message: "User rejected chains.",  code: 5001 }
 *   USER_REJECTED_METHODS { message: "User rejected methods.", code: 5002 }
 *   USER_REJECTED_EVENTS  { message: "User rejected events.",  code: 5003 }
 *
 * A decoder that only recognised 4001 would show a user who just declined a WalletConnect
 * pairing request the generic "Something went wrong" failure state instead of "Signature
 * declined" — technically not incorrect, but exactly the kind of quiet downgrade this
 * protocol's own error-handling philosophy treats as a defect (see `decode.ts`'s header
 * comment on `instanceof` breaking silently across duplicate module instances; this is the
 * same shape of failure, a different cause).
 */

describe("WalletConnect rejection codes", () => {
  /**
   * `message` deliberately does *not* contain "rejected" or "denied" anywhere. If this
   * test were written with the SDK's real wording ("User rejected.") it would also pass
   * against a decoder with the numeric-code check deleted entirely, purely through the
   * pre-existing message-regex fallback — proving nothing about the code check itself.
   * A generic message isolates the two: this only passes if `code` alone is recognised.
   */
  it.each([
    ["USER_REJECTED", 5000],
    ["USER_REJECTED_CHAINS", 5001],
    ["USER_REJECTED_METHODS", 5002],
    ["USER_REJECTED_EVENTS", 5003],
  ])("classifies %s (code %d) as a rejection from the code alone", (_label, code) => {
    const decoded = decodeError({ code, message: "Session request declined by peer." });
    expect(decoded).toEqual({ kind: "user-rejected" });
    expect(explainDecoded(decoded).tone).toBe("rejected");
  });

  it("still recognises the EIP-1193 shape injected wallets use", () => {
    expect(decodeError({ code: 4001, message: "User rejected the request." })).toEqual({
      kind: "user-rejected",
    });
    expect(decodeError({ code: "ACTION_REJECTED" })).toEqual({ kind: "user-rejected" });
  });

  /**
   * The realistic case: wagmi wraps a connector's rejection in its own error before it
   * reaches `explainError`, so the WalletConnect code is not always sitting at the top
   * level. `decode.ts` walks the whole `.cause` chain for exactly this reason.
   */
  it("finds a WalletConnect rejection nested inside a wrapping connector error", () => {
    const wrapped = {
      name: "ConnectorClientError",
      message: "An error occurred while connecting.",
      cause: {
        name: "SessionRequestError",
        message: "User rejected.",
        code: 5000,
      },
    };
    expect(decodeError(wrapped)).toEqual({ kind: "user-rejected" });
  });

  /**
   * The gap this suite exists to close. If an intermediate wrapper drops the numeric
   * `code` — plausible, since not every layer of a connector's own error handling
   * preserves it — only the message text survives. Before this fix, the message check
   * looked at `messageOf(error)`, the *top-level* error only; a message that read "User
   * rejected." two levels down in `.cause.cause` was invisible to it. Reintroducing that
   * bug (checking only the outermost node) makes this exact case fail.
   */
  it("falls back to message text at any depth when the code is lost along the way", () => {
    const codeless = {
      name: "ConnectorClientError",
      message: "An error occurred while connecting.",
      cause: {
        name: "SessionRequestError",
        message: "Internal error.",
        cause: {
          message: "User rejected.",
        },
      },
    };
    expect(decodeError(codeless)).toEqual({ kind: "user-rejected" });
  });

  it("does not misclassify an unrelated error as a rejection", () => {
    const decoded = decodeError({ message: "fetch failed" });
    expect(decoded.kind).not.toBe("user-rejected");
    expect(decoded.kind).toBe("network");
  });
});
