import type { Address, Hex, PublicClient } from "viem";
import {
  assetPassportAbi,
  documentRegistryAbi,
  maintenanceRegistryAbi,
  organizationRegistryAbi,
} from "@/lib/contracts/generated/abis";
import { DocumentStatus } from "@/lib/contracts/generated/enums";
import { requireAddress, type AddressBook } from "@/lib/contracts/addressBook";
import { value } from "@/hooks/useContractRead";
import { abiEvent, scanLogs } from "./logs";
import { DEPLOYED_AT_BLOCK } from "@/config/env";

/**
 * Documents and maintenance records.
 *
 * Four facts about these two registries shape everything here, and each was read out of
 * the contracts rather than carried over from the docs:
 *
 * 1. **A maintenance record has no status.** The struct is `assetId`, `performedByOrgId`,
 *    `documentId`, `performedAt`, `mType`, `recordedAt`, `recordHash` — and that is all.
 *    There is no edit, no delete, and nothing for a lifecycle to move through. A
 *    correction is a *new* record. Any "status" shown against one would be invented.
 *
 * 2. **Both registries store a claimed date the protocol cannot verify.** Maintenance
 *    carries `performedAt` (asserted by the MRO) *and* `recordedAt` (witnessed by the
 *    chain); the contract states outright that reading the first without the second is
 *    misreading the registry. Documents carry only the claimed `issuedAt` — the witnessed
 *    time is the block of the registration event, which is why provenance needs a log
 *    read rather than a storage read.
 *
 * 3. **Neither struct records who called.** Attribution is to an *organization*
 *    (`issuerOrgId` / `performedByOrgId`), and `issuerOrgId == 0` means the asset owner
 *    acting personally. The acting account exists only as the sender of the transaction
 *    that carried the write, so it comes from the log and its transaction, and is labelled
 *    as such.
 *
 * 4. **`credentialId` is emitted and never stored.** It pins a maintenance record to the
 *    exact `MAINTENANCE_AUTHORITY` credential that authorised it — the audit trail that
 *    survives the credential's later revocation. It is unavailable to any storage read.
 */

type Entry = { status: "success"; result: unknown } | { status: "failure" };

const PAGE = 50n;

// ────────────────────────────────────────────────────────────── types ────

export type DocumentRecord = {
  documentId: bigint;
  assetId: bigint;
  /** Attributing organization, or 0 when the asset owner registered it personally. */
  issuerOrgId: bigint;
  supersededById: bigint;
  /** Caller-asserted real-world issuance date. Bounded only by not being in the future. */
  issuedAt: number;
  docType: number;
  status: number;
  documentHash: Hex;
  /** Off-chain location. Rendered as text, never fetched by this application. */
  uri: string | null;
};

export type MaintenanceRecord = {
  recordId: bigint;
  assetId: bigint;
  performedByOrgId: bigint;
  /** Supporting document, or 0. */
  documentId: bigint;
  /** Claimed by the MRO. The protocol cannot verify it. */
  performedAt: number;
  mType: number;
  /** Witnessed by the chain. The only date here the protocol vouches for. */
  recordedAt: number;
  recordHash: Hex;
  /** `recordedAt - performedAt`. Large values mean backfilled history, which is legitimate. */
  gapSeconds: number;
};

/** Where a record came from. Recovered from logs — none of it is in storage. */
export type Provenance = {
  transactionHash: Hex;
  blockNumber: bigint;
  /** Block time of the write. For documents this is the only witnessed timestamp. */
  witnessedAt: number | null;
  /** Transaction sender. Not a stored field — the account that carried the write. */
  submittedBy: Address | null;
  /** Maintenance only: the credential relied upon, emitted for exactly this purpose. */
  credentialId: bigint | null;
};

export type OrgRef = {
  orgId: bigint;
  status: number;
  orgType: number;
  isVerified: boolean;
};

// ────────────────────────────────────────────────────────── documents ────

