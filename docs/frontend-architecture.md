# AeroAsset Protocol — Frontend Architecture

Proposed architecture for the production frontend. Every decision here is grounded in a
capability verified against the deployed contracts and recorded in
[`frontend-contract-map.md`](frontend-contract-map.md). Where a design choice exists only
to work around a contract property, that property is cited.

**Nothing is implemented.** This document is for approval.

---

## 0. Constraints this architecture answers to

Seven properties of the deployed protocol drive most of what follows.

| # | Contract property | Architectural consequence |
|---|---|---|
| C1 | Listings, offers and credentials store a `status` that goes **stale** — verified live: `getListing(3).status == ACTIVE(1)` while `isListingActive(3) == false` | A containment layer that makes rendering a raw status a **type error** |
| C2 | Every aggregate view reverts on a miss (`getPassport`, `getListing`, `getOffer`, `getOrganization`, `getCredential`, …) | Every batched read uses `allowFailure: true` and returns `null` |
| C3 | `componentsOf` is a swap-and-pop array | Every paged read pins one block height |
| C4 | **No on-chain enumeration by owner, party or subject anywhere** | A browser-side log indexer, with all the cost that implies |
| C5 | `EscrowOpened.buyer`/`seller` are **not indexed** on either declaration | "My trades" downloads all escrow events and filters client-side |
| C6 | 116 custom errors, no `require`-with-string | Simulate-before-sign and a generated error decoder |
| C7 | Timelock delay is 172,800 s (48 h) and holds `PROTOCOL_ADMIN` + `FEE_MANAGER` | Admin surfaces are **queues**, not buttons |

---

## 1. Technology stack

No frontend exists in this repository, so the specified stack applies.

| Layer | Choice | Version target | Why |
|---|---|---|---|
| Framework | **Next.js** (App Router) | 15.x | Server components let public reads run server-side, keeping the RPC key off the client |
| Language | **TypeScript** | 5.7+, `strict`, `noUncheckedIndexedAccess` | The containment layer is enforced by the type system; it needs a strict one |
| Styling | **Tailwind CSS** | 3.4.x | |
| Components | **shadcn/ui** | latest | Copy-in, not a dependency. Brings Radix primitives, which are the accessibility floor |
| Chain client | **viem** | 2.x | Multicall with `allowFailure`, exact `bigint` arithmetic, ABI type inference |
| React ↔ chain | **wagmi** | 2.x | Connectors, account/network state, transaction lifecycle |
| Server state | **TanStack Query** | 5.x | Ships inside wagmi already; used directly for the domain layer |
| Testing | **Vitest** + **Playwright** | | Vitest for pure functions and fork tests, Playwright for three end-to-end specs |
| Lint | **ESLint 9** flat config + `typescript-eslint` | | The containment boundary is an ESLint rule with its own test |

### Deliberately not included

| Not used | Why |
|---|---|
| **RainbowKit** | Its visual identity *is* the crypto-app look this product is explicitly not. Connect UI is built from shadcn + wagmi connectors directly — a dialog, a list of connectors, an account menu. Perhaps 200 lines, and it matches the rest of the interface |
| **Redux / Zustand / Jotai** | Nearly all state here is server state and belongs to TanStack Query. The two genuine exceptions (§5) are React Context |
| **The Graph / any subgraph** | No indexer in v1. `readListingPage(ids)` and `readOffersForListing(id)` are transport-agnostic seams for later |
| **`@wagmi/cli`** | Its output is generated `useReadMarketplace*` hooks, which hand a component `getListing()` with zero friction — precisely the hazard C1 exists to prevent |
| **ethers.js** | viem covers it; two chain libraries is one too many |
| **A component library beyond shadcn** | shadcn is already the component system |

---

## 2. Folder structure

Located at **`web/`**, not `frontend/`. The repository already references `web/` in
`.github/workflows/ci.yml` and `.claude/launch.json`; matching it avoids renaming working
infrastructure. Trivially changed if you prefer `frontend/`.

**No root `package.json`.** The repository root is a Foundry project with git submodules in
`lib/`; a root manifest invites tooling to confuse the two.

