import type { Address, Hex, PublicClient } from "viem";
import {
  aircraftRegistryAbi,
  assetOwnershipAbi,
  assetPassportAbi,
  assetRegistryAbi,
  componentRegistryAbi,
  credentialRegistryAbi,
  documentRegistryAbi,
  maintenanceRegistryAbi,
  marketplaceAbi,
  organizationRegistryAbi,
} from "@/lib/contracts/generated/abis";
import {
  AssetKind,
  AssetStatus,
  ComponentStatus,
  CredentialType,
} from "@/lib/contracts/generated/enums";
import { requireAddress, type AddressBook } from "@/lib/contracts/addressBook";
import { value } from "@/hooks/useContractRead";

/**
 * The asset passport.
 *
 * `AssetPassport` is a purpose-built aggregator that owns no storage of its own, so it
 * cannot disagree with the registries it reads. It does, however, deliberately omit two
 * things a complete record needs — the pending direct transfer, and any marketplace
 * state — so both are fetched alongside rather than inferred.
 *
 * Everything here is pinned to one block height. That is not tidiness: `componentsOf` is
 * a swap-and-pop array, so paging across a removal skips one entry and duplicates
 * another; and a stored status read at block N can contradict its effective-status check
 * at N+1.
 */

type Entry = { status: "success"; result: unknown } | { status: "failure" };

const ZERO = "0x0000000000000000000000000000000000000000";
const PAGE = 50n;

// ─────────────────────────────────────────────────────────────── types ────

/** Transfer state with expiry applied. */
export type TransferState =
  | { kind: "free" }
  | { kind: "frozen" }
  | { kind: "locked"; by: Address }
  | { kind: "pending"; to: Address; expiresAt: number }
  /**
   * An offer exists in storage but its deadline has passed. `pendingOwner` is still
   * non-zero — nothing clears it — so reading the field alone reports "awaiting
   * acceptance" for an offer `acceptTransfer` would revert on.
   */
  | { kind: "offerExpired"; to: Address; expiresAt: number };

export type OrgSummary = {
  orgId: bigint;
  status: number;
  orgType: number;
  nameHash: Hex;
  verified: boolean;
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

export type InstalledComponent = {
  assetId: bigint;
  partNumber: Hex;
  kind: number;
  status: number;
  position: number;
  installedAt: number;
  verified: boolean;
};

export type DocumentView = {
  documentId: bigint;
  assetId: bigint;
  issuerOrgId: bigint;
  supersededById: bigint;
  issuedAt: number;
  docType: number;
  status: number;
  documentHash: Hex;
  /** Off-chain location. Rendered as text, never fetched. */
  uri: string | null;
};

export type MaintenanceView = {
  recordId: bigint;
  assetId: bigint;
  performedByOrgId: bigint;
  documentId: bigint;
  performedAt: number;
  mType: number;
  recordedAt: number;
  recordHash: Hex;
  /** Gap between the claimed date and the date the chain witnessed the record. */
  gapSeconds: number;
};

export type CredentialView = {
  credentialId: bigint;
  subjectOrgId: bigint;
  issuerOrgId: bigint;
  credType: number;
  status: number;
  issuedAt: number;
  expiresAt: number;
  /** Computed, never read from `status` alone — a credential expires by time. */
  isValid: boolean;
};

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
  activeListingId: bigint | null;

  aircraft: AircraftView | null;
  component: ComponentView | null;

  orgs: { registrar: OrgSummary | null; verifier: OrgSummary | null };

  blockNumber: bigint;
};

// ──────────────────────────────────────────────────────────── readers ────

export async function readPassport(
  client: PublicClient,
  book: AddressBook,
  assetId: bigint,
  blockNumber: bigint,
  now: bigint,
): Promise<PassportView | null> {
  const [passportResult, ownershipResult, uriResult, listingResult] = await client.multicall({
    contracts: [
      {
        address: requireAddress(book, "ASSET_PASSPORT"),
        abi: assetPassportAbi,
        functionName: "getPassport",
        args: [assetId],
      },
      {
        address: requireAddress(book, "ASSET_OWNERSHIP"),
        abi: assetOwnershipAbi,
        functionName: "getOwnership",
        args: [assetId],
      },
      {
        address: requireAddress(book, "ASSET_PASSPORT"),
        abi: assetPassportAbi,
        functionName: "metadataURI",
        args: [assetId],
      },
      {
        // Already freshness-filtered on-chain: returns 0 when the listing has lapsed by
        // time alone, even though its stored status still reads ACTIVE.
        address: requireAddress(book, "MARKETPLACE"),
        abi: marketplaceAbi,
        functionName: "activeListingOf",
        args: [assetId],
      },
    ],
    allowFailure: true,
    blockNumber,
  });

  const raw = value<{
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
  }>(passportResult as Entry);

  if (!raw) return null;

  const ownership = value<{
    owner: Address;
    since: number;
    transferFrozen: boolean;
    pendingOwner: Address;
    offerExpiresAt: number;
    lockedBy: Address;
  }>(ownershipResult as Entry);

  const listingId = value<bigint>(listingResult as Entry);

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
    metadataURI: value<string>(uriResult as Entry) || null,

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
}

