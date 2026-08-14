// A component doing exactly what the containment boundary exists to prevent.
//
// This file is NOT part of the app and is excluded from tsconfig and the build. Its only
// purpose is to be linted by `test/lint/boundary.test.ts`, which asserts ESLint rejects
// it. If this file ever lints clean, the boundary has silently stopped working and
// nothing else would tell us.

import { marketplaceAbi } from "@/generated/abis/marketplace";
import { readContract } from "viem/actions";

export async function BadListingCard({ id }: { id: bigint }) {
  // The actual bug this prevents: reading stored status and rendering it. An expired
  // listing still reads ACTIVE until someone pays gas to record the expiry, so this
  // shows expired listings as buyable.
  const listing = await readContract({} as never, {
    address: "0x0000000000000000000000000000000000000000",
    abi: marketplaceAbi,
    functionName: "getListing",
    args: [id],
  } as never);

  return <div>{String(listing)}</div>;
}
