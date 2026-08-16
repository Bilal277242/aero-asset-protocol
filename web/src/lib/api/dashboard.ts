import type { Address, PublicClient } from "viem";
import {
  assetRegistryAbi,
  assetPassportAbi,
  credentialRegistryAbi,
  documentRegistryAbi,
  escrowFactoryAbi,
  feeManagerAbi,
  maintenanceRegistryAbi,
  marketplaceAbi,
  organizationRegistryAbi,
} from "@/lib/contracts/generated/abis";
import { AssetKind, AssetStatus, ListingStatus } from "@/lib/contracts/generated/enums";
import type { AddressBook } from "@/lib/contracts/addressBook";
import { requireAddress } from "@/lib/contracts/addressBook";
import { value } from "@/hooks/useContractRead";

/**
 * Dashboard readers.
 *
 * Every figure here is either a counter the protocol maintains or something derived by
 * reading state directly. Nothing is estimated and nothing is invented — where the
 * contracts cannot answer a question, the dashboard says so rather than showing a
 * plausible number.
 *
 * Two distinctions the protocol forces and the UI must respect:
 *
 * - **Cumulative is not current.** `listingCount()` is the highest id ever minted, not
 *   the number of live listings. Conflating them overstates activity permanently.
 * - **Stored status is not effective status.** A listing past its deadline still reads
 *   ACTIVE until somebody pays gas to record the expiry, so "active" is computed with
 *   `isListingActive`, never read.
 */

/** How many records a derived count will walk before it stops and says so. */
export const SCAN_LIMIT = 200;

type MulticallEntry = { status: "success"; result: unknown } | { status: "failure" };

// ───────────────────────────────────────────────────────────── overview ────

export type ProtocolOverview = {
  counts: {
    assets: bigint | null;
    organizations: bigint | null;
    credentials: bigint | null;
    documents: bigint | null;
    maintenance: bigint | null;
    listingsAllTime: bigint | null;
    offersAllTime: bigint | null;
    escrowsAllTime: bigint | null;
  };
  fees: {
    marketplaceBps: number | null;
    maxBps: number | null;
    treasury: Address | null;
  };
  pausedModules: string[];
};

const PAUSABLE = [
  "MARKETPLACE",
  "ASSET_OWNERSHIP",
  "ASSET_REGISTRY",
  "AIRCRAFT_REGISTRY",
  "COMPONENT_REGISTRY",
  "DOCUMENT_REGISTRY",
  "MAINTENANCE_REGISTRY",
  "ORGANIZATION_REGISTRY",
  "CREDENTIAL_REGISTRY",
] as const;

