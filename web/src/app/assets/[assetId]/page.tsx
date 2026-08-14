import { notFound } from "next/navigation";
import Link from "next/link";
import { NonClaim } from "@/components/protocol/NonClaim";
import { VerifyFile } from "@/components/asset/VerifyFile";
import { ADDRESS_REGISTRY, chainId, publicClient } from "@/lib/chain/config";
import { resolveAddressBook } from "@/lib/contracts/addressBook";
import {
  readAssetPage,
  readDocuments,
  readMaintenance,
  readPassport,
  type AircraftView,
  type ComponentView,
  type DocumentView,
  type MaintenanceView,
  type PassportView,
} from "@/lib/domain/passport";
import { bytes32Label, shortHex } from "@/lib/format/bytes32";
import { duration, formatDate, formatDateTime, relative } from "@/lib/format/time";
import {
  aircraftCategoryLabel,
  assetKindLabel,
  assetStatusLabel,
  componentStatusLabel,
  documentStatusLabel,
  documentTypeLabel,
  maintenanceTypeLabel,
} from "@/generated/enums";

export const dynamic = "force-dynamic";

const PAGE = 25n;

export default async function AssetPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId: raw } = await params;

  // Ids are sequential `uint256`s starting at 1. Anything else is a bad URL, not a miss.
  if (!/^[1-9]\d{0,77}$/.test(raw)) notFound();
  const assetId = BigInt(raw);

  const client = publicClient();
  const { addresses: book } = await resolveAddressBook(client, chainId, ADDRESS_REGISTRY);
  const block = await client.getBlock();

  const passport = await readPassport(client, book, assetId, block.timestamp);
  if (!passport) notFound();

  const [componentIds, documentIds, maintenanceIds] = await Promise.all([
    passport.counts.components > 0n
      ? readAssetPage(client, book, "components", assetId, 0n, PAGE, passport.blockNumber)
      : Promise.resolve([]),
    passport.counts.documents > 0n
      ? readAssetPage(client, book, "documents", assetId, 0n, PAGE, passport.blockNumber)
      : Promise.resolve([]),
    passport.counts.maintenance > 0n
      ? readAssetPage(client, book, "maintenance", assetId, 0n, PAGE, passport.blockNumber)
      : Promise.resolve([]),
  ]);

  const [documents, maintenance] = await Promise.all([
    readDocuments(client, book, documentIds, passport.blockNumber),
    readMaintenance(client, book, maintenanceIds, passport.blockNumber),
  ]);

  const title = passport.aircraft
    ? bytes32Label(passport.aircraft.model)
    : passport.component
      ? bytes32Label(passport.component.partNumber)
      : `Asset #${assetId}`;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <span className="font-mono text-sm text-[var(--muted)]">#{assetId.toString()}</span>
        <span className="rounded border border-[var(--border)] px-2 py-0.5 text-xs">
          {assetKindLabel[passport.kind] ?? "Unknown"}
        </span>
        <StatusChip passport={passport} />
      </div>

      <p className="mt-2 text-xs text-[var(--muted)]">
        Read at block {passport.blockNumber.toString()} — every field on this page is from
        that one height.
      </p>

      <Overview passport={passport} now={block.timestamp} />

      {passport.aircraft && <Aircraft a={passport.aircraft} />}
      {passport.component && <Component c={passport.component} />}

      {/* Only an airframe can carry components — `installComponent` reverts
          `ParentNotAircraft` for anything else, so the section is noise elsewhere. */}
      {passport.aircraft && (
        <Components ids={componentIds} count={passport.counts.components} />
      )}
      <Documents documents={documents} count={passport.counts.documents} />
      <Maintenance records={maintenance} count={passport.counts.maintenance} />

      <VerifyFile
        documentHashes={documents.map((d) => ({ id: d.documentId.toString(), hash: d.documentHash }))}
        commitments={[
          { label: "Serial number", hash: passport.serialNumberHash },
          { label: "Metadata", hash: passport.metadataHash },
          ...(passport.aircraft
            ? [{ label: "Registration mark", hash: passport.aircraft.registrationMarkHash }]
            : []),
        ]}
      />
    </div>
  );
}

function StatusChip({ passport }: { passport: PassportView }) {
  const label = assetStatusLabel[passport.status] ?? "Unknown";
  const tone = passport.isTerminal ? "text-[var(--bad)]" : "text-[var(--ok)]";
  return (
    <span className={`rounded border border-[var(--border)] px-2 py-0.5 text-xs ${tone}`}>
      {label}
    </span>
  );
}