```
web/
├── app/                            Next.js App Router
│   ├── (public)/                   No wallet required — server-rendered
│   │   ├── protocol/               health, authorization map, address book
│   │   ├── fleet/
│   │   │   └── [assetId]/          passport
│   │   ├── market/
│   │   │   └── [listingId]/
│   │   └── registry/               organizations + credentials
│   ├── (connected)/                Wallet required — client-rendered
│   │   ├── assets/
│   │   ├── trades/
│   │   │   └── [escrowId]/
│   │   └── org/[orgId]/
│   ├── ops/                        Role-gated console (§4.4)
│   │   ├── organizations/  assets/  credentials/
│   │   ├── disputes/  incident/  governance/
│   ├── layout.tsx   providers.tsx   globals.css
│   └── api/                        Route handlers (§8.4) — log-scan proxy only
│
├── components/
│   ├── ui/                         shadcn primitives. No protocol knowledge
│   ├── protocol/                   Protocol-aware, presentational only
│   │   ├── VerificationStrip.tsx   the signature component
│   │   ├── NonClaim.tsx            legal/airworthiness/maintenance qualifiers
│   │   ├── StateChip.tsx           four-value semantic state
│   │   ├── AddressDisplay.tsx      monospace + explorer link
│   │   ├── Amount.tsx              token amounts, tabular, exact
│   │   └── BlockStamp.tsx          "read at block N"
│   ├── data/                       DataTable, Pagination, EmptyState, Skeleton
│   └── layout/                     Shell, Nav, ConnectButton, DriftBanner
│
├── lib/
│   ├── contracts/                  ── THE ONLY PLACE ABIs EXIST ──
│   │   ├── generated/              committed codegen output
│   │   │   ├── abis/*.ts           16 ABIs, `as const`
│   │   │   ├── enums.ts            15 enums + display labels (from artifact AST)
│   │   │   ├── errors.ts           116 errors as one `protocolErrorAbi`
│   │   │   ├── addresses.ts        snapshot + deployedAtBlock
│   │   │   └── manifest.ts         ABI fingerprints, generation timestamp
│   │   └── addressBook.ts          live resolution through ProtocolAddressRegistry
│   │
│   ├── web3/                       Chain plumbing. No protocol semantics
│   │   ├── config.ts               wagmi config, chain, transports
│   │   ├── clients.ts              server + browser public clients
│   │   ├── connectors.ts           injected, WalletConnect, Safe
│   │   ├── tx/                     transaction engine (§10)
│   │   │   ├── flow.ts   step.ts   useTxFlow.ts   persistence.ts
│   │   └── errors/
│   │       ├── decode.ts           decode against protocolErrorAbi
│   │       └── explain.ts          error → { title, cause, remedy }
│   │
│   ├── api/                        ── THE DOMAIN LAYER ──
│   │   │                           The only consumer of lib/contracts.
│   │   │                           "api" = the protocol's API to us, not HTTP.
│   │   ├── atBlock.ts              pinned-height read wrapper
│   │   ├── passport.ts   asset.ts   ownership.ts
│   │   ├── listing.ts    offer.ts   escrow.ts
│   │   ├── organization.ts   credential.ts
│   │   ├── document.ts   maintenance.ts
│   │   ├── roles.ts                capability resolution (§5.2)
│   │   ├── fees.ts       health.ts
│   │   ├── logs/                   the browser-side indexer (§8.3)
│   │   │   ├── scan.ts   cursor.ts   topics.ts
│   │   └── keys.ts                 TanStack query keys (§5.1)
│   │
│   └── utils/                      Pure. No imports from contracts or web3
│       ├── bytes32.ts   money.ts   time.ts   address.ts   salt.ts
│
├── hooks/                          React bindings over lib/api
│   ├── useChainClock.ts   useCapabilities.ts   usePassport.ts
│   ├── useListing.ts      useEscrow.ts         useTxFlow.ts
│
├── types/                          Cross-cutting types not owned elsewhere
│   ├── views.ts                    ListingView, EscrowView, PassportView…
│   └── capability.ts
│
├── config/
│   ├── env.ts                      validated env, fails fast at boot
│   ├── routes.ts                   route table + capability gate per route
│   └── explorer.ts
│
├── scripts/                        codegen.mts + 4 generators, check-*.mts probes
├── test/
│   ├── unit/   fork/   lint/   e2e/
└── public/
```

### The one rule that governs the tree

```
components/  →  hooks/  →  lib/api/  →  lib/contracts/
                                    →  lib/web3/
```

**Arrows point one way.** A component may never import from `lib/contracts` or call a viem
action. Enforced by ESLint (§7.4), and the rule has its own test because it is a
correctness control, not a style preference.

---

## 3. Routing structure

