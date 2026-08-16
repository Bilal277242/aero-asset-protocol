import type { Address, PublicClient } from "viem";
import {
  assetRegistryAbi,
  credentialRegistryAbi,
  documentRegistryAbi,
  escrowFactoryAbi,
  maintenanceRegistryAbi,
  marketplaceAbi,
  organizationRegistryAbi,
} from "@/lib/contracts/generated/abis";
import {
  assetKindLabel,
  listingStatusLabel,
  maintenanceTypeLabel,
  organizationStatusLabel,
} from "@/lib/contracts/generated/enums";
import type { AddressBook } from "@/lib/contracts/addressBook";
import { abiEvent, blockTimes, scanLogs, type ScannedLog } from "./logs";

/**
 * The protocol activity feed.
 *
 * Assembled from event logs because the contracts expose no chronological index — there
 * is no `recentEvents()` and no enumeration by time. The events were designed to be
 * sufficient to rebuild state off-chain, which is exactly what this does at a small
 * scale.
 *
 * **Logs supply the record of what happened, not the current state.** A listing that has
 * since been cancelled still has its original `ListingCreated` sitting in the chain,
 * unchanged. This feed is deliberately historical — it says "this happened", never "this
 * is true now" — and anything that needs current state reads it separately.
 */

export type ActivityCategory =
  | "asset"
  | "verification"
  | "market"
  | "settlement"
  | "provenance"
  | "identity";

export type ActivityItem = {
  id: string;
  category: ActivityCategory;
  title: string;
  detail: string;
  blockNumber: bigint;
  timestamp: number | null;
  txHash: `0x${string}`;
  href?: string;
};

const n = (v: unknown) => String(v ?? "");
const shortAddr = (v: unknown) => {
  const s = String(v ?? "");
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
};

/** One source of events: which contract, which event, and how to describe it. */
type Source = {
  key: keyof AddressBook & string;
  abi: readonly unknown[];
  event: string;
  category: ActivityCategory;
  describe: (args: Record<string, unknown>) => { title: string; detail: string; href?: string };
  /** Drops entries that duplicate another source. */
  skip?: (args: Record<string, unknown>) => boolean;
};

