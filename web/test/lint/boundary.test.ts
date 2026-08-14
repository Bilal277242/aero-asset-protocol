import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { resolve } from "node:path";

/**
 * The containment boundary is a correctness control, not a style preference, so it is
 * tested like one.
 *
 * The protocol stores a `status` on listings, offers and credentials that goes stale —
 * an expired listing still reads `ACTIVE` until someone pays gas to record the expiry.
 * The ESLint rules in `eslint.config.mjs` are what stop a component reading it directly.
 * A misconfigured `ignores`, a plugin that fails to load, or a rename of the domain
 * directory would all disable them silently.
 *
 * This actually happened during Phase 0: `eslint-config-next` pulls
 * `@rushstack/eslint-patch`, which crashes on ESLint 9.39 and took the entire lint run
 * down. The build still passed. Without this test the boundary would have been dead and
 * nothing would have said so.
 */
describe("domain containment boundary", () => {
  const fixture = resolve(import.meta.dirname, "fixtures", "violation.tsx");

  it("rejects a component that imports a generated ABI or a raw viem action", async () => {
    // `overrideConfig` re-states the rule against the fixture path, because the fixture
    // lives outside `src/` (it must not be part of the build).
    const eslint = new ESLint({
      overrideConfigFile: resolve(import.meta.dirname, "..", "..", "eslint.config.mjs"),
      overrideConfig: {
        files: ["**/violation.tsx"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                { group: ["**/generated/abis/*", "@/generated/abis", "@/generated/abis/*"] },
                { group: ["viem/actions", "wagmi/actions"] },
              ],
            },
          ],
        },
      },
      ignore: false,
    });

    const results = await eslint.lintFiles([fixture]);
    const messages = results.flatMap((r) => r.messages);
    const restricted = messages.filter((m) => m.ruleId === "no-restricted-imports");

    // Both violations must be caught: the ABI import and the raw action import.
    expect(
      restricted.length,
      `expected 2 no-restricted-imports errors, got ${restricted.length}. ` +
        `All messages: ${JSON.stringify(messages.map((m) => m.ruleId))}`,
    ).toBe(2);
  });

  it("loads the real config without crashing", async () => {
    // Guards the failure mode that actually bit us: a plugin blowing up on load, which
    // makes every rule silently absent rather than reporting an error.
    const eslint = new ESLint({
      overrideConfigFile: resolve(import.meta.dirname, "..", "..", "eslint.config.mjs"),
    });
    const config = await eslint.calculateConfigForFile(
      resolve(import.meta.dirname, "..", "..", "src", "app", "page.tsx"),
    );

    expect(config.rules).toBeDefined();
    expect(config.rules?.["no-restricted-imports"]).toBeDefined();
  });
});