Three route groups, matching the three access tiers.

| Route | Rendering | Access | Primary calls |
|---|---|---|---|
| `/` | Static | public | — |
| `/protocol` | Server, dynamic | public | 14× `tryGetAddress`, 9× `paused`, 11× `getRoleMembers`, all counts, fee config |
| `/fleet` | Server, dynamic | public | `assetCount` → id window → `getPassport` batch |
| `/fleet/[assetId]` | Server, dynamic | public | `getPassport`, `getOwnership`, `activeListingOf`, kind-gated specialization, paged lists |
| `/market` | Server, dynamic | public | `listingCount` → descending window → `readListingPage` |
| `/market/[listingId]` | Server + client island | public | `readListing`, `readOffersForListing`, `quote` |
| `/registry` | Server, dynamic | public | `organizationCount`, `credentialCount`, log scan |
| `/assets` | Client | connected | log-derived candidates, each **confirmed on-chain** |
| `/trades` | Client | connected | `EscrowOpened` scan, client-side party filter (C5) |
| `/trades/[escrowId]` | Client | party | one multicall for full escrow state |
| `/org/[orgId]` | Client | org admin | `getOrganization`, `pendingAdmin`, operator log replay |
| `/ops` | Client | any standing | capability-gated console shell |
| `/ops/organizations` | Client | `ORG_VERIFIER` | `PENDING` org queue |
| `/ops/assets` | Client | `ASSET_VERIFIER` | unverified asset queue |
| `/ops/credentials` | Client | `CREDENTIAL_ISSUER` | issue + lifecycle |
| `/ops/disputes` | Client | `ARBITRATOR` | `DISPUTED` escrow queue |
| `/ops/incident` | Client | `PAUSER` | per-module pause |
| `/ops/governance` | Client | timelock proposer | operation queue with countdown |

**Public routes are server components.** The RPC endpoint carries an API key; running these
reads server-side keeps it out of the browser bundle and out of `connect-src`.

**Route gating is declarative.** `config/routes.ts` maps each route to a required
capability; the `/ops` layout resolves capabilities once and renders `notFound()` rather
than an "access denied" page — a role you do not hold should not advertise itself.

**Never a client-side security boundary.** Route gating is navigation ergonomics only.
Authorization is enforced on-chain; the UI merely avoids offering actions that would revert.

---

## 4. Component architecture

Four tiers, by how much protocol knowledge each is allowed.

### 4.1 `components/ui/` — primitives
shadcn/Radix. Button, Dialog, Table, Tooltip, Toast, Tabs, Form. **Zero protocol
knowledge.** Swappable without touching anything else.

### 4.2 `components/data/` — data presentation
`DataTable` (sortable, column-configurable, horizontally scrollable with a sticky first
column), `Pagination`, `EmptyState`, `Skeleton`, `ErrorState`. Generic over row type.

### 4.3 `components/protocol/` — protocol-aware, presentational
Understand *view types* but never fetch. Props in, JSX out.

**`VerificationStrip`** — the signature component, on every record. Three bands, always in
this order:

1. **What it is** — name, id, kind, state chips
2. **What the chain asserts, and at which block** — owner, commitments, registrar, `BlockStamp`
3. **What none of it claims** — the `NonClaim` qualifiers for that record type

The block height is not debug output; it is the honest answer to "as of when?".

**`NonClaim`** — four variants (`title`, `airworthiness`, `maintenance`, `attestation`).
Renders **adjacent to the claim it qualifies**, never in a footer. A "Verified" chip
without its qualifier is the failure this protocol's own documentation forbids.

**`StateChip`** — takes a view state, never a raw enum. Four semantic values:

| Value | Meaning | Example |
|---|---|---|
| `confirmed` | The chain asserts it now | listing `active`, org `VERIFIED` |
| `blocked` | An action would revert | asset unverified, component installed |
| `adverse` | Terminal or hostile | `DESTROYED`, `REVOKED`, `DISPUTED`, paused |
| `unrecorded` | **True by time, not yet written to the chain** | listing `lapsed`, expired transfer offer, deferred payout |

`unrecorded` is the fourth state most systems lack and this protocol demands. Amber implies
"be careful"; green is a lie. It gets its own value and a consistent sentence.

### 4.4 Feature components — colocated in `app/`
Compose the above and consume hooks. The `/ops` console is one shell rendering a **queue
list**, where each queue declares its required capability and its own count query. Adding a
role console is adding a queue, not a route tree.

