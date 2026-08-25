"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { StateChip } from "@/components/protocol/state-chip";
import { AddressDisplay } from "@/components/protocol/chain-value";
import { DataTable, type Column } from "@/components/data/data-table";
import { EmptyState, ErrorState, Banner } from "@/components/data/states";
import { NetworkGuard } from "@/components/web3/network-guard";
import { CreateListingDialog } from "@/components/market/create-listing-dialog";
import { useContractRead } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import {
  descendingWindow,
  readListingCount,
  readListingPage,
  readTokenMeta,
  LISTING_LABEL,
  LISTING_TONE,
  type ListingView,
} from "@/lib/api/market";
import { assetKindLabel } from "@/lib/contracts/generated/enums";
import { bytes32Label } from "@/lib/utils/bytes32";
import { formatFixed } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/time";
import { SETTLEMENT_TOKEN } from "@/config/env";

const PAGE = 60;

type SortKey = "listingId" | "price" | "expiresAt";

/**
 * The market.
 *
 * Listings are read from the chain and their state is **computed**, never taken from the
 * stored status field. That distinction is the whole reason a lapsed listing here says
 * "Lapsed" rather than offering itself for sale.
 */
export default function MarketplacePage() {
  const router = useRouter();
  const account = useAccountState();

  const [query, setQuery] = React.useState("");
  const [stateFilter, setStateFilter] = React.useState("open");
  const [kindFilter, setKindFilter] = React.useState("all");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "listingId",
    dir: "desc",
  });
  const [createOpen, setCreateOpen] = React.useState(false);

  const market = useContractRead(["market", "listings"], async ({ client, book, blockNumber }) => {
    const block = await client.getBlock({ blockNumber });
    const count = await readListingCount(client, book);
    const ids = descendingWindow(count, PAGE);
    const listings = await readListingPage(client, book, ids, block.timestamp, blockNumber);
    const token = await readTokenMeta(client, SETTLEMENT_TOKEN);
    return { listings, token, total: Number(count), truncated: Number(count) > PAGE };
  });

  const rows = React.useMemo(() => {
    const all = market.data?.listings ?? [];
    const q = query.trim().toLowerCase();

    const filtered = all.filter((l) => {
      if (stateFilter === "open" && l.state !== "active") return false;
      if (stateFilter !== "open" && stateFilter !== "all" && l.state !== stateFilter) return false;
      if (kindFilter !== "all" && String(l.asset?.kind ?? "") !== kindFilter) return false;
      if (!q) return true;
      return (
        bytes32Label(l.asset?.label, "").toLowerCase().includes(q) ||
        l.listingId.toString() === q.replace("#", "") ||
        l.assetId.toString() === q.replace("#", "") ||
        l.seller.toLowerCase().includes(q)
      );
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "price") return a.price === b.price ? 0 : (a.price > b.price ? 1 : -1) * dir;
      if (sort.key === "expiresAt") return (a.expiresAt - b.expiresAt) * dir;
      return (Number(a.listingId) - Number(b.listingId)) * dir;
    });
  }, [market.data, query, stateFilter, kindFilter, sort]);

  const decimals = market.data?.token.decimals ?? 6;
  const symbol = market.data?.token.symbol ?? "";
  const lapsedCount = (market.data?.listings ?? []).filter((l) => l.state === "lapsed").length;

  const columns: Column<ListingView>[] = [
    { key: "listingId", header: "Listing", sticky: true, mono: true, sortable: true, cell: (l) => `#${l.listingId}` },
    {
      key: "asset",
      header: "Asset",
      cell: (l) => (
        <span>
          <span className="block font-medium text-ink">
            {bytes32Label(l.asset?.label, `Asset #${l.assetId}`)}
          </span>
          <span className="block font-mono text-2xs text-ink-3">asset #{l.assetId.toString()}</span>
        </span>
      ),
    },
    {
      key: "kind",
      header: "Category",
      hideBelow: "tablet",
      cell: (l) => <Badge>{assetKindLabel[l.asset?.kind ?? 0] ?? "—"}</Badge>,
    },
    {
      key: "verified",
      header: "Verification",
      hideBelow: "laptop",
      cell: (l) =>
        l.asset?.verified ? (
          <StateChip tone="confirmed">Attested</StateChip>
        ) : (
          <StateChip tone="blocked">Not attested</StateChip>
        ),
    },
    {
      key: "state",
      header: "Status",
      cell: (l) => (
        <span className="flex flex-wrap items-center gap-1">
          <StateChip
            tone={LISTING_TONE[l.state]}
            hint={
              l.state === "lapsed"
                ? "Past its deadline; the stored status still reads ACTIVE."
                : undefined
            }
          >
            {LISTING_LABEL[l.state]}
          </StateChip>
          {l.escrow && <StateChip tone="blocked">In escrow</StateChip>}
          {l.sellerStillOwns === false && <StateChip tone="adverse">Seller changed</StateChip>}
        </span>
      ),
    },
    {
      key: "seller",
      header: "Seller",
      hideBelow: "laptop",
      cell: (l) => <AddressDisplay address={l.seller} />,
    },
    {
      key: "expiresAt",
      header: "Expires",
      hideBelow: "desktop",
      mono: true,
      sortable: true,
      cell: (l) => formatDate(l.expiresAt),
    },
    {
      key: "price",
      header: `Price ${symbol}`,
      numeric: true,
      sortable: true,
      cell: (l) => formatFixed(l.price, decimals),
    },
  ];

  return (
    <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
      <NetworkGuard />

      <header className="mb-5 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-key">Marketplace</p>
          <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight text-ink">Listings</h1>
          <p className="mt-1 max-w-[70ch] text-sm text-ink-2">
            Every listing on this deployment, with its state computed against the
            chain&rsquo;s own clock rather than read from storage.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)} disabled={!account.isConnected}>
          List an asset
        </Button>
      </header>

      {lapsedCount > 0 && (
        <Banner tone="warning" title={`${lapsedCount} listing${lapsedCount === 1 ? "" : "s"} lapsed`} className="mb-4">
          Past the deadline, but recording an expiry costs gas so the stored status still
          reads <code className="font-mono text-2xs">ACTIVE</code>. Anyone can record it —
          open a lapsed listing to do so.
        </Banner>
      )}

      <div className="mb-3 flex flex-col gap-2 tablet:flex-row tablet:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search asset, listing id or seller"
          className="tablet:max-w-[300px]"
          aria-label="Search listings"
        />
        <Select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          aria-label="Filter by status"
          className="tablet:max-w-[170px]"
        >
          <option value="open">Open for offers</option>
          <option value="all">All statuses</option>
          <option value="lapsed">Lapsed</option>
          <option value="sold">Sold</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expiry recorded</option>
        </Select>
        <Select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          aria-label="Filter by category"
          className="tablet:max-w-[160px]"
        >
          <option value="all">All categories</option>
          {Object.entries(assetKindLabel)
            .filter(([k]) => k !== "0")
            .map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
        </Select>
        {market.data && (
          <p className="ml-auto font-mono text-2xs text-ink-3">
            {rows.length} of {market.data.total} listings
          </p>
        )}
      </div>

      {market.isError ? (
        <ErrorState
          kind={market.error?.tone === "infrastructure" ? "infrastructure" : "protocol"}
          title={market.error?.title ?? "Could not load the market"}
          cause={market.error?.cause}
          remedy={market.error?.remedy}
          detail={market.error?.detail}
          onRetry={market.refetch}
        />
      ) : (
        <DataTable
          caption="Marketplace listings"
          columns={columns}
          rows={rows}
          rowKey={(l) => l.listingId.toString()}
          loading={market.isLoading}
          sort={sort}
          onSortChange={(key) =>
            setSort((s) => ({
              key: key as SortKey,
              dir: s.key === key && s.dir === "desc" ? "asc" : "desc",
            }))
          }
          onRowClick={(l) => router.push(`/marketplace/${l.listingId}`)}
          empty={
            query || stateFilter !== "all" || kindFilter !== "all" ? (
              <EmptyState
                variant="filtered"
                title="No listings match these filters"
                description={`${market.data?.total ?? 0} listings exist on this deployment.`}
                action={
                  <Button size="sm" variant="ghost" onClick={() => { setQuery(""); setStateFilter("all"); setKindFilter("all"); }}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="Nothing listed yet"
                description="An owner can list a verified, transferable asset that is not installed in an airframe."
              />
            )
          }
        />
      )}

      <section className="mt-8 rounded-md bg-panel shadow-raised p-4">
        <h2 className="font-mono text-sm font-semibold tracking-tight text-ink">
          How a trade completes
        </h2>
        <p className="mt-1 max-w-[80ch] text-sm leading-relaxed text-ink-2">
          There is no buy-now. A trade is{" "}
          <strong className="font-medium text-ink">
            list → offer → accept → approve → fund → release
          </strong>
          . An offer moves no money; acceptance deploys a fresh escrow contract for that
          trade alone and freezes price, fee and both deadlines into it. The buyer then
          deposits the exact price and releases when satisfied — title, fee and proceeds
          all move in one transaction, or none of them do.
        </p>
        <p className="mt-2 max-w-[80ch] text-xs leading-relaxed text-ink-3">
          Every non-terminal state has a permissionless exit, so no party&rsquo;s funds
          depend on a counterparty responding.{" "}
          <Link href="/platform" className="text-accent hover:underline">
            More on the protocol
          </Link>
        </p>
      </section>

      {market.data?.truncated && (
        <p className="mt-3 text-2xs leading-relaxed text-blocked">
          Showing the most recent {PAGE} of {market.data.total}. See{" "}
          <Link href="/documentation" className="text-accent hover:underline">
            the indexing note
          </Link>{" "}
          for how discovery scales past this.
        </p>
      )}

      <CreateListingDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onListed={() => market.refetch()}
      />
    </AppShell>
  );
}
