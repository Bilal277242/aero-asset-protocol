import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ESLint } from "eslint";

/**
 * The containment boundary is a correctness control, not a style preference.
 *
 * It has already failed silently once: `eslint-config-next` pulled in a patch that
 * crashed on ESLint 9, `next build` printed the crash as a warning and carried on, and
 * every rule was dead while the build stayed green. A lint run that reports no errors is
 * indistinguishable from a lint run that never happened, so these tests assert both that
 * the config **loads** and that it actually **rejects** a violation.
 *
 * What the boundary forbids is a component being able to construct a contract call —
 * that is how a raw `getListing` ends up rendered and an expired listing shows as
 * buyable. Enums and error tables are display constants with no capability attached and
 * are deliberately allowed through; a test that assumed otherwise would push every status
 * label through a pointless re-export.
 */

const cwd = fileURLToPath(new URL("../..", import.meta.url));

let eslint: ESLint;

// Resolving the flat config pulls in typescript-eslint and takes far longer than the
// default timeout allows on a cold run. Paid once, here, rather than by whichever test
// happened to run first.
beforeAll(() => {
  eslint = new ESLint({ cwd });
}, 120_000);

const lint = async (code: string, filePath: string) => {
  const [result] = await eslint.lintText(code, { filePath, warnIgnored: false });
  return result?.messages ?? [];
};

const restricted = (messages: { ruleId?: string | null }[]) =>
  messages.filter((m) => m.ruleId === "no-restricted-imports");

describe("eslint config", () => {
  it(
    "loads and produces a usable result",
    async () => {
      const messages = await lint("export const x = 1;\n", "src/lib/api/probe.ts");
      expect(Array.isArray(messages)).toBe(true);
      expect(messages).toEqual([]);
    },
    120_000,
  );
});

describe("containment boundary", () => {
  it("rejects an ABI import from a component", async () => {
    const messages = await lint(
      `import { marketplaceAbi } from "@/lib/contracts/generated/abis";\nexport const a = marketplaceAbi;\n`,
      "src/components/market/probe.tsx",
    );
    expect(restricted(messages)).toHaveLength(1);
  });

  it("rejects an ABI import from a page", async () => {
    const messages = await lint(
      `import { escrowAbi } from "@/lib/contracts/generated/abis/Escrow";\nexport const a = escrowAbi;\n`,
      "src/app/trades/probe.tsx",
    );
    expect(restricted(messages)).toHaveLength(1);
  });

  it("rejects raw chain actions from a component", async () => {
    const messages = await lint(
      `import { readContract } from "viem/actions";\nexport const a = readContract;\n`,
      "src/components/market/probe.tsx",
    );
    expect(restricted(messages)).toHaveLength(1);
  });

  it("allows enum labels through — they carry no capability", async () => {
    const messages = await lint(
      `import { listingStatusLabel } from "@/lib/contracts/generated/enums";\nexport const a = listingStatusLabel;\n`,
      "src/components/market/probe.tsx",
    );
    expect(restricted(messages)).toEqual([]);
  });

  it("allows the domain layer to import ABIs — that is where they belong", async () => {
    const messages = await lint(
      `import { marketplaceAbi } from "@/lib/contracts/generated/abis";\nexport const a = marketplaceAbi;\n`,
      "src/lib/api/probe.ts",
    );
    expect(restricted(messages)).toEqual([]);
  });
});
