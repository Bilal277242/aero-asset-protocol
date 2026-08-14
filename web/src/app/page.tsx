import Link from "next/link";
import { NonClaim } from "@/components/protocol/NonClaim";

export default function HomePage() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">
        Verified aviation assets, traded through escrow
      </h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        A registry for aircraft, engines and components — with a digital passport carrying
        ownership, documents and maintenance provenance, and a marketplace that settles
        every trade through a per-trade escrow contract.
      </p>

      <div className="mt-8 flex gap-3 text-sm">
        <Link
          href="/market"
          className="rounded border border-[var(--border)] bg-[var(--panel)] px-4 py-2 hover:border-[var(--muted)]"
        >
          Browse the market
        </Link>
        <Link
          href="/status"
          className="rounded border border-[var(--border)] px-4 py-2 text-[var(--muted)] hover:text-[var(--text)]"
        >
          Protocol status
        </Link>
      </div>

      <section className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          How a trade works
        </h2>
        <ol className="mt-3 grid gap-3 text-sm sm:grid-cols-5">
          {[
            ["List", "The owner lists a verified asset in an allowlisted token."],
            ["Offer", "A buyer offers. No funds move — it is an expression of intent."],
            ["Accept", "The seller accepts. Price, fee and deadlines freeze, and a per-trade escrow is deployed."],
            ["Fund", "The buyer deposits into that escrow, which locks the asset."],
            ["Release", "The buyer releases. The asset, the fee and the proceeds move in one transaction."],
          ].map(([title, body], i) => (
            <li
              key={title}
              className="rounded border border-[var(--border)] bg-[var(--panel)] p-3"
            >
              <div className="font-mono text-xs text-[var(--muted)]">{i + 1}</div>
              <div className="mt-1 font-medium">{title}</div>
              <p className="mt-1 text-xs text-[var(--muted)]">{body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Every funded escrow has an exit no single party can remove: unfunded trades can
          be cancelled, funded ones time out to the buyer, and a dispute that nobody
          arbitrates refunds in full.
        </p>
      </section>

      <section className="mt-12 max-w-3xl">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          What this does not claim
        </h2>
        <div className="mt-3 grid gap-2">
          <NonClaim variant="title" display="block" />
          <NonClaim variant="airworthiness" display="block" />
          <NonClaim variant="maintenance" display="block" />
        </div>
      </section>
    </div>
  );
}
