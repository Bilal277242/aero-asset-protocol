"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardFooter, CardHeader, DataRow } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Skeleton, TableSkeleton, RecordSkeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StateChip, UnrecordedNote } from "@/components/protocol/state-chip";
import { NonClaim } from "@/components/protocol/non-claim";
import { AddressDisplay, Amount, BlockStamp, HashDisplay } from "@/components/protocol/chain-value";
import { VerificationStrip } from "@/components/protocol/verification-strip";
import { DataTable, Pagination, type Column } from "@/components/data/data-table";
import { Banner, EmptyState, ErrorState } from "@/components/data/states";

/* Sample rows mirror the real seeded Sepolia state so the table is not fiction. */
type Row = {
  id: string;
  designation: string;
  kind: string;
  year: string;
  state: React.ReactNode;
  price: string;
};

const ROWS: Row[] = [
  {
    id: "1",
    designation: "A320-214",
    kind: "Aircraft",
    year: "2018",
    state: <StateChip tone="confirmed">Active</StateChip>,
    price: "1.00",
  },
  {
    id: "3",
    designation: "B737-800",
    kind: "Aircraft",
    year: "2015",
    state: <StateChip tone="confirmed">Active</StateChip>,
    price: "28,500,000.00",
  },
  {
    id: "4",
    designation: "CFM56-5B4",
    kind: "Engine",
    year: "—",
    state: (
      <StateChip tone="unrecorded" hint="Past expiry; the chain still stores ACTIVE.">
        Lapsed
      </StateChip>
    ),
    price: "2,400,000.00",
  },
  {
    id: "2",
    designation: "CFM56-5B4",
    kind: "Engine",
    year: "—",
    state: (
      <StateChip tone="blocked" hint="Installed on airframe #1 and unverified.">
        Not listable
      </StateChip>
    ),
    price: "—",
  },
];

const COLUMNS: Column<Row>[] = [
  { key: "id", header: "ID", cell: (r) => `#${r.id}`, mono: true, sticky: true, sortable: true },
  { key: "designation", header: "Designation", cell: (r) => r.designation, sortable: true },
  { key: "kind", header: "Kind", cell: (r) => <Badge>{r.kind}</Badge>, hideBelow: "tablet" },
  { key: "year", header: "Year", cell: (r) => r.year, mono: true, hideBelow: "laptop" },
  { key: "state", header: "State", cell: (r) => r.state },
  { key: "price", header: "Price USDC", cell: (r) => r.price, numeric: true, sortable: true },
];

