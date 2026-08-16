/**
 * Regenerates every binding this app has to the protocol.
 *
 *   npm run codegen
 *
 * Reads `../out` (Foundry build artifacts) and `../deployments`. Writes
 * `src/lib/contracts/generated/`, which is COMMITTED — see gen-addresses.mts for why,
 * given `deployments/` itself is git-ignored.
 *
 * Run after any contract change or redeploy. CI re-runs this and fails on a diff to the
 * artifact-derived outputs (ABIs, enums, errors), which are reproducible from `../out`
 * alone. The address book is excluded from that check because `../deployments` is not
 * present in CI.
 */
import { mkdir } from "node:fs/promises";
import { GENERATED_DIR, OUT_DIR } from "./shared.mts";
import { genAbis } from "./gen-abis.mts";
import { genEnums } from "./gen-enums.mts";
import { genErrors } from "./gen-errors.mts";
import { genAddresses } from "./gen-addresses.mts";

async function main() {
  await mkdir(GENERATED_DIR, { recursive: true });
  console.log(`reading artifacts from ${OUT_DIR}`);

  const abis = await genAbis();
  console.log(`  abis      ${abis.count} contracts`);

  const enums = await genEnums();
  console.log(`  enums     ${enums.count} enums`);

  const errors = await genErrors();
  console.log(`  errors    ${errors.count} custom errors`);

  const addresses = await genAddresses();
  console.log(`  addresses ${addresses.summary}`);

  console.log(`\nwrote ${GENERATED_DIR}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
