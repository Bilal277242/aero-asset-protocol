/**
 * Regenerates every binding the app has to the protocol.
 *
 *   npm run codegen
 *
 * Reads `../out` (Foundry build artifacts) and `../deployments/<chainId>.json`.
 * Writes `src/generated/`, which is COMMITTED — see the note in gen-addresses.mts
 * for why, given `deployments/` itself is git-ignored.
 *
 * Run this after any contract change or redeploy. CI re-runs it and fails on a diff
 * for the artifact-derived outputs (ABIs, enums, errors), which are reproducible from
 * `../out` alone. The address book is not diff-checked, because `../deployments` is
 * not present in CI.
 */
import { mkdir } from "node:fs/promises";
import { genAbis } from "./gen-abis.mts";
import { genEnums } from "./gen-enums.mts";
import { genErrors } from "./gen-errors.mts";
import { genAddresses } from "./gen-addresses.mts";
import { OUT_DIR, GENERATED_DIR } from "./shared.mts";

async function main() {
  await mkdir(`${GENERATED_DIR}/abis`, { recursive: true });

  console.log(`reading artifacts from ${OUT_DIR}`);

  const abiResult = await genAbis();
  console.log(`  abis      ${abiResult.count} contracts`);

  const enumResult = await genEnums();
  console.log(`  enums     ${enumResult.count} enums`);

  const errorResult = await genErrors();
  console.log(`  errors    ${errorResult.count} custom errors`);

  const addressResult = await genAddresses();
  console.log(`  addresses ${addressResult.summary}`);

  console.log(`\nwrote ${GENERATED_DIR}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
