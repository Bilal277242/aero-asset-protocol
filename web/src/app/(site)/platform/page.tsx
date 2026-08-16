import type { Metadata } from "next";
import { Container, Section, SectionHead, FeatureCard, FactStrip, CTABand, ExternalLink } from "@/components/site/sections";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, THead, TBody, TR, TH, TD, TableCaption } from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "Five contract layers covering identity, assets, provenance and settlement — with immutable finance contracts and timelocked governance.",
};

const REPO = "https://github.com/Bilal277242/aero-asset-protocol";

const LAYERS = [
  {
    id: "L0",
    name: "Core",
    contracts: "ProtocolAddressRegistry · RoleManager · ProtocolTimelock",
    body: "One address registry every module resolves its peers through, so any single contract can be replaced without redeploying everything downstream. One central role manager — there is no owner account anywhere in the protocol.",
  },
  {
    id: "L1",
    name: "Identity",
    contracts: "OrganizationRegistry · CredentialRegistry",
    body: "Organizations self-register, then an authorised verifier attests to them. Typed aviation credentials — maintenance authority, inspection authority, manufacturing approval — gate who may perform which action.",
  },
  {
    id: "L2",
    name: "Assets",
    contracts: "AssetRegistry · AssetOwnership · AircraftRegistry · ComponentRegistry",
    body: "One identifier space for every asset. Ownership lives in a separate ledger with its own transfer offers, freezes and settlement locks, so a marketplace defect cannot reach title.",
  },
  {
    id: "L3",
    name: "Provenance",
    contracts: "DocumentRegistry · MaintenanceRegistry · AssetPassport",
    body: "Documents are hashes and locations, never contents. Maintenance records carry both a claimed and a witnessed date. The passport aggregates an entire asset in one read and owns no storage of its own.",
  },
  {
    id: "L4",
    name: "Transaction",
    contracts: "Marketplace · EscrowFactory · Escrow · FeeManager",
    body: "The marketplace records intent and never custodies funds or assets. Each accepted offer deploys a fresh escrow contract holding that trade alone, so a defect cannot reach money held for an unrelated trade.",
  },
];

