"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DataRow } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { Table, TableWrap, THead, TBody, TR, TH, TD, TableCaption } from "@/components/ui/table";
import { Banner, EmptyState, ErrorState } from "@/components/data/states";
import { StateChip, UnrecordedNote } from "@/components/protocol/state-chip";
import { NonClaim } from "@/components/protocol/non-claim";
import { AddressDisplay, BlockStamp } from "@/components/protocol/chain-value";
import { NetworkGuard } from "@/components/web3/network-guard";
import { TransactionDialog } from "@/components/web3/transaction-dialog";
import { ActionButton } from "@/components/market/action-button";
import { EscrowPanel } from "@/components/market/escrow-panel";
import { useContractRead, useAddressBook } from "@/hooks/useContractRead";
import { useContractWrite } from "@/hooks/useContractWrite";
import { useAccountState } from "@/hooks/useAccountState";
import { marketWrites } from "@/lib/api/writes";
import {
  readListingPage,
  readOffersForListing,
  readTokenMeta,
  quoteFee,
  LISTING_LABEL,
  LISTING_TONE,
  OFFER_TONE,
  type ListingView,
  type OfferView,
} from "@/lib/api/market";
import { deriveListingActions, deriveOfferActions } from "@/lib/api/actions";
import { assetKindLabel } from "@/lib/contracts/generated/enums";
import { bytes32Label } from "@/lib/utils/bytes32";
import { formatFixed, parseAmount, splitPrice } from "@/lib/utils/money";
import { formatDate, formatDateTime, relative } from "@/lib/utils/time";
import { DEPLOYED_AT_BLOCK } from "@/config/env";