---

## 5. State management

Four categories, three mechanisms, no global store library.

| Category | Mechanism | Rationale |
|---|---|---|
| Chain state | **TanStack Query** | It is server state that happens to live on a chain |
| Wallet state | **wagmi** | Its own reactive store, already present |
| Chain clock + capabilities | **React Context** | Cross-cutting, read constantly, changes rarely |
| Ephemeral UI | **`useState`** | Dialogs, form drafts, sort order |

### 5.1 Query keys

```ts
['aeroasset', chainId, domain, ...identifiers, { block? }]
```

**Query keys never hold raw structs**, and neither do cached values. Everything cached is
already a view type, so even a `getQueryData` escape cannot surface a stale status.

Staleness by volatility: passport 30 s · listings 15 s · escrow state 10 s · protocol
health 60 s · immutable facts (token decimals, enum labels, `TIMEOUT_PENALTY_BPS`) infinite.

### 5.2 `CapabilityProvider`

Resolves once per connected address, in one multicall:

- 11 × `RoleManager.hasRole`
- organization membership (`isActingFor`, admin, operator) for orgs the address touches
- whether the address owns any asset
- whether the address is party to any live escrow
- `ProtocolTimelock.hasRole(PROPOSER_ROLE, me)`

Yields a `Capability` set that drives nav, route gates and per-action affordances.
Invalidated on account change, chain change, and after any transaction that could alter it.

### 5.3 `ChainClockProvider`

Seeds from `getBlock().timestamp`, interpolates locally, re-syncs on new blocks. Every
deadline comparison in the domain layer takes `now: bigint` **explicitly** — the functions
stay pure and exhaustively testable, and ESLint bans `Date` inside `lib/api/**` so nobody
can quietly reach for the browser clock.

Any deadline-gated action within **90 seconds** of its boundary renders *"may revert — the
chain's clock decides"* rather than a confidently enabled button.

---

## 6. Web3 integration architecture

### 6.1 Two clients, different jobs

| Client | Where | Transport | Used for |
|---|---|---|---|
| `serverClient` | Server components, route handlers | HTTP with the keyed RPC URL, multicall batching | All public reads |
| `browserClient` | Client components | HTTP with a public RPC URL | Reads that must react to wallet state |
| `walletClient` | Client only, via wagmi | Injected / WalletConnect | All writes |

The keyed RPC URL is a **server-only env var**. `NEXT_PUBLIC_*` gets a rate-limited public
endpoint. If the public endpoint degrades, the app says so rather than showing stale data
as fresh (§12.3).

### 6.2 Address resolution

Exactly **one** address comes from configuration: `ProtocolAddressRegistry`. Everything else
resolves through it at runtime — faithful to architecture decision D3, and the reason a
redeploy surfaces as a banner rather than a silently dead app.

Boot: seed from the committed snapshot (synchronous, no flash) → one multicall of 14
`tryGetAddress` → on mismatch **the registry wins** and a drift banner names the key.

### 6.3 Connect flow

wagmi connectors (injected, WalletConnect, Safe) behind a shadcn dialog. No RainbowKit.
After connect: verify chain is 11155111, resolve capabilities, then render.

---

## 7. Contract integration layer

The heart of the architecture. Five mechanisms; no single one is sufficient.

### 7.1 Generate, never hand-write

`scripts/codegen.mts` reads `../out` and `../deployments`, emits to
`lib/contracts/generated/`, and the output is **committed**.

| Generator | Source | Output |
|---|---|---|
| `gen-abis` | `out/<C>.sol/<C>.json` × 16 | `abis/*.ts` with `as const` — required for viem's return-type inference on the 17-field `Passport` |
| `gen-enums` | artifact `.ast` `EnumDefinition` nodes | 15 enums + label maps |
| `gen-errors` | every `{type:'error'}` across all 16 ABIs | one `protocolErrorAbi` for decoding |
| `gen-addresses` | `deployments/11155111.json` + broadcast receipts | address snapshot + `deployedAtBlock` |

Enums come from the **AST** because the ABI only gives `uint8`, and an off-by-one renders
"Sold" where the chain says "Cancelled".

The address book is committed despite `deployments/` being git-ignored: it is ignored
because it is regenerated per chain, not because it is secret. Every address is on
Etherscan. Committing the derived TypeScript is the only thing that makes a CI or hosted
build possible; staleness is caught at runtime by §6.2.