export function deriveTransferState(
  raw: { transferFrozen: boolean; lockedBy: Address },
  ownership: { pendingOwner?: Address; offerExpiresAt?: number } | null,
  now: bigint,
): TransferState {
  if (raw.transferFrozen) return { kind: "frozen" };
  if (raw.lockedBy && raw.lockedBy !== ZERO) return { kind: "locked", by: raw.lockedBy };

  const pending = ownership?.pendingOwner;
  if (!pending || pending === ZERO) return { kind: "free" };

  const expiresAt = ownership?.offerExpiresAt ?? 0;
  // `acceptTransfer` reverts when `offerExpiresAt <= block.timestamp`, so the deadline
  // second itself is already too late.
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
  // Only ask the registry matching the kind: `getAircraft` reverts for a component and
  // vice versa, so a blind call to both is one guaranteed failure per asset.
  if (kind === AssetKind.AIRCRAFT) {
    const [result] = await client.multicall({
      contracts: [
        {
          address: requireAddress(book, "AIRCRAFT_REGISTRY"),
          abi: aircraftRegistryAbi,
          functionName: "getAircraft",
          args: [assetId],
        },
      ],
      allowFailure: true,
      blockNumber,
    });
    return [value<AircraftView>(result as Entry), null];
  }

  if (kind === AssetKind.ENGINE || kind === AssetKind.APU || kind === AssetKind.COMPONENT) {
    const [result] = await client.multicall({
      contracts: [
        {
          address: requireAddress(book, "COMPONENT_REGISTRY"),
          abi: componentRegistryAbi,
          functionName: "getComponent",
          args: [assetId],
        },
      ],
      allowFailure: true,
      blockNumber,
    });
    const raw = value<Omit<ComponentView, "isInstalled">>(result as Entry);
    return [
      null,
      raw ? { ...raw, isInstalled: raw.status === ComponentStatus.INSTALLED } : null,
    ];
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
  const wanted = [...new Set([registrarOrgId, verifierOrgId].filter((id) => id > 0n).map(String))].map(
    BigInt,
  );
  if (wanted.length === 0) return { registrar: null, verifier: null };

  const results = await client.multicall({
    contracts: wanted.map((orgId) => ({
      address: requireAddress(book, "ORGANIZATION_REGISTRY"),
      abi: organizationRegistryAbi,
      functionName: "getOrganization" as const,
      args: [orgId],
    })),
    allowFailure: true,
    blockNumber,
  });

  const byId = new Map<string, OrgSummary>();
  wanted.forEach((orgId, i) => {
    const raw = value<{ status: number; orgType: number; nameHash: Hex }>(results[i] as Entry);
    if (!raw) return;
    byId.set(orgId.toString(), {
      orgId,
      status: raw.status,
      orgType: raw.orgType,
      nameHash: raw.nameHash,
      // Current standing comes from `status`. `verifiedAt` survives suspension and
      // revocation, so it cannot answer "is this org verified now".
      verified: raw.status === 2,
    });
  });

  return {
    registrar: byId.get(registrarOrgId.toString()) ?? null,
    verifier: byId.get(verifierOrgId.toString()) ?? null,
  };
}

// ───────────────────────────────────────────────────────── components ────

export async function readInstalledComponents(
  client: PublicClient,
  book: AddressBook,
  assetId: bigint,
  blockNumber: bigint,
): Promise<InstalledComponent[]> {
  const ids = (await client.readContract({
    address: requireAddress(book, "ASSET_PASSPORT"),
    abi: assetPassportAbi,
    functionName: "components",
    args: [assetId, 0n, PAGE],
    blockNumber,
  })) as readonly bigint[];

  if (ids.length === 0) return [];

  const results = await client.multicall({
    contracts: ids.flatMap((id) => [
      {
        address: requireAddress(book, "COMPONENT_REGISTRY"),
        abi: componentRegistryAbi,
        functionName: "getComponent" as const,
        args: [id],
      },
      {
        address: requireAddress(book, "ASSET_REGISTRY"),
        abi: assetRegistryAbi,
        functionName: "isVerified" as const,
        args: [id],
      },
    ]),
    allowFailure: true,
    blockNumber,
  });

  return ids.flatMap((assetIdOfComponent, i) => {
    const c = value<ComponentView>(results[i * 2] as Entry);
    if (!c) return [];
    return [
      {
        assetId: assetIdOfComponent,
        partNumber: c.partNumber,
        kind: c.kind,
        status: c.status,
        position: c.position,
        installedAt: c.installedAt,
        verified: value<boolean>(results[i * 2 + 1] as Entry) ?? false,
      },
    ];
  });
}

// ────────────────────────────────────────────────────────── documents ────

export async function readDocuments(
  client: PublicClient,
  book: AddressBook,
  assetId: bigint,
  blockNumber: bigint,
): Promise<DocumentView[]> {
  const ids = (await client.readContract({
    address: requireAddress(book, "ASSET_PASSPORT"),
    abi: assetPassportAbi,
    functionName: "documents",
    args: [assetId, 0n, PAGE],
    blockNumber,
  })) as readonly bigint[];

  if (ids.length === 0) return [];

  const results = await client.multicall({
    contracts: ids.flatMap((id) => [
      {
        address: requireAddress(book, "DOCUMENT_REGISTRY"),
        abi: documentRegistryAbi,
        functionName: "getDocument" as const,
        args: [id],
      },
      {
        address: requireAddress(book, "DOCUMENT_REGISTRY"),
        abi: documentRegistryAbi,
        functionName: "documentURI" as const,
        args: [id],
      },
    ]),
    allowFailure: true,
    blockNumber,
  });

  return ids.flatMap((documentId, i) => {
    const d = value<Omit<DocumentView, "documentId" | "uri">>(results[i * 2] as Entry);
    if (!d) return [];
    return [{ ...d, documentId, uri: value<string>(results[i * 2 + 1] as Entry) || null }];
  });
}

// ──────────────────────────────────────────────────────── maintenance ────

export async function readMaintenance(
  client: PublicClient,
  book: AddressBook,
  assetId: bigint,
  blockNumber: bigint,
): Promise<MaintenanceView[]> {
  const ids = (await client.readContract({
    address: requireAddress(book, "ASSET_PASSPORT"),
    abi: assetPassportAbi,
    functionName: "maintenance",
    args: [assetId, 0n, PAGE],
    blockNumber,
  })) as readonly bigint[];

  if (ids.length === 0) return [];

  const results = await client.multicall({
    contracts: ids.map((id) => ({
      address: requireAddress(book, "MAINTENANCE_REGISTRY"),
      abi: maintenanceRegistryAbi,
      functionName: "getMaintenanceRecord" as const,
      args: [id],
    })),
    allowFailure: true,
    blockNumber,
  });

  return ids.flatMap((recordId, i) => {
    const r = value<Omit<MaintenanceView, "recordId" | "gapSeconds">>(results[i] as Entry);
    if (!r) return [];
    return [{ ...r, recordId, gapSeconds: r.recordedAt - r.performedAt }];
  });
}

// ─────────────────────────────────────────────────────────── credentials ────

/**
 * Credentials held by the organizations connected to this asset.
 *
 * An asset never holds a credential — credentials belong to organizations. What matters
 * on a passport is whether the organizations that registered, verified or maintained it
 * were and are authorised, so those are the credentials shown.
 *
 * `isValid` is computed by the contract rather than read from `status`, because a
 * credential can expire by time alone with no transaction recording it.
 */
export async function readOrgCredentials(
  client: PublicClient,
  book: AddressBook,
  orgIds: bigint[],
  blockNumber: bigint,
): Promise<CredentialView[]> {
  const unique = [...new Set(orgIds.filter((id) => id > 0n).map(String))].map(BigInt);
  if (unique.length === 0) return [];

  const types = Object.values(CredentialType).filter((t) => t !== CredentialType.UNSPECIFIED);
  const pairs = unique.flatMap((orgId) => types.map((credType) => ({ orgId, credType })));

  const lookups = await client.multicall({
    contracts: pairs.map(({ orgId, credType }) => ({
      address: requireAddress(book, "CREDENTIAL_REGISTRY"),
      abi: credentialRegistryAbi,
      functionName: "validCredentialOfType" as const,
      args: [orgId, credType],
    })),
    allowFailure: true,
    blockNumber,
  });

  const found = pairs
    .map((_, i) => value<bigint>(lookups[i] as Entry))
    .filter((id): id is bigint => id !== null && id > 0n);

  const credentialIds = [...new Set(found.map(String))].map(BigInt);
  if (credentialIds.length === 0) return [];

  const details = await client.multicall({
    contracts: credentialIds.flatMap((id) => [
      {
        address: requireAddress(book, "CREDENTIAL_REGISTRY"),
        abi: credentialRegistryAbi,
        functionName: "getCredential" as const,
        args: [id],
      },
      {
        address: requireAddress(book, "CREDENTIAL_REGISTRY"),
        abi: credentialRegistryAbi,
        functionName: "isValid" as const,
        args: [id],
      },
    ]),
    allowFailure: true,
    blockNumber,
  });

  return credentialIds.flatMap((credentialId, i) => {
    const c = value<{
      issuerOrgId: bigint;
      subjectOrgId: bigint;
      issuedAt: number;
      expiresAt: number;
      credType: number;
      status: number;
    }>(details[i * 2] as Entry);
    if (!c) return [];
    return [
      {
        credentialId,
        subjectOrgId: c.subjectOrgId,
        issuerOrgId: c.issuerOrgId,
        credType: c.credType,
        status: c.status,
        issuedAt: c.issuedAt,
        expiresAt: c.expiresAt,
        isValid: value<boolean>(details[i * 2 + 1] as Entry) ?? false,
      },
    ];
  });
}

// ──────────────────────────────────────────────────────────── index ────

export type AssetSummary = {
  assetId: bigint;
  kind: number;
  status: number;
  verified: boolean;
  owner: Address;
  registeredAt: number;
  label: Hex | null;
  componentCount: bigint;
  documentCount: bigint;
};

/** The register index. Walks ids descending because there is no enumeration by owner. */
export async function readAssetIndex(
  client: PublicClient,
  book: AddressBook,
  blockNumber: bigint,
  limit = 100,
): Promise<{ items: AssetSummary[]; total: number; truncated: boolean }> {
  const total = Number(
    await client.readContract({
      address: requireAddress(book, "ASSET_REGISTRY"),
      abi: assetRegistryAbi,
      functionName: "assetCount",
      blockNumber,
    }),
  );

  const take = Math.min(total, limit);
  const ids = Array.from({ length: take }, (_, i) => BigInt(total - i));
  if (ids.length === 0) return { items: [], total, truncated: false };

  const passports = await client.multicall({
    contracts: ids.map((assetId) => ({
      address: requireAddress(book, "ASSET_PASSPORT"),
      abi: assetPassportAbi,
      functionName: "getPassport" as const,
      args: [assetId],
    })),
    allowFailure: true,
    blockNumber,
  });

  const decoded = ids.flatMap((assetId, i) => {
    const p = value<{
      kind: number;
      status: number;
      verified: boolean;
      owner: Address;
      registeredAt: number;
      componentCount: bigint;
      documentCount: bigint;
    }>(passports[i] as Entry);
    return p ? [{ assetId, ...p }] : [];
  });

  // Labels come from the specialization registries; `AssetRegistry` holds no name.
  const labels = await client.multicall({
    contracts: decoded.map((d) =>
      d.kind === AssetKind.AIRCRAFT
        ? {
            address: requireAddress(book, "AIRCRAFT_REGISTRY"),
            abi: aircraftRegistryAbi,
            functionName: "getAircraft" as const,
            args: [d.assetId],
          }
        : {
            address: requireAddress(book, "COMPONENT_REGISTRY"),
            abi: componentRegistryAbi,
            functionName: "getComponent" as const,
            args: [d.assetId],
          },
    ),
    allowFailure: true,
    blockNumber,
  });

  const items: AssetSummary[] = decoded.map((d, i) => {
    const spec = value<{ model?: Hex; partNumber?: Hex }>(labels[i] as Entry);
    return {
      assetId: d.assetId,
      kind: d.kind,
      status: d.status,
      verified: d.verified,
      owner: d.owner,
      registeredAt: d.registeredAt,
      label: spec?.model ?? spec?.partNumber ?? null,
      componentCount: d.componentCount,
      documentCount: d.documentCount,
    };
  });

  return { items, total, truncated: total > take };
}