function Overview({ passport, now }: { passport: PassportView; now: bigint }) {
  return (
    <Section title="Overview">
      <dl className="grid gap-1 font-mono text-xs">
        <Row label="Owner">
          <span>{passport.owner}</span>
          <div className="mt-0.5">
            <NonClaim variant="title" />
          </div>
        </Row>
        <Row label="Owned since">{formatDate(passport.ownedSince)}</Row>
        <Row label="Registered">{formatDate(passport.registeredAt)}</Row>
        <Row label="Verified">
          {passport.verified ? (
            <>
              <span className="text-[var(--ok)]">yes</span>, {formatDate(passport.verifiedAt)}
              <div className="mt-0.5">
                <NonClaim variant="airworthiness" />
              </div>
            </>
          ) : (
            <span className="text-[var(--warn)]">
              no — cannot be listed until an asset verifier verifies it
            </span>
          )}
        </Row>
        <Row label="Transferable">
          <TransferState passport={passport} now={now} />
        </Row>
        <Row label="Registrar org">
          #{passport.registrarOrgId.toString()}{" "}
          {passport.orgs.registrar && (
            <span className={passport.orgs.registrar.verified ? "" : "text-[var(--warn)]"}>
              ({passport.orgs.registrar.verified ? "verified" : "not currently verified"})
            </span>
          )}
          <div className="mt-0.5">
            <NonClaim variant="attestation" />
          </div>
        </Row>
        <Row label="Serial commitment">{shortHex(passport.serialNumberHash, 10, 6)}</Row>
        <Row label="Metadata URI">
          {passport.metadataURI ? (
            <>
              <span className="break-all">{passport.metadataURI}</span>
              <div className="mt-0.5 text-[var(--muted)]">
                Off-chain and unverified. Not fetched by this app.
              </div>
            </>
          ) : (
            "—"
          )}
        </Row>
        <Row label="Listed">
          {passport.activeListingId ? (
            <Link href={`/market/${passport.activeListingId}`} className="text-[var(--ok)] underline">
              listing #{passport.activeListingId.toString()}
            </Link>
          ) : (
            "not listed"
          )}
        </Row>
      </dl>
    </Section>
  );
}

function TransferState({ passport, now }: { passport: PassportView; now: bigint }) {
  const t = passport.transfer;
  switch (t.kind) {
    case "free":
      return <span className="text-[var(--ok)]">yes</span>;
    case "frozen":
      return (
        <span className="text-[var(--bad)]">
          frozen — the asset is {assetStatusLabel[passport.status]?.toLowerCase()}
        </span>
      );
    case "locked":
      return (
        <span className="text-[var(--warn)]">
          locked by escrow {shortHex(t.by)} — a trade is in progress
        </span>
      );
    case "pending":
      return (
        <span className="text-[var(--warn)]">
          transfer offered to {shortHex(t.to)}, expires {relative(t.expiresAt, now)}
        </span>
      );
    case "offerExpired":
      return (
        <span className="text-[var(--muted)]">
          yes — a transfer offer to {shortHex(t.to)} expired{" "}
          {relative(t.expiresAt, now)} and can no longer be accepted, though the record
          still holds it
        </span>
      );
  }
}

function Aircraft({ a }: { a: AircraftView }) {
  return (
    <Section title="Airframe">
      <dl className="grid gap-1 font-mono text-xs">
        <Row label="Model">{bytes32Label(a.model)}</Row>
        <Row label="Manufacturer">
          {bytes32Label(a.manufacturerName)}
          {a.manufacturerOrgId > 0n && ` (org #${a.manufacturerOrgId.toString()})`}
        </Row>
        <Row label="Year">{a.manufactureYear || "—"}</Row>
        <Row label="Category">{aircraftCategoryLabel[a.category] ?? "—"}</Row>
        <Row label="Registration mark">{shortHex(a.registrationMarkHash, 10, 6)}</Row>
      </dl>
    </Section>
  );
}

function Component({ c }: { c: ComponentView }) {
  return (
    <Section title="Component">
      <dl className="grid gap-1 font-mono text-xs">
        <Row label="Part number">{bytes32Label(c.partNumber)}</Row>
        <Row label="Status">{componentStatusLabel[c.status] ?? "—"}</Row>
        <Row label="Fitted to">
          {c.isInstalled ? (
            <>
              <Link href={`/assets/${c.parentAssetId}`} className="underline">
                asset #{c.parentAssetId.toString()}
              </Link>{" "}
              at position {c.position}
              <div className="mt-0.5 text-[var(--muted)]">
                An installed component cannot be listed for sale. Remove it first.
              </div>
            </>
          ) : (
            "not installed"
          )}
        </Row>
        {c.installedAt > 0 && <Row label="Installed">{formatDate(c.installedAt)}</Row>}
        {c.removedAt > 0 && <Row label="Last removed">{formatDate(c.removedAt)}</Row>}
      </dl>
    </Section>
  );
}