**CI regenerates and fails on any diff** to ABIs, enums or errors.

### 7.2 View types have no `status` field

```ts
export type ListingState =
  | 'active'      // stored ACTIVE and inside its window
  | 'lapsed'      // stored ACTIVE, past expiresAt, expiry unrecorded  ← no on-chain counterpart
  | 'expired'     // expiry recorded on-chain
  | 'sold' | 'cancelled';
```

Deliberately **different words** from `ListingStatus`, so a raw enum value cannot be
assigned without a type error. `lapsed` has no on-chain counterpart — the trap becomes a
first-class renderable state instead of a hidden bug. Same treatment for `OfferState`,
`CredentialState`, `TransferState`.

### 7.3 One constructor, always paired

`readListing()` multicalls `getListing` + `isListingActive` + `escrowOf` + `ownerOf`
together, at one block. **`getListing` appears in exactly one file.** The only raw accessor
is named `dangerouslyReadRawListing` and is used only by `/protocol`, whose job is showing
unmassaged state.

A **dev-mode tripwire** asserts `(state === 'active') === isListingActive`. It catches what
unit tests structurally cannot: an enum shifted by a redeploy, a regenerated ABI that
reordered a struct, a `now` sourced from the browser.

### 7.4 The ESLint boundary

```js
// Outside lib/api, lib/contracts, lib/web3 and /protocol:
'no-restricted-imports': ['error', { patterns: [
  { group: ['**/contracts/generated/*'], message: 'Components must not touch ABIs. Use lib/api.' },
  { group: ['viem/actions', 'wagmi/actions'], message: 'Raw chain reads belong in lib/api.' },
]}],
// Inside lib/api:
'no-restricted-globals': ['error', { name: 'Date', message: 'Use the chain clock.' }],
```

`test/lint/boundary.test.ts` asserts **both** that a violation fixture is rejected **and
that the config loads without throwing**. That second assertion exists because this exact
rule set has already died silently once: `eslint-config-next` pulled in a patch that
crashed on ESLint 9, `next build` printed the crash as a warning and continued, and the
rules were dead while the build stayed green.

### 7.5 Pinned-block reads

`atBlock(client, fn)` wraps every multi-call and paginated read. Two reasons, both
verified: `componentsOf` is swap-and-pop (C3), and stored/effective status must be observed
at the same height (C1). Cost is one extra `eth_blockNumber` per logical read.

---

## 8. Data fetching strategy

### 8.1 Read paths

| Need | Strategy |
|---|---|
| Public page, first paint | Server component, `await` domain reader, stream |
| Wallet-dependent | Client component + TanStack Query via hook |
| Detail after list | Prefetch on the server, hydrate the client cache |
| Post-transaction | Invalidate by domain key, refetch at the receipt's block |

### 8.2 Batching

Every logical read is one multicall with `allowFailure: true` (C2). Kind-gated
specialization: only `getAircraft` for an `AIRCRAFT`, only `getComponent` for a component —
calling both is one guaranteed failure per asset.

### 8.3 The log indexer — the load-bearing weak point

C4 means there is **no on-chain enumeration by owner, party or subject**. This is the direct
cost of shipping without a subgraph, and it is a small indexer running in the browser.

| Query | Mechanism | Cost |
|---|---|---|
| Listings by seller | `ListingCreated.seller` indexed | cheap |
| Offers by buyer / listing | `OfferMade.buyer`, `.listingId` indexed | cheap |
| Assets by owner | `AssetRegistered.owner` indexed + replay `OwnershipTransferred` | moderate |
| Documents by issuer | `DocumentRegistered.issuerOrgId` indexed | cheap |
| Organizations by admin | `OrganizationRegistered.admin` indexed + replay transfers | moderate |
| **Escrows by party** | **not indexed (C5)** — download all, filter client-side | **expensive** |
| **Credentials by subject org** | **`subjectOrgId` not indexed** — download all, filter | **expensive** |
| Operators of an org | replay `OrganizationOperatorSet` | cheap |

Implementation: fixed 9,000-block windows from `deployedAtBlock` (11,485,840), **sequential
not parallel** — the failure mode is rate-limiting, and fanning out turns a slow read into a
rejected one. Halve the window once per failure level, floor at 500. Cursor and results
cached in IndexedDB, keyed by chain and contract address, resumable.

