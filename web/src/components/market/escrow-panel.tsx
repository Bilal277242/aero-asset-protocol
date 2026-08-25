"use client";

import * as React from "react";
import type { Address } from "viem";
import { Card, CardBody, CardHeader, DataRow } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { Banner, ErrorState } from "@/components/data/states";
import { StateChip } from "@/components/protocol/state-chip";
import { AddressDisplay } from "@/components/protocol/chain-value";
import { TransactionDialog } from "@/components/web3/transaction-dialog";
import { useContractRead, useAddressBook } from "@/hooks/useContractRead";
import { useContractWrite } from "@/hooks/useContractWrite";
import { useAccountState } from "@/hooks/useAccountState";
import { readEscrow, readFunding, readTokenMeta, readAssetsPaused } from "@/lib/api/market";
import { approveExact, escrowWrites } from "@/lib/api/writes";
import { deriveEscrowActions, type Action } from "@/lib/api/actions";
import { escrowStatusLabel, EscrowStatus } from "@/lib/contracts/generated/enums";
import { formatFixed, splitPrice, applyBps } from "@/lib/utils/money";
import { formatDateTime, relative } from "@/lib/utils/time";

/**
 * The escrow cockpit — where a trade actually settles.
 *
 * There is no buy-now in this protocol. Settlement is approve → fund → release, against a
 * contract deployed for this trade alone. This panel is the only place that sequence is
 * offered, and every step states what it will do before the wallet opens.
 */
