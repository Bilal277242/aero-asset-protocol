import js from "@eslint/js";
import tseslint from "typescript-eslint";

// `eslint-config-next` is deliberately not used: it pulls in `@rushstack/eslint-patch`,
// which fails hard on ESLint 9 and takes the whole lint run down with it. Losing a few
// Next-specific hints is worth keeping the run alive.
export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
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
  {
    /**
     * The containment boundary.
     *
     * The hazard is a component being able to *construct a contract call*, because that
     * is how a raw `getListing` ends up rendered and an expired listing shows as
     * buyable. So the ban is on ABIs and on raw chain actions — not on everything under
     * `generated/`.
     *
     * Enums and error tables are deliberately allowed through: they are display
     * constants with no capability attached, and forcing every status label to be
     * re-exported through the domain layer would add indirection without removing any
     * risk.
     */
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "viem/actions",
                "wagmi/actions",
                "**/contracts/generated/abis",
                "**/contracts/generated/abis/*",
              ],
              message:
                "Components must not reach the chain directly. Put the read in lib/api and call it through a hook.",
            },
          ],
        },
      ],
    },
  },
);
