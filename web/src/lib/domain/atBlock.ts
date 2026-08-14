import type { PublicClient } from "viem";

/**
 * Runs a set of reads against one fixed block height.
 *
 * Two distinct problems, both real, both invisible until they bite:
 *
 * 1. **`componentsOf` is a swap-and-pop array.** Removing a component moves the last
 *    element into the freed slot, so paging `offset=0,limit=10` then `offset=10,limit=10`
 *    across a removal silently skips one entry and duplicates another. Pinning the block
 *    makes the whole paged read atomic.
 *
 * 2. **Effective status is time-dependent.** `getListing` at block N and
 *    `isListingActive` at block N+1 can contradict each other across an expiry. Every
 *    derivation in this layer pairs a stored read with a computed one, so they must see
 *    the same state.
 *
 * The cost is one extra `eth_blockNumber` per logical read. That is the correct price.
 */
export async function atBlock<T>(
  client: PublicClient,
  fn: (blockNumber: bigint) => Promise<T>,
): Promise<T> {
  const blockNumber = await client.getBlockNumber();
  return fn(blockNumber);
}

/** A viem multicall entry, narrowed to the success case. */
export type CallResult = { status: "success"; result: unknown } | { status: "failure" };

/**
 * Reads a multicall entry, returning null on failure.
 *
 * Every view function in this protocol reverts on a miss — `getPassport` throws
 * `AssetNotFound`, `getAircraft` throws for a component, `getListing` throws
 * `ListingNotFound`. With `allowFailure: true` those become failure entries rather than
 * a thrown multicall, and this turns them into nulls the caller can branch on.
 */
export function value<T>(entry: CallResult | undefined): T | null {
  return entry?.status === "success" ? (entry.result as T) : null;
}
