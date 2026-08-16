import type { Metadata } from "next";
import { Container, Section, SectionHead, CTABand, ExternalLink, FactStrip } from "@/components/site/sections";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "About",
  description:
    "What AeroAsset is, the principles it was built on, and an honest account of its current status and limitations.",
};

const REPO = "https://github.com/Bilal277242/aero-asset-protocol";

export default function AboutPage() {
  return (
    <>
      <Section tone="panel">
        <SectionHead
          as="h1"
          eyebrow="About"
          title="A protocol, not a company"
          lede="AeroAsset is an open-source set of smart contracts and an interface for reading and using them. There is no custodian, no account to open, and nothing here holds anyone's assets or documents."
        />
      </Section>

      <Section>
        <div className="grid gap-8 laptop:grid-cols-2">
          <div>
            <SectionHead eyebrow="Why it exists" title="Records are the asset" />
            <div className="mt-4 grid gap-3 text-sm leading-relaxed text-ink-2">
              <p>
                A commercial airframe is worth a great deal less without its records. Continuous
                airworthiness documentation, maintenance history, component provenance and clear
                title are what make an aircraft financeable and saleable — and a gap in any of
                them is usually discovered at the point of sale, when it is most expensive to
                resolve.
              </p>
              <p>
                Today those records move as PDFs and email attachments between parties who have
                no particular reason to trust one another, and are held by whoever happens to
                hold them. There is no way to prove that a document existed in a given form on a
                given date without trusting the custodian, and no way to check a claim without
                asking the party making it.
              </p>
              <p>
                This protocol does not solve that by digitising paperwork. It adds one thing:
                a shared, append-only record of{" "}
                <strong className="font-medium text-ink">who asserted what, and when</strong>,
                that no participant can revise afterwards and anyone can check independently.
              </p>
            </div>
          </div>

          <div>
            <SectionHead eyebrow="What it deliberately is not" title="Scope, and its edges" />
            <div className="mt-4 grid gap-3 text-sm leading-relaxed text-ink-2">
              <p>
                It is not a document store. Aviation records are large and often confidential;
                the chain holds a hash and a location, never contents.
              </p>
              <p>
                It is not a registry of legal title. Ownership here is protocol state. Real title
                is a matter for the relevant civil aviation authority and the law of the
                jurisdiction involved.
              </p>
              <p>
                It is not an airworthiness authority. Nothing in the protocol constitutes a
                certification, an approval, or a release to service.
              </p>
              <p>
                And a deliberately short feature list: no fractional ownership, no tokenised
                securities, no lending against airframes, no automated valuation. Each was
                considered and excluded from V1 as a scope decision rather than a technical one.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="panel">
        <SectionHead
          eyebrow="Principles"
          title="How this was built"
          lede="Four commitments that shaped the code and this interface, in roughly the order they mattered."
        />
        <div className="mt-8 grid gap-4 tablet:grid-cols-2">
          <Card>
            <CardHeader title="Never claim more than the chain knows" />
            <CardBody className="text-sm leading-relaxed text-ink-2">
              Every non-claim in this protocol appears beside the thing it qualifies, not in a
              footer. A verified badge without its qualifier would let a reader infer legal
              title or airworthiness from a green tick, and in this domain that inference has
              real safety and financial consequences.
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Show state as it truly is, not as it is stored" />
            <CardBody className="text-sm leading-relaxed text-ink-2">
              Listings, offers and credentials carry a status that goes stale — an expired
              listing still reads active until somebody pays gas to record the expiry. The
              contracts expose the computed answer for exactly this reason, and this interface
              is built so that rendering the stale field is a compile error rather than a
              judgement call.
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="No exit should depend on a counterparty" />
            <CardBody className="text-sm leading-relaxed text-ink-2">
              Every non-terminal escrow state is bounded by a deadline after which anyone at
              all can move it to a terminal state. An unresponsive buyer, an absent arbitrator
              or an administrative pause can delay a trade; none of them can strand the money.
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Say what has not been done" />
            <CardBody className="text-sm leading-relaxed text-ink-2">
              The internal audit was performed by the same author as the code, and its two most
              severe findings were design decisions that same author had written and defended.
              That is a real weakness and it is stated at the top of the audit rather than
              buried in it.
            </CardBody>
          </Card>
        </div>
      </Section>

      <Section>
        <SectionHead
          eyebrow="Status"
          title="Where this actually stands"
          lede="Current as of the Sepolia deployment. Nothing below is aspirational."
        />
        <div className="mt-8">
          <FactStrip
            facts={[
              { label: "Network", value: "Sepolia", note: "Testnet only · chain 11155111" },
              { label: "Contracts deployed", value: "16", note: "All source-verified on Etherscan" },
              { label: "Independent audit", value: "None", note: "Internal review only" },
              { label: "Licence", value: "MIT", note: "Source publicly available" },
            ]}
          />
        </div>

        <div className="mt-6 rounded border border-adverse/40 bg-adverse-bg p-4">
          <p className="text-sm font-medium text-ink">This is not production software</p>
          <p className="mt-1 max-w-[76ch] text-sm leading-relaxed text-ink-2">
            It runs on a test network, holds no assets of value, and has not been reviewed by an
            independent security auditor. An independent human audit is a hard prerequisite
            before this protocol handles anything real. Nothing on this site is an offer, an
            inducement, or financial, legal or airworthiness advice.
          </p>
        </div>
      </Section>

      <Section tone="panel">
        <SectionHead
          eyebrow="Openness"
          title="Everything is checkable"
          lede="There is no private component. The contracts, the specification, the audit and this interface are all public."
        />
        <div className="mt-6 grid gap-3 text-sm text-ink-2">
          <p>
            <ExternalLink href={REPO}>Source repository</ExternalLink> — contracts, tests,
            deployment scripts and this interface.
          </p>
          <p>
            <ExternalLink href={`${REPO}/tree/main/docs`}>Specification</ExternalLink> — thirteen
            documents covering architecture, state machines, permissions, invariants and the
            threat model. The specification is treated as authoritative: where the code and the
            documents have disagreed, the disagreement was recorded and one of them was fixed.
          </p>
          <p>
            <ExternalLink href={`${REPO}/tree/main/audit`}>Internal audit</ExternalLink> — five
            domain reviews and a finding catalogue, including findings raised against this code
            and how each was closed.
          </p>
          <p>
            <ExternalLink href="https://sepolia.etherscan.io/address/0xc9cf5998604A65e2C115476b7D165CB7A68e6224">
              Address registry on Etherscan
            </ExternalLink>{" "}
            — the single root of trust. Every other contract address resolves through it.
          </p>
        </div>
      </Section>

      <section className="py-12 laptop:py-16">
        <Container>
          <CTABand
            title="Read the specification"
            lede="Or take a document you hold and check it against the chain yourself."
            primary={{ href: "/documentation", label: "Documentation" }}
            secondary={{ href: "/contact", label: "Get in touch" }}
          />
        </Container>
      </section>
    </>
  );
}
