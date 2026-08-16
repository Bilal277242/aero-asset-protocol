import Link from "next/link";
import type { Metadata } from "next";
import {
  ShieldCheck,
  FileSearch,
  Wrench,
  ArrowLeftRight,
  Landmark,
  Boxes,
  Plug,
  Lock,
} from "lucide-react";
import { Container, Section, SectionHead, FeatureCard, Steps, FactStrip, CTABand, SampleNote, ExternalLink } from "@/components/site/sections";
import { Badge } from "@/components/ui/badge";
import { StateChip } from "@/components/protocol/state-chip";
import { VerificationStrip } from "@/components/protocol/verification-strip";
import { AddressDisplay, HashDisplay, Amount } from "@/components/protocol/chain-value";
import { Table, TableWrap, THead, TBody, TR, TH, TD, TableCaption } from "@/components/ui/table";
import { NonClaim } from "@/components/protocol/non-claim";

export const metadata: Metadata = {
  title: "Aviation asset records, provable end to end",
  description:
    "A registry, digital passport and escrowed marketplace for aircraft, engines and components. Provenance you can check yourself, settlement that needs no trusted intermediary.",
};

const REPO = "https://github.com/Bilal277242/aero-asset-protocol";

export default function HomePage() {
  return (
    <>
      {/* ── 1 · Hero ─────────────────────────────────────────────── */}
      <section className="border-b border-rule bg-panel">
        <Container className="py-14 laptop:py-20">
          <div className="grid gap-10 laptop:grid-cols-[1.1fr_1fr] laptop:items-center">
            <div>
              <Badge variant="accent" className="mb-4">
                Deployed on Sepolia · chain 11155111
              </Badge>

              <h1 className="text-balance text-3xl font-semibold tracking-tight text-ink laptop:text-4xl">
                An aircraft is worth its records
              </h1>

              <p className="mt-4 max-w-[56ch] text-lg leading-relaxed text-ink-2">
                AeroAsset is protocol infrastructure for aviation asset records. It gives an
                airframe, engine or component a permanent identity, an append-only provenance
                trail, and a settlement path that does not depend on trusting the party
                holding the paperwork.
              </p>

              <ul className="mt-6 grid gap-x-6 gap-y-2 text-sm text-ink-2 tablet:grid-cols-2">
                {[
                  ["Asset records", "One identity per airframe, engine and component"],
                  ["Provenance", "Append-only history that survives a change of owner"],
                  ["Verification", "Attestations by authorised roles, checkable by anyone"],
                  ["Maintenance history", "Claimed date and witnessed date, side by side"],
                  ["Ownership", "A protocol-gated ledger, not a spreadsheet"],
                  ["Marketplace", "Per-trade escrow with no custodial intermediary"],
                ].map(([term, detail]) => (
                  <li key={term} className="flex gap-2">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    <span>
                      <strong className="font-medium text-ink">{term}</strong>
                      <span className="text-ink-3"> — {detail}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-col gap-2 tablet:flex-row">
                <Link
                  href="/marketplace"
                  className="inline-flex h-11 items-center justify-center rounded bg-accent px-6 text-base font-medium text-accent-ink transition-colors hover:bg-accent-hover"
                >
                  Explore marketplace
                </Link>
                <Link
                  href="/verification"
                  className="inline-flex h-11 items-center justify-center rounded border border-rule bg-panel px-6 text-base font-medium text-ink transition-colors hover:border-ink-3 hover:bg-sunken"
                >
                  Verify an asset
                </Link>
              </div>

              <p className="mt-4 font-mono text-2xs text-ink-3">
                Testnet deployment · not independently audited · not for use with real funds
              </p>
            </div>

            {/* The hero visual is the product's own component rendering real seeded state. */}
            <div>
              <VerificationStrip
                title="A320-214"
                identifier="ASSET #1"
                classification={<Badge>Aircraft</Badge>}
                state={<StateChip tone="confirmed">Verified</StateChip>}
                blockNumber="11,493,660"
                nonClaims={["title", "airworthiness"]}
                fields={[
                  {
                    label: "Owner",
                    value: <AddressDisplay address="0x4eaDF30c01FB8456BCCa506cF436936Eb6eAFF70" />,
                  },
                  {
                    label: "Serial commitment",
                    value: (
                      <HashDisplay hash="0x3f539148a3554fbf2d148e8850f449d4a63bf273cc87b3c052f0bce187661033" />
                    ),
                  },
                  { label: "Registrar", value: "Org #1 · verified" },
                  { label: "Manufacturer", value: "Airbus · 2018" },
                  { label: "Installed components", value: "1 engine" },
                  { label: "Documents", value: "1 registered" },
                ]}
              />
              <SampleNote>
                A real record from the Sepolia deployment. Every field is read from the chain
                at the block shown.
              </SampleNote>
            </div>
          </div>
        </Container>
      </section>

      {/* ── What / problem / who / why ────────────────────────────── */}
      <Section>
        <div className="grid gap-8 laptop:grid-cols-2">
          <div>
            <SectionHead
              eyebrow="What it is"
              title="A shared record that no single party owns"
              lede="Five layers of smart contracts on a public chain: identity for organizations, a registry for assets, provenance for documents and maintenance, and a marketplace that settles through per-trade escrow. Sixteen contracts, all source-available."
            />
          </div>
          <div className="grid gap-4">
            <div>
              <p className="label-key mb-1.5">The problem</p>
              <p className="text-sm leading-relaxed text-ink-2">
                An aircraft&rsquo;s value lives in its records, and those records live in PDFs and
                email across parties with no reason to trust each other. A gap in a logbook is
                discovered at sale, when it is most expensive. There is no way to prove a
                document existed in a given form at a given date without trusting whoever is
                holding it.
              </p>
            </div>
            <div>
              <p className="label-key mb-1.5">Who it is for</p>
              <p className="text-sm leading-relaxed text-ink-2">
                Owners and lessors who trade assets; maintenance organizations recording work;
                brokers running diligence; buyers who need provenance they can check
                independently; and the verifiers and registrars who attest to any of it.
              </p>
            </div>
            <div>
              <p className="label-key mb-1.5">Why a blockchain</p>
              <p className="text-sm leading-relaxed text-ink-2">
                For two properties, not as a category. First, an append-only log with
                independently checkable timestamps: <em>who asserted what, and when</em>, with no
                custodian who can revise it later. Second, settlement without a trusted escrow
                agent — funds and title move in one transaction or neither moves.{" "}
                <strong className="font-medium text-ink">
                  It does not make claims true.
                </strong>{" "}
                It makes them attributable, timestamped and permanent.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 2 · Platform overview ─────────────────────────────────── */}
      <Section tone="panel" id="platform">
        <SectionHead
          eyebrow="Platform"
          title="Five layers, each with one job"
          lede="Every dependency points downward. A defect in the marketplace cannot reach the ownership ledger, and the contracts that hold money are immutable."
        />
        <div className="mt-8 grid gap-4 tablet:grid-cols-2 laptop:grid-cols-3">
          <FeatureCard icon={Landmark} title="Identity" fact="OrganizationRegistry · CredentialRegistry">
            Organizations self-register, then an authorised verifier attests to them. Typed
            aviation credentials gate who may record what.
          </FeatureCard>
          <FeatureCard icon={Boxes} title="Assets" fact="AssetRegistry · AssetOwnership + 2 specializations">
            One global identifier per asset. Ownership is a separate ledger with its own
            transfer rules, freezes and settlement locks.
          </FeatureCard>
          <FeatureCard icon={FileSearch} title="Provenance" fact="DocumentRegistry · MaintenanceRegistry · AssetPassport">
            Documents are stored as hashes and locations, never contents. The passport
            aggregates everything about an asset in one read.
          </FeatureCard>
          <FeatureCard icon={ArrowLeftRight} title="Transaction" fact="Marketplace · EscrowFactory · Escrow · FeeManager">
            The marketplace records intent and never holds funds or assets. A fresh escrow
            contract is deployed per trade.
          </FeatureCard>
          <FeatureCard icon={Lock} title="Governance" fact="RoleManager · ProtocolTimelock · 48 h delay">
            Eleven roles, no owner account. Every privileged change is queued behind a timelock
            and publicly visible before it executes.
          </FeatureCard>
          <FeatureCard icon={ShieldCheck} title="Safety properties" fact="116 custom errors · 18 protocol invariants">
            Every failure is typed and decodable. Every non-terminal escrow state has a
            permissionless exit, so nobody&rsquo;s funds depend on a counterparty responding.
          </FeatureCard>
        </div>
        <div className="mt-6">
          <Link href="/platform" className="text-sm font-medium text-accent hover:underline">
            Full platform overview →
          </Link>
        </div>
      </Section>

      {/* ── 3 · Asset Passport showcase ───────────────────────────── */}
      <Section>
        <div className="grid gap-8 laptop:grid-cols-[1fr_1.1fr] laptop:items-start">
          <div>
            <SectionHead
              eyebrow="Asset passport"
              title="Everything known about an asset, in one read"
              lede="Identity, ownership, installed components, documents and maintenance — assembled by a contract that owns no storage of its own and therefore cannot disagree with the registries it reads."
            />
            <dl className="mt-6 grid gap-3">
              {[
                ["Identity", "Kind, status, registrar, and salted commitments to serial and tail number."],
                ["Ownership", "Current owner, held since, and whether a transfer or settlement lock is open."],
                ["Components", "What is installed, in which position, and when it was fitted."],
                ["Documents", "Type, issue date, status and a hash you can check against your own file."],
                ["Maintenance", "What was done, by whom, when claimed — and when the chain witnessed it."],
              ].map(([k, v]) => (
                <div key={k} className="border-b border-rule-2 pb-2.5 last:border-0">
                  <dt className="text-sm font-medium text-ink">{k}</dt>
                  <dd className="mt-0.5 text-sm text-ink-2">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded border border-rule bg-panel p-4">
            <p className="label-key mb-3">Passport · asset #1</p>
            <dl className="grid gap-2 text-sm">
              {[
                ["Kind", "Aircraft"],
                ["Status", "Registered"],
                ["Verified", "Yes · by org #1"],
                ["Owner since", "2026-08-14"],
                ["Transferable", "Yes"],
                ["Components", "1"],
                ["Documents", "1"],
                ["Maintenance records", "0"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-rule-2 pb-1.5 last:border-0">
                  <dt className="label-key">{k}</dt>
                  <dd className="font-mono text-xs text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4">
              <NonClaim variant="airworthiness" display="block" />
            </div>
            <SampleNote>Live values from the Sepolia deployment.</SampleNote>
          </div>
        </div>
      </Section>

      {/* ── 4 · Verification ──────────────────────────────────────── */}
      <Section tone="panel">
        <SectionHead
          eyebrow="Verification"
          title="Check it yourself, without asking us"
          lede="Three separate things get called verification in this protocol, and conflating them is how people end up trusting the wrong one."
        />
        <div className="mt-8 grid gap-4 laptop:grid-cols-3">
          <FeatureCard title="Asset verification" fact="AssetRegistry.verifyAsset">
            An authorised verifier attests to an asset at a point in time. It is an
            attestation with a name and a timestamp attached — not a certification, and not a
            statement about airworthiness.
          </FeatureCard>
          <FeatureCard title="Document verification" fact="keccak256, computed in your browser">
            Drop the PDF you were sent. Its hash is computed locally and compared against the
            commitment on the chain. A match proves the file is byte-identical to what was
            registered. The file never leaves your machine.
          </FeatureCard>
          <FeatureCard title="Commitment verification" fact="keccak256(abi.encode(value, salt))">
            Serial numbers and tail numbers are stored as hashes. Given the value and the salt
            it was committed with, anyone can reproduce the hash and confirm the record refers
            to the aircraft they think it does.
          </FeatureCard>
        </div>
        <div className="mt-6 rounded border border-blocked/40 bg-blocked-bg p-4">
          <p className="text-sm font-medium text-ink">What verification does not do</p>
          <p className="mt-1 max-w-[76ch] text-sm leading-relaxed text-ink-2">
            A matching hash proves a file is unchanged since it was registered. It proves
            nothing about whether the document is genuine, current, or issued by the
            organization named on it. The protocol records who asserted what and when; assessing
            whether the assertion is true remains the reader&rsquo;s job.
          </p>
        </div>
        <div className="mt-6">
          <Link href="/verification" className="text-sm font-medium text-accent hover:underline">
            How verification works →
          </Link>
        </div>
      </Section>

      {/* ── 5 · Maintenance and provenance ────────────────────────── */}
      <Section>
        {/*
          `[&>*]:min-w-0` is load-bearing. A grid item defaults to `min-width: auto`, so it
          refuses to shrink below its content's intrinsic width — and the table below has a
          wide one. Without this the column computes to 423px inside a 343px grid on a
          phone, and `overflow-x: clip` on the body then hides the overflow instead of
          scrolling it, silently cutting the right-hand side off every paragraph here.
        */}
        <div className="grid gap-8 laptop:grid-cols-[1fr_1.1fr] [&>*]:min-w-0">
          <SectionHead
            eyebrow="Maintenance &amp; provenance"
            title="Two dates, and only one of them is witnessed"
            lede="A maintenance record carries the date the work is claimed to have happened and the date the chain observed the record. The protocol cannot verify the first. It makes the gap visible rather than pretending it does not exist."
          />
          <div>
            <TableWrap>
              <Table>
                <TableCaption>Illustrative maintenance records</TableCaption>
                <THead>
                  <TR>
                    <TH>Type</TH>
                    <TH>Claimed performed</TH>
                    <TH>Recorded on-chain</TH>
                    <TH numeric>Gap</TH>
                  </TR>
                </THead>
                <TBody>
                  <TR>
                    <TD>C check</TD>
                    <TD mono>2026-03-02</TD>
                    <TD mono>2026-03-04</TD>
                    <TD numeric>2 days</TD>
                  </TR>
                  <TR>
                    <TD>Engine overhaul</TD>
                    <TD mono>2024-11-18</TD>
                    <TD mono>2026-08-01</TD>
                    <TD numeric className="text-blocked">621 days</TD>
                  </TR>
                </TBody>
              </Table>
            </TableWrap>
            <SampleNote>
              Illustrative rows, not chain data — no maintenance has been recorded on the
              testnet deployment yet. Replace with live records once an MRO organization holds
              a maintenance credential.
            </SampleNote>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              A large gap is not proof of anything. Several large gaps written in the same
              minute is what a fabricated history looks like — and that pattern is only
              visible because both dates are kept.
            </p>
            <div className="mt-3">
              <NonClaim variant="maintenance" display="block" />
            </div>
          </div>
        </div>
      </Section>

      {/* ── 6 · Marketplace preview ───────────────────────────────── */}
      <Section tone="panel">
        <SectionHead
          eyebrow="Marketplace"
          title="Listings, offers, and escrow that cannot strand anyone"
          lede="The marketplace records intent and never touches money. Accepting an offer deploys a fresh escrow contract for that trade alone, with price, fee and both deadlines frozen at that moment."
        />

        <div className="mt-8">
          <TableWrap>
            <Table>
              <TableCaption>Current listings on the Sepolia deployment</TableCaption>
              <THead>
                <TR>
                  <TH sticky>ID</TH>
                  <TH>Asset</TH>
                  <TH>Kind</TH>
                  <TH>State</TH>
                  <TH numeric>Price USDC</TH>
                </TR>
              </THead>
              <TBody>
                <TR>
                  <TD sticky mono>#1</TD>
                  <TD>A320-214</TD>
                  <TD><Badge>Aircraft</Badge></TD>
                  <TD><StateChip tone="blocked">In escrow</StateChip></TD>
                  <TD numeric><Amount value="1.00" /></TD>
                </TR>
                <TR>
                  <TD sticky mono>#2</TD>
                  <TD>B737-800</TD>
                  <TD><Badge>Aircraft</Badge></TD>
                  <TD><StateChip tone="confirmed">Active</StateChip></TD>
                  <TD numeric><Amount value="28,500,000.00" /></TD>
                </TR>
                <TR>
                  <TD sticky mono>#3</TD>
                  <TD>CFM56-5B4</TD>
                  <TD><Badge>Engine</Badge></TD>
                  <TD>
                    <StateChip tone="unrecorded" hint="Past expiry; storage still reads ACTIVE.">
                      Lapsed
                    </StateChip>
                  </TD>
                  <TD numeric><Amount value="2,400,000.00" /></TD>
                </TR>
              </TBody>
            </Table>
          </TableWrap>
          <SampleNote>
            Real listings from the testnet deployment, shown as a static snapshot. Live reads
            arrive with the chain integration.
          </SampleNote>
        </div>

        <div className="mt-6 rounded border border-unrecorded/40 bg-unrecorded-bg p-4">
          <p className="text-sm font-medium text-ink">
            Why listing #3 says &ldquo;Lapsed&rdquo; and not &ldquo;Active&rdquo;
          </p>
          <p className="mt-1 max-w-[76ch] text-sm leading-relaxed text-ink-2">
            Its deadline has passed, but recording that costs gas, so the contract&rsquo;s stored
            status still reads <code className="font-mono text-xs">ACTIVE</code>. An interface
            that renders the raw field would offer it for sale. Every status in this app is
            computed against the chain&rsquo;s own clock instead of read, which is why it can tell
            you the truth here.
          </p>
        </div>

        <div className="mt-6">
          <Link href="/marketplace" className="text-sm font-medium text-accent hover:underline">
            How settlement works →
          </Link>
        </div>
      </Section>

      {/* ── 7 · How it works ──────────────────────────────────────── */}
      <Section id="how">
        <SectionHead
          eyebrow="How it works"
          title="From registration to settled trade"
          lede="Every step is a contract call anyone can inspect, and every one of them emits an event sufficient to rebuild the state off-chain."
        />
        <div className="mt-8">
          <Steps
            steps={[
              {
                title: "An organization registers and is verified",
                body: "Anyone can self-register an organization. An authorised verifier attests to it before it can introduce records into the registry.",
                note: "registerOrganization → verifyOrganization",
              },
              {
                title: "An asset is registered and given a passport",
                body: "A verified organization registers an airframe, engine or component. It gets a permanent identifier, salted commitments to its serial and tail number, and an owner.",
                note: "registerAircraft / registerComponent",
              },
              {
                title: "Provenance accumulates",
                body: "Documents are registered as hashes and locations. Credentialed maintenance organizations record work performed. Nothing can be deleted; a superseded record stays visible.",
                note: "registerDocument · recordMaintenance",
              },
              {
                title: "The owner lists it",
                body: "A verified, transferable, uninstalled asset can be listed in an allowlisted settlement token. Nine preconditions are checked on-chain before a listing exists.",
                note: "createListing",
              },
              {
                title: "A buyer offers; the seller accepts",
                body: "An offer moves no money — it is an expression of intent. Acceptance freezes price, protocol fee and both deadlines, and deploys an escrow contract for this trade alone.",
                note: "makeOffer → acceptOffer",
              },
              {
                title: "The buyer funds, then releases",
                body: "The buyer deposits the exact price into that escrow, which locks the asset. On release, title moves to the buyer, the fee goes to the treasury and the balance to the seller — in one transaction, or none of it happens.",
                note: "fund → release",
              },
              {
                title: "Every stall has an exit",
                body: "An unfunded trade can be cancelled by either party, or by anyone once the funding window closes. A funded trade that stalls refunds the buyer after the settlement window. A dispute that nobody arbitrates refunds in full. No party's funds ever depend on a counterparty choosing to act.",
                note: "cancel · claimTimeout · claimDisputeTimeout",
              },
            ]}
          />
        </div>

        <div className="mt-8">
          <p className="label-key mb-3">Protocol parameters, as deployed</p>
          <FactStrip
            facts={[
              { label: "Protocol fee", value: "2.00%", note: "Hard-capped at 10% in immutable code" },
              { label: "Funding window", value: "7 days", note: "Then anyone may cancel" },
              { label: "Settlement window", value: "14 days", note: "Then the buyer is refunded, less 2%" },
              { label: "Governance delay", value: "48 hours", note: "On every privileged change" },
            ]}
          />
        </div>
      </Section>

      {/* ── 8 · Enterprise and integration ────────────────────────── */}
      <Section tone="panel" id="enterprise">
        <div className="grid gap-8 laptop:grid-cols-[1fr_1.2fr]">
          <SectionHead
            eyebrow="Integration"
            title="No private API, because there is no private data"
            lede="Every read this interface performs, any system can perform. The contracts are the API."
          />
          <div className="grid gap-4">
            <FeatureCard icon={Plug} title="Read directly from the chain">
              Any Ethereum client can call the same view functions this site uses. The asset
              passport aggregates an entire record in one call; paginated accessors handle
              assets with decades of history.
            </FeatureCard>
            <FeatureCard icon={Wrench} title="Build against typed artifacts">
              ABIs, enums and all 116 custom errors are generated from the compiled contracts
              rather than transcribed. Events are designed so an indexer can rebuild protocol
              state without trusting any server.
            </FeatureCard>
            <FeatureCard icon={Lock} title="Operate your own roles">
              Verification, credential issuance, arbitration and incident pause are all
              on-chain roles. An operator holds their own keys; no account here can act for
              them.
            </FeatureCard>
            <p className="text-sm leading-relaxed text-ink-2">
              Contracts are verified on Etherscan and the full specification, internal audit and
              source are public.{" "}
              <ExternalLink href={REPO}>Repository</ExternalLink>
            </p>
          </div>
        </div>
      </Section>

      {/* ── 9 · Final CTA ─────────────────────────────────────────── */}
      <section className="bg-ground py-12 laptop:py-16">
        <Container>
          <CTABand
            title="Start with a record you can check"
            lede="Browse what is listed on the testnet deployment, or take a document you already hold and confirm for yourself whether it matches the chain."
            primary={{ href: "/marketplace", label: "Explore marketplace" }}
            secondary={{ href: "/verification", label: "Verify an asset" }}
          />
        </Container>
      </section>
    </>
  );
}