export default function PlatformPage() {
  return (
    <>
      <Section tone="panel">
        <SectionHead
          as="h1"
          eyebrow="Platform"
          title="Sixteen contracts, five layers, one direction of dependency"
          lede="Every layer may call downward and never upward. The contracts that hold money are immutable; the registries that hold data can be upgraded, but only through a timelock that makes every change visible before it lands."
        />
        <div className="mt-8">
          <FactStrip
            facts={[
              { label: "Deployed contracts", value: "16", note: "Nine behind upgradeable proxies" },
              { label: "Protocol roles", value: "11", note: "Three held only by contracts" },
              { label: "Typed errors", value: "116", note: "No untyped failures anywhere" },
              { label: "Events", value: "55", note: "Sufficient to rebuild state off-chain" },
            ]}
          />
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="Architecture" title="The layers" />
        <div className="mt-8 grid gap-px overflow-hidden rounded border border-rule bg-rule">
          {LAYERS.map((l) => (
            <div key={l.id} className="grid gap-2 bg-panel p-4 laptop:grid-cols-[100px_1fr]">
              <div>
                <Badge variant="accent">{l.id}</Badge>
              </div>
              <div>
                <h3 className="text-md font-semibold tracking-tight text-ink">{l.name}</h3>
                <p className="mt-0.5 font-mono text-2xs text-ink-3">{l.contracts}</p>
                <p className="mt-2 max-w-[76ch] text-sm leading-relaxed text-ink-2">{l.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="panel">
        <SectionHead
          eyebrow="Design decisions"
          title="Choices with consequences"
          lede="Four decisions shape everything else, and each was made deliberately rather than by default."
        />
        <div className="mt-8 grid gap-4 tablet:grid-cols-2">
          <FeatureCard title="Ownership is not a token" fact="Custom registry, not ERC-721">
            Aviation transfers are gated on conditions a token standard cannot express — the
            asset must be verified, unfrozen, not held by a settlement lock, and not an engine
            currently bolted to an airframe. Making assets transferable by a standard
            `transferFrom` would mean giving up every one of those guarantees.
          </FeatureCard>
          <FeatureCard title="Money contracts cannot be upgraded" fact="Escrow · EscrowFactory · FeeManager">
            Registries can be fixed if a bug is found. The contracts holding funds cannot,
            because an upgradeable escrow is one governance compromise away from being drained.
            The trade-off is deliberate: data is recoverable, money is not.
          </FeatureCard>
          <FeatureCard title="One escrow per trade" fact="EIP-1167 minimal proxy clone">
            A single pooled escrow would put every trade's funds behind one contract. A clone
            per trade means a defect reaches exactly one deal, and the contract's authority to
            move an aircraft exists only while that deal is live.
          </FeatureCard>
          <FeatureCard title="Effective status is computed, never stored" fact="isListingActive · isOfferActive · isValid">
            A listing past its deadline still reads ACTIVE in storage, because recording the
            expiry costs gas that nobody has a reason to spend. The contracts expose the
            computed answer alongside the stored one, and any correct client uses it.
          </FeatureCard>
        </div>
      </Section>

      <Section>
        <SectionHead
          eyebrow="Governance"
          title="No owner, no admin key, no exceptions"
          lede="Administrative power is held by a timelock contract rather than a person. Every privileged action is queued publicly and executes only after the delay."
        />
        <div className="mt-8">
          <TableWrap>
            <Table>
              <TableCaption>Protocol roles and their holders</TableCaption>
              <THead>
                <TR>
                  <TH sticky>Role</TH>
                  <TH>Authority</TH>
                  <TH>Held by</TH>
                </TR>
              </THead>
              <TBody>
                {[
                  ["PROTOCOL_ADMIN", "Upgrades, address book, token allowlist, unpause", "Timelock · 48 h"],
                  ["FEE_MANAGER", "Fee rate and treasury, within a hard cap", "Timelock · 48 h"],
                  ["PAUSER", "Halt a module — and deliberately cannot restart one", "Operational key"],
                  ["ORG_VERIFIER", "Verify, suspend and reactivate organizations", "Operational key"],
                  ["ASSET_VERIFIER", "Attest to an asset, and withdraw that attestation", "Operational key"],
                  ["CREDENTIAL_ISSUER", "Issue and revoke aviation credentials", "Operational key"],
                  ["ARBITRATOR", "Resolve a disputed escrow to exactly one party", "Operational key"],
                  ["ASSET_MINTER", "Mint an asset id on an organization's behalf", "Contracts only"],
                  ["ESCROW_FACTORY", "Grant settlement authority to a new escrow", "Contracts only"],
                  ["SETTLEMENT", "Move title for one specific trade", "Live escrows only"],
                ].map(([role, authority, holder]) => (
                  <TR key={role}>
                    <TD sticky mono>{role}</TD>
                    <TD className="text-ink-2">{authority}</TD>
                    <TD className="text-ink-2">{holder}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
          <p className="mt-3 max-w-[76ch] text-sm leading-relaxed text-ink-2">
            The asymmetry between pausing and unpausing is intentional. Halting the protocol
            during an incident must be fast and low-trust; restarting it must be slow and
            high-trust. A compromised pauser key can disrupt, but cannot extract value.
          </p>
        </div>
      </Section>

      <Section tone="panel">
        <SectionHead
          eyebrow="Security posture"
          title="What has and has not been done"
          lede="Stated plainly, because the alternative is letting a reader assume more than is true."
        />
        <div className="mt-6 grid gap-4 laptop:grid-cols-2">
          <div className="rounded border border-rule bg-panel p-4">
            <p className="label-key mb-2">Completed</p>
            <ul className="grid gap-1.5 text-sm text-ink-2">
              <li>Full test suite including fuzz and protocol-level invariant tests</li>
              <li>Static analysis blocking in CI at medium severity and above</li>
              <li>An internal audit, with every finding remediated and regression-tested</li>
              <li>Staged deployment with an on-chain verification script asserting the result</li>
              <li>All contracts source-verified on Etherscan</li>
            </ul>
          </div>
          <div className="rounded border border-adverse/40 bg-adverse-bg p-4">
            <p className="label-key mb-2">Not done</p>
            <ul className="grid gap-1.5 text-sm text-ink-2">
              <li>
                <strong className="font-medium text-ink">No independent audit.</strong> The
                internal review was performed by the same author as the code, which is a real
                weakness in it.
              </li>
              <li>No mainnet deployment, and no production key custody</li>
              <li>Arbitration is centralised in V1 — bounded, but centralised</li>
              <li>Griefing is bounded rather than priced</li>
            </ul>
          </div>
        </div>
        <p className="mt-4 max-w-[76ch] text-sm leading-relaxed text-ink-2">
          The full internal audit, including the findings that were raised against this code
          and how each was closed, is public.{" "}
          <ExternalLink href={`${REPO}/tree/main/audit`}>Read the audit</ExternalLink>
        </p>
      </Section>

      <section className="py-12 laptop:py-16">
        <Container>
          <CTABand
            title="Read the specification"
            lede="Thirteen documents covering architecture, state machines, permissions, invariants and the threat model."
            primary={{ href: "/documentation", label: "Documentation" }}
            secondary={{ href: "/verification", label: "Verify an asset" }}
          />
        </Container>
      </section>
    </>
  );
}
