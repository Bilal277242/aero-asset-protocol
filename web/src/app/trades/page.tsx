"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { StateChip } from "@/components/protocol/state-chip";
import { AddressDisplay } from "@/components/protocol/chain-value";
import { DataTable, type Column } from "@/components/data/data-table";
import { EmptyState, ErrorState, Banner } from "@/components/data/states";
import { NetworkGuard } from "@/components/web3/network-guard";
import { useContractRead } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import { readTradesForParty, type TradeSummary } from "@/lib/api/trades";
import { readTokenMeta } from "@/lib/api/market";
import { escrowStatusLabel, EscrowStatus } from "@/lib/contracts/generated/enums";
import { formatFixed } from "@/lib/utils/money";
import { relative } from "@/lib/utils/time";
import { DEPLOYED_AT_BLOCK, SETTLEMENT_TOKEN } from "@/config/env";

const TONE: Record<number, "confirmed" | "blocked" | "adverse" | "neutral"> = {
  [EscrowStatus.AWAITING_FUNDING]: "blocked",
  [EscrowStatus.FUNDED]: "blocked",
  [EscrowStatus.DISPUTED]: "adverse",
  [EscrowStatus.RELEASED]: "confirmed",
  [EscrowStatus.REFUNDED]: "neutral",
  [EscrowStatus.CANCELLED]: "neutral",
};

export default function TradesPage() {
  const router = useRouter();
  const account = useAccountState();

  const trades = useContractRead(
    ["trades", account.address ?? ""],
    async ({ client, book, blockNumber }) => {
      if (!account.address) return null;
      const [result, token] = await Promise.all([
        readTradesForParty(client, book, account.address, DEPLOYED_AT_BLOCK, blockNumber),
        readTokenMeta(client, SETTLEMENT_TOKEN),
      ]);
      return { ...result, token };
    },
    { enabled: account.isConnected, staleTime: 20_000 },
  );

  const decimals = trades.data?.token.decimals ?? 6;
  const symbol = trades.data?.token.symbol ?? "";

  const columns: Column<TradeSummary>[] = [
    { key: "id", header: "Escrow", sticky: true, mono: true, cell: (t) => `#${t.escrowId}` },
    {
      key: "role",
      header: "Your role",
      cell: (t) => <Badge variant={t.role === "buyer" ? "accent" : "neutral"}>{t.role}</Badge>,
    },
    { key: "listing", header: "Listing", mono: true, hideBelow: "tablet", cell: (t) => `#${t.listingId}` },
    {
      key: "asset",
      header: "Asset",
      mono: true,
      hideBelow: "tablet",
      cell: (t) => (t.escrow ? `#${t.escrow.terms.assetId}` : "—"),
    },
    {
      key: "counterparty",
      header: "Counterparty",
      hideBelow: "laptop",
      cell: (t) => <AddressDisplay address={t.role === "buyer" ? t.seller : t.buyer} />,
    },
    {
      key: "status",
      header: "State",
      cell: (t) =>
        t.escrow ? (
          <StateChip tone={TONE[t.escrow.status] ?? "neutral"}>
            {escrowStatusLabel[t.escrow.status] ?? "Unknown"}
          </StateChip>
        ) : (
          <StateChip tone="neutral">Unreadable</StateChip>
        ),
    },
    {
      key: "deadline",
      header: "Next deadline",
      hideBelow: "desktop",
      mono: true,
      cell: (t) => {
        if (!t.escrow) return "—";
        const now = Math.floor(Date.now() / 1000);
        if (t.escrow.status === EscrowStatus.AWAITING_FUNDING)
          return relative(t.escrow.terms.fundingDeadline, now);
        if (t.escrow.status === EscrowStatus.FUNDED)
          return relative(t.escrow.terms.settlementDeadline, now);
        if (t.escrow.status === EscrowStatus.DISPUTED && t.escrow.disputeDeadline > 0)
          return relative(t.escrow.disputeDeadline, now);
        return "—";
      },
    },
    {
      key: "price",
      header: `Amount ${symbol}`,
      numeric: true,
      cell: (t) => formatFixed(t.price, decimals),
    },
  ];

  return (
    <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
      <NetworkGuard />

      <header className="mb-5 mt-2">
        <p className="label-key">Settlement</p>
        <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight text-ink">My trades</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-2">
          Every escrow where the connected account is buyer or seller, with the state read
          from each contract rather than from the event that opened it.
        </p>
      </header>

      {!account.isConnected ? (
        <EmptyState
          title="Connect a wallet"
          description="Trades are scoped to an account. Everything else on this site works without one."
        />
      ) : trades.isError ? (
        <ErrorState
          kind={trades.error?.tone === "infrastructure" ? "infrastructure" : "protocol"}
          title={trades.error?.title ?? "Could not load your trades"}
          cause={trades.error?.cause}
          remedy={trades.error?.remedy}
          detail={trades.error?.detail}
          onRetry={trades.refetch}
        />
      ) : (
        <>
          <DataTable
            caption="Escrows involving this account"
            columns={columns}
            rows={trades.data?.trades ?? []}
            rowKey={(t) => t.escrowId.toString()}
            loading={trades.isLoading}
            onRowClick={(t) => router.push(`/trades/${t.escrowId}`)}
            empty={
              <EmptyState
                title="No trades yet"
                description="An escrow is created when a seller accepts your offer, or when you accept someone else's."
              />
            }
          />

          {trades.data && trades.data.scanned > 0 && (
            <Banner tone="info" title="How this list is built" className="mt-4">
              Neither escrow-opened event indexes the buyer or the seller, so every escrow
              event ({trades.data.scanned} so far) is downloaded and filtered here. That is
              a property of the immutable factory, not a choice — and the reason an index
              becomes necessary as the protocol grows.
            </Banner>
          )}
        </>
      )}
    </AppShell>
  );
}