export function EscrowPanel({
  escrowAddress,
  onDone,
}: {
  escrowAddress: Address;
  onDone?: () => void;
}) {
  const account = useAccountState();
  const book = useAddressBook();
  const [pending, setPending] = React.useState<Action | null>(null);
  const tx = useContractWrite();

  const state = useContractRead(
    ["market", "escrow", escrowAddress, account.address ?? ""],
    async ({ client, book: b, blockNumber }) => {
      const block = await client.getBlock({ blockNumber });
      const escrow = await readEscrow(client, escrowAddress, blockNumber);
      if (!escrow) return null;

      const token = await readTokenMeta(client, escrow.terms.paymentToken);
      const funding = account.address
        ? await readFunding(client, escrow.terms.paymentToken, account.address, escrowAddress, blockNumber)
        : null;

      // `release` gates on the ownership module's pause, not the marketplace's, because
      // `settleTransfer` is pause-gated while `markSold` is not.
      const assetsPaused = await readAssetsPaused(client, b, blockNumber);

      return { escrow, token, funding, assetsPaused, now: block.timestamp };
    },
    { staleTime: 10_000 },
  );

  if (state.isLoading) return <RecordSkeleton rows={5} />;
  if (state.isError || !state.data) {
    return (
      <ErrorState
        kind="protocol"
        title={state.error?.title ?? "Could not load the escrow"}
        cause={state.error?.cause}
        onRetry={state.refetch}
      />
    );
  }

  const { escrow, token, funding, assetsPaused, now } = state.data;
  const viewer = { address: account.address, isConnected: account.isConnected };
  const actions = deriveEscrowActions(escrow, viewer, now, funding, assetsPaused);
  const split = splitPrice(escrow.terms.price, escrow.terms.feeAmount);
  const penalty = applyBps(escrow.terms.price, escrow.timeoutPenaltyBps);

  const run = (action: Action) => {
    if (!book.data) return;

    // Approval targets the token; everything else targets this escrow clone.
    const request =
      action.id === "approve"
        ? approveExact(escrow.terms.paymentToken, escrowAddress, escrow.terms.price)
        : action.id === "fund"
          ? escrowWrites.fund(escrowAddress)
          : action.id === "release"
            ? escrowWrites.release(escrowAddress)
            : action.id === "cancel"
              ? escrowWrites.cancel(escrowAddress)
              : action.id === "raiseDispute"
                ? escrowWrites.raiseDispute(escrowAddress)
                : action.id === "claimTimeout"
                  ? escrowWrites.claimTimeout(escrowAddress)
                  : action.id === "claimDisputeTimeout"
                    ? escrowWrites.claimDisputeTimeout(escrowAddress)
                    : null;

    if (!request) return;

    void tx.execute(request).then((hash) => {
      if (hash) {
        state.refetch();
        onDone?.();
      }
    });
  };

  return (
    <Card>
      <CardHeader
        title={`Escrow #${escrow.escrowId.toString()}`}
        description="A contract deployed for this trade alone."
        actions={
          <StateChip
            tone={
              escrow.status === EscrowStatus.RELEASED
                ? "confirmed"
                : escrow.status === EscrowStatus.DISPUTED
                  ? "adverse"
                  : escrow.isTerminal
                    ? "neutral"
                    : "blocked"
            }
          >
            {escrowStatusLabel[escrow.status] ?? "Unknown"}
          </StateChip>
        }
      />
      <CardBody className="grid gap-4">
        {assetsPaused && escrow.status === EscrowStatus.FUNDED && (
          <Banner tone="critical" title="Ownership transfers are paused">
            You cannot release while the ownership module is halted. Your only exit until
            it is unpaused would be a timeout claim after{" "}
            {formatDateTime(escrow.terms.settlementDeadline)}, which costs{" "}
            {formatFixed(penalty, token.decimals)} {token.symbol}.
          </Banner>
        )}

        <dl>
          <DataRow label="Contract">
            <AddressDisplay address={escrowAddress} />
          </DataRow>
          <DataRow label="Buyer">
            <AddressDisplay address={escrow.terms.buyer} />
          </DataRow>
          <DataRow label="Seller">
            <AddressDisplay address={escrow.terms.seller} />
          </DataRow>
          <DataRow label="Price (frozen)">
            <span className="font-mono">
              {formatFixed(escrow.terms.price, token.decimals)} {token.symbol}
            </span>
          </DataRow>
          <DataRow label="Protocol fee (frozen)">
            <span className="font-mono">
              {formatFixed(split.fee, token.decimals)} {token.symbol}
            </span>
          </DataRow>
          <DataRow label="Seller receives">
            <span className="font-mono">
              {formatFixed(split.proceeds, token.decimals)} {token.symbol}
            </span>
          </DataRow>
          <DataRow label="Deposited">
            <span className="font-mono">
              {formatFixed(escrow.deposited, token.decimals)} {token.symbol}
            </span>
          </DataRow>
          <DataRow label="Funding deadline">
            {formatDateTime(escrow.terms.fundingDeadline)}{" "}
            <span className="text-ink-3">({relative(escrow.terms.fundingDeadline, Number(now))})</span>
          </DataRow>
          <DataRow label="Settlement deadline">
            {formatDateTime(escrow.terms.settlementDeadline)}{" "}
            <span className="text-ink-3">({relative(escrow.terms.settlementDeadline, Number(now))})</span>
          </DataRow>
          {escrow.disputeDeadline > 0 && (
            <DataRow label="Arbitration deadline">
              {formatDateTime(escrow.disputeDeadline)}
            </DataRow>
          )}
        </dl>

        {funding && account.isConnected && (
          <div className="rounded-sm bg-sunken shadow-inset-sm p-3">
            <p className="label-key mb-1.5">Your position</p>
            <dl className="grid gap-1 text-xs">
              <div className="flex justify-between">
                <dt className="text-ink-2">Balance</dt>
                <dd className="font-mono text-ink">
                  {formatFixed(funding.balance, token.decimals)} {token.symbol}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-2">Approved to this escrow</dt>
                <dd className="font-mono text-ink">
                  {formatFixed(funding.allowance, token.decimals)} {token.symbol}
                </dd>
              </div>
            </dl>
            {funding.balance < escrow.terms.price && (
              <p className="mt-2 text-xs text-blocked">
                Your balance is below the trade price. Sepolia USDC comes from Circle&rsquo;s
                faucet.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {actions.map((a) => {
            const btn = (
              <Button
                key={a.id}
                size="sm"
                variant={a.destructive ? "danger" : a.primary ? "primary" : "secondary"}
                disabled={!a.enabled}
                onClick={() => {
                  tx.reset();
                  setPending(a);
                }}
              >
                {a.label}
              </Button>
            );
            return a.enabled || !a.reason ? (
              <React.Fragment key={a.id}>{btn}</React.Fragment>
            ) : (
              <Tooltip key={a.id} content={a.reason}>
                <span className="inline-flex cursor-help">{btn}</span>
              </Tooltip>
            );
          })}
        </div>

        <p className="text-2xs leading-relaxed text-ink-3">
          Approval is for exactly the trade price and goes to this escrow only — never an
          unlimited allowance, and never to the marketplace. Each escrow is single-use, so
          unlimited approval would be pure downside.
        </p>
      </CardBody>

      {pending && (
        <TransactionDialog
          open={!!pending}
          onOpenChange={(v) => !v && setPending(null)}
          title={pending.label}
          description={
            pending.id === "release"
              ? "Title, protocol fee and seller proceeds all move in one transaction, or none of them do."
              : pending.destructive
                ? "This cannot be undone."
                : undefined
          }
          tx={tx}
          onConfirm={() => run(pending)}
          confirmLabel={pending.label}
          summary={
            <EscrowSummary
              actionId={pending.id}
              price={escrow.terms.price}
              fee={split.fee}
              proceeds={split.proceeds}
              penalty={penalty}
              decimals={token.decimals}
              symbol={token.symbol}
              escrowAddress={escrowAddress}
            />
          }
        />
      )}
    </Card>
  );
}

function EscrowSummary({
  actionId,
  price,
  fee,
  proceeds,
  penalty,
  decimals,
  symbol,
  escrowAddress,
}: {
  actionId: string;
  price: bigint;
  fee: bigint;
  proceeds: bigint;
  penalty: bigint;
  decimals: number;
  symbol: string;
  escrowAddress: Address;
}) {
  const amount = (v: bigint) => `${formatFixed(v, decimals)} ${symbol}`;

  switch (actionId) {
    case "approve":
      return (
        <>
          <p>
            Permits exactly {amount(price)} to be moved by escrow{" "}
            {escrowAddress.slice(0, 6)}…{escrowAddress.slice(-4)}, and nothing more.
          </p>
          <p>No funds move yet. This only grants the escrow permission to take them.</p>
        </>
      );
    case "fund":
      return (
        <>
          <p>Deposits {amount(price)} into the escrow and locks the asset.</p>
          <p>
            You can release when satisfied, or recover your deposit after the settlement
            deadline less a {amount(penalty)} penalty.
          </p>
        </>
      );
    case "release":
      return (
        <>
          <p>Transfers the asset to you and releases the funds in one transaction:</p>
          <p>· {amount(fee)} protocol fee to the treasury</p>
          <p>· {amount(proceeds)} to the seller</p>
        </>
      );
    case "cancel":
      return <p>Abandons the trade. No funds have moved, so nothing is returned or lost.</p>;
    case "raiseDispute":
      return (
        <>
          <p>Freezes the escrow pending arbitration. Neither party can settle it meanwhile.</p>
          <p>
            If no arbitrator acts within the dispute window, anyone can refund the buyer in
            full.
          </p>
        </>
      );
    case "claimTimeout":
      return (
        <>
          <p>Refunds the buyer {amount(price - penalty)} and pays the seller {amount(penalty)}.</p>
          <p>
            The penalty compensates a seller who carried a locked, unsaleable asset for the
            whole settlement window.
          </p>
        </>
      );
    case "claimDisputeTimeout":
      return <p>Refunds the buyer {amount(price)} in full. The asset does not move.</p>;
    default:
      return null;
  }
}
