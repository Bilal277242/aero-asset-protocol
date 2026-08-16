import type { Address, PublicClient } from "viem";
import {
  aircraftRegistryAbi,
  assetOwnershipAbi,
  assetRegistryAbi,
  componentRegistryAbi,
  documentRegistryAbi,
  maintenanceRegistryAbi,
  marketplaceAbi,
} from "@/lib/contracts/generated/abis";
import { maintenanceTypeLabel, assetStatusLabel } from "@/lib/contracts/generated/enums";
import type { AddressBook } from "@/lib/contracts/addressBook";
import { abiEvent, blockTimes, scanLogs } from "./logs";

/**
 * One asset's on-chain history.
 *
 * Every event below indexes `assetId`, so the provider does the filtering rather than the
 * browser. This is the closest thing the protocol has to a logbook: an append-only
 * sequence of who did what, when, and in which transaction.
 *
 * The timeline is deliberately **historical**. It records what happened; it never asserts
 * what is true now. A transfer that was later reversed still has its original event, and
 * the passport reads current state separately.
 */

export type TimelineEntry = {
  id: string;
  kind:
    | "registered"
    | "verification"
    | "status"
    | "ownership"
    | "component"
    | "document"
    | "maintenance"
    | "market"
    | "lock";
  title: string;
  detail: string;
  blockNumber: bigint;
  timestamp: number | null;
  txHash: `0x${string}`;
};

const n = (v: unknown) => String(v ?? "");
const short = (v: unknown) => {
  const s = String(v ?? "");
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
};

type Source = {
  key: keyof AddressBook & string;
  abi: readonly unknown[];
  event: string;
  /** Which indexed argument carries the asset id. */
  filter: (assetId: bigint) => Record<string, unknown>;
  kind: TimelineEntry["kind"];
  describe: (args: Record<string, unknown>) => { title: string; detail: string };
};