export async function readDocument(
  client: PublicClient,
  book: AddressBook,
  documentId: bigint,
  blockNumber: bigint,
): Promise<DocumentRecord | null> {
  const registry = requireAddress(book, "DOCUMENT_REGISTRY");

  const [docResult, uriResult] = await client.multicall({
    contracts: [
      { address: registry, abi: documentRegistryAbi, functionName: "getDocument", args: [documentId] },
      { address: registry, abi: documentRegistryAbi, functionName: "documentURI", args: [documentId] },
    ],
    allowFailure: true,
    blockNumber,
  });

  const raw = value<{
    assetId: bigint;
    issuerOrgId: bigint;
    supersededById: bigint;
    issuedAt: number;
    docType: number;
    status: number;
    documentHash: Hex;
  }>(docResult as Entry);
  if (!raw) return null;

  return { documentId, ...raw, uri: value<string>(uriResult as Entry) || null };
}

export async function readDocumentIndex(
  client: PublicClient,
  book: AddressBook,
  blockNumber: bigint,
  limit = 100,
): Promise<{ items: DocumentRecord[]; total: number; truncated: boolean }> {
  const registry = requireAddress(book, "DOCUMENT_REGISTRY");

  const total = Number(
    await client.readContract({
      address: registry,
      abi: documentRegistryAbi,
      functionName: "documentCount",
      blockNumber,
    }),
  );

  const take = Math.min(total, limit);
  // Descending: the newest document is the one a reader is most likely looking for, and
  // ids are dense from 1 so there is no enumeration to page through.
  const ids = Array.from({ length: take }, (_, i) => BigInt(total - i));
  if (ids.length === 0) return { items: [], total, truncated: false };

  const results = await client.multicall({
    contracts: ids.flatMap((id) => [
      { address: registry, abi: documentRegistryAbi, functionName: "getDocument" as const, args: [id] },
      { address: registry, abi: documentRegistryAbi, functionName: "documentURI" as const, args: [id] },
    ]),
    allowFailure: true,
    blockNumber,
  });

  const items = ids.flatMap((documentId, i) => {
    const raw = value<Omit<DocumentRecord, "documentId" | "uri">>(results[i * 2] as Entry);
    if (!raw) return [];
    return [{ documentId, ...raw, uri: value<string>(results[i * 2 + 1] as Entry) || null }];
  });

  return { items, total, truncated: total > take };
}

/**
 * Asks the chain which document holds a commitment for an asset.
 *
 * The lookup is **per asset**, not protocol-wide. A global index once let anyone burn a
 * hash permanently by registering it against a junk asset they controlled, and could not
 * represent a document that legitimately covers a fleet — an Airworthiness Directive
 * applies to every aircraft of a type (audit AAP-07). So the same document may resolve to
 * different ids on different assets, and to nothing at all on an asset it was never
 * registered against.
 */
export async function lookupDocumentByHash(
  client: PublicClient,
  book: AddressBook,
  assetId: bigint,
  documentHash: Hex,
  blockNumber: bigint,
): Promise<bigint | null> {
  const id = (await client.readContract({
    address: requireAddress(book, "DOCUMENT_REGISTRY"),
    abi: documentRegistryAbi,
    functionName: "documentIdOf",
    args: [assetId, documentHash],
    blockNumber,
  })) as bigint;

  return id > 0n ? id : null;
}

