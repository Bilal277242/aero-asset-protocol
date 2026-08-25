import type { Metadata } from "next";
import { Container, Section, SectionHead, CTABand, ExternalLink } from "@/components/site/sections";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, THead, TBody, TR, TH, TD, TableCaption } from "@/components/ui/table";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Specification, contract reference, deployed addresses and integration notes for the AeroAsset protocol.",
};

const REPO = "https://github.com/Bilal277242/aero-asset-protocol";
const DOCS = `${REPO}/blob/main/docs`;
const EXPLORER = "https://sepolia.etherscan.io/address";

const SPEC = [
  ["architecture.md", "Layering, module boundaries and the eight foundational decisions"],
  ["requirements.md", "Functional and non-functional requirements, and the V1 scope gate"],
  ["asset-model.md", "Every struct and enum, with field semantics and storage packing"],
  ["state-machines.md", "Every lifecycle and every legal transition, with the guards"],
  ["permissions.md", "Function-level permission matrix, each row backed by tests"],
  ["roles.md", "Role catalogue, key custody expectations and the incident runbook"],
  ["events.md", "Event catalogue and the indexing strategy behind it"],
  ["errors.md", "The custom error catalogue"],
  ["invariants.md", "Protocol invariants and how each is encoded as an executable test"],
  ["security-model.md", "Trust assumptions and the controls that back them"],
  ["threat-model.md", "Attacker profiles and threats T-01 through T-16"],
  ["storage-model.md", "Namespaced storage layout and the rules for upgrading it"],
  ["deploy.md", "Deployment runbook — key custody, staged rollout, verification"],
];

const FRONTEND = [
  ["frontend-contract-map.md", "Every contract's read and write surface, mapped to features"],
  ["frontend-architecture.md", "How this interface is structured and why"],
  ["design-system.md", "Tokens, components and the responsive strategy"],
];

const ADDRESSES: [string, string, string][] = [
  ["ProtocolAddressRegistry", "0xc9cf5998604A65e2C115476b7D165CB7A68e6224", "Root of trust — resolves every other address"],
  ["RoleManager", "0x8C39Daef421BF14BB4Bb56712eDd8bc52CEF7126", "All eleven protocol roles"],
  ["ProtocolTimelock", "0x9Ed700bD47c8782b6C428F0eDd50c2F7Ea57728F", "48-hour delay on privileged actions"],
  ["OrganizationRegistry", "0x64fBD54f4Cb8bA641a05a32C789924Be31722EBB", "Organizations and operators"],
  ["CredentialRegistry", "0xEdB1aE99c7F1a32b3A6a0F39c7F421386eC6d1e9", "Typed aviation credentials"],
  ["AssetRegistry", "0x88E3A5094DFA93926f3B6D5ED57173D3473EA660", "Asset identity, status, verification"],
  ["AssetOwnership", "0xeA2b26E8B8d1ed33Fd2339478cd50465478Ad812", "Ownership ledger, transfers, locks"],
  ["AircraftRegistry", "0xA68ff461Fe0F79ee9C9587EB5a20b896Cdd44f1C", "Airframe specialization"],
  ["ComponentRegistry", "0xe1d04AD09C240Adf4B494F89869fA4B06Add4B31", "Components and installation"],
  ["DocumentRegistry", "0x6167260075f2300f01ce8152df65E724d985fE9f", "Document hashes and locations"],
  ["MaintenanceRegistry", "0xe25c0A7F34cC30cB0bf37bBe990f332114F29B9B", "Maintenance records"],
  ["AssetPassport", "0x057FA5385B4CbD4c6d0a5B5d109B171F883763e4", "Read-only aggregator"],
  ["Marketplace", "0xA38072A464D8EDC2a7C74B84eC463e3E1eA36B86", "Listings and offers"],
  ["FeeManager", "0xb69A4c294D994B94B097307F38adf9c1634CC083", "Fee rates and token allowlist"],
  ["EscrowFactory", "0x3F0A2CC772d0e714970425beC8b31dd415E0c390", "Deploys one escrow per trade"],
  ["Escrow (implementation)", "0xfC317babD11079c5Edb75311C6a6146699C88006", "Cloned per trade"],
];