export async function readProtocolOverview(
  client: PublicClient,
  book: AddressBook,
  blockNumber: bigint,
): Promise<ProtocolOverview> {
  const counters = await client.multicall({
    contracts: [
      { address: requireAddress(book, "ASSET_REGISTRY"), abi: assetRegistryAbi, functionName: "assetCount" },
      { address: requireAddress(book, "ORGANIZATION_REGISTRY"), abi: organizationRegistryAbi, functionName: "organizationCount" },
      { address: requireAddress(book, "CREDENTIAL_REGISTRY"), abi: credentialRegistryAbi, functionName: "credentialCount" },
      { address: requireAddress(book, "DOCUMENT_REGISTRY"), abi: documentRegistryAbi, functionName: "documentCount" },
      { address: requireAddress(book, "MAINTENANCE_REGISTRY"), abi: maintenanceRegistryAbi, functionName: "maintenanceCount" },
      { address: requireAddress(book, "MARKETPLACE"), abi: marketplaceAbi, functionName: "listingCount" },
      { address: requireAddress(book, "MARKETPLACE"), abi: marketplaceAbi, functionName: "offerCount" },
      { address: requireAddress(book, "ESCROW_FACTORY"), abi: escrowFactoryAbi, functionName: "escrowCount" },
      { address: requireAddress(book, "FEE_MANAGER"), abi: feeManagerAbi, functionName: "FEE_TYPE_MARKETPLACE" },
      { address: requireAddress(book, "FEE_MANAGER"), abi: feeManagerAbi, functionName: "MAX_FEE_BPS" },
      { address: requireAddress(book, "FEE_MANAGER"), abi: feeManagerAbi, functionName: "treasury" },
    ],
    allowFailure: true,
    blockNumber,
  });

  const feeType = value<`0x${string}`>(counters[8] as MulticallEntry);
  const pauseKeys = PAUSABLE.filter((k) => book[k]);

  const [pauseResults, feeBps] = await Promise.all([
    client.multicall({
      contracts: pauseKeys.map((key) => ({
        address: book[key] as Address,
        // `paused()` is identical across every module built on ProtocolModuleUpgradeable.
        abi: marketplaceAbi,
        functionName: "paused" as const,
      })),
      allowFailure: true,
      blockNumber,
    }),
    feeType
      ? client
          .readContract({
            address: requireAddress(book, "FEE_MANAGER"),
            abi: feeManagerAbi,
            functionName: "feeBps",
            args: [feeType],
            blockNumber,
          })
          .then((v) => Number(v))
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const pausedModules = pauseKeys.filter(
    (_, i) => value<boolean>(pauseResults[i] as MulticallEntry) === true,
  );

  return {
    counts: {
      assets: value<bigint>(counters[0] as MulticallEntry),
      organizations: value<bigint>(counters[1] as MulticallEntry),
      credentials: value<bigint>(counters[2] as MulticallEntry),
      documents: value<bigint>(counters[3] as MulticallEntry),
      maintenance: value<bigint>(counters[4] as MulticallEntry),
      listingsAllTime: value<bigint>(counters[5] as MulticallEntry),
      offersAllTime: value<bigint>(counters[6] as MulticallEntry),
      escrowsAllTime: value<bigint>(counters[7] as MulticallEntry),
    },
    fees: {
      marketplaceBps: feeBps,
      maxBps: value<number>(counters[9] as MulticallEntry),
      treasury: value<Address>(counters[10] as MulticallEntry),
    },
    pausedModules: [...pausedModules],
  };
}

// ──────────────────────────────────────────────────────────────── assets ────

export type AssetBreakdown = {
  total: number;
  scanned: number;
  truncated: boolean;
  verified: number;
  unverified: number;
  byKind: { kind: number; label: string; count: number }[];
  byStatus: { status: number; count: number }[];
  terminal: number;
};

type RawPassport = {
  assetId: bigint;
  kind: number;
  status: number;
  verified: boolean;
};

export async function readAssetBreakdown(
  client: PublicClient,
  book: AddressBook,
  blockNumber: bigint,
): Promise<AssetBreakdown> {
  const total = Number(
    await client.readContract({
      address: requireAddress(book, "ASSET_REGISTRY"),
      abi: assetRegistryAbi,
      functionName: "assetCount",
      blockNumber,
    }),
  );

  // There is no on-chain aggregate by kind or verification, so this walks the ids. The
  // cap is honest rather than silent: past it the dashboard says the figures cover a
  // sample, and this is the point where an indexer stops being optional.
  const scanned = Math.min(total, SCAN_LIMIT);
  const ids = Array.from({ length: scanned }, (_, i) => BigInt(total - i));

  const results = ids.length
    ? await client.multicall({
        contracts: ids.map((assetId) => ({
          address: requireAddress(book, "ASSET_PASSPORT"),
          abi: assetPassportAbi,
          functionName: "getPassport" as const,
          args: [assetId],
        })),
        allowFailure: true,
        blockNumber,
      })
    : [];

  const kinds = new Map<number, number>();
  const statuses = new Map<number, number>();
  let verified = 0;
  let terminal = 0;

  results.forEach((entry) => {
    const p = value<RawPassport>(entry as MulticallEntry);
    if (!p) return;
    if (p.verified) verified += 1;
    if (p.status === AssetStatus.RETIRED || p.status === AssetStatus.DESTROYED) terminal += 1;
    kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
    statuses.set(p.status, (statuses.get(p.status) ?? 0) + 1);
  });

  const decoded = results.filter((e) => (e as MulticallEntry).status === "success").length;

  return {
    total,
    scanned: decoded,
    truncated: total > scanned,
    verified,
    unverified: decoded - verified,
    byKind: [...kinds.entries()]
      .map(([kind, count]) => ({ kind, label: kindLabel(kind), count }))
      .sort((a, b) => b.count - a.count),
    byStatus: [...statuses.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    terminal,
  };
}

function kindLabel(kind: number): string {
  const entry = Object.entries(AssetKind).find(([, v]) => v === kind);
  return entry ? entry[0] : `Kind ${kind}`;
}

// ─────────────────────────────────────────────────────────── marketplace ────

export type MarketBreakdown = {
  allTime: number;
  scanned: number;
  truncated: boolean;
  /** Computed with `isListingActive`, never read from the stored status. */
  active: number;
  /** Stored ACTIVE but past its deadline — true by time, unrecorded on-chain. */
  lapsed: number;
  sold: number;
  cancelled: number;
  expiredRecorded: number;
  withLiveEscrow: number;
  offersAllTime: number;
  escrowsAllTime: number;
};

type RawListing = { status: number; expiresAt: number; escrowId: bigint };

export async function readMarketBreakdown(
  client: PublicClient,
  book: AddressBook,
  blockNumber: bigint,
): Promise<MarketBreakdown> {
  const marketplace = requireAddress(book, "MARKETPLACE");

  const [countRaw, offersRaw, escrowsRaw] = await client.multicall({
    contracts: [
      { address: marketplace, abi: marketplaceAbi, functionName: "listingCount" },
      { address: marketplace, abi: marketplaceAbi, functionName: "offerCount" },
      { address: requireAddress(book, "ESCROW_FACTORY"), abi: escrowFactoryAbi, functionName: "escrowCount" },
    ],
    allowFailure: true,
    blockNumber,
  });

  const allTime = Number(value<bigint>(countRaw as MulticallEntry) ?? 0n);
  const scanned = Math.min(allTime, SCAN_LIMIT);
  const ids = Array.from({ length: scanned }, (_, i) => BigInt(allTime - i));

  const results = ids.length
    ? await client.multicall({
        contracts: ids.flatMap((id) => [
          { address: marketplace, abi: marketplaceAbi, functionName: "getListing" as const, args: [id] },
          { address: marketplace, abi: marketplaceAbi, functionName: "isListingActive" as const, args: [id] },
        ]),
        allowFailure: true,
        blockNumber,
      })
    : [];

  let active = 0;
  let lapsed = 0;
  let sold = 0;
  let cancelled = 0;
  let expiredRecorded = 0;
  let withLiveEscrow = 0;
  let decoded = 0;

  ids.forEach((_, i) => {
    const raw = value<RawListing>(results[i * 2] as MulticallEntry);
    const isActive = value<boolean>(results[i * 2 + 1] as MulticallEntry);
    if (!raw) return;
    decoded += 1;

    if (raw.escrowId && raw.escrowId > 0n) withLiveEscrow += 1;

    switch (raw.status) {
      case ListingStatus.SOLD:
        sold += 1;
        break;
      case ListingStatus.CANCELLED:
        cancelled += 1;
        break;
      case ListingStatus.EXPIRED:
        expiredRecorded += 1;
        break;
      case ListingStatus.ACTIVE:
        // The distinction the whole read layer exists for.
        if (isActive) active += 1;
        else lapsed += 1;
        break;
    }
  });

  return {
    allTime,
    scanned: decoded,
    truncated: allTime > scanned,
    active,
    lapsed,
    sold,
    cancelled,
    expiredRecorded,
    withLiveEscrow,
    offersAllTime: Number(value<bigint>(offersRaw as MulticallEntry) ?? 0n),
    escrowsAllTime: Number(value<bigint>(escrowsRaw as MulticallEntry) ?? 0n),
  };
}

// ──────────────────────────────────────────────────────── organizations ────

export type OrgBreakdown = {
  total: number;
  scanned: number;
  truncated: boolean;
  verified: number;
  byStatus: Record<number, number>;
};

export async function readOrgBreakdown(
  client: PublicClient,
  book: AddressBook,
  blockNumber: bigint,
): Promise<OrgBreakdown> {
  const registry = requireAddress(book, "ORGANIZATION_REGISTRY");
  const total = Number(
    await client.readContract({
      address: registry,
      abi: organizationRegistryAbi,
      functionName: "organizationCount",
      blockNumber,
    }),
  );

  const scanned = Math.min(total, SCAN_LIMIT);
  const ids = Array.from({ length: scanned }, (_, i) => BigInt(total - i));

  const results = ids.length
    ? await client.multicall({
        contracts: ids.map((orgId) => ({
          address: registry,
          abi: organizationRegistryAbi,
          functionName: "getOrganization" as const,
          args: [orgId],
        })),
        allowFailure: true,
        blockNumber,
      })
    : [];

  const byStatus: Record<number, number> = {};
  let decoded = 0;

  results.forEach((entry) => {
    const org = value<{ status: number }>(entry as MulticallEntry);
    if (!org) return;
    decoded += 1;
    byStatus[org.status] = (byStatus[org.status] ?? 0) + 1;
  });

  return {
    total,
    scanned: decoded,
    truncated: total > scanned,
    // 2 is VERIFIED. Read from status, never from `verifiedAt != 0` — that field
    // survives suspension and revocation.
    verified: byStatus[2] ?? 0,
    byStatus,
  };
}

// ───────────────────────────────────────────────────────── maintenance ────

export type MaintenanceBreakdown = {
  total: number;
  scanned: number;
  /** Records whose claimed date is more than 30 days before the chain witnessed them. */
  backdated: number;
  /** Median gap in seconds between claimed and recorded. */
  medianGapSeconds: number | null;
  recent: {
    recordId: bigint;
    assetId: bigint;
    orgId: bigint;
    mType: number;
    performedAt: number;
    recordedAt: number;
  }[];
};

type RawMaintenance = {
  assetId: bigint;
  performedByOrgId: bigint;
  documentId: bigint;
  performedAt: number;
  mType: number;
  recordedAt: number;
};

export async function readMaintenanceBreakdown(
  client: PublicClient,
  book: AddressBook,
  blockNumber: bigint,
): Promise<MaintenanceBreakdown> {
  const registry = requireAddress(book, "MAINTENANCE_REGISTRY");
  const total = Number(
    await client.readContract({
      address: registry,
      abi: maintenanceRegistryAbi,
      functionName: "maintenanceCount",
      blockNumber,
    }),
  );

  const scanned = Math.min(total, SCAN_LIMIT);
  const ids = Array.from({ length: scanned }, (_, i) => BigInt(total - i));

  const results = ids.length
    ? await client.multicall({
        contracts: ids.map((recordId) => ({
          address: registry,
          abi: maintenanceRegistryAbi,
          functionName: "getMaintenanceRecord" as const,
          args: [recordId],
        })),
        allowFailure: true,
        blockNumber,
      })
    : [];

  const gaps: number[] = [];
  const recent: MaintenanceBreakdown["recent"] = [];
  let backdated = 0;

  ids.forEach((recordId, i) => {
    const r = value<RawMaintenance>(results[i] as MulticallEntry);
    if (!r) return;
    const gap = r.recordedAt - r.performedAt;
    gaps.push(gap);
    if (gap > 30 * 86_400) backdated += 1;
    if (recent.length < 8) {
      recent.push({
        recordId,
        assetId: r.assetId,
        orgId: r.performedByOrgId,
        mType: r.mType,
        performedAt: r.performedAt,
        recordedAt: r.recordedAt,
      });
    }
  });

  gaps.sort((a, b) => a - b);
  const median = gaps.length
    ? (gaps[Math.floor(gaps.length / 2)] ?? null)
    : null;

  return { total, scanned: gaps.length, backdated, medianGapSeconds: median, recent };
}