export default function DesignSystemPage() {
  const toast = useToast();
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" }>({
    key: "id",
    dir: "asc",
  });
  const [offset, setOffset] = React.useState(0);

  return (
    <AppShell standing={{ connected: true, hasOperations: true }}>
      <header className="mb-8">
        <p className="label-key">Design system</p>
        <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight text-ink">
          AeroAsset visual language
        </h1>
        <p className="mt-2 max-w-[70ch] text-md text-ink-2">
          Every token and component, rendered rather than described. Switch the theme in the
          top bar and resize the window — both are part of the specification.
        </p>
      </header>

      <div className="grid gap-10">
        <Section id="color" title="01 · Colour">
          <p className="mb-4 max-w-[68ch] text-sm text-ink-2">
            One accent, four semantic states, and neutrals with a deliberate blue-green bias
            toward the accent. The fourth state is the one most systems lack.
          </p>
          <div className="grid grid-cols-2 gap-3 tablet:grid-cols-3 laptop:grid-cols-6">
            <Swatch name="Accent" varName="--accent" note="Petrol. Interactive, links, focus." />
            <Swatch name="Confirmed" varName="--confirmed" note="The chain asserts it now." />
            <Swatch name="Blocked" varName="--blocked" note="An action would revert." />
            <Swatch name="Adverse" varName="--adverse" note="Terminal or hostile." />
            <Swatch name="Unrecorded" varName="--unrecorded" note="True by time, unwritten." />
            <Swatch name="Ink" varName="--ink" note="Primary text." />
          </div>
        </Section>

        <Section id="type" title="02–03 · Typography and hierarchy">
          <div className="grid gap-4 laptop:grid-cols-2">
            <Card>
              <CardHeader title="Scale" description="Sans carries the interface." />
              <CardBody className="grid gap-2">
                <p className="text-4xl font-semibold tracking-tight">Display 40</p>
                <p className="text-3xl font-semibold tracking-tight">Heading 32</p>
                <p className="text-2xl font-semibold tracking-tight">Heading 26</p>
                <p className="text-xl font-medium">Heading 21</p>
                <p className="text-lg">Subhead 17</p>
                <p className="text-md">Body 15 — the default reading size.</p>
                <p className="text-sm text-ink-2">Secondary 13</p>
                <p className="text-xs text-ink-3">Caption 12</p>
                <p className="label-key">Label key 10 uppercase</p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Monospace is semantic"
                description="It marks what the chain said, not a style preference."
              />
              <CardBody className="grid gap-3">
                <div>
                  <span className="label-key">Prose (sans)</span>
                  <p className="text-sm">This aircraft is listed and open for offers.</p>
                </div>
                <div>
                  <span className="label-key">Chain value (mono)</span>
                  <p className="font-mono text-xs">
                    0xA38072A464D8EDC2a7C74B84eC463e3E1eA36B86
                  </p>
                </div>
                <p className="text-xs leading-relaxed text-ink-2">
                  A reader can tell which pixels are the protocol&apos;s claim and which are
                  ours, without being taught the rule.
                </p>
              </CardBody>
            </Card>
          </div>
        </Section>

        <Section id="space" title="04–06 · Spacing, radius, elevation">
          <div className="grid gap-4 laptop:grid-cols-3">
            <Card>
              <CardHeader title="Spacing" description="4px base." />
              <CardBody className="grid gap-1.5">
                {[1, 2, 3, 4, 6, 8, 12, 16].map((s) => (
                  <div key={s} className="flex items-center gap-3">
                    <span className="w-8 font-mono text-2xs text-ink-3">{s * 4}</span>
                    <div className="h-2 bg-accent" style={{ width: s * 4 }} />
                  </div>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Radius" description="4px ceiling. Placards have corners." />
              <CardBody className="flex flex-wrap items-end gap-3">
                {[
                  ["0", "rounded-none"],
                  ["2", "rounded-xs"],
                  ["3", "rounded-sm"],
                  ["4", "rounded"],
                  ["6", "rounded-lg"],
                ].map(([label, cls]) => (
                  <div key={label} className="text-center">
                    <div className={`size-12 border border-rule bg-sunken ${cls}`} />
                    <span className="mt-1 block font-mono text-2xs text-ink-3">{label}</span>
                  </div>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Elevation" description="Rules first; shadows only lift." />
              <CardBody className="grid gap-3">
                {[
                  ["hairline", "shadow-hairline"],
                  ["raised", "shadow-raised"],
                  ["overlay", "shadow-overlay"],
                  ["modal", "shadow-modal"],
                ].map(([label, cls]) => (
                  <div
                    key={label}
                    className={`rounded-md bg-panel shadow-raised px-3 py-2 font-mono text-2xs text-ink-2 ${cls}`}
                  >
                    {label}
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        </Section>

        <Section id="buttons" title="07 · Buttons">
          <Card>
            <CardBody className="grid gap-4">
              <Row label="Variants">
                <Button variant="primary">Fund escrow</Button>
                <Button variant="secondary">Cancel listing</Button>
                <Button variant="ghost">Details</Button>
                <Button variant="danger">Revoke credential</Button>
                <Button variant="link">View on Etherscan</Button>
              </Row>
              <Row label="Sizes">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
              </Row>
              <Row label="States">
                <Button loading>Confirming</Button>
                <Button disabled>Unavailable</Button>
                <Tooltip content="Assets are paused. Funding now would leave a penalised timeout as your only exit.">
                  <Button variant="secondary">Why disabled?</Button>
                </Tooltip>
              </Row>
            </CardBody>
          </Card>
        </Section>

        <Section id="inputs" title="08 · Inputs">
          <Card>
            <CardBody className="grid gap-4 tablet:grid-cols-2">
              <Field label="Asset id" htmlFor="f1" hint="Sequential, starting at 1." required>
                <Input id="f1" mono placeholder="1" />
              </Field>
              <Field
                label="Salt"
                htmlFor="f2"
                error="Salt must be 0x-prefixed hex or a decimal number."
              >
                <Input id="f2" mono defaultValue="not-hex" invalid />
              </Field>
              <Field label="Document type" htmlFor="f3">
                <Select id="f3" defaultValue="1">
                  <option value="1">Airworthiness certificate</option>
                  <option value="2">Registration certificate</option>
                  <option value="6">Logbook</option>
                </Select>
              </Field>
              <Field label="Notes" htmlFor="f4" hint="Stored off-chain. Never on the chain.">
                <Textarea id="f4" placeholder="Optional" />
              </Field>
            </CardBody>
          </Card>
        </Section>

        <Section id="cards" title="09 · Cards and the verification strip">
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
              { label: "Manufacturer", value: "Airbus" },
              { label: "Built", value: "2018" },
            ]}
          />
          <Card className="mt-4 max-w-[480px]">
            <CardHeader title="Escrow #1" description="Per-trade clone" actions={<StateChip tone="blocked">Awaiting funding</StateChip>} />
            <CardBody>
              <dl>
                <DataRow label="Price">
                  <Amount value="1.00" symbol="USDC" />
                </DataRow>
                <DataRow label="Protocol fee">
                  <Amount value="0.02" symbol="USDC" />
                </DataRow>
                <DataRow label="Seller receives">
                  <Amount value="0.98" symbol="USDC" />
                </DataRow>
                <DataRow label="Funding deadline">in 7 days</DataRow>
              </dl>
            </CardBody>
            <CardFooter>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
              <Button variant="primary" size="sm">
                Approve &amp; fund
              </Button>
            </CardFooter>
          </Card>
        </Section>

        <Section id="tables" title="10 · Tables">
          <p className="mb-3 max-w-[68ch] text-sm text-ink-2">
            A fleet register is a table. Narrow the window: the identity column pins, low-value
            columns drop, and the table scrolls inside its own container — the page never does.
          </p>
          <DataTable
            caption="Sample fleet register"
            columns={COLUMNS}
            rows={ROWS}
            rowKey={(r) => r.id}
            sort={sort}
            onSortChange={(key) =>
              setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }))
            }
          />
          <Pagination offset={offset} limit={4} total={4} onChange={setOffset} />
        </Section>

        <Section id="badges" title="11–12 · Badges and status">
          <div className="grid gap-4 laptop:grid-cols-2">
            <Card>
              <CardHeader title="Badges" description="What a thing is." />
              <CardBody className="flex flex-wrap gap-2">
                <Badge>Aircraft</Badge>
                <Badge>Engine</Badge>
                <Badge variant="accent">L4</Badge>
                <Badge variant="outline">Sepolia</Badge>
                <Badge variant="solid">MRO</Badge>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Status" description="What state it is in." />
              <CardBody className="grid gap-3">
                <div className="flex flex-wrap gap-2">
                  <StateChip tone="confirmed">Active</StateChip>
                  <StateChip tone="blocked">Not listable</StateChip>
                  <StateChip tone="adverse">Disputed</StateChip>
                  <StateChip tone="unrecorded">Lapsed</StateChip>
                  <StateChip tone="neutral">Unknown</StateChip>
                </div>
                <UnrecordedNote what="This listing passed its expiry, but no one has paid to record it, so storage still reads ACTIVE." />
              </CardBody>
            </Card>
          </div>
        </Section>

        <Section id="overlays" title="13–14 · Modals and toasts">
          <Card>
            <CardBody>
              <Row label="Overlays">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="primary">Confirm transaction</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Approve and fund escrow #1</DialogTitle>
                      <DialogDescription>
                        Two signatures. The approval is for exactly the trade price and goes to
                        this escrow only.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogBody>
                      <dl>
                        <DataRow label="Spender">
                          <AddressDisplay address="0x60e13a5a85e7f3d102984e714B0b6a0B58C05Fa2" />
                        </DataRow>
                        <DataRow label="Amount">
                          <Amount value="1.00" symbol="USDC" />
                        </DataRow>
                        <DataRow label="Asset transfers to you">Asset #1 — A320-214</DataRow>
                      </dl>
                      <NonClaim variant="title" display="block" className="mt-3" />
                    </DialogBody>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="secondary">Cancel</Button>
                      </DialogClose>
                      <Button variant="primary">Sign approval</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Button
                  variant="secondary"
                  onClick={() =>
                    toast({
                      tone: "success",
                      title: "Offer placed",
                      description: "Offer #2 on listing #2 for 27,000,000.00 USDC.",
                    })
                  }
                >
                  Success toast
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    toast({
                      tone: "error",
                      title: "This aircraft changed hands",
                      description:
                        "The listing recorded a different seller. It can no longer be accepted.",
                      duration: null,
                    })
                  }
                >
                  Error toast
                </Button>
              </Row>
            </CardBody>
          </Card>
        </Section>

        <Section id="nav" title="15–16 · Navigation and sidebar">
          <Card>
            <CardBody className="grid gap-3 text-sm text-ink-2">
              <p className="max-w-[68ch]">
                Both are live around this page. The sidebar groups by tier — public surfaces,
                account surfaces, and one Operations console — rather than by contract. Below
                1024px it becomes a drawer; the menu button is in the top bar.
              </p>
              <p className="max-w-[68ch]">
                Eleven protocol roles do not become eleven nav items. Operations is one
                destination whose contents are role-gated, because an address holding two
                verifier roles should see two work queues on one screen.
              </p>
            </CardBody>
          </Card>
        </Section>

        <Section id="states" title="17–19 · Loading, empty and error">
          <Tabs defaultValue="loading">
            <TabsList>
              <TabsTrigger value="loading">Loading</TabsTrigger>
              <TabsTrigger value="empty">Empty</TabsTrigger>
              <TabsTrigger value="error">Error</TabsTrigger>
            </TabsList>

            <TabsContent value="loading" className="grid gap-4 laptop:grid-cols-2">
              <TableSkeleton rows={4} cols={4} />
              <RecordSkeleton rows={4} />
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-3 w-40" />
              </div>
            </TabsContent>

            <TabsContent value="empty" className="grid gap-4">
              <EmptyState
                title="No listings yet"
                description="Nothing is currently offered for sale. A verified asset that is not installed and not already listed can be listed by its owner."
                action={<Button size="sm" variant="secondary">Browse the fleet</Button>}
              />
              <EmptyState
                variant="filtered"
                title="No results for these filters"
                description="Three listings exist, but none are aircraft under 2010."
                action={<Button size="sm" variant="ghost">Clear filters</Button>}
              />
            </TabsContent>

            <TabsContent value="error" className="grid gap-4">
              <ErrorState
                kind="infrastructure"
                title="Cannot reach the network"
                cause="The RPC endpoint did not respond after three attempts."
                remedy="This is an infrastructure problem, not a protocol one. Your data is unchanged."
                onRetry={() => undefined}
              />
              <ErrorState
                kind="protocol"
                title="This engine is fitted to an airframe"
                cause="Engine #4 is installed on airframe #3. The protocol refuses to list an installed component."
                remedy="Remove it from the airframe first, then list it."
                detail="ComponentIsInstalled(4, 3)"
              />
              <Banner tone="critical" title="Assets module is paused">
                You can fund now, but you will not be able to release until it is unpaused.
                Your only exit would be a timeout after 29 Aug, which costs 2%.
              </Banner>
            </TabsContent>
          </Tabs>
        </Section>

        <footer className="border-t border-rule pt-4">
          <BlockStamp blockNumber="11,493,660" />
        </footer>
      </div>
    </AppShell>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id}>
      <h2 className="mb-3 border-b border-rule pb-2 font-mono text-sm font-bold uppercase tracking-wide text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <span className="label-key">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Swatch({ name, varName, note }: { name: string; varName: string; note: string }) {
  return (
    <div className="overflow-hidden rounded-md bg-panel shadow-raised">
      <div className="h-14" style={{ background: `var(${varName})` }} />
      <div className="p-2">
        <span className="block font-mono text-2xs font-bold text-ink">{name}</span>
        <span className="mt-0.5 block text-2xs leading-snug text-ink-3">{note}</span>
      </div>
    </div>
  );
}
