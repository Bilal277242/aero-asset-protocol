import type { Address, Hex, PublicClient } from "viem";
import {
  aircraftRegistryAbi,
  assetOwnershipAbi,
  assetPassportAbi,
  componentRegistryAbi,
  documentRegistryAbi,
  maintenanceRegistryAbi,
  marketplaceAbi,
  organizationRegistryAbi,
} from "@/generated/abis";
import { AssetKind, AssetStatus, ComponentStatus } from "@/generated/enums";
import type { AddressBook } from "@/generated/addresses";
import { atBlock, value, type CallResult } from "./atBlock";

/** What the transfer state actually is, once expiry is accounted for. */
export type TransferState =
  | { kind: "free" }
  | { kind: "frozen" }
  | { kind: "locked"; by: Address }
  /** A direct transfer offer is outstanding and can still be accepted. */
  | { kind: "pending"; to: Address; expiresAt: number }
  /**
   * An offer exists in storage but its deadline has passed. `pendingOwner` is still
   * non-zero — nothing clears it — so reading the field alone says "awaiting
   * acceptance" when `acceptTransfer` would revert `TransferOfferExpired`.
   */
  | { kind: "offerExpired"; to: Address; expiresAt: number };

export type PassportView = {
  assetId: bigint;
  kind: number;
  status: number;
  isTerminal: boolean;
  verified: boolean;
  verifiedAt: number;
  registeredAt: number;
  registrarOrgId: bigint;
  verifierOrgId: bigint;
  serialNumberHash: Hex;
  metadataHash: Hex;
  metadataURI: string | null;

  owner: Address;
  ownedSince: number;
  transfer: TransferState;

  counts: { components: bigint; documents: bigint; maintenance: bigint };

  /** Non-null only when the asset has a genuinely active listing. */
  activeListingId: bigint | null;

  aircraft: AircraftView | null;
  component: ComponentView | null;

  orgs: { registrar: OrgSummary | null; verifier: OrgSummary | null };

  /** The height every field above was read at. */
  blockNumber: bigint;
};

export type AircraftView = {
  manufacturerOrgId: bigint;
  manufactureYear: number;
  category: number;
  model: Hex;
  manufacturerName: Hex;
  registrationMarkHash: Hex;
};

export type ComponentView = {
  parentAssetId: bigint;
  installedAt: number;
  removedAt: number;
  position: number;
  kind: number;
  status: number;
  partNumber: Hex;
  isInstalled: boolean;
};

export type OrgSummary = { orgId: bigint; status: number; nameHash: Hex; verified: boolean };

type RawPassport = {
  assetId: bigint;
  kind: number;
  status: number;
  verified: boolean;
  registrarOrgId: bigint;
  verifierOrgId: bigint;
  registeredAt: number;
  verifiedAt: number;
  serialNumberHash: Hex;
  metadataHash: Hex;
  owner: Address;
  ownedSince: number;
  transferFrozen: boolean;
  lockedBy: Address;
  componentCount: bigint;
  documentCount: bigint;
  maintenanceCount: bigint;
};

type RawOwnership = {
  owner: Address;
  since: number;
  transferFrozen: boolean;
  pendingOwner: Address;
  offerExpiresAt: number;
  lockedBy: Address;
};

/**
 * Everything the passport page needs, at one block height.
 *
 * `AssetPassport.getPassport` is a purpose-built aggregator and does most of the work,
 * but it deliberately omits two things a UI needs: the pending direct transfer
 * (`pendingOwner` / `offerExpiresAt`) and any marketplace state. Both are fetched
 * alongside rather than derived, because guessing either would be wrong.
 *
 * Returns null for an unknown asset rather than throwing — `getPassport` reverts
 * `AssetNotFound`, and a 404 is the caller's decision, not this layer's.
 */