**Logs supply ids and nothing else.** Every rendered field comes from a fresh view call at a
pinned height. A log records what was true when emitted: a withdrawn offer still has its
original `OfferMade` sitting in the chain, unchanged and completely misleading.

**Escalation trigger:** at `listingCount() > ~1,000` or `escrowCount() > ~5,000`, cold-start
becomes unacceptable and an indexer stops being optional. `readListingPage(ids)` and
`readOffersForListing(id)` are the seams where one drops in.

### 8.4 The one route handler

`app/api/logs/[topic]/route.ts` proxies log scans server-side, so the keyed RPC endpoint
serves them and the browser is not rate-limited on a cold `/trades`. Read-only, no
parameters beyond a validated topic and block range, no user data. It is the only server
route.

---

## 9. Error handling

### 9.1 Four classes, four treatments

| Class | Example | Treatment |
|---|---|---|
| **Infrastructure** | RPC down, rate-limited | Say so plainly. Never render stale data as fresh (§12.3) |
| **Not found** | `getPassport` reverts `AssetNotFound` | `notFound()` with copy naming the ambiguity: unissued id, or an id from a different deployment |
| **Precondition** | `AssetNotVerified`, `ComponentIsInstalled` | Caught at **simulation**, before the wallet opens. Rendered as a checklist with a fix link |
| **Execution** | reverted after signing | Should be near-impossible; decoded, explained, Etherscan link |

### 9.2 `explainError`

Decodes against the generated `protocolErrorAbi` (all 116) and maps to
`{ title, cause, remedy, affected }`. Unmapped errors render `ErrorName(arg0, arg1)`
verbatim plus an explorer link — **never** "Transaction failed".

Worked example:

```
SellerNoLongerOwner(1, 0x4eaD…FF70, 0xabb0…8145)
→ Title:   This aircraft changed hands
   Cause:  The listing recorded 0x4eaD…FF70 as the seller, but 0xabb0…8145 owns it now.
   Remedy: The listing can no longer be accepted. The new owner must list it again.
```

`ComponentIsInstalled(4, 3)` → *"Engine #4 is fitted to airframe #3. Remove it before
listing."* with a link to the remove action.

### 9.3 Coverage as a gate

~40 errors are reachable by a normal user; those get hand-written copy and a test asserting
each is mapped. The remaining ~76 (initialization, UUPS, machine-role) fall through to the
verbatim renderer.

---

## 10. Transaction handling

### 10.1 Flow / Step

A `Flow` is an ordered list of `Step`s. **Step position is derived from chain state, never
from local state** — each step has `skipIf(ctx)`, re-evaluated on mount and after every
receipt. Close the tab between approve and fund, return tomorrow, land exactly where you
were.

Only `{ chainId, flowKey, stepKey, hash }` persists to localStorage, so a reload can
re-attach `waitForTransactionReceipt`. No amounts, no addresses, no user data.

### 10.2 Every step simulates before it signs

`simulateContract` → decode any revert through `explainError` → render → only then open the
wallet. With 116 typed errors, a user should essentially never see a reverted transaction.

### 10.3 `buyFlow`, the one that matters

Preflight blocks on: escrow status, `me === terms.buyer`, funding deadline not passed, USDC
balance sufficient (with faucet link).

It **warns without blocking** when `AssetOwnership.paused()`:

> Assets are paused. You can fund now, but you will not be able to release until it is
> unpaused; your only exit would be `claimTimeout` after ‹date›, which costs you 2%.

This is a genuine trap with no on-chain guard — `setTransferLock` is not pause-gated but
`settleTransfer` is. **Treat this warning as a correctness requirement, not copy.**

Steps: `reset-allowance` (only on a stale partial) → `approve` → `fund`.

The approval spender is the **per-trade escrow clone**, never the Marketplace, and the
amount is `terms.price` read from `Escrow.getTerms()` — the *offer* price, not the listing
price. Exact amount, never `MaxUint256`: each clone is single-use, so unlimited approval is
pure downside. The UI says so, since users are trained that "unlimited" is normal.

### 10.4 `acceptOfferFlow`

`acceptOffer` returns `(escrowId, escrow)` but **return values are unavailable from a
transaction**. Parse `EscrowOpened` from the receipt logs, or read `escrowOf(listingId)`
after confirmation.

### 10.5 `deriveEscrowActions`

```ts
deriveEscrowActions(escrow, now, viewer, roles, pause, funds) → Action[]
```