export default function DocumentationPage() {
  return (
    <>
      <Section tone="panel">
        <SectionHead
          as="h1"
          eyebrow="Documentation"
          title="The specification is the source of truth"
          lede="Sixteen documents covering the protocol and this interface. Where the code and the specification have disagreed, the disagreement was recorded and one of them was corrected — twice so far."
        />
      </Section>

      <Section>
        <SectionHead eyebrow="Protocol specification" title="Thirteen documents" />
        <div className="mt-6">
          <TableWrap>
            <Table>
              <TableCaption>Protocol specification documents</TableCaption>
              <THead>
                <TR>
                  <TH sticky>Document</TH>
                  <TH>Contents</TH>
                </TR>
              </THead>
              <TBody>
                {SPEC.map(([file, desc]) => (
                  <TR key={file}>
                    <TD sticky mono>
                      <ExternalLink href={`${DOCS}/${file}`}>{file}</ExternalLink>
                    </TD>
                    <TD className="text-ink-2">{desc}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </div>
      </Section>

      <Section tone="panel">
        <SectionHead
          eyebrow="Interface"
          title="Building against the protocol"
          lede="Written while building this site, and useful to anyone integrating independently."
        />
        <div className="mt-6 grid gap-4 laptop:grid-cols-3">
          {FRONTEND.map(([file, desc]) => (
            <Card key={file}>
              <CardHeader title={file} />
              <CardBody className="grid gap-3 text-sm text-ink-2">
                <p>{desc}</p>
                <ExternalLink href={`${DOCS}/${file}`}>Read</ExternalLink>
              </CardBody>
            </Card>
          ))}
        </div>

        <div className="mt-6 rounded-md bg-panel shadow-raised p-4">
          <p className="text-sm font-medium text-ink">Three constraints worth knowing before you integrate</p>
          <ul className="mt-2 grid gap-2 text-sm leading-relaxed text-ink-2">
            <li>
              <strong className="font-medium text-ink">Stored status goes stale.</strong> Listings,
              offers and credentials expose both a stored status and a computed one. Read{" "}
              <code className="font-mono text-xs">isListingActive</code>,{" "}
              <code className="font-mono text-xs">isOfferActive</code> and{" "}
              <code className="font-mono text-xs">isValid</code> — never the raw field.
            </li>
            <li>
              <strong className="font-medium text-ink">Aggregate views revert on a miss.</strong>{" "}
              <code className="font-mono text-xs">getPassport</code>,{" "}
              <code className="font-mono text-xs">getListing</code> and their siblings revert
              rather than returning empty. Batch reads need failure tolerance or one bad id takes
              the whole call down.
            </li>
            <li>
              <strong className="font-medium text-ink">There is no enumeration by owner.</strong>{" "}
              No <code className="font-mono text-xs">assetsOf(address)</code> exists anywhere.
              Ownership and party queries are answered from event logs, and two of them —
              escrow parties and credential subjects — are not indexed, so they require a
              client-side filter.
            </li>
          </ul>
        </div>
      </Section>

      <Section>
        <SectionHead
          eyebrow="Deployment"
          title="Deployed addresses"
          lede="Sepolia, chain 11155111. Nine of these are proxies; call the addresses below, never an implementation directly — an implementation reads empty storage and returns plausible zeroes."
        />
        <div className="mt-6">
          <TableWrap>
            <Table>
              <TableCaption>Deployed contract addresses on Sepolia</TableCaption>
              <THead>
                <TR>
                  <TH sticky>Contract</TH>
                  <TH>Address</TH>
                  <TH>Role</TH>
                </TR>
              </THead>
              <TBody>
                {ADDRESSES.map(([name, addr, role]) => (
                  <TR key={addr}>
                    <TD sticky>{name}</TD>
                    <TD mono>
                      <ExternalLink href={`${EXPLORER}/${addr}`}>{addr}</ExternalLink>
                    </TD>
                    <TD className="text-ink-2">{role}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
          <p className="mt-3 text-sm text-ink-2">
            Settlement token: Sepolia USDC{" "}
            <code className="font-mono text-xs">0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238</code>,
            six decimals. All contracts are source-verified.
          </p>
        </div>
      </Section>

      <Section tone="panel">
        <SectionHead eyebrow="Running it" title="Build from source" />
        <div className="mt-6 grid gap-4 laptop:grid-cols-2">
          <Card>
            <CardHeader title="Contracts" description="Foundry" />
            <CardBody>
              <pre className="overflow-x-auto rounded-xs bg-sunken shadow-inset-sm p-3 font-mono text-2xs leading-relaxed text-ink-2">
{`git clone --recurse-submodules \\
  ${REPO.replace("https://", "")}
cd aero-asset-protocol
forge build
forge test`}
              </pre>
              <p className="mt-2 text-xs text-ink-2">
                Solidity 0.8.28, EVM target cancun, compiled through the IR pipeline so the
                bytecode under test is the bytecode that ships.
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Interface" description="Next.js" />
            <CardBody>
              <pre className="overflow-x-auto rounded-xs bg-sunken shadow-inset-sm p-3 font-mono text-2xs leading-relaxed text-ink-2">
{`cd web
npm install
npm run dev`}
              </pre>
              <p className="mt-2 text-xs text-ink-2">
                Chain integration is in progress. The design system is browsable at{" "}
                <code className="font-mono">/design</code>.
              </p>
            </CardBody>
          </Card>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="outline">Solidity 0.8.28</Badge>
          <Badge variant="outline">Foundry</Badge>
          <Badge variant="outline">OpenZeppelin 5.4.0</Badge>
          <Badge variant="outline">Next.js 15</Badge>
          <Badge variant="outline">MIT</Badge>
        </div>
      </Section>

      <section className="py-12 laptop:py-16">
        <Container>
          <CTABand
            title="Questions about integrating?"
            lede="The repository is the best place to raise them, and issues are public so the answer helps whoever asks next."
            primary={{ href: "/contact", label: "Get in touch" }}
            secondary={{ href: "/platform", label: "Platform overview" }}
          />
        </Container>
      </section>
    </>
  );
}
