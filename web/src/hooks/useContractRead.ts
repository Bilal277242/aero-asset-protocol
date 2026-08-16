"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";
import type { PublicClient } from "viem";
import { browserClient } from "@/lib/web3/clients";
import { resolveAddressBook, type ResolvedAddressBook } from "@/lib/contracts/addressBook";
import { explainError, type ExplainedError } from "@/lib/web3/errors/explain";
import { CHAIN_ID } from "@/config/env";

/**
 * Contract reads.
 *
 * Deliberately **not** a thin wrapper over `useReadContract`. That hook takes an address,
 * an ABI and a function name, which means every component using it holds an ABI — exactly
 * what the containment boundary exists to prevent.
 *
 * Instead this takes a *reader function*: a unit of domain logic that receives a client
 * and an address book and returns a view type. Components name what they want, never how
 * it is fetched.
 */

export type Reader<T> = (ctx: {
  client: PublicClient;
  book: ResolvedAddressBook["addresses"];
  blockNumber: bigint;
}) => Promise<T>;

export type ReadResult<T> = {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ExplainedError | null;
  /** The height the data was read at — the honest answer to "as of when?". */
  blockNumber: bigint | undefined;
  refetch: () => void;
};

/** Resolves the address book once and shares it across every read on the page. */
export function useAddressBook(): UseQueryResult<ResolvedAddressBook> {
  return useQuery({
    queryKey: ["aeroasset", CHAIN_ID, "addressBook"],
    queryFn: () => resolveAddressBook(browserClient()),
    // Module addresses change only through a timelocked governance action.
    staleTime: 5 * 60_000,
    retry: 2,
  });
}

/**
 * Runs a domain reader against a pinned block height.
 *
 * The pin is not tidiness. `componentsOf` is a swap-and-pop array, so paging across a
 * removal silently skips one entry and duplicates another; and a stored status read at
 * block N can contradict its effective-status check at N+1. Every multi-call read in this
 * app sees one consistent height.
 */
export function useContractRead<T>(
  key: readonly unknown[],
  reader: Reader<T>,
  options?: { enabled?: boolean; staleTime?: number },
): ReadResult<T> {
  const book = useAddressBook();
  const enabled = (options?.enabled ?? true) && book.isSuccess;

  const query = useQuery({
    queryKey: ["aeroasset", CHAIN_ID, ...key],
    enabled,
    staleTime: options?.staleTime ?? 12_000,
    queryFn: async () => {
      const client = browserClient();
      const blockNumber = await client.getBlockNumber();
      const data = await reader({
        client,
        book: book.data?.addresses ?? {},
        blockNumber,
      });
      return { data, blockNumber };
    },
  });

  const error = useMemo(() => {
    const raw = query.error ?? book.error;
    return raw ? explainError(raw) : null;
  }, [query.error, book.error]);

  return {
    data: query.data?.data,
    blockNumber: query.data?.blockNumber,
    isLoading: query.isLoading || book.isLoading,
    isError: query.isError || book.isError,
    error,
    refetch: () => void query.refetch(),
  };
}

/**
 * Reads a multicall entry, returning null on failure.
 *
 * Every aggregate view in this protocol reverts on a miss — `getPassport` throws
 * `AssetNotFound`, `getListing` throws `ListingNotFound`. With `allowFailure: true` those
 * become failure entries instead of a thrown multicall, and this turns them into nulls
 * the caller can branch on.
 */
export function value<T>(
  entry: { status: "success"; result: unknown } | { status: "failure" } | undefined,
): T | null {
  return entry?.status === "success" ? (entry.result as T) : null;
}
