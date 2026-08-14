import Link from "next/link";
import { AddressBookDriftBanner } from "@/components/protocol/AddressBookDriftBanner";
import {
  ADDRESS_REGISTRY,
  SETTLEMENT_TOKEN,
  chainId,
  publicClient,
} from "@/lib/chain/config";
import { readProtocolHealth, type ProtocolHealth } from "@/lib/contracts/health";
import { abiHashes, generatedAt } from "@/generated/manifest";
import { deployments } from "@/generated/addresses";

/**
 * Protocol health.
 *
 * Built first, deliberately. Every later "why did that revert" starts here: a paused
 * module, a de-allowlisted token, or an address book pointing somewhere unexpected all
 * show up immediately instead of as an opaque failure three screens deep.
 *
 * This is the one page allowed to read raw protocol state — it is excluded from the
 * ESLint containment boundary because showing exactly what the chain says, unmassaged,
 * is its entire job.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StatusPage() {
  let health: ProtocolHealth | null = null;
  let error: string | null = null;

  try {
    health = await readProtocolHealth(
      publicClient(),
      chainId,
      ADDRESS_REGISTRY,
      SETTLEMENT_TOKEN,
    );
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (error || !health) {
    return (
      <div className="rounded border border-[var(--bad)] bg-[color-mix(in_srgb,var(--bad)_12%,transparent)] p-4">
        <h1 className="text-lg font-semibold text-[var(--bad)]">Cannot reach the protocol</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          The RPC endpoint or the address registry is unreachable. This is an
          infrastructure problem, not a protocol one.
        </p>
        <pre className="mt-3 overflow-x-auto rounded bg-black/30 p-3 font-mono text-xs">
          {error}
        </pre>
      </div>
    );
  }

  const explorer = "https://sepolia.etherscan.io/address/";

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Protocol status</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Chain {chainId} · block {health.blockNumber.toString()} · deployed at block{" "}
        {deployments[chainId].deployedAtBlock.toString()}
      </p>

      <div className="mt-6">
        <AddressBookDriftBanner drift={health.book.drift} unset={health.book.unset} />
      </div>

      {/* Pause is per-module, and the consequences are asymmetric. */}
      <Section title="Pause state">
        {health.anyPaused ? (
          <p className="mb-3 rounded border border-[var(--warn)] px-3 py-2 text-xs text-[var(--warn)]">
            At least one module is paused. Settlement stops while refunds keep working —
            that asymmetry is deliberate. Note a paused{" "}
            <code className="font-mono">ASSET_OWNERSHIP</code> blocks escrow release even
            though <code className="font-mono">Escrow</code> itself has no pause.
          </p>
        ) : null}
        <dl className="grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs sm:grid-cols-3">
          {Object.entries(health.pause).map(([key, paused]) => (
            <div key={key} className="flex justify-between border-b border-[var(--border)] py-1">
              <dt className="text-[var(--muted)]">{key}</dt>
              <dd className={paused ? "text-[var(--bad)]" : "text-[var(--ok)]"}>
                {paused === null ? "n/a" : paused ? "PAUSED" : "live"}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Fees and settlement">
        <dl className="grid gap-1 font-mono text-xs">
          <Row label="Marketplace fee">
            {health.fees.marketplaceBps === null
              ? "—"
              : `${health.fees.marketplaceBps} bps (${health.fees.marketplaceBps / 100}%)`}
            <span className="ml-2 text-[var(--muted)]">
              cap {health.fees.maxBps ?? "—"} bps, immutable
            </span>
          </Row>
          <Row label="Treasury">{health.fees.treasury ?? "—"}</Row>
          <Row label="Settlement token">
            {SETTLEMENT_TOKEN}
            <span
              className={`ml-2 ${health.fees.settlementTokenAllowed ? "text-[var(--ok)]" : "text-[var(--bad)]"}`}
            >
              {health.fees.settlementTokenAllowed ? "allowlisted" : "NOT ALLOWLISTED"}
            </span>
          </Row>
        </dl>
        {health.fees.settlementTokenAllowed === false && (
          <p className="mt-2 text-xs text-[var(--bad)]">
            Listings priced in this token cannot be created and existing offers cannot be
            accepted — <code className="font-mono">acceptOffer</code> re-checks the
            allowlist.
          </p>
        )}
      </Section>

      <Section title="Counts">
        <dl className="grid grid-cols-2 gap-x-8 font-mono text-xs sm:grid-cols-3">
          {Object.entries(health.counts).map(([key, value]) => (
            <div key={key} className="flex justify-between border-b border-[var(--border)] py-1">
              <dt className="text-[var(--muted)]">{key}</dt>
              <dd>{value === null ? "—" : value.toString()}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Resolved addresses">
        <p className="mb-2 text-xs text-[var(--muted)]">
          Resolved live through <code className="font-mono">ProtocolAddressRegistry</code>,
          never from a hardcoded list. These are proxies — calling an implementation
          directly reads empty storage and returns plausible zeroes.
        </p>
        <table className="w-full text-left font-mono text-xs">
          <tbody>
            {Object.entries(health.book.addresses).map(([key, address]) => (
              <tr key={key} className="border-b border-[var(--border)]">
                <td className="py-1 pr-4 text-[var(--muted)]">{key}</td>
                <td className="py-1">
                  <Link
                    href={`${explorer}${address}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="hover:underline"
                  >
                    {address}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Build">
        <p className="text-xs text-[var(--muted)]">
          Bindings generated {generatedAt} from Foundry artifacts. ABI fingerprints below —
          if one changes, re-run <code className="font-mono">npm run codegen</code>.
        </p>
        <dl className="mt-2 grid grid-cols-1 gap-x-8 font-mono text-xs sm:grid-cols-2">
          {Object.entries(abiHashes).map(([name, hash]) => (
            <div key={name} className="flex justify-between border-b border-[var(--border)] py-1">
              <dt className="text-[var(--muted)]">{name}</dt>
              <dd>{hash}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
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
    <div className="flex justify-between border-b border-[var(--border)] py-1">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