export default function ListingDetailPage() {
  const params = useParams<{ listingId: string }>();
  const raw = params?.listingId ?? "";
  const valid = /^[1-9]\d{0,18}$/.test(raw);
  const listingId = valid ? BigInt(raw) : 0n;

  const account = useAccountState();
  const [offerOpen, setOfferOpen] = React.useState(false);

  const listing = useContractRead(
    ["market", "listing", raw],
    async ({ client, book: b, blockNumber }) => {
      const block = await client.getBlock({ blockNumber });
      const [view] = await readListingPage(client, b, [listingId], block.timestamp, blockNumber);
      if (!view) return null;
      const token = await readTokenMeta(client, view.paymentToken);
      const fee = await quoteFee(client, b, view.price);
      return { view, token, fee, now: block.timestamp };
    },
    { enabled: valid },
  );

  const offers = useContractRead(
    ["market", "offers", raw],
    async ({ client, book: b, blockNumber }) => {
      const block = await client.getBlock({ blockNumber });
      return readOffersForListing(client, b, listingId, block.timestamp, DEPLOYED_AT_BLOCK, blockNumber);
    },
    { enabled: valid, staleTime: 20_000 },
  );

  const refetchAll = React.useCallback(() => {
    listing.refetch();
    offers.refetch();
  }, [listing, offers]);

  if (!valid) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <ErrorState kind="not-found" title="Not a valid listing id" cause="Listing ids are whole numbers starting at 1." />
      </AppShell>
    );
  }

  if (listing.isLoading) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <RecordSkeleton rows={7} />
      </AppShell>
    );
  }

  if (listing.isError || !listing.data) {
    return (
      <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
        <ErrorState
          kind={listing.error?.tone === "infrastructure" ? "infrastructure" : "not-found"}
          title={listing.error?.title ?? "No such listing"}
          cause={listing.error?.cause ?? `Nothing is recorded under listing id ${raw}.`}
          remedy={listing.error?.remedy}
          detail={listing.error?.detail}
          onRetry={listing.refetch}
        />
      </AppShell>
    );
  }

  const { view: l, token, fee, now } = listing.data;
  const split = fee !== null ? splitPrice(l.price, fee) : null;
  const viewer = { address: account.address, isConnected: account.isConnected };
  const actions = deriveListingActions(l, viewer, now);
  const title = bytes32Label(l.asset?.label, `Asset #${l.assetId}`);

  return (
    <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
      <NetworkGuard />

      <Link href="/marketplace" className="mb-3 mt-2 inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-accent">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Marketplace
      </Link>

      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-ink">{title}</h1>
          <span className="font-mono text-sm text-ink-3">LISTING #{l.listingId.toString()}</span>
          <Badge>{assetKindLabel[l.asset?.kind ?? 0] ?? "—"}</Badge>
          <StateChip tone={LISTING_TONE[l.state]}>{LISTING_LABEL[l.state]}</StateChip>
          {l.asset?.verified ? (
            <StateChip tone="confirmed">Attested</StateChip>
          ) : (
            <StateChip tone="blocked">Not attested</StateChip>
          )}
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <Link href={`/assets/${l.assetId}`} className="text-accent hover:underline">
            Open asset passport #{l.assetId.toString()}
          </Link>
          <span className="text-ink-3">·</span>
          <BlockStamp blockNumber={l.blockNumber.toString()} />
        </p>
      </header>

      {l.state === "lapsed" && (
        <div className="mb-4 rounded border border-unrecorded/40 bg-unrecorded-bg p-3">
          <UnrecordedNote what="This listing passed its deadline. Offers and acceptance are refused, but the stored status still reads ACTIVE because recording an expiry costs gas." />
        </div>
      )}

      {l.sellerStillOwns === false && (
        <Banner tone="critical" title="The seller no longer owns this asset" className="mb-4">
          The listing recorded <AddressDisplay address={l.seller} /> as the seller, but{" "}
          {l.currentOwner && <AddressDisplay address={l.currentOwner} />} owns it now.
          Acceptance would revert — the current owner must list it again.
        </Banner>
      )}

      {l.escrow && (
        <Banner tone="warning" title="A trade is in progress" className="mb-4">
          Escrow #{l.escrow.escrowId.toString()} is open against this listing. The seller
          cannot cancel and no further offer can be accepted until it settles or times out.
        </Banner>
      )}

      <div className="grid gap-4 laptop:grid-cols-[1.2fr_1fr]">
        <div className="grid gap-4">
          <Card>
            <CardHeader title="Listing terms" description="Recorded by Marketplace." />
            <CardBody>
              <dl>
                <DataRow label="Asking price">
                  <span className="font-mono text-lg font-semibold tracking-tight text-ink">
                    {formatFixed(l.price, token.decimals)} {token.symbol}
                  </span>
                </DataRow>
                {split && (
                  <>
                    <DataRow label="Protocol fee (indicative)">
                      <span className="font-mono">
                        {formatFixed(split.fee, token.decimals)} {token.symbol}
                      </span>
                    </DataRow>
                    <DataRow label="Seller receives (indicative)">
                      <span className="font-mono">
                        {formatFixed(split.proceeds, token.decimals)} {token.symbol}
                      </span>
                    </DataRow>
                  </>
                )}
                <DataRow label="Seller">
                  <AddressDisplay address={l.seller} />
                </DataRow>
                <DataRow label="Settlement token">
                  <AddressDisplay address={l.paymentToken} /> ({token.symbol})
                </DataRow>
                <DataRow label="Listed">{formatDate(l.createdAt)}</DataRow>
                <DataRow label="Expires">
                  {formatDateTime(l.expiresAt)}{" "}
                  <span className="text-ink-3">({relative(l.expiresAt, Number(now))})</span>
                </DataRow>
              </dl>

              {split && (
                <p className="mt-3 text-2xs leading-relaxed text-ink-3">
                  The fee shown is a quote at today&rsquo;s rate. The number that binds a
                  trade is frozen into the escrow at acceptance, so a later fee change
                  cannot reprice a trade already in flight.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={`Offers (${offers.data?.length ?? 0})`}
              description="Read from OfferMade logs, then confirmed on-chain."
            />
            <CardBody>
              {offers.isLoading ? (
                <RecordSkeleton rows={3} />
              ) : offers.isError ? (
                <ErrorState
                  kind="infrastructure"
                  title={offers.error?.title ?? "Could not load offers"}
                  cause={offers.error?.cause}
                  onRetry={offers.refetch}
                />
              ) : (offers.data?.length ?? 0) === 0 ? (
                <EmptyState
                  title="No offers yet"
                  description="An offer carries no funds — it is an expression of intent at a price and a deadline."
                />
              ) : (
                <OfferTable
                  offers={offers.data ?? []}
                  listing={l}
                  viewer={viewer}
                  decimals={token.decimals}
                  symbol={token.symbol}
                  now={now}
                  onDone={refetchAll}
                />
              )}
            </CardBody>
          </Card>

          {l.escrow && (
            <EscrowPanel
              escrowAddress={l.escrow.address}
              onDone={refetchAll}
            />
          )}
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader title="Actions" description="What the protocol will accept from you." />
            <CardBody className="grid gap-2">
              {actions.map((a) => (
                <ActionButton
                  key={a.id}
                  action={a}
                  onClick={() => {
                    if (a.id === "makeOffer") setOfferOpen(true);
                  }}
                  contractCall={
                    a.id === "cancelListing"
                      ? { kind: "cancelListing", listingId: l.listingId }
                      : a.id === "expireListing"
                        ? { kind: "expireListing", listingId: l.listingId }
                        : undefined
                  }
                  onDone={refetchAll}
                />
              ))}
              {!account.isConnected && (
                <p className="mt-1 text-xs text-ink-3">
                  Connect a wallet to act on this listing. Browsing needs no wallet.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Before you commit" />
            <CardBody className="grid gap-2 text-xs leading-relaxed text-ink-2">
              <p>
                An offer moves no money. If the seller accepts, a fresh escrow contract is
                deployed for this trade alone and you deposit into that, never into the
                marketplace.
              </p>
              <p>
                Approve the exact price to that escrow — never an unlimited allowance. Each
                escrow is single-use, so unlimited approval is pure downside.
              </p>
              <p>
                Every non-terminal state has a permissionless exit. An unfunded trade can be
                cancelled; a funded one refunds you after the settlement window, less a 2%
                penalty; a dispute nobody arbitrates refunds you in full.
              </p>
              <NonClaim variant="title" display="block" />
            </CardBody>
          </Card>
        </div>
      </div>

      <MakeOfferDialog
        open={offerOpen}
        onOpenChange={setOfferOpen}
        listing={l}
        decimals={token.decimals}
        symbol={token.symbol}
        onDone={refetchAll}
      />
    </AppShell>
  );
}

// ───────────────────────────────────────────────────────────── offers ────

function OfferTable({
  offers,
  listing,
  viewer,
  decimals,
  symbol,
  now,
  onDone,
}: {
  offers: OfferView[];
  listing: ListingView;
  viewer: { address: `0x${string}` | undefined; isConnected: boolean };
  decimals: number;
  symbol: string;
  now: bigint;
  onDone: () => void;
}) {
  return (
    <TableWrap>
      <Table>
        <TableCaption>Offers against this listing</TableCaption>
        <THead>
          <TR>
            <TH sticky>Offer</TH>
            <TH>Buyer</TH>
            <TH numeric>Price {symbol}</TH>
            <TH>Expires</TH>
            <TH>State</TH>
            <TH>Actions</TH>
          </TR>
        </THead>
        <TBody>
          {offers.map((o) => {
            // Only what this viewer could plausibly do. A disabled control with a reason
            // helps the party it belongs to; to anyone else it is noise.
            const acts = deriveOfferActions(o, listing, viewer).filter((a) => a.relevant);
            return (
              <TR key={o.offerId.toString()}>
                <TD sticky mono>#{o.offerId.toString()}</TD>
                <TD>
                  <AddressDisplay address={o.buyer} />
                </TD>
                <TD numeric>{formatFixed(o.price, decimals)}</TD>
                <TD mono className="whitespace-nowrap">{relative(o.expiresAt, Number(now))}</TD>
                <TD>
                  <StateChip
                    tone={OFFER_TONE[o.state]}
                    hint={o.state === "lapsed" ? "Past its deadline; storage still reads ACTIVE." : undefined}
                  >
                    {o.state}
                  </StateChip>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {acts.map((a) => (
                      <ActionButton
                        key={a.id}
                        action={a}
                        size="sm"
                        contractCall={{
                          kind: a.id as
                            | "acceptOffer"
                            | "rejectOffer"
                            | "withdrawOffer"
                            | "expireOffer",
                          offerId: o.offerId,
                        }}
                        onDone={onDone}
                      />
                    ))}
                  </div>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </TableWrap>
  );
}

// ────────────────────────────────────────────────────────── make offer ────

function MakeOfferDialog({
  open,
  onOpenChange,
  listing,
  decimals,
  symbol,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listing: ListingView;
  decimals: number;
  symbol: string;
  onDone: () => void;
}) {
  const book = useAddressBook();
  const tx = useContractWrite();
  const [price, setPrice] = React.useState("");
  const [days, setDays] = React.useState("14");

  const { reset } = tx;
  React.useEffect(() => {
    if (!open) {
      reset();
      setPrice("");
      setDays("14");
    }
  }, [open, reset]);

  const parsed = parseAmount(price, decimals);
  const dayCount = Number(days);
  const validDays = Number.isFinite(dayCount) && dayCount >= 1 && dayCount <= 365;
  const ready = parsed !== null && parsed > 0n && validDays && !!book.data;

  const submit = () => {
    if (!ready || !book.data || parsed === null) return;
    const expiresAt = Math.floor(Date.now() / 1000) + dayCount * 86_400;
    void tx
      .execute(
        marketWrites.makeOffer(book.data.addresses, {
          listingId: listing.listingId,
          price: parsed,
          expiresAt,
        }),
      )
      .then((hash) => {
        if (hash) onDone();
      });
  };

  return (
    <TransactionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Offer on listing #${listing.listingId}`}
      description="An offer carries no funds. You commit capital only if the seller accepts and you then fund the escrow."
      tx={tx}
      onConfirm={submit}
      confirmLabel="Place offer"
      summary={
        parsed !== null ? (
          <>
            <p>
              Offers {formatFixed(parsed, decimals)} {symbol} for asset #
              {listing.assetId.toString()}, open for {days} days.
            </p>
            <p>No money moves now. You can withdraw at any time before acceptance.</p>
          </>
        ) : undefined
      }
    >
      <div className="grid gap-3">
        <Field
          label={`Your offer in ${symbol}`}
          htmlFor="mo-price"
          hint={`Asking price is ${formatFixed(listing.price, decimals)} ${symbol}. You may offer any amount.`}
          error={price !== "" && parsed === null ? `At most ${decimals} decimal places.` : undefined}
          required
        >
          <Input
            id="mo-price"
            mono
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={formatFixed(listing.price, decimals)}
            invalid={price !== "" && parsed === null}
          />
        </Field>
        <Field
          label="Offer open for (days)"
          htmlFor="mo-days"
          hint="After this the offer lapses and can no longer be accepted."
          error={!validDays ? "Between 1 and 365." : undefined}
          required
        >
          <Input id="mo-days" mono value={days} onChange={(e) => setDays(e.target.value)} invalid={!validDays} />
        </Field>
      </div>
    </TransactionDialog>
  );
}
