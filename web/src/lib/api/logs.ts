import type { AbiEvent, Address, PublicClient } from "viem";

/**
 * Chunked `eth_getLogs`.
 *
 * This is the direct cost of shipping without an indexer, and the weakest point of the
 * read layer. Providers disagree about the limits and none fail politely: Infura caps a
 * range at 10k blocks, Alchemy caps result size and rate-limits, public endpoints do both
 * with worse errors. An unbounded scan works fine on a fresh deployment and stops working
 * silently once there is history.
 *
 * Sequential rather than parallel is deliberate — the failure mode here is rate-limiting,
 * and fanning out turns a slow read into a rejected one.
 */
const DEFAULT_CHUNK = 9_000n;
const MIN_CHUNK = 500n;

export type LogScan = {
  address: Address;
  event: AbiEvent;
  args?: Record<string, unknown>;
  fromBlock: bigint;
  toBlock: bigint;
  chunk?: bigint;
};

export type ScannedLog = {
  address: Address;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
  eventName: string;
  args: Record<string, unknown>;
};

export async function scanLogs(client: PublicClient, scan: LogScan): Promise<ScannedLog[]> {
  const out: ScannedLog[] = [];
  let cursor = scan.fromBlock;
  let chunk = scan.chunk ?? DEFAULT_CHUNK;

  while (cursor <= scan.toBlock) {
    const end = cursor + chunk - 1n < scan.toBlock ? cursor + chunk - 1n : scan.toBlock;

    try {
      const logs = await client.getLogs({
        address: scan.address,
        event: scan.event,
        args: scan.args,
        fromBlock: cursor,
        toBlock: end,
      } as Parameters<PublicClient["getLogs"]>[0]);

      for (const log of logs as unknown as ScannedLog[]) {
        out.push({
          address: log.address,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
          eventName: scan.event.name,
          args: (log.args ?? {}) as Record<string, unknown>,
        });
      }
      cursor = end + 1n;
    } catch (err) {
      // Halve once per failure level. Below MIN_CHUNK the range is not the problem, and
      // shrinking further only multiplies requests against a provider already saying no.
      if (chunk <= MIN_CHUNK) throw err;
      chunk = chunk / 2n > MIN_CHUNK ? chunk / 2n : MIN_CHUNK;
    }
  }

  return out;
}

/**
 * Pulls an event definition out of a generated ABI.
 *
 * Throws at call time if missing, which is the right moment: the ABI is generated from
 * the compiled contract, so an absent event means the bindings and the chain have
 * diverged and nothing downstream can be trusted.
 */
export function abiEvent(abi: readonly unknown[], name: string): AbiEvent {
  const found = abi.find(
    (item): item is AbiEvent =>
      typeof item === "object" &&
      item !== null &&
      (item as AbiEvent).type === "event" &&
      (item as AbiEvent).name === name,
  );
  if (!found) {
    throw new Error(`No event "${name}" in the generated ABI. Re-run \`npm run codegen\`.`);
  }
  return found;
}

/**
 * Timestamps for a set of blocks, fetched once each.
 *
 * Events carry a block number but not a time, and an activity feed without times is a
 * list of numbers. Deduplicated because a burst of protocol activity usually lands in
 * very few blocks.
 */
export async function blockTimes(
  client: PublicClient,
  blockNumbers: bigint[],
  limit = 40,
): Promise<Map<bigint, number>> {
  const unique = [...new Set(blockNumbers.map(String))].map(BigInt).slice(0, limit);
  const times = new Map<bigint, number>();

  const results = await Promise.allSettled(
    unique.map((blockNumber) => client.getBlock({ blockNumber })),
  );

  results.forEach((result, i) => {
    const key = unique[i];
    if (key !== undefined && result.status === "fulfilled") {
      times.set(key, Number(result.value.timestamp));
    }
  });

  return times;
}
