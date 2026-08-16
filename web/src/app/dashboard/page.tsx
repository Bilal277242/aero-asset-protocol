"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Banner } from "@/components/data/states";
import { StateChip, UnrecordedNote } from "@/components/protocol/state-chip";
import { NonClaim } from "@/components/protocol/non-claim";
import { AddressDisplay, BlockStamp } from "@/components/protocol/chain-value";
import { Panel, Metric, Distribution } from "@/components/dashboard/panel";
import { NetworkGuard } from "@/components/web3/network-guard";
import { useContractRead } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import {
  readProtocolOverview,
  readAssetBreakdown,
  readMarketBreakdown,
  readOrgBreakdown,
  readMaintenanceBreakdown,
} from "@/lib/api/dashboard";
import { readActivity } from "@/lib/api/activity";
import { DEPLOYED_AT_BLOCK, explorerTx } from "@/config/env";
import { assetStatusLabel, maintenanceTypeLabel } from "@/lib/contracts/generated/enums";
import { duration, formatDate, relative } from "@/lib/utils/time";

/**
 * The operations dashboard.
 *
 * Every figure is a counter the protocol maintains or something derived by reading state
 * directly. Where the contracts cannot answer a question the panel says so rather than
 * showing a plausible number — there is no settled-volume figure here, for instance,
 * because nothing has settled yet and inventing one would be the whole problem.
 *
 * Not gated behind a wallet. Protocol data is public and gating it would be theatre; the
 * connected account adds context rather than unlocking the page.
 */