const SOURCES: Source[] = [
  {
    key: "ASSET_REGISTRY",
    abi: assetRegistryAbi,
    event: "AssetRegistered",
    category: "asset",
    describe: (a) => ({
      title: `${assetKindLabel[Number(a.kind)] ?? "Asset"} registered`,
      detail: `Asset #${n(a.assetId)} by organization #${n(a.registrarOrgId)}, owned by ${shortAddr(a.owner)}`,
      href: `/assets/${n(a.assetId)}`,
    }),
  },
  {
    key: "ASSET_REGISTRY",
    abi: assetRegistryAbi,
    event: "AssetVerificationChanged",
    category: "verification",
    describe: (a) => ({
      title: a.verified ? "Asset verified" : "Asset verification withdrawn",
      detail: `Asset #${n(a.assetId)}${a.verified ? ` credited to organization #${n(a.verifierOrgId)}` : ""}`,
      href: `/assets/${n(a.assetId)}`,
    }),
  },
  {
    key: "ASSET_REGISTRY",
    abi: assetRegistryAbi,
    event: "AssetStatusChanged",
    category: "asset",
    describe: (a) => ({
      title: "Asset status changed",
      detail: `Asset #${n(a.assetId)} moved to status ${n(a.newStatus)}`,
      href: `/assets/${n(a.assetId)}`,
    }),
  },
  {
    key: "ORGANIZATION_REGISTRY",
    abi: organizationRegistryAbi,
    event: "OrganizationRegistered",
    category: "identity",
    describe: (a) => ({
      title: "Organization registered",
      detail: `Organization #${n(a.orgId)}, administered by ${shortAddr(a.admin)}`,
    }),
  },
  {
    key: "ORGANIZATION_REGISTRY",
    abi: organizationRegistryAbi,
    event: "OrganizationStatusChanged",
    category: "identity",
    describe: (a) => ({
      title: `Organization ${(organizationStatusLabel[Number(a.newStatus)] ?? "status changed").toLowerCase()}`,
      detail: `Organization #${n(a.orgId)}, by ${shortAddr(a.by)}`,
    }),
  },
  {
    key: "CREDENTIAL_REGISTRY",
    abi: credentialRegistryAbi,
    event: "CredentialIssued",
    category: "identity",
    describe: (a) => ({
      title: "Credential issued",
      detail: `Credential #${n(a.credentialId)} to organization #${n(a.subjectOrgId)}, issued by #${n(a.issuerOrgId)}`,
    }),
  },
  {
    key: "DOCUMENT_REGISTRY",
    abi: documentRegistryAbi,
    event: "DocumentRegistered",
    category: "provenance",
    describe: (a) => ({
      title: "Document registered",
      detail: `Document #${n(a.documentId)} against asset #${n(a.assetId)}`,
      href: `/assets/${n(a.assetId)}`,
    }),
  },
  {
    key: "MAINTENANCE_REGISTRY",
    abi: maintenanceRegistryAbi,
    event: "MaintenanceRecorded",
    category: "provenance",
    describe: (a) => ({
      title: `${maintenanceTypeLabel[Number(a.mType)] ?? "Maintenance"} recorded`,
      detail: `Asset #${n(a.assetId)} by organization #${n(a.performedByOrgId)}`,
      href: `/assets/${n(a.assetId)}`,
    }),
  },
  {
    key: "MARKETPLACE",
    abi: marketplaceAbi,
    event: "ListingCreated",
    category: "market",
    describe: (a) => ({
      title: "Listing created",
      detail: `Listing #${n(a.listingId)} for asset #${n(a.assetId)} by ${shortAddr(a.seller)}`,
      href: `/marketplace`,
    }),
  },
  {
    key: "MARKETPLACE",
    abi: marketplaceAbi,
    event: "ListingStatusChanged",
    category: "market",
    // Creation emits both `ListingCreated` and a NONE -> ACTIVE status change in the same
    // transaction. Showing both puts two entries on one event, which makes the feed look
    // busier than the protocol actually was.
    skip: (a) => Number(a.oldStatus) === 0,
    describe: (a) => ({
      title: `Listing ${(listingStatusLabel[Number(a.newStatus)] ?? "changed").toLowerCase()}`,
      detail: `Listing #${n(a.listingId)}`,
      href: `/marketplace`,
    }),
  },
  {
    key: "MARKETPLACE",
    abi: marketplaceAbi,
    event: "OfferMade",
    category: "market",
    describe: (a) => ({
      title: "Offer made",
      detail: `Offer #${n(a.offerId)} on listing #${n(a.listingId)} by ${shortAddr(a.buyer)}`,
      href: `/marketplace`,
    }),
  },
  {
    key: "ESCROW_FACTORY",
    abi: escrowFactoryAbi,
    event: "EscrowOpened",
    category: "settlement",
    describe: (a) => ({
      title: "Escrow opened",
      detail: `Escrow #${n(a.escrowId)} for listing #${n(a.listingId)} at ${shortAddr(a.escrow)}`,
    }),
  },
];

export async function readActivity(
  client: PublicClient,
  book: AddressBook,
  fromBlock: bigint,
  toBlock: bigint,
  limit = 25,
): Promise<{ items: ActivityItem[]; scannedFrom: bigint; scannedTo: bigint }> {
  const scans = SOURCES.filter((s) => book[s.key]).map(async (source) => {
    try {
      const logs = await scanLogs(client, {
        address: book[source.key] as Address,
        event: abiEvent(source.abi, source.event),
        fromBlock,
        toBlock,
      });
      return logs
        .filter((log) => !source.skip?.(log.args))
        .map((log) => ({ log, source }));
    } catch {
      // One unavailable event stream must not empty the whole feed.
      return [] as { log: ScannedLog; source: Source }[];
    }
  });

  const collected = (await Promise.all(scans)).flat();

  collected.sort((a, b) => {
    if (a.log.blockNumber !== b.log.blockNumber) {
      return a.log.blockNumber > b.log.blockNumber ? -1 : 1;
    }
    return b.log.logIndex - a.log.logIndex;
  });

  const top = collected.slice(0, limit);
  const times = await blockTimes(
    client,
    top.map((c) => c.log.blockNumber),
  );

  const items: ActivityItem[] = top.map(({ log, source }) => {
    const described = source.describe(log.args);
    return {
      id: `${log.transactionHash}-${log.logIndex}`,
      category: source.category,
      title: described.title,
      detail: described.detail,
      href: described.href,
      blockNumber: log.blockNumber,
      timestamp: times.get(log.blockNumber) ?? null,
      txHash: log.transactionHash,
    };
  });

  return { items, scannedFrom: fromBlock, scannedTo: toBlock };
}