Pure, and the most-tested function in the codebase: 7 statuses × 4 viewer roles ×
before/at/after 3 deadlines × 2 pause states, asserting both `enabled` and the reason
string. Note `release` gates on `AssetOwnership.paused()` — **not** `Marketplace.paused()`,
because `markSold` has no pause gate.

### 10.6 Governance flows

Every `/ops/governance` action is `schedule → wait 48 h → execute` (C7). Rendered as a
proposal with `getOperationState` driving a four-state UI (`Unset / Waiting / Ready / Done`)
and a live countdown. The execute control stays disabled until `isOperationReady`.

---

## 11. Wallet architecture

### 11.1 Connectors
`injected()`, `walletConnect()`, `safe()`. Safe matters: production role holders should be
multisigs, and the timelock proposer almost certainly is.

### 11.2 Identity, not "your wallet"
An address is shown with its **standing** — organization membership and roles — not as a
balance. This is the difference between enterprise software and a crypto app. The account
menu shows: address, org affiliations, roles held, and network.

### 11.3 Account and chain changes
Any change invalidates the capability cache, the whole query cache, and any in-flight flow
whose `chainId` no longer matches. Address changes mid-flow are treated as a new session,
not a continuation.

### 11.4 Read-only by default
Nothing prompts for a connection until the user attempts something that needs one. Every
public route works fully disconnected.

---

## 12. Network handling

### 12.1 One chain
Sepolia `11155111`. `config/env.ts` validates at boot and refuses to start against an
unknown chain rather than rendering a broken app.

### 12.2 Wrong network
Detected at connect and on change. A blocking banner with a one-click `switchChain`. Writes
are disabled; reads continue, because reads use the app's own client and do not care what
the wallet is pointed at.

### 12.3 RPC degradation — honesty over optimism
Three failure modes, three behaviours:

| Failure | Behaviour |
|---|---|
| Timeout / 5xx | Retry with backoff, cap 3. Then an error state that says the RPC is unreachable and distinguishes infrastructure from protocol |
| Rate limit (429) | Back off, pause background log scans first, keep foreground reads |
| Partial multicall failure | Render what resolved, mark the rest explicitly unavailable — never as zero or absent |

**Stale data is never presented as fresh.** Every view carries the block it was read at, so
"as of block N" is always answerable. If a refetch fails, the timestamp stops advancing and
the UI shows it rather than silently serving an old cache.

---

## 13. Responsive design strategy

### 13.1 The tension
This is dense, tabular, enterprise software. Fleet registers and asset lists **are** tables.
The usual answer — collapse tables into cards on mobile — destroys the density that makes
them useful.

### 13.2 Approach by content

| Content | ≥1024px | <1024px |
|---|---|---|
| Data tables (fleet, market, queues) | Full table | Horizontal scroll, **sticky identity column**, with a configurable column set |
| Record detail (passport, escrow) | Two columns | Single column, tabs become an accordion |
| `VerificationStrip` | Three bands inline | Three bands stacked, order preserved |
| Ops console | Queue sidebar + detail | Queue list → detail as a stack |
| Transaction flows | Inline stepper | Full-screen sheet, one step at a time |

Wide content scrolls **inside its own container**; the page body never scrolls sideways.

### 13.3 Non-negotiables at every width
Non-claims stay adjacent to the claims they qualify — they are never the thing that gets
dropped for space. Amounts stay `tabular-nums`. Addresses stay monospace and truncate at the
middle, never the end.

### 13.4 Accessibility floor
Radix primitives, visible focus on every control, `prefers-reduced-motion` honoured, state
never encoded by colour alone (every `StateChip` carries a text label), axe clean as a CI
gate.

---

## 14. Security architecture

### 14.1 Content Security Policy

```
default-src 'self';
connect-src 'self' <rpc-origin> <walletconnect-relay>;
img-src 'self' data:;
worker-src 'self' blob:;
frame-ancestors 'none';
base-uri 'self'; form-action 'self';
```

`connect-src` is the enforcement mechanism for two guarantees below, not decoration.

### 14.2 `metadataURI` and `documentURI` are untrusted input
User-supplied strings stored on-chain. **Rendered as text or a labelled external link;
never fetched.** Fetching arbitrary user-supplied URIs from the app origin is an SSRF and
XSS surface for zero v1 benefit. The CSP enforces it even if a future contributor forgets.