/** Documents registered against one asset. Used to show a supersession chain in context. */
export async function readAssetDocuments(
  client: PublicClient,
  book: AddressBook,
  assetId: bigint,
  blockNumber: bigint,
): Promise<DocumentRecord[]> {
  const ids = (await client.readContract({
    address: requireAddress(book, "ASSET_PASSPORT"),
    abi: assetPassportAbi,
    functionName: "documents",
    args: [assetId, 0n, PAGE],
    blockNumber,
  })) as readonly bigint[];

  if (ids.length === 0) return [];

  const registry = requireAddress(book, "DOCUMENT_REGISTRY");
  const results = await client.multicall({
    contracts: ids.map((id) => ({
      address: registry,
      abi: documentRegistryAbi,
      functionName: "getDocument" as const,
      args: [id],
    })),
    allowFailure: true,
    blockNumber,
  });

  return ids.flatMap((documentId, i) => {
    const raw = value<Omit<DocumentRecord, "documentId" | "uri">>(results[i] as Entry);
    return raw ? [{ documentId, ...raw, uri: null }] : [];
  });
}

// ─────────────────────────────────────────────────────── maintenance ────

export async function readMaintenanceRecord(
  client: PublicClient,
  book: AddressBook,
  recordId: bigint,
  blockNumber: bigint,
): Promise<MaintenanceRecord | null> {
  const [result] = await client.multicall({
    contracts: [
      {
        address: requireAddress(book, "MAINTENANCE_REGISTRY"),
        abi: maintenanceRegistryAbi,
        functionName: "getMaintenanceRecord",
        args: [recordId],
      },
    ],
    allowFailure: true,
    blockNumber,
  });

  const raw = value<Omit<MaintenanceRecord, "recordId" | "gapSeconds">>(result as Entry);
  if (!raw) return null;

  return { recordId, ...raw, gapSeconds: raw.recordedAt - raw.performedAt };
}

export async function readMaintenanceIndex(
  client: PublicClient,
  book: AddressBook,
  blockNumber: bigint,
  limit = 100,
): Promise<{ items: MaintenanceRecord[]; total: number; truncated: boolean }> {
  const registry = requireAddress(book, "MAINTENANCE_REGISTRY");

  const total = Number(
    await client.readContract({
      address: registry,
      abi: maintenanceRegistryAbi,
      functionName: "maintenanceCount",
      blockNumber,
    }),
  );

  const take = Math.min(total, limit);
  const ids = Array.from({ length: take }, (_, i) => BigInt(total - i));
  if (ids.length === 0) return { items: [], total, truncated: false };

  const results = await client.multicall({
    contracts: ids.map((id) => ({
      address: registry,
      abi: maintenanceRegistryAbi,
      functionName: "getMaintenanceRecord" as const,
      args: [id],
    })),
    allowFailure: true,
    blockNumber,
  });

  const items = ids.flatMap((recordId, i) => {
    const raw = value<Omit<MaintenanceRecord, "recordId" | "gapSeconds">>(results[i] as Entry);
    if (!raw) return [];
    return [{ recordId, ...raw, gapSeconds: raw.recordedAt - raw.performedAt }];
  });

  return { items, total, truncated: total > take };
}

/**
 * Whether an organization may record maintenance, answered by the contract.
 *
 * Three independent conditions, all checked on-chain: the account acts for the
 * organization and it is `VERIFIED`, the organization is of type `MRO`, and it holds a
 * currently-valid `MAINTENANCE_AUTHORITY` credential. `canRecordMaintenance` exists
 * precisely so a client can ask before spending gas on a transaction that would revert.
 */
export async function readCanRecordMaintenance(
  client: PublicClient,
  book: AddressBook,
  orgId: bigint,
  account: Address,
  blockNumber: bigint,
): Promise<boolean> {
  const [result] = await client.multicall({
    contracts: [
      {
        address: requireAddress(book, "MAINTENANCE_REGISTRY"),
        abi: maintenanceRegistryAbi,
        functionName: "canRecordMaintenance",
        args: [orgId, account],
      },
    ],
    allowFailure: true,
    blockNumber,
  });

  return value<boolean>(result as Entry) ?? false;
}

// ───────────────────────────────────────────────────────── provenance ────

/**
 * The transaction behind a record.
 *
 * Storage says what was written; only the log says when it landed, in which transaction,
 * and — via that transaction's sender — which account carried it. For maintenance the log
 * also carries `credentialId`, which is deliberately not stored.
 *
 * Returns null rather than throwing when the scan finds nothing: a provider that rejects
 * a range should degrade a provenance panel, not take the record page down with it.
 */
