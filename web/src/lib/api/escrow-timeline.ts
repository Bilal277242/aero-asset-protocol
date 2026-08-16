import type { Address, PublicClient } from "viem";
import { escrowAbi, escrowFactoryAbi } from "@/lib/contracts/generated/abis";
import { escrowStatusLabel } from "@/lib/contracts/generated/enums";
import { requireAddress, type AddressBook } from "@/lib/contracts/addressBook";
import { abiEvent, blockTimes, scanLogs } from "./logs";

/**
 * One escrow's transaction history.
 *
 * Every escrow event indexes `escrowId`, so the provider filters. The clone address is
 * also known, which means these scans are cheap and exact — unlike finding escrows by
 * party, where the fields are unindexed.
 */

export type EscrowEvent = {
  id: string;
  title: string;
  detail: string;
  blockNumber: bigint;
  timestamp: number | null;
  txHash: `0x${string}`;
};

type Source = {
  event: string;
  describe: (args: Record<string, unknown>) => { title: string; detail: string };
};

const n = (v: unknown) => String(v ?? "");
const short = (v: unknown) => {
  const s = String(v ?? "");
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
};

const SOURCES: Source[] = [
  {
    event: "EscrowStatusChanged",
    describe: (a) => ({
      title: `Status → ${escrowStatusLabel[Number(a.newStatus)] ?? n(a.newStatus)}`,
      detail: `from ${escrowStatusLabel[Number(a.oldStatus)] ?? n(a.oldStatus)}`,
    }),
  },
  {
    event: "EscrowFunded",
    describe: (a) => ({
      title: "Funded",
      detail: `${short(a.buyer)} deposited ${n(a.amount)} base units — the measured balance delta, not the amount requested`,
    }),
  },
  {
    event: "EscrowSettled",
    describe: (a) => ({
      title: "Settled to the seller",
      detail: `${short(a.seller)} received ${n(a.sellerProceeds)}; protocol fee ${n(a.feeAmount)}`,
    }),
  },
  {
    event: "EscrowRefunded",
    describe: (a) => ({
      title: "Refunded to the buyer",
      detail: `${short(a.buyer)} received ${n(a.amount)}`,
    }),
  },
  {
    event: "DisputeRaised",
    describe: (a) => ({ title: "Dispute raised", detail: `by ${short(a.raisedBy)}` }),
  },
  {
    event: "DisputeDeadlineSet",
    describe: (a) => ({
      title: "Arbitration clock started",
      detail: `Anyone may refund the buyer in full after ${n(a.deadline)}`,
    }),
  },
  {
    event: "DisputeResolved",
    describe: (a) => ({
      title: `Dispute resolved for the ${a.releasedToSeller ? "seller" : "buyer"}`,
      detail: `by arbitrator ${short(a.arbitrator)}`,
    }),
  },
  {
    event: "FeeCollected",
    describe: (a) => ({
      title: "Protocol fee collected",
      detail: `${n(a.amount)} to ${short(a.treasury)}`,
    }),
  },
  {
    event: "TimeoutPenaltyCharged",
    describe: (a) => ({
      title: "Timeout penalty charged",
      detail: `${n(a.amount)} forfeited to ${short(a.seller)}`,
    }),
  },
  {
    event: "PayoutDeferred",
    describe: (a) => ({
      title: "Payout deferred",
      detail: `${n(a.amount)} could not be delivered to ${short(a.recipient)} and is now claimable`,
    }),
  },
  {
    event: "PayoutWithdrawn",
    describe: (a) => ({
      title: "Deferred payout claimed",
      detail: `${n(a.amount)} to ${short(a.recipient)}`,
    }),
  },
];

export async function readEscrowTimeline(
  client: PublicClient,
  book: AddressBook,
  escrowId: bigint,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<EscrowEvent[]> {
  const address = (await client.readContract({
    address: requireAddress(book, "ESCROW_FACTORY"),
    abi: escrowFactoryAbi,
    functionName: "escrowOf",
    args: [escrowId],
    blockNumber: toBlock,
  })) as Address;

  if (!address || address === "0x0000000000000000000000000000000000000000") return [];

  const collected = (
    await Promise.all(
      SOURCES.map(async (source) => {
        try {
          const logs = await scanLogs(client, {
            address,
            event: abiEvent(escrowAbi, source.event),
            fromBlock,
            toBlock,
          });
          return logs.map((log) => ({ log, source }));
        } catch {
          return [];
        }
      }),
    )
  ).flat();

  // The opening event lives on the factory, not the clone.
  try {
    const opened = await scanLogs(client, {
      address: requireAddress(book, "ESCROW_FACTORY"),
      event: abiEvent(escrowFactoryAbi, "EscrowOpened"),
      args: { escrowId },
      fromBlock,
      toBlock,
    });
    for (const log of opened) {
      collected.push({
        log,
        source: {
          event: "EscrowOpened",
          describe: (a) => ({
            title: "Escrow deployed",
            detail: `for listing #${n(a.listingId)} — price and fee frozen at this moment`,
          }),
        },
      });
    }
  } catch {
    // The clone's own events still tell most of the story.
  }

  collected.sort((a, b) => {
    if (a.log.blockNumber !== b.log.blockNumber) {
      return a.log.blockNumber > b.log.blockNumber ? -1 : 1;
    }
    return b.log.logIndex - a.log.logIndex;
  });

  const times = await blockTimes(client, collected.map((c) => c.log.blockNumber));

  return collected.map(({ log, source }) => {
    const described = source.describe(log.args);
    return {
      id: `${log.transactionHash}-${log.logIndex}`,
      title: described.title,
      detail: described.detail,
      blockNumber: log.blockNumber,
      timestamp: times.get(log.blockNumber) ?? null,
      txHash: log.transactionHash,
    };
  });
}
