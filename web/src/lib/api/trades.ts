import type { Address, PublicClient } from "viem";
import { escrowFactoryAbi } from "@/lib/contracts/generated/abis";
import { requireAddress, type AddressBook } from "@/lib/contracts/addressBook";
import { abiEvent, scanLogs } from "./logs";
import { readEscrow, type EscrowView } from "./market";

/**
 * Escrows a party is involved in.
 *
 * **`buyer` and `seller` are not indexed** on `EscrowFactory.EscrowOpened`, nor on the
 * `Marketplace` declaration of the same event name. `EscrowFactory` is immutable, so this
 * cannot be fixed on-chain — the only route is to download every escrow event and filter
 * in the client. That is the single most expensive query in this application and the
 * clearest argument for an index once `escrowCount()` grows.
 *
 * Logs supply **ids and parties only**. Status, deposits and deadlines are re-read from
 * each clone at a pinned height, because the event records the trade's opening terms and
 * says nothing about what has happened since.
 */

export type TradeSummary = {
  escrowId: bigint;
  address: Address;
  listingId: bigint;
  buyer: Address;
  seller: Address;
  price: bigint;
  feeAmount: bigint;
  /** Re-read from the clone. Absent when the contract could not be reached. */
  escrow: EscrowView | null;
  role: "buyer" | "seller";
};

export async function readTradesForParty(
  client: PublicClient,
  book: AddressBook,
  party: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<{ trades: TradeSummary[]; scanned: number }> {
  const factory = requireAddress(book, "ESCROW_FACTORY");

  const logs = await scanLogs(client, {
    address: factory,
    event: abiEvent(escrowFactoryAbi, "EscrowOpened"),
    fromBlock,
    toBlock,
  });

  const lower = party.toLowerCase();

  const mine = logs
    .map((log) => ({
      escrowId: log.args.escrowId as bigint,
      address: log.args.escrow as Address,
      listingId: log.args.listingId as bigint,
      buyer: log.args.buyer as Address,
      seller: log.args.seller as Address,
      price: log.args.price as bigint,
      feeAmount: log.args.feeAmount as bigint,
    }))
    .filter((e) => e.buyer?.toLowerCase() === lower || e.seller?.toLowerCase() === lower);

  const escrows = await Promise.all(
    mine.map((e) => readEscrow(client, e.address, toBlock).catch(() => null)),
  );

  const trades: TradeSummary[] = mine.map((e, i) => ({
    ...e,
    escrow: escrows[i] ?? null,
    role: e.buyer.toLowerCase() === lower ? "buyer" : "seller",
  }));

  // Newest first: a trade needing attention is almost always a recent one.
  trades.sort((a, b) => (a.escrowId > b.escrowId ? -1 : 1));

  return { trades, scanned: logs.length };
}

/** One escrow by its factory id, for the detail route. */
export async function readTradeById(
  client: PublicClient,
  book: AddressBook,
  escrowId: bigint,
  blockNumber: bigint,
): Promise<EscrowView | null> {
  const address = (await client.readContract({
    address: requireAddress(book, "ESCROW_FACTORY"),
    abi: escrowFactoryAbi,
    functionName: "escrowOf",
    args: [escrowId],
    blockNumber,
  })) as Address;

  if (!address || address === "0x0000000000000000000000000000000000000000") return null;
  return readEscrow(client, address, blockNumber);
}
