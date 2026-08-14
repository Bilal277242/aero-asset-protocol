import js from "@eslint/js";
import tseslint from "typescript-eslint";

// `eslint-config-next` is deliberately not used. It pulls in
// `@rushstack/eslint-patch`, which fails hard on ESLint 9.39 with "Failed to patch
// ESLint because the calling module was not recognized" — taking the whole lint run
// down with it. Its value is a handful of Next-specific hints; the rules below are a
// correctness control. Losing the hints to keep the control is the right trade.

/**
 * The rules below the standard config are the point of this file.
 *
 * The protocol stores a `status` on listings, offers and credentials that goes stale:
 * an expired listing still reads `ACTIVE` until someone pays gas to record the expiry.
 * A component that renders `listing.status` therefore shows expired listings as
 * buyable. That is a correctness bug no type checker catches, so it is enforced here
 * instead — components physically cannot reach an ABI.
 *
 * `test/lint/boundary.test.ts` asserts these rules actually fire. The rules are
 * load-bearing, so they get their own test.
 */
export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "src/generated/**",
      "test/lint/fixtures/**",
      // Rewritten by `next build`; its triple-slash references are not ours to style.
      "next-env.d.ts",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },

  // ── The containment boundary ───────────────────────────────────────────────
  // Everything except the domain layer, the tx layer, and the contract plumbing.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/domain/**",
      "src/lib/tx/**",
      "src/lib/contracts/**",
      "src/lib/chain/**",
      "src/generated/**",
      // /status deliberately renders raw protocol state — it is the debugging page.
      "src/app/status/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/generated/abis/*", "@/generated/abis", "@/generated/abis/*"],
              message:
                "Components must not touch ABIs directly. Use @/lib/domain, which pairs every status read with its effective-status check.",
            },
            {
              group: ["viem/actions", "wagmi/actions"],
              message:
                "Raw chain reads belong in @/lib/domain. A read that bypasses it can render a stale status.",
            },
          ],
        },
      ],
    },
  },

  // ── The domain layer answers to the chain's clock, not the browser's ───────
  // Every deadline in the protocol is compared against `block.timestamp`. Using
  // `Date.now()` here silently disagrees with the contract near a boundary.
  {
    files: ["src/lib/domain/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "Date", message: "Use the chain clock (`now: bigint`) — deadlines compare against block.timestamp." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Use the chain clock (`now: bigint`)." },
      ],
    },
  },
);