const SOURCES: Source[] = [
  {
    key: "ASSET_REGISTRY",
    abi: assetRegistryAbi,
    event: "AssetRegistered",
    filter: (assetId) => ({ assetId }),
    kind: "registered",
    describe: (a) => ({
      title: "Asset registered",
      detail: `By organization #${n(a.registrarOrgId)}, first owner ${short(a.owner)}`,
    }),
  },
  {
    key: "AIRCRAFT_REGISTRY",
    abi: aircraftRegistryAbi,
    event: "AircraftRegistered",
    filter: (assetId) => ({ assetId }),
    kind: "registered",
    describe: (a) => ({
      title: "Airframe record created",
      detail: `Built ${n(a.manufactureYear)}`,
    }),
  },
  {
    key: "COMPONENT_REGISTRY",
    abi: componentRegistryAbi,
    event: "ComponentRegistered",
    filter: (assetId) => ({ assetId }),
    kind: "registered",
    describe: () => ({ title: "Component record created", detail: "" }),
  },
  {
    key: "ASSET_REGISTRY",
    abi: assetRegistryAbi,
    event: "AssetVerificationChanged",
    filter: (assetId) => ({ assetId }),
    kind: "verification",
    describe: (a) => ({
      title: a.verified ? "Protocol verification recorded" : "Protocol verification withdrawn",
      detail: a.verified
        ? `Attested by an asset verifier, credited to organization #${n(a.verifierOrgId)}`
        : `Withdrawn by ${short(a.by)}`,
    }),
  },
  {
    key: "ASSET_REGISTRY",
    abi: assetRegistryAbi,
    event: "AssetStatusChanged",
    filter: (assetId) => ({ assetId }),
    kind: "status",
    describe: (a) => ({
      title: "Operational status changed",
      detail: `${assetStatusLabel[Number(a.oldStatus)] ?? n(a.oldStatus)} → ${
        assetStatusLabel[Number(a.newStatus)] ?? n(a.newStatus)
      }`,
    }),
  },
  {
    key: "ASSET_OWNERSHIP",
    abi: assetOwnershipAbi,
    event: "OwnershipInitialized",
    filter: (assetId) => ({ assetId }),
    kind: "ownership",
    describe: (a) => ({ title: "Ownership opened", detail: `First owner ${short(a.owner)}` }),
  },
  {
    key: "ASSET_OWNERSHIP",
    abi: assetOwnershipAbi,
    event: "OwnershipTransferred",
    filter: (assetId) => ({ assetId }),
    kind: "ownership",
    describe: (a) => ({
      title: "Ownership transferred",
      detail: `${short(a.from)} → ${short(a.to)}`,
    }),
  },
  {
    key: "ASSET_OWNERSHIP",
    abi: assetOwnershipAbi,
    event: "TransferLockChanged",
    filter: (assetId) => ({ assetId }),
    kind: "lock",
    describe: (a) => ({
      title: String(a.lockedBy) === "0x0000000000000000000000000000000000000000"
        ? "Settlement lock released"
        : "Settlement lock taken",
      detail: `By ${short(a.by)}`,
    }),
  },
  {
    key: "COMPONENT_REGISTRY",
    abi: componentRegistryAbi,
    event: "ComponentInstalled",
    filter: (assetId) => ({ parentAssetId: assetId }),
    kind: "component",
    describe: (a) => ({
      title: "Component installed",
      detail: `Asset #${n(a.componentAssetId)} at position ${n(a.position)}`,
    }),
  },
  {
    key: "COMPONENT_REGISTRY",
    abi: componentRegistryAbi,
    event: "ComponentRemoved",
    filter: (assetId) => ({ previousParentAssetId: assetId }),
    kind: "component",
    describe: (a) => ({
      title: "Component removed",
      detail: `Asset #${n(a.componentAssetId)} detached`,
    }),
  },
  {
    key: "DOCUMENT_REGISTRY",
    abi: documentRegistryAbi,
    event: "DocumentRegistered",
    filter: (assetId) => ({ assetId }),
    kind: "document",
    describe: (a) => ({
      title: "Document registered",
      detail: `Document #${n(a.documentId)} by organization #${n(a.issuerOrgId)}`,
    }),
  },
  {
    key: "MAINTENANCE_REGISTRY",
    abi: maintenanceRegistryAbi,
    event: "MaintenanceRecorded",
    filter: (assetId) => ({ assetId }),
    kind: "maintenance",
    describe: (a) => ({
      title: `${maintenanceTypeLabel[Number(a.mType)] ?? "Maintenance"} recorded`,
      detail: `By organization #${n(a.performedByOrgId)} under credential #${n(a.credentialId)}`,
    }),
  },
  {
    key: "MARKETPLACE",
    abi: marketplaceAbi,
    event: "ListingCreated",
    filter: (assetId) => ({ assetId }),
    kind: "market",
    describe: (a) => ({
      title: "Listed for sale",
      detail: `Listing #${n(a.listingId)} by ${short(a.seller)}`,
    }),
  },
];

export async function readAssetTimeline(
  client: PublicClient,
  book: AddressBook,
  assetId: bigint,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<TimelineEntry[]> {
  const scans = SOURCES.filter((s) => book[s.key]).map(async (source) => {
    try {
      const logs = await scanLogs(client, {
        address: book[source.key] as Address,
        event: abiEvent(source.abi, source.event),
        args: source.filter(assetId),
        fromBlock,
        toBlock,
      });
      return logs.map((log) => ({ log, source }));
    } catch {
      // One unavailable stream must not empty the whole logbook.
      return [];
    }
  });

  const collected = (await Promise.all(scans)).flat();

  collected.sort((a, b) => {
    if (a.log.blockNumber !== b.log.blockNumber) {
      return a.log.blockNumber > b.log.blockNumber ? -1 : 1;
    }
    return b.log.logIndex - a.log.logIndex;
  });

  const times = await blockTimes(
    client,
    collected.map((c) => c.log.blockNumber),
  );

  return collected.map(({ log, source }) => {
    const described = source.describe(log.args);
    return {
      id: `${log.transactionHash}-${log.logIndex}`,
      kind: source.kind,
      title: described.title,
      detail: described.detail,
      blockNumber: log.blockNumber,
      timestamp: times.get(log.blockNumber) ?? null,
      txHash: log.transactionHash,
    };
  });
}