### 14.3 Local file verification
Document hashing runs `keccak256` in a **Web Worker**; the file never leaves the machine.
There is no `fetch` in the worker and `connect-src` cannot reach an upload endpoint, so a
bug cannot become an exfiltration.

The salt field is mandatory in the UI, not optional: `security-model.md` §7 is explicit that
an unsalted commitment to a tail number is brute-forceable in seconds. The tool states that
the salt is the protection, and asks which `abi.encode` argument type was used — `bytes32`
and `string` produce different commitments from the same characters.

### 14.4 Secrets
No private key is ever handled, requested, stored or displayed. The keyed RPC URL is
server-only and never reaches the bundle. `.env.local` is git-ignored. Nothing sensitive
goes into a query string.

### 14.5 Approval hygiene
Exact-amount approvals to the per-trade clone. Never `MaxUint256`. A stale non-zero
allowance is reset to zero before re-approving. The UI explains why unlimited is refused.

### 14.6 Transaction legibility
Every signature request is preceded by a plain-language summary: what moves, to whom, how
much, and what happens next. Amounts shown in token units with the symbol, never raw base
units. This is the practical anti-phishing measure — a user who can read what they are
signing can refuse it.

### 14.7 Client-side gating is not security
Stated explicitly so nobody mistakes it: route gates and disabled buttons are ergonomics.
Every authorization is enforced on-chain. The UI's job is to avoid offering actions that
would revert, not to prevent them.

### 14.8 Dependency posture
Pinned versions, `npm ci` in CI, Dependabot on. shadcn components are copied into the tree
and reviewed, not pulled at runtime. No analytics, no third-party scripts, no font CDN —
which is also why `connect-src` can stay this narrow.

---

## 15. Testing strategy

**No mocked RPC anywhere.** Mocked-viem tests pass while the app is broken; they test the
mock. Everything is either a pure function or a real chain.

| Layer | Tool | Content |
|---|---|---|
| Unit | Vitest | `deriveEscrowActions` table-driven; `deriveListingState` / `deriveOfferState` / `deriveTransferState` including boundary seconds; bytes32 round-trip; 6-decimal exactness; `fee + proceeds === price` |
| Lint boundary | Vitest | Violation fixture is rejected **and** the config loads |
| Fork | Vitest + anvil, pinned block | Real readers against the real deployed protocol. `evm_setNextBlockTimestamp` past a listing's `expiresAt` and assert `state === 'lapsed'` — the only test that *proves* the effective-status layer works |
| E2E | Playwright | Three specs, not thirty: public passport, full trade, dispute resolution |
| CI | GitHub Actions | typecheck, lint, boundary, unit, codegen drift, build. Fork tests nightly |

The seeded Sepolia state exists for exactly this: listing #3 is permanently `lapsed`
(verified: stored `ACTIVE`, `isListingActive() == false`), escrow `0x60e1…5Fa2` is a real
`AWAITING_FUNDING`, and listing #2 carries a live 27,000,000 USDC offer.

---

## 16. Summary of decisions

| # | Decision | Rationale |
|---|---|---|
| A1 | `web/`, no root `package.json` | Matches existing CI and launch config; keeps Foundry and npm apart |
| A2 | Server components for public reads | Keeps the keyed RPC out of the browser |
| A3 | `lib/api/` is the sole consumer of `lib/contracts/` | Makes rendering a stale status a type error, not a review note |
| A4 | View states use different words from on-chain enums | A raw enum cannot be assigned without failing the compile |
| A5 | ESLint boundary with its own test | The rule is a correctness control and has died silently once before |
| A6 | Every read pinned to one block | swap-and-pop arrays, and stored-vs-effective agreement |
| A7 | Chain clock, `Date` banned in the domain layer | Deadlines compare against `block.timestamp` |
| A8 | Simulate before every signature | 116 typed errors; users should not see reverts |
| A9 | Flow steps derived from chain state | Resumable across sessions and devices |
| A10 | Browser log indexer with IndexedDB cursor | No on-chain enumeration exists |
| A11 | No RainbowKit | Its visual identity is the crypto look this product rejects |
| A12 | Fourth semantic state, `unrecorded` | The protocol has states that are neither good nor bad |
| A13 | URIs rendered, never fetched | SSRF/XSS surface for zero benefit, enforced by CSP |
| A14 | Admin surfaces are queues | The timelock delay is 48 h and cannot be short-circuited |

---

*Proposed against the deployment surveyed at Sepolia block 11,493,660. No Solidity modified. Nothing implemented.*