export default function DashboardPage() {
  const account = useAccountState();

  const overview = useContractRead(["dashboard", "overview"], ({ client, book, blockNumber }) =>
    readProtocolOverview(client, book, blockNumber),
  );
  const assets = useContractRead(["dashboard", "assets"], ({ client, book, blockNumber }) =>
    readAssetBreakdown(client, book, blockNumber),
  );
  const market = useContractRead(["dashboard", "market"], ({ client, book, blockNumber }) =>
    readMarketBreakdown(client, book, blockNumber),
  );
  const orgs = useContractRead(["dashboard", "orgs"], ({ client, book, blockNumber }) =>
    readOrgBreakdown(client, book, blockNumber),
  );
  const maintenance = useContractRead(
    ["dashboard", "maintenance"],
    ({ client, book, blockNumber }) => readMaintenanceBreakdown(client, book, blockNumber),
  );
  const activity = useContractRead(
    ["dashboard", "activity"],
    ({ client, book, blockNumber }) =>
      readActivity(client, book, DEPLOYED_AT_BLOCK, blockNumber, 20),
    { staleTime: 30_000 },
  );

  return (
    <AppShell standing={{ connected: account.isConnected, hasOperations: false }}>
      <NetworkGuard />

      <header className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-key">Operations</p>
          <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight text-ink">Dashboard</h1>
          <p className="mt-1 max-w-[70ch] text-sm text-ink-2">
            Protocol state read directly from the Sepolia deployment. Every figure below is
            a counter the contracts maintain or a value derived from them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Sepolia · 11155111</Badge>
          {account.isConnected && account.address && (
            <Badge variant="accent">
              <AddressDisplay address={account.address} />
            </Badge>
          )}
        </div>
      </header>

      {overview.data && overview.data.pausedModules.length > 0 && (
        <Banner tone="critical" title="One or more modules are paused" className="mb-4">
          {overview.data.pausedModules.join(", ")} — settlement is halted while refunds and
          timeout claims keep working. Restarting requires a timelocked governance action.
        </Banner>
      )}

      <div className="grid gap-4">
        {/* ── Overview cards ───────────────────────────────────────── */}
        <Panel
          title="Protocol overview"
          description="Cumulative counters maintained by the contracts."
          state={overview}
          skeleton={
            <div className="grid grid-cols-2 gap-px bg-rule laptop:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-panel p-3">
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="mt-2 h-6 w-12" />
                </div>
              ))}
            </div>
          }
        >
          {(data) => (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-rule bg-rule tablet:grid-cols-3 laptop:grid-cols-4">
              <Metric label="Assets" value={num(data.counts.assets)} href="/fleet" />
              <Metric
                label="Verified assets"
                value={assets.data ? assets.data.verified : "—"}
                tone="confirmed"
                caveat={assets.data?.truncated ? `of ${assets.data.scanned} sampled` : undefined}
              />
              <Metric label="Organizations" value={num(data.counts.organizations)} />
              <Metric
                label="Active listings"
                value={market.data ? market.data.active : "—"}
                tone="confirmed"
                caveat="computed, not read from stored status"
                href="/marketplace"
              />
              <Metric
                label="Listings all time"
                value={num(data.counts.listingsAllTime)}
                caveat="highest id minted, not live count"
              />
              <Metric label="Offers all time" value={num(data.counts.offersAllTime)} />
              <Metric
                label="Escrows opened"
                value={num(data.counts.escrowsAllTime)}
                caveat="the protocol has no transaction counter"
              />
              <Metric label="Documents" value={num(data.counts.documents)} />
            </div>
          )}
        </Panel>

        <div className="grid gap-4 laptop:grid-cols-2">
          {/* ── Asset overview ─────────────────────────────────────── */}
          <Panel
            title="Asset register"
            description="Composition of the registry by kind and verification."
            state={assets}
            emptyWhen={(d) => d.total === 0}
            emptyTitle="No assets registered"
            emptyDescription="A verified organization can register an aircraft, engine or component."
          >
            {(data) => (
              <div className="grid gap-4">
                <Distribution
                  total={data.scanned}
                  segments={[
                    { label: "Verified", count: data.verified, tone: "confirmed" },
                    { label: "Unverified", count: data.unverified, tone: "blocked" },
                    { label: "Retired or destroyed", count: data.terminal, tone: "adverse" },
                  ]}
                />

                <div>
                  <p className="label-key mb-1.5">By kind</p>
                  <dl className="grid gap-1">
                    {data.byKind.map((k) => (
                      <div
                        key={k.kind}
                        className="flex items-center justify-between border-b border-rule-2 py-1 text-sm last:border-0"
                      >
                        <dt className="text-ink-2">{titleCase(k.label)}</dt>
                        <dd className="font-mono tabular-nums text-ink">{k.count}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div>
                  <p className="label-key mb-1.5">By status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.byStatus.map((s) => (
                      <StateChip
                        key={s.status}
                        tone={s.status >= 5 ? "adverse" : "neutral"}
                      >
                        {assetStatusLabel[s.status] ?? `Status ${s.status}`} · {s.count}
                      </StateChip>
                    ))}
                  </div>
                </div>

                {data.truncated && (
                  <p className="text-2xs text-blocked">
                    Figures cover the most recent {data.scanned} of {data.total} assets. The
                    protocol exposes no aggregate by kind or verification, so these are
                    derived by reading records directly.
                  </p>
                )}
                <NonClaim variant="airworthiness" display="block" />
              </div>
            )}
          </Panel>

          {/* ── Marketplace activity ───────────────────────────────── */}
          <Panel
            title="Marketplace"
            description="Listing states, computed against the chain's clock."
            state={market}
            emptyWhen={(d) => d.allTime === 0}
            emptyTitle="No listings yet"
            emptyDescription="An owner can list a verified, transferable asset that is not installed in an airframe."
          >
            {(data) => (
              <div className="grid gap-4">
                <Distribution
                  total={data.scanned}
                  segments={[
                    { label: "Active", count: data.active, tone: "confirmed" },
                    { label: "Lapsed — expiry unrecorded", count: data.lapsed, tone: "unrecorded" },
                    { label: "Expiry recorded", count: data.expiredRecorded, tone: "neutral" },
                    { label: "Sold", count: data.sold, tone: "neutral" },
                    { label: "Cancelled", count: data.cancelled, tone: "adverse" },
                  ]}
                />

                {data.lapsed > 0 && (
                  <div className="rounded border border-unrecorded/40 bg-unrecorded-bg p-3">
                    <UnrecordedNote
                      what={`${data.lapsed} listing${data.lapsed === 1 ? " has" : "s have"} passed the deadline, but recording an expiry costs gas so the stored status still reads ACTIVE.`}
                    />
                  </div>
                )}

                <dl className="grid gap-1 text-sm">
                  <Row label="Offers all time" value={data.offersAllTime} />
                  <Row label="Escrows opened" value={data.escrowsAllTime} />
                  <Row label="Listings with a live escrow" value={data.withLiveEscrow} />
                </dl>

                <p className="text-2xs leading-relaxed text-ink-3">
                  Settled volume is not shown: it would require summing settlement events,
                  and nothing has settled on this deployment yet. An invented figure would
                  be worse than its absence.
                </p>
              </div>
            )}
          </Panel>

          {/* ── Verification activity ──────────────────────────────── */}
          <Panel
            title="Verification"
            description="Attestations by authorised roles."
            state={orgs}
            emptyWhen={(d) => d.total === 0}
            emptyTitle="No organizations registered"
            emptyDescription="Registration is permissionless; verification is not."
          >
            {(data) => (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-rule bg-rule">
                  <Metric label="Organizations" value={data.total} />
                  <Metric label="Verified" value={data.verified} tone="confirmed" />
                  <Metric
                    label="Verified assets"
                    value={assets.data ? assets.data.verified : "—"}
                    tone="confirmed"
                  />
                  <Metric
                    label="Awaiting verification"
                    value={assets.data ? assets.data.unverified : "—"}
                    tone="blocked"
                    caveat="cannot be listed until verified"
                  />
                </div>

                <p className="text-xs leading-relaxed text-ink-2">
                  Verification is an attestation by an account holding the relevant role,
                  recorded with a timestamp and the organization credited. It is not a
                  determination of airworthiness or of corporate identity.
                </p>
                <NonClaim variant="attestation" display="block" />
              </div>
            )}
          </Panel>

          {/* ── Maintenance activity ───────────────────────────────── */}
          <Panel
            title="Maintenance"
            description="Recorded events, with the gap between claim and witness."
            state={maintenance}
            emptyWhen={(d) => d.total === 0}
            emptyTitle="No maintenance recorded"
            emptyDescription="Recording requires an MRO organization holding a valid maintenance-authority credential. No credential has been issued on this deployment."
          >
            {(data) => (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-rule bg-rule">
                  <Metric label="Records" value={data.total} />
                  <Metric
                    label="Backdated over 30 days"
                    value={data.backdated}
                    tone={data.backdated > 0 ? "blocked" : "neutral"}
                  />
                </div>

                {data.medianGapSeconds !== null && (
                  <p className="text-xs text-ink-2">
                    Median gap between claimed and recorded:{" "}
                    <span className="font-mono">{duration(data.medianGapSeconds)}</span>
                  </p>
                )}

                <ul className="grid gap-1.5">
                  {data.recent.map((r) => (
                    <li
                      key={r.recordId.toString()}
                      className="border-b border-rule-2 pb-1.5 last:border-0"
                    >
                      <p className="text-sm text-ink">
                        {maintenanceTypeLabel[r.mType] ?? "Maintenance"} · asset #
                        {r.assetId.toString()}
                      </p>
                      <p className="font-mono text-2xs text-ink-3">
                        claimed {formatDate(r.performedAt)} · recorded{" "}
                        {formatDate(r.recordedAt)}
                      </p>
                    </li>
                  ))}
                </ul>

                <NonClaim variant="maintenance" display="block" />
              </div>
            )}
          </Panel>
        </div>

        {/* ── Recent activity ──────────────────────────────────────── */}
        <Panel
          title="Recent activity"
          description="Reconstructed from protocol events since deployment."
          state={activity}
          emptyWhen={(d) => d.items.length === 0}
          emptyTitle="No protocol activity"
          emptyDescription="Nothing has been recorded on this deployment yet."
          skeleton={<TableSkeleton rows={6} cols={4} />}
          actions={
            <Button size="sm" variant="ghost" onClick={activity.refetch}>
              Refresh
            </Button>
          }
        >
          {(data) => (
            <div className="grid gap-3">
              <ol className="grid gap-px overflow-hidden rounded border border-rule bg-rule">
                {data.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-1 bg-panel p-3 tablet:flex-row tablet:items-baseline tablet:gap-4"
                  >
                    <span className="w-24 shrink-0">
                      <CategoryChip category={item.category} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">
                        {item.href ? (
                          <Link href={item.href} className="hover:text-accent hover:underline">
                            {item.title}
                          </Link>
                        ) : (
                          item.title
                        )}
                      </span>
                      <span className="block text-xs text-ink-2">{item.detail}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <a
                        href={explorerTx(item.txHash)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block font-mono text-2xs text-ink-3 hover:text-accent"
                      >
                        block {item.blockNumber.toString()}
                      </a>
                      {item.timestamp !== null && (
                        <span className="block font-mono text-2xs text-ink-3">
                          {relative(item.timestamp, Math.floor(Date.now() / 1000))}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="font-mono text-2xs text-ink-3">
                scanned blocks {data.scannedFrom.toString()}–{data.scannedTo.toString()} ·
                showing {data.items.length} most recent
              </p>
            </div>
          )}
        </Panel>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-3">
          <p className="text-2xs text-ink-3">
            Testnet deployment. Not independently audited. Not for use with real funds.
          </p>
          {overview.blockNumber && <BlockStamp blockNumber={overview.blockNumber.toString()} />}
        </footer>
      </div>
    </AppShell>
  );
}

function num(v: bigint | null): string {
  return v === null ? "—" : v.toString();
}

function titleCase(s: string): string {
  const lower = s.toLowerCase().replace(/_/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-rule-2 py-1 last:border-0">
      <dt className="text-ink-2">{label}</dt>
      <dd className="font-mono tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function CategoryChip({ category }: { category: string }) {
  const tone = {
    asset: "neutral",
    verification: "confirmed",
    market: "neutral",
    settlement: "blocked",
    provenance: "neutral",
    identity: "neutral",
  }[category] as "neutral" | "confirmed" | "blocked";

  return <StateChip tone={tone}>{category}</StateChip>;
}
