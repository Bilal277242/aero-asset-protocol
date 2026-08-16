import type { Metadata } from "next";
import { Container, Section, SectionHead, Steps, CTABand, ExternalLink } from "@/components/site/sections";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/data/states";
import { NonClaim } from "@/components/protocol/non-claim";
import { Table, TableWrap, THead, TBody, TR, TH, TD, TableCaption } from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Verification",
  description:
    "Three different things are called verification in this protocol. What each one proves, what it does not, and how to check any of them yourself.",
};

const REPO = "https://github.com/Bilal277242/aero-asset-protocol";

export default function VerificationPage() {
  return (
    <>
      <Section tone="panel">
        <SectionHead
          as="h1"
          eyebrow="Verification"
          title="What can actually be proved, and by whom"
          lede="Three separate mechanisms get called verification here. They prove different things, and treating them as interchangeable is the most consequential mistake a reader of this registry can make."
        />
      </Section>

      <Section>
        <div className="grid gap-6 laptop:grid-cols-3">
          {[
            {
              n: "Asset verification",
              what: "An account holding ASSET_VERIFIER_ROLE attested to this asset at a recorded moment, crediting a named organization.",
              proves: "That a specific authorised role made a statement, on a specific date.",
              not: "Anything about airworthiness, condition, or the accuracy of the underlying records.",
              call: "AssetRegistry.verifyAsset",
            },
            {
              n: "Document verification",
              what: "The keccak256 hash of a file is compared against the commitment stored when the document was registered.",
              proves: "That the file in your hands is byte-identical to the one registered.",
              not: "That the document is genuine, current, or issued by the organization named on it.",
              call: "DocumentRegistry.documentIdOf",
            },
            {
              n: "Commitment verification",
              what: "Serial and tail numbers are stored as salted hashes. Given the value and salt, anyone can recompute the commitment.",
              proves: "That a record refers to the specific airframe or engine you believe it does.",
              not: "That the serial number itself was ever legitimate.",
              call: "keccak256(abi.encode(value, salt))",
            },
          ].map((c) => (
            <Card key={c.n}>
              <CardHeader title={c.n} />
              <CardBody className="grid gap-3 text-sm">
                <p className="text-ink-2">{c.what}</p>
                <div>
                  <p className="label-key">Proves</p>
                  <p className="mt-0.5 text-confirmed">{c.proves}</p>
                </div>
                <div>
                  <p className="label-key">Does not prove</p>
                  <p className="mt-0.5 text-ink-2">{c.not}</p>
                </div>
                <p className="border-t border-rule-2 pt-2 font-mono text-2xs text-ink-3">{c.call}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </Section>

      {/* The tool. Honest about not being wired yet. */}
      <Section tone="panel" id="tool">
        <SectionHead
          eyebrow="Check a record"
          title="Verify a document or a commitment"
          lede="Hashing happens in your browser. A document you check here is never uploaded, and the page has no network permission that would let it be."
        />

        <Banner tone="warning" title="Not yet connected to the chain" className="mt-6">
          The interface below is complete but the chain integration has not landed, so it
          cannot yet compare against live commitments. Until then, verify directly against the
          contracts — <ExternalLink href={`${REPO}/blob/main/docs/frontend-contract-map.md`}>the contract map</ExternalLink>{" "}
          documents every read needed.
        </Banner>

        <div className="mt-6 grid gap-4 laptop:grid-cols-2">
          <Card>
            <CardHeader
              title="A document file"
              description="Compared against the hashes registered for an asset."
            />
            <CardBody className="grid gap-4">
              <div className="flex items-center justify-center rounded border border-dashed border-rule px-4 py-10 text-center text-xs text-ink-3">
                Drop a file here, or click to choose one
              </div>
              <Field label="Asset id" htmlFor="v-asset" hint="Which asset's documents to check against.">
                <Input id="v-asset" mono placeholder="1" disabled />
              </Field>
              <Button variant="primary" disabled>
                Compute hash and compare
              </Button>
              <p className="text-xs leading-relaxed text-ink-2">
                A match proves the file is byte-identical to what was registered. A single
                re-saved PDF changes every byte, so a mismatch is not evidence of forgery
                either — only of a different file.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="A serial or registration mark"
              description="Recomputes the commitment stored on the asset."
            />
            <CardBody className="grid gap-4">
              <Field label="Value" htmlFor="v-value" hint="The serial number or tail number as it was committed.">
                <Input id="v-value" mono placeholder="MSN-7421" disabled />
              </Field>
              <Field
                label="Salt"
                htmlFor="v-salt"
                hint="Shared by whoever registered the asset. Without it the commitment cannot be reproduced."
              >
                <Input id="v-salt" mono placeholder="0x… or a decimal" disabled />
              </Field>
              <Button variant="primary" disabled>
                Recompute commitment
              </Button>
              <p className="text-xs leading-relaxed text-blocked">
                <strong className="font-medium">The salt is the protection, not the hash.</strong>{" "}
                Tail numbers and serials are short and publicly enumerable — an unsalted
                commitment is recoverable in seconds by anyone reading the chain.
              </p>
            </CardBody>
          </Card>
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="Diligence" title="Reading a passport properly" />
        <div className="mt-8">
          <Steps
            steps={[
              {
                title: "Confirm the asset is the one you mean",
                body: "Ask the seller for the serial number and the salt it was committed with, then recompute. Two aircraft of the same type look identical in a registry until you check the commitment.",
              },
              {
                title: "Check who attested, not just that something is verified",
                body: "A verified flag names the organization credited and the date. Check that the organization is still verified — verification can be suspended, and a suspension does not retroactively invalidate what it attested to.",
              },
              {
                title: "Hash the documents you were sent",
                body: "Any document that matters should match a commitment on the asset. A document that does not appear on-chain at all is not evidence of anything; the registry simply has never seen it.",
              },
              {
                title: "Read both maintenance dates",
                body: "Compare the claimed date against the date the chain witnessed the record. Several records with large gaps, all written in the same minute, is what a fabricated history looks like.",
              },
              {
                title: "Check ownership independently of the listing",
                body: "A listing stores the seller as a snapshot taken when it was created. If the asset has changed hands since, settlement will refuse — but the listing will still be sitting there looking normal.",
              },
            ]}
          />
        </div>
      </Section>

      <Section tone="panel">
        <SectionHead
          eyebrow="Limits"
          title="What this registry cannot do for you"
          lede="Written down because a verification page that only lists strengths is itself misleading."
        />
        <div className="mt-6">
          <TableWrap>
            <Table>
              <TableCaption>Limits of on-chain verification</TableCaption>
              <THead>
                <TR>
                  <TH sticky>Question</TH>
                  <TH>Answer</TH>
                </TR>
              </THead>
              <TBody>
                {[
                  ["Is this aircraft airworthy?", "The protocol has no opinion. It is not an airworthiness authority and makes no such determination."],
                  ["Does this record prove legal ownership?", "No. On-chain ownership is protocol state, not title under any jurisdiction's law and not a civil aviation authority's register."],
                  ["Is this document authentic?", "A hash proves the file is unchanged since registration. Whether it was genuine when registered is outside what any chain can establish."],
                  ["Did the maintenance actually happen?", "The performed date is the recording organization's claim. Only the recording date is witnessed."],
                  ["Is this organization real?", "The record shows an authorised role attested to it. That is an attestation, not a corporate identity check."],
                  ["Can a bad record be deleted?", "No. Records can be superseded or revoked, and both remain visible. The history is append-only by design."],
                ].map(([q, a]) => (
                  <TR key={q}>
                    <TD sticky className="font-medium">{q}</TD>
                    <TD className="text-ink-2">{a}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
          <div className="mt-4 grid gap-2">
            <NonClaim variant="title" display="block" />
            <NonClaim variant="airworthiness" display="block" />
          </div>
        </div>
      </Section>

      <section className="py-12 laptop:py-16">
        <Container>
          <CTABand
            title="See it applied to a real asset"
            lede="The testnet deployment holds four assets, one of them verified with a registered document."
            primary={{ href: "/marketplace", label: "Explore marketplace" }}
            secondary={{ href: "/documentation", label: "Read the specification" }}
          />
        </Container>
      </section>
    </>
  );
}