export async function readPassport(
  client: PublicClient,
  book: AddressBook,
  assetId: bigint,
  now: bigint,
): Promise<PassportView | null> {
  return atBlock(client, async (blockNumber) => {
    const [passportResult, ownershipResult, uriResult, listingResult] = await client.multicall({
      contracts: [
        {
          address: book.ASSET_PASSPORT,
          abi: assetPassportAbi,
          functionName: "getPassport",
          args: [assetId],
        },
        {
          address: book.ASSET_OWNERSHIP,
          abi: assetOwnershipAbi,
          functionName: "getOwnership",
          args: [assetId],
        },
        {
          address: book.ASSET_PASSPORT,
          abi: assetPassportAbi,
          functionName: "metadataURI",
          args: [assetId],
        },
        {
          // Already freshness-filtered on-chain: returns 0 when the listing has lapsed
          // by time alone, even though its stored status still reads ACTIVE.
          address: book.MARKETPLACE,
          abi: marketplaceAbi,
          functionName: "activeListingOf",
          args: [assetId],
        },
      ],
      allowFailure: true,
      blockNumber,
    });

    const raw = value<RawPassport>(passportResult as CallResult);
    if (!raw) return null;

    const ownership = value<RawOwnership>(ownershipResult as CallResult);
    const listingId = value<bigint>(listingResult as CallResult);

    // Only ask the specialization registry that matches the kind. `getAircraft` reverts
    // for a component and vice versa, so a blind call to both is two guaranteed failures.
    const [aircraft, component] = await readSpecialization(
      client,
      book,
      assetId,
      raw.kind,
      blockNumber,
    );

    const orgs = await readOrgs(client, book, raw.registrarOrgId, raw.verifierOrgId, blockNumber);

    return {
      assetId: raw.assetId,
      kind: raw.kind,
      status: raw.status,
      isTerminal: raw.status === AssetStatus.RETIRED || raw.status === AssetStatus.DESTROYED,
      verified: raw.verified,
      verifiedAt: raw.verifiedAt,
      registeredAt: raw.registeredAt,
      registrarOrgId: raw.registrarOrgId,
      verifierOrgId: raw.verifierOrgId,
      serialNumberHash: raw.serialNumberHash,
      metadataHash: raw.metadataHash,
      metadataURI: value<string>(uriResult as CallResult) || null,

      owner: raw.owner,
      ownedSince: raw.ownedSince,
      transfer: deriveTransferState(raw, ownership, now),

      counts: {
        components: raw.componentCount,
        documents: raw.documentCount,
        maintenance: raw.maintenanceCount,
      },

      activeListingId: listingId && listingId > 0n ? listingId : null,

      aircraft,
      component,
      orgs,
      blockNumber,
    };
  });
}

/**
 * Transfer state, with expiry applied.
 *
 * The lock and freeze flags come from the passport; the pending-offer fields only exist
 * on the ownership record. An expired offer is reported as such rather than as pending,
 * because the two look identical in storage and only one of them can be accepted.
 */
export function deriveTransferState(
  raw: Pick<RawPassport, "transferFrozen" | "lockedBy">,
  ownership: RawOwnership | null,
  now: bigint,
): TransferState {
  if (raw.transferFrozen) return { kind: "frozen" };
  if (raw.lockedBy && raw.lockedBy !== ZERO) return { kind: "locked", by: raw.lockedBy };

  const pending = ownership?.pendingOwner;
  if (!pending || pending === ZERO) return { kind: "free" };

  const expiresAt = ownership?.offerExpiresAt ?? 0;
  const expired = expiresAt !== 0 && BigInt(expiresAt) <= now;

  return expired
    ? { kind: "offerExpired", to: pending, expiresAt }
    : { kind: "pending", to: pending, expiresAt };
}

async function readSpecialization(
  client: PublicClient,
  book: AddressBook,
  assetId: bigint,
  kind: number,
  blockNumber: bigint,
): Promise<[AircraftView | null, ComponentView | null]> {
  if (kind === AssetKind.AIRCRAFT) {
    const [result] = await client.multicall({
      contracts: [
        {
          address: book.AIRCRAFT_REGISTRY,
          abi: aircraftRegistryAbi,
          functionName: "getAircraft",
          args: [assetId],
        },
      ],
      allowFailure: true,
      blockNumber,
    });
    const raw = value<AircraftView>(result as CallResult);
    return [raw, null];
  }

  if (kind === AssetKind.ENGINE || kind === AssetKind.APU || kind === AssetKind.COMPONENT) {
    const [result] = await client.multicall({
      contracts: [
        {
          address: book.COMPONENT_REGISTRY,
          abi: componentRegistryAbi,
          functionName: "getComponent",
          args: [assetId],
        },
      ],
      allowFailure: true,
      blockNumber,
    });
    const raw = value<Omit<ComponentView, "isInstalled">>(result as CallResult);
    return [null, raw ? { ...raw, isInstalled: raw.status === ComponentStatus.INSTALLED } : null];
  }

  return [null, null];
}