function Components({ ids, count }: { ids: bigint[]; count: bigint }) {
  return (
    <Section title={`Installed components (${count.toString()})`}>
      {ids.length === 0 ? (
        <Empty>Nothing installed.</Empty>
      ) : (
        <ul className="grid gap-1 font-mono text-xs">
          {ids.map((id) => (
            <li key={id.toString()} className="border-b border-[var(--border)] py-1">
              <Link href={`/assets/${id}`} className="underline">
                asset #{id.toString()}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Truncated shown={ids.length} count={count} />
    </Section>
  );
}

function Documents({ documents, count }: { documents: DocumentView[]; count: bigint }) {
  return (
    <Section title={`Documents (${count.toString()})`}>
      {documents.length === 0 ? (
        <Empty>No documents registered.</Empty>
      ) : (
        <table className="w-full text-left font-mono text-xs">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="py-1 pr-4 font-normal">Type</th>
              <th className="py-1 pr-4 font-normal">Issued</th>
              <th className="py-1 pr-4 font-normal">Status</th>
              <th className="py-1 pr-4 font-normal">Commitment</th>
              <th className="py-1 font-normal">Location</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.documentId.toString()} className="border-t border-[var(--border)]">
                <td className="py-1 pr-4">{documentTypeLabel[d.docType] ?? "—"}</td>
                <td className="py-1 pr-4">{formatDate(d.issuedAt)}</td>
                <td className="py-1 pr-4">
                  {documentStatusLabel[d.status] ?? "—"}
                  {d.supersededById > 0n && ` → #${d.supersededById.toString()}`}
                </td>
                <td className="py-1 pr-4">{shortHex(d.documentHash, 10, 6)}</td>
                <td className="py-1 break-all text-[var(--muted)]">{d.uri ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Truncated shown={documents.length} count={count} />
      <p className="mt-2 text-xs text-[var(--muted)]">
        The chain stores a hash and a location, never the document. A commitment proves a
        file existed in this exact form — it does not prove the file is retrievable, nor
        anything about its contents.
      </p>
    </Section>
  );
}

function Maintenance({ records, count }: { records: MaintenanceView[]; count: bigint }) {
  return (
    <Section title={`Maintenance (${count.toString()})`}>
      <div className="mb-3">
        <NonClaim variant="maintenance" display="block" />
      </div>

      {records.length === 0 ? (
        <Empty>No maintenance recorded.</Empty>
      ) : (
        <>
          <table className="w-full text-left font-mono text-xs">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="py-1 pr-4 font-normal">Type</th>
                <th className="py-1 pr-4 font-normal">Claimed performed</th>
                <th className="py-1 pr-4 font-normal">Recorded on-chain</th>
                <th className="py-1 pr-4 font-normal">Gap</th>
                <th className="py-1 font-normal">By org</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const gap = r.recordedAt - r.performedAt;
                const backdated = gap > 86400 * 30;
                return (
                  <tr key={r.recordId.toString()} className="border-t border-[var(--border)]">
                    <td className="py-1 pr-4">{maintenanceTypeLabel[r.mType] ?? "—"}</td>
                    <td className="py-1 pr-4">{formatDateTime(r.performedAt)}</td>
                    <td className="py-1 pr-4">{formatDateTime(r.recordedAt)}</td>
                    <td className={`py-1 pr-4 ${backdated ? "text-[var(--warn)]" : ""}`}>
                      {gap <= 0 ? "—" : duration(gap)}
                    </td>
                    <td className="py-1">#{r.performedByOrgId.toString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <Truncated shown={records.length} count={count} />
          <p className="mt-2 text-xs text-[var(--muted)]">
            <strong className="text-[var(--text)]">Two dates, and only one is witnessed.</strong>{" "}
            <em>Claimed performed</em> is asserted by the recording organisation and the
            protocol cannot verify it. <em>Recorded on-chain</em> is the protocol&apos;s own
            observation. A large gap is not proof of anything, but several records with
            large gaps written at the same moment is what a fabricated history looks like.
          </p>
        </>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-[var(--border)] py-1.5 sm:flex-row sm:justify-between sm:gap-8">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="sm:max-w-[60%] sm:text-right">{children}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[var(--muted)]">{children}</p>;
}

/**
 * A short list that quietly stops is the same class of lie as a stale status: the reader
 * concludes the record is complete. Every list here is capped at one page, so every list
 * says so when it hits the cap.
 */
function Truncated({ shown, count }: { shown: number; count: bigint }) {
  if (BigInt(shown) >= count) return null;
  return (
    <p className="mt-2 text-xs text-[var(--warn)]">
      Showing {shown} of {count.toString()}. This page reads one fixed-size page at a
      single block height and does not yet page beyond it — the remainder is on-chain, not
      missing.
    </p>
  );
}
