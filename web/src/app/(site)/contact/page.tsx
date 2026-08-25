import type { Metadata } from "next";
import { Bug, BookOpen, ShieldAlert, Code2 } from "lucide-react";
import { Container, Section, SectionHead, CTABand, ExternalLink } from "@/components/site/sections";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "How to reach the AeroAsset project — issues, security reports and integration questions.",
};

const REPO = "https://github.com/Bilal277242/aero-asset-protocol";

const CHANNELS = [
  {
    icon: Bug,
    title: "Report a defect",
    body: "Something in the contracts or this interface behaves differently from the specification. Include the chain, the contract address and the transaction hash if there is one.",
    href: `${REPO}/issues/new`,
    label: "Open an issue",
  },
  {
    icon: ShieldAlert,
    title: "Report a security issue",
    body: "Please do not open a public issue for anything that could put funds or records at risk. Use GitHub's private vulnerability reporting, which goes to the maintainer without disclosing the detail publicly.",
    href: `${REPO}/security/advisories/new`,
    label: "Private security report",
  },
  {
    icon: Code2,
    title: "Integration questions",
    body: "How to read a passport, decode an error, or scan for events. Public issues are preferred: the answer is then available to whoever asks the same thing next.",
    href: `${REPO}/issues`,
    label: "Browse and ask",
  },
  {
    icon: BookOpen,
    title: "Corrections to the specification",
    body: "The specification is treated as authoritative, which makes an error in it a real defect. Two have already been found and fixed this way.",
    href: `${REPO}/tree/main/docs`,
    label: "Read the specification",
  },
];

export default function ContactPage() {
  return (
    <>
      <Section tone="panel">
        <SectionHead
          as="h1"
          eyebrow="Contact"
          title="Where to raise something"
          lede="AeroAsset is an open-source protocol rather than a company. There is no sales team, no support desk and no account management — but there is a public repository where everything gets answered in the open."
        />
      </Section>

      <Section>
        <div className="grid gap-4 tablet:grid-cols-2">
          {CHANNELS.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.title}>
                <CardHeader title={c.title} />
                <CardBody className="grid gap-3">
                  <Icon className="size-5 text-accent" aria-hidden="true" />
                  <p className="text-sm leading-relaxed text-ink-2">{c.body}</p>
                  <ExternalLink href={c.href} className="text-sm font-medium">
                    {c.label}
                  </ExternalLink>
                </CardBody>
              </Card>
            );
          })}
        </div>

        {/* A form would need a server to receive it, and there isn't one. Saying so is
            better than shipping a form that silently discards what people write. */}
        <div className="mt-6 rounded-md bg-panel shadow-raised p-4">
          <p className="text-sm font-medium text-ink">Why there is no contact form here</p>
          <p className="mt-1 max-w-[76ch] text-sm leading-relaxed text-ink-2">
            A form needs a server to receive it and someone to monitor the inbox. This project
            has neither, and a form that quietly discarded what you wrote would be worse than
            no form at all. Every channel above reaches the maintainer directly.
          </p>
        </div>
      </Section>

      <Section tone="panel">
        <SectionHead
          eyebrow="Before you write"
          title="Things that are already answered"
          lede="Three questions come up often enough to answer here."
        />
        <div className="mt-6 grid gap-4">
          {[
            {
              q: "Can I use this with real aircraft or real money?",
              a: "No. It is deployed on a test network, has not had an independent security audit, and holds nothing of value. An independent audit is a hard prerequisite before it handles anything real.",
            },
            {
              q: "Is on-chain ownership here legally binding?",
              a: "No. Ownership in this protocol is protocol state. Legal title is a matter for the relevant civil aviation authority and the law of the jurisdiction involved, and nothing here changes that.",
            },
            {
              q: "Can you remove or correct a record?",
              a: "No, and neither can anyone else — that is the point. Documents can be superseded or revoked and both remain visible; maintenance records cannot be amended, only added to. An append-only history that someone can edit is not a history.",
            },
          ].map((f) => (
            <div key={f.q} className="rounded-md bg-panel shadow-raised p-4">
              <p className="text-sm font-medium text-ink">{f.q}</p>
              <p className="mt-1 max-w-[76ch] text-sm leading-relaxed text-ink-2">{f.a}</p>
            </div>
          ))}
        </div>
      </Section>

      <section className="py-12 laptop:py-16">
        <Container>
          <CTABand
            title="Everything is public"
            lede="Contracts, specification, internal audit and this interface — all in one repository."
            primary={{ href: "/documentation", label: "Documentation" }}
            secondary={{ href: "/about", label: "About the project" }}
          />
        </Container>
      </section>
    </>
  );
}
