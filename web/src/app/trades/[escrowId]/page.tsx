"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DataRow } from "@/components/ui/card";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { Banner, ErrorState } from "@/components/data/states";
import { StateChip } from "@/components/protocol/state-chip";
import { NonClaim } from "@/components/protocol/non-claim";
import { AddressDisplay, BlockStamp } from "@/components/protocol/chain-value";
import { NetworkGuard } from "@/components/web3/network-guard";
import { EscrowPanel } from "@/components/market/escrow-panel";
import { LifecycleTrack, NoInspectionNotice } from "@/components/market/lifecycle";
import { useContractRead } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import { readTradeById } from "@/lib/api/trades";
import { readTokenMeta } from "@/lib/api/market";
import { readEscrowTimeline } from "@/lib/api/escrow-timeline";
import { escrowStatusLabel, EscrowStatus } from "@/lib/contracts/generated/enums";
import { formatFixed, splitPrice } from "@/lib/utils/money";
import { formatDateTime, relative } from "@/lib/utils/time";
import { DEPLOYED_AT_BLOCK, explorerAddress, explorerTx } from "@/config/env";

const TONE: Record<number, "confirmed" | "blocked" | "adverse" | "neutral"> = {
  [EscrowStatus.AWAITING_FUNDING]: "blocked",
  [EscrowStatus.FUNDED]: "blocked",
  [EscrowStatus.DISPUTED]: "adverse",
  [EscrowStatus.RELEASED]: "confirmed",
  [EscrowStatus.REFUNDED]: "neutral",
  [EscrowStatus.CANCELLED]: "neutral",
};