async function readOrgs(
  client: PublicClient,
  book: AddressBook,
  registrarOrgId: bigint,
  verifierOrgId: bigint,
  blockNumber: bigint,
): Promise<{ registrar: OrgSummary | null; verifier: OrgSummary | null }> {
  const wanted = [registrarOrgId, verifierOrgId].filter((id) => id > 0n);
  if (wanted.length === 0) return { registrar: null, verifier: null };

  const results = await client.multicall({
    contracts: wanted.map((orgId) => ({
      address: book.ORGANIZATION_REGISTRY,
      abi: organizationRegistryAbi,
      functionName: "getOrganization" as const,
      args: [orgId],
    })),
    allowFailure: true,
    blockNumber,
  });

  const byId = new Map<bigint, OrgSummary>();
  wanted.forEach((orgId, i) => {
    const raw = value<{ status: number; nameHash: Hex }>(results[i] as CallResult);
    if (!raw) return;
    // `verifiedAt` survives suspension and revocation, so current standing must come
    // from `status`, never from `verifiedAt != 0`.
    byId.set(orgId, {
      orgId,
      status: raw.status,
      nameHash: raw.nameHash,
      verified: raw.status === ORG_VERIFIED,
    });
  });

  return {
    registrar: byId.get(registrarOrgId) ?? null,
    verifier: byId.get(verifierOrgId) ?? null,
  };
}

/** One page of ids from a paginated accessor, read at a caller-fixed height. */
export async function readAssetPage(
  client: PublicClient,
  book: AddressBook,
  which: "components" | "documents" | "maintenance",
  assetId: bigint,
  offset: bigint,
  limit: bigint,
  blockNumber: bigint,
): Promise<bigint[]> {
  const ids = await client.readContract({
    address: book.ASSET_PASSPORT,
    abi: assetPassportAbi,
    functionName: which,
    args: [assetId, offset, limit],
    blockNumber,
  });
  return [...(ids as readonly bigint[])];
}

export type DocumentView = {
  documentId: bigint;
  assetId: bigint;
  issuerOrgId: bigint;
  supersededById: bigint;
  issuedAt: number;
  docType: number;
  status: number;
  documentHash: Hex;
  uri: string | null;
};

export async function readDocuments(
  client: PublicClient,
  book: AddressBook,
  ids: bigint[],
  blockNumber: bigint,
): Promise<DocumentView[]> {
  if (ids.length === 0) return [];

  const results = await client.multicall({
    contracts: ids.flatMap((id) => [
      {
        address: book.DOCUMENT_REGISTRY,
        abi: documentRegistryAbi,
        functionName: "getDocument" as const,
        args: [id],
      },
      {
        address: book.DOCUMENT_REGISTRY,
        abi: documentRegistryAbi,
        functionName: "documentURI" as const,
        args: [id],
      },
    ]),
    allowFailure: true,
    blockNumber,
  });

  return ids.flatMap((documentId, i) => {
    const raw = value<Omit<DocumentView, "documentId" | "uri">>(results[i * 2] as CallResult);
    if (!raw) return [];
    const uri = value<string>(results[i * 2 + 1] as CallResult);
    return [{ ...raw, documentId, uri: uri || null }];
  });
}

export type MaintenanceView = {
  recordId: bigint;
  assetId: bigint;
  performedByOrgId: bigint;
  documentId: bigint;
  performedAt: number;
  mType: number;
  recordedAt: number;
  recordHash: Hex;
};

export async function readMaintenance(
  client: PublicClient,
  book: AddressBook,
  ids: bigint[],
  blockNumber: bigint,
): Promise<MaintenanceView[]> {
  if (ids.length === 0) return [];

  const results = await client.multicall({
    contracts: ids.map((id) => ({
      address: book.MAINTENANCE_REGISTRY,
      abi: maintenanceRegistryAbi,
      functionName: "getMaintenanceRecord" as const,
      args: [id],
    })),
    allowFailure: true,
    blockNumber,
  });

  return ids.flatMap((recordId, i) => {
    const raw = value<Omit<MaintenanceView, "recordId">>(results[i] as CallResult);
    return raw ? [{ ...raw, recordId }] : [];
  });
}

const ZERO = "0x0000000000000000000000000000000000000000";
const ORG_VERIFIED = 2;