async function provenanceFrom(
  client: PublicClient,
  address: Address,
  event: ReturnType<typeof abiEvent>,
  args: Record<string, unknown>,
  toBlock: bigint,
): Promise<Provenance | null> {
  const logs = await scanLogs(client, {
    address,
    event,
    args,
    fromBlock: BigInt(DEPLOYED_AT_BLOCK),
    toBlock,
  });

  const log = logs[0];
  if (!log) return null;

  const [block, transaction] = await Promise.all([
    client.getBlock({ blockNumber: log.blockNumber }).catch(() => null),
    client.getTransaction({ hash: log.transactionHash }).catch(() => null),
  ]);

  const credentialId = log.args.credentialId;

  return {
    transactionHash: log.transactionHash,
    blockNumber: log.blockNumber,
    witnessedAt: block ? Number(block.timestamp) : null,
    submittedBy: transaction ? (transaction.from as Address) : null,
    credentialId: typeof credentialId === "bigint" ? credentialId : null,
  };
}

export function readDocumentProvenance(
  client: PublicClient,
  book: AddressBook,
  documentId: bigint,
  toBlock: bigint,
): Promise<Provenance | null> {
  return provenanceFrom(
    client,
    requireAddress(book, "DOCUMENT_REGISTRY"),
    abiEvent(documentRegistryAbi, "DocumentRegistered"),
    { documentId },
    toBlock,
  ).catch(() => null);
}

export function readMaintenanceProvenance(
  client: PublicClient,
  book: AddressBook,
  recordId: bigint,
  toBlock: bigint,
): Promise<Provenance | null> {
  return provenanceFrom(
    client,
    requireAddress(book, "MAINTENANCE_REGISTRY"),
    abiEvent(maintenanceRegistryAbi, "MaintenanceRecorded"),
    { recordId },
    toBlock,
  ).catch(() => null);
}

// ──────────────────────────────────────────────────────── shared refs ────

/**
 * Standing of the organizations a record refers to, **as it is now**.
 *
 * Deliberately current rather than historical. Later revocation of an organization or its
 * credential does not retroactively invalidate records already written — protocol history
 * is append-only — so this is context for a reader, never a reason to hide a record.
 */
export async function readOrgRefs(
  client: PublicClient,
  book: AddressBook,
  orgIds: bigint[],
  blockNumber: bigint,
): Promise<Map<string, OrgRef>> {
  const unique = [...new Set(orgIds.filter((id) => id > 0n).map(String))].map(BigInt);
  const out = new Map<string, OrgRef>();
  if (unique.length === 0) return out;

  const registry = requireAddress(book, "ORGANIZATION_REGISTRY");
  const results = await client.multicall({
    contracts: unique.map((orgId) => ({
      address: registry,
      abi: organizationRegistryAbi,
      functionName: "getOrganization" as const,
      args: [orgId],
    })),
    allowFailure: true,
    blockNumber,
  });

  unique.forEach((orgId, i) => {
    const raw = value<{ status: number; orgType: number }>(results[i] as Entry);
    if (!raw) return;
    out.set(orgId.toString(), {
      orgId,
      status: raw.status,
      orgType: raw.orgType,
      // Current standing is `status`. `verifiedAt` survives suspension, so it cannot
      // answer "is this organization verified now".
      isVerified: raw.status === 2,
    });
  });

  return out;
}

/** Whether a document can still support a new maintenance record. */
export const isSupportable = (document: DocumentRecord) =>
  document.status === DocumentStatus.ACTIVE;

// The verdict logic itself is pure and lives in `./hash-check`, re-exported here so a
// caller needs one import for the reader and the classifier it feeds.
export { classifyHash, type HashOutcome } from "./hash-check";