export default function TradeDetailPage() {
  const params = useParams<{ escrowId: string }>();
  const raw = params?.escrowId ?? "";
  const valid = /^[1-9]\d{0,18}$/.test(raw);
  const escrowId = valid ? BigInt(raw) : 0n;
  const account = useAccountState();

  const trade = useContractRead(
    ["trades", "detail", raw],
    async ({ client, book, blockNumber }) => {
      const escrow = await readTradeById(client, book, escrowId, blockNumber);
      if (!escrow) return null;
      const token = await readTokenMeta(client, escrow.terms.paymentToken);
      const block = await client.getBlock({ blockNumber });
      return { escrow, token, now: block.timestamp };
    },
    { enabled: valid, staleTime: 10_000 },
  );

  const timeline = useContractRead(
    ["trades", "timeline", raw],
    ({ client, book, blockNumber }) =>
      readEscrowTimeline(client, book, escrowId, DEPLOYED_AT_BLOCK, blockNumber),
    { enabled: valid, staleTime: 30_000 },
  );

  if (!valid) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <ErrorState kind="not-found" title="Not a valid escrow id" cause="Escrow ids are whole numbers starting at 1." />
      </AppShell>
    );
  }

  if (trade.isLoading) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <RecordSkeleton rows={8} />
      </AppShell>
    );
  }

  if (trade.isError || !trade.data) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <ErrorState
          kind={trade.error?.tone === "infrastructure" ? "infrastructure" : "not-found"}
          title={trade.error?.title ?? "No such escrow"}
          cause={trade.error?.cause ?? `No escrow is recorded under id ${raw}.`}
          detail={trade.error?.detail}
          onRetry={trade.refetch}
        />
      </AppShell>
    );
  }

  const { escrow, token, now } = trade.data;
  const split = splitPrice(escrow.terms.price, escrow.terms.feeAmount);
  const me = account.address?.toLowerCase();
  const role =
    me === escrow.terms.buyer.toLowerCase()
      ? "buyer"
      : me === escrow.terms.seller.toLowerCase()
        ? "seller"
        : null;

  return (
    <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
      <NetworkGuard />

      <Link href="/trades" className="mb-3 mt-2 inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-accent">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        My trades
      </Link>

      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-ink">
            Escrow #{escrow.escrowId.toString()}
          </h1>
          <StateChip tone={TONE[escrow.status] ?? "neutral"}>
            {escrowStatusLabel[escrow.status] ?? "Unknown"}
          </StateChip>
          {role && <Badge variant="accent">You are the {role}</Badge>}
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <a
            href={explorerAddress(escrow.address)}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 font-mono text-accent hover:underline"
          >
            {escrow.address}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
          <span className="text-ink-3">·</span>
          {trade.blockNumber !== undefined && (
            <BlockStamp blockNumber={trade.blockNumber.toString()} />
          )}
        </p>
      </header>

      <Card className="mb-4">
        <CardHeader title="Trade lifecycle" description="As the contracts implement it." />
        <CardBody>
          <LifecycleTrack status={escrow.status} />
        </CardBody>
      </Card>

      {escrow.status === EscrowStatus.AWAITING_FUNDING && role === "buyer" && (
        <NoInspectionNotice className="mb-4" />
      )}

      {escrow.totalDeferred > 0n && (
        <Banner tone="warning" title="A payout could not be delivered" className="mb-4">
          {formatFixed(escrow.totalDeferred, token.decimals)} {token.symbol} is held as
          claimable rather than sent — most plausibly a blocked account on the settlement
          token. It can be claimed at any time and by anyone; the funds only ever go to the
          recorded recipient.
        </Banner>
      )}

      <div className="grid gap-4 laptop:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Trade terms" description="Frozen at acceptance. Nothing here is re-derived." />
          <CardBody>
            <dl>
              <DataRow label="Asset">
                <Link href={`/assets/${escrow.terms.assetId}`} className="text-accent hover:underline">
                  Asset #{escrow.terms.assetId.toString()}
                </Link>
              </DataRow>
              <DataRow label="Listing">
                <Link href={`/marketplace/${escrow.terms.listingId}`} className="text-accent hover:underline">
                  Listing #{escrow.terms.listingId.toString()}
                </Link>
              </DataRow>
              <DataRow label="Buyer">
                <AddressDisplay address={escrow.terms.buyer} explorerUrl={explorerAddress(escrow.terms.buyer)} />
              </DataRow>
              <DataRow label="Seller">
                <AddressDisplay address={escrow.terms.seller} explorerUrl={explorerAddress(escrow.terms.seller)} />
              </DataRow>
              <DataRow label="Amount">
                <span className="font-mono text-lg font-semibold tracking-tight text-ink">
                  {formatFixed(escrow.terms.price, token.decimals)}
                </span>
              </DataRow>
              <DataRow label="Currency">
                {token.symbol}{" "}
                <AddressDisplay address={escrow.terms.paymentToken} />
              </DataRow>
              <DataRow label="Protocol fee">
                <span className="font-mono">
                  {formatFixed(split.fee, token.decimals)} {token.symbol}
                </span>
              </DataRow>
              <DataRow label="Seller receives">
                <span className="font-mono">
                  {formatFixed(split.proceeds, token.decimals)} {token.symbol}
                </span>
              </DataRow>
              <DataRow label="Treasury">
                <AddressDisplay address={escrow.terms.treasury} />
              </DataRow>
              <DataRow label="Deposited so far">
                <span className="font-mono">
                  {formatFixed(escrow.deposited, token.decimals)} {token.symbol}
                </span>
              </DataRow>
            </dl>
            <p className="mt-3 text-2xs leading-relaxed text-ink-3">
              Fee and treasury were captured when the offer was accepted, so a later fee
              change or treasury rotation cannot alter this trade.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Deadlines" description="Every one of them has a permissionless exit." />
          <CardBody>
            <dl>
              <DataRow label="Funding deadline">
                {formatDateTime(escrow.terms.fundingDeadline)}
                <span className="ml-1 text-ink-3">
                  ({relative(escrow.terms.fundingDeadline, Number(now))})
                </span>
              </DataRow>
              <DataRow label="Settlement deadline">
                {formatDateTime(escrow.terms.settlementDeadline)}
                <span className="ml-1 text-ink-3">
                  ({relative(escrow.terms.settlementDeadline, Number(now))})
                </span>
              </DataRow>
              {escrow.disputeRaisedAt > 0 && (
                <DataRow label="Arbitration deadline">
                  {formatDateTime(escrow.disputeDeadline)}
                  <span className="ml-1 text-ink-3">
                    ({relative(escrow.disputeDeadline, Number(now))})
                  </span>
                </DataRow>
              )}
              <DataRow label="Timeout penalty">
                {(escrow.timeoutPenaltyBps / 100).toFixed(2)}% to the seller
              </DataRow>
            </dl>

            <ul className="mt-3 grid gap-1.5 text-xs leading-relaxed text-ink-2">
              <li>
                <strong className="font-medium text-ink">Unfunded</strong> — either party can
                cancel; anyone can once the funding deadline passes. No funds moved.
              </li>
              <li>
                <strong className="font-medium text-ink">Funded</strong> — after the
                settlement deadline anyone can refund the buyer, less the penalty paid to the
                seller for carrying a locked asset.
              </li>
              <li>
                <strong className="font-medium text-ink">Disputed</strong> — an arbitrator
                picks one party, or anyone refunds the buyer in full once arbitration runs
                out of time.
              </li>
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4">
        <EscrowPanel escrowAddress={escrow.address} onDone={() => { trade.refetch(); timeline.refetch(); }} />
      </div>

      <Card className="mt-4">
        <CardHeader title="On-chain history" description="Every transaction against this escrow." />
        <CardBody>
          {timeline.isLoading ? (
            <RecordSkeleton rows={3} />
          ) : (timeline.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-ink-3">No events recorded against this escrow yet.</p>
          ) : (
            <ol className="grid gap-px overflow-hidden rounded-md bg-rule shadow-raised">
              {timeline.data?.map((e) => (
                <li key={e.id} className="flex flex-col gap-1 bg-panel p-3 tablet:flex-row tablet:items-baseline tablet:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{e.title}</span>
                    {e.detail && <span className="block text-xs text-ink-2">{e.detail}</span>}
                  </span>
                  <span className="shrink-0 text-left tablet:text-right">
                    <a
                      href={explorerTx(e.txHash)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 break-all font-mono text-2xs text-accent hover:underline"
                    >
                      {e.txHash.slice(0, 10)}…{e.txHash.slice(-8)}
                      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                    </a>
                    <span className="block font-mono text-2xs text-ink-3">
                      block {e.blockNumber.toString()}
                      {e.timestamp !== null && ` · ${formatDateTime(e.timestamp)}`}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <div className="mt-4">
        <NonClaim variant="title" display="block" />
      </div>
    </AppShell>
  );
}
