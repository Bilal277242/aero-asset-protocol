# AeroAsset Protocol — Development Rules

## Environment

Development runs in **WSL (Ubuntu)** against a Windows-hosted checkout.

```bash
cd /mnt/d/Solidity-Foundry/aero-asset-protocol
export PATH=$HOME/.foundry/bin:$PATH
```

Foundry lives at `~/.foundry/bin` inside WSL and is **not** on the Windows `PATH` —
always run `forge` from WSL. `.gitattributes` forces LF endings; do not disable it, or
`forge fmt --check` will fail in CI while passing locally.

**`web/` is the exception: run npm from Windows, not WSL.** `npm install` against the
DrvFs mount hangs indefinitely without writing a file. Foundry from WSL, npm from
Windows PowerShell — and never run `next build` while `next dev` is serving, because
they share `.next` and the dev server ends up executing production chunks.

## Stack

Solidity `0.8.28` (pinned) · Foundry · OpenZeppelin `v5.4.0` · EVM target `cancun`.
Dependency versions are pinned by git tag in `lib/` and must not be floated.

## Read before implementing

`/docs` is the approved specification. Never write a contract before reading:

- `architecture.md` — layering, module boundaries, foundational decisions D1–D8
- `asset-model.md` — exact struct and enum definitions
- `state-machines.md` — every legal transition
- `permissions.md` — who may call what
- `errors.md`, `events.md` — the declared catalogues
- `security-model.md`, `threat-model.md`, `invariants.md`

**Do not change the architecture without explaining why and getting approval.** The
decisions in `architecture.md` §4 (D1–D8) were made deliberately and have downstream
consequences.

## Hard rules

- Custom errors only. No `require`-with-string in `src/`.
- Emit an event for every state change, sufficient to reconstruct state off-chain.
- Checks-effects-interactions on fund-moving paths. Where an interaction genuinely must
  precede an effect — measuring a balance delta, or learning that a transfer failed —
  say so at the site and state what makes it safe instead. Do not claim "without
  exception" unless it holds; see audit AAP-16.
- Reentrancy guards (`ReentrancyGuardTransient`) on every function that moves value.
- No unbounded loop in any state-changing function. Array indexes are `view`-read only.
- Explicit access control on every non-`view` external function.
- Validate every external input; guard every state transition.
- Full NatSpec: `@title`, `@author`, `@notice`, `@dev` on contracts; `@notice`, `@dev`,
  `@param`, `@return` on every external/public function; NatSpec on events, errors,
  structs and enum members.
- Prefer OpenZeppelin. Check `lib/openzeppelin-contracts` before writing anything that
  sounds like a standard primitive.
- Never store aviation documents on-chain — hashes and URIs only.
- Never assume on-chain ownership equals legal title, and never make a regulatory
  claim. Repeat the non-claims from `requirements.md` in the NatSpec of contracts they
  apply to.
- Minimize storage writes; respect the packing in `asset-model.md`.
- ERC-7201 namespaced storage in every upgradeable contract; `_disableInitializers()`
  in every implementation constructor.

## Testing

Every contract needs: unit tests, access-control tests, negative tests (every custom
error reached with its exact arguments), event tests, fuzz tests, and invariant tests
where the contract owns protocol-level state.

Coverage target: ≥95% line and branch on `src/`.

## Before claiming a phase complete

```bash
forge fmt && forge build && forge test && forge snapshot
```

`forge build` must be warning-free under `FOUNDRY_PROFILE=ci` (warnings are errors there).

**Do not claim completion if tests fail.** Report the failure and the output.

## Workflow

One phase at a time. Per contract: design → implement → unit tests → fuzz tests →
security review → optimize. Optimize only after correctness and security are
established.

Do not modify contracts outside the current phase's scope.

## V1 scope gate

Rejected regardless of implementation quality: fractional ownership, tokenized
securities, aircraft-backed lending, DAO governance, cross-chain bridges, automated
valuation, DeFi yield, decentralized arbitration, on-chain document storage.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 | Specification + Foundry foundation | ✅ complete |
| 1 | `ProtocolAddressRegistry`, `RoleManager`, `OrganizationRegistry` | ✅ complete |
| 2 | `CredentialRegistry` | ✅ complete |
| 3 | `AssetRegistry`, `AssetOwnership` | ✅ complete |
| 4 | `AircraftRegistry`, `ComponentRegistry` | ✅ complete |
| 5 | `DocumentRegistry`, `MaintenanceRegistry`, `AssetPassport` | ✅ complete |
| 6 | `FeeManager`, `Marketplace` | ✅ complete |
| 7 | `EscrowFactory`, `Escrow`, disputes | ✅ complete |
| 8 | Invariants, fuzz, static analysis, gas | ✅ complete |
| 9 | Deployment scripts, local E2E | ✅ complete |
| 10 | Internal audit (`audit/`) — 26 findings raised, 25 valid | ✅ complete |
| 10a | Gate 0 remediation — permanent fund/state loss | ✅ complete |
| 10b | Gate 1 remediation — identifier burns, `via_ir`, Slither | ✅ complete |
| 10c | Gate 2 remediation — economic + data integrity | ✅ complete |
| 10d | Gate 3 remediation — housekeeping | ✅ complete — all 25 findings closed |
| 9b | Sepolia deploy + verify | ✅ complete — chain 11155111, all 25 contracts verified |
| 10e | AAP-27 (runbook) and AAP-28/29/30 (live deploy) | ✅ complete — 29 findings stand, all closed |

## Web UI (`web/`)

The production frontend against the **existing deployed contracts**. It integrates with
them; it does not drive their design. Do not change anything in `src/` to make a UI
problem easier — if a contract genuinely cannot support a screen, say so and mark the
capability **NOT AVAILABLE IN CURRENT CONTRACTS**.

A first attempt was built and deleted (commit `7efbec3`); the current app is the
redesign and shares no code with it.

### Read before implementing

- `docs/frontend-contract-map.md` — the ABI surface, per contract, and what is genuinely
  absent. Documentation is not evidence a function exists; this file was written against
  compiled ABIs and found two defects in `/docs` doing exactly that.
- `docs/frontend-architecture.md` — decisions A1–A14, the same standing as D1–D8.
- `docs/design-system.md` — tokens, components, and the aesthetic the product is held to:
  enterprise aviation software, never generic crypto/NFT.
- `docs/marketplace-indexing.md` — staged plan and the thresholds that trigger each stage.

### Stack

Next.js 15 App Router · React 19 · TypeScript strict + `noUncheckedIndexedAccess` ·
Tailwind · Radix primitives · wagmi **3** · viem 2 · TanStack Query 5. No RainbowKit, no
additional frameworks — introducing one needs a reason and approval.

Note wagmi is v3, not v2: `useAccount` is a deprecated alias for `useConnection`, and
`injected` is exported from the `wagmi` root.

### Hard rules

- **Never read a stored `status` to decide what a user can do.** Listings, offers and
  credentials all go stale — an expired listing still reads `ACTIVE` until someone pays
  gas. Use `isListingActive` / `isOfferActive` / `isValid`. A UI that renders the raw
  field shows expired listings as buyable.
- **`getPassport`, `getListing`, `getAircraft`, `getCredential` and friends revert on a
  miss**, so every batched read needs `allowFailure: true` or one bad id takes the page
  down.
- **Components must not construct a contract call.** ESLint blocks ABIs and
  `viem/actions` / `wagmi/actions` from `src/components/**` and `src/app/**`. Reads go in
  `lib/api` behind a Reader function; writes go in `lib/api/*writes.ts` as typed
  descriptors. Enums and error tables are allowed through — display constants with no
  capability attached.
- **Keep pure decision logic in its own module, away from the readers.** Anything under
  `lib/api` that touches `addressBook` pulls in `config/env`, which throws at import
  without a configured RPC — so a pure function living beside a reader cannot be tested
  without one. This has bitten twice: `roles.ts` → `role-catalog.ts`, and `records.ts` →
  `hash-check.ts`. Both were found by a test refusing to load, which is the cheap way to
  find it. Re-export from the reader module so callers still need one import.
- **Frontend checks are never the security boundary.** `RoleManager` and the contracts
  decide. Role gating exists to avoid offering buttons that revert; say so where it
  could be mistaken for enforcement. A connected wallet is never an administrator until
  `hasRole` says so, and hiding a nav link is not access control.
- **Derive whether an action is reachable; never hardcode it.** On this deployment
  `PROTOCOL_ADMIN` *and* `FEE_MANAGER` are held solely by `ProtocolTimelock`, so no
  wallet can execute their actions directly — read the holders and say so. A hardcoded
  "timelocked" flag keeps claiming it after a role moves. Roles held only by contracts
  (`ASSET_MINTER`, `ESCROW_FACTORY`, `SETTLEMENT`, and on Sepolia `ARBITRATOR`) are
  detected by bytecode, not by a name list.
- **Irreversible and dangerous are different.** Only irreversible actions get the
  type-to-confirm gate. Marking everything dangerous trains people to click through.
- **Copy every deadline comparison from the contract, and do not assume the protocol is
  uniform.** Escrow deadlines use strict `>`; `expireCredential` uses `<=`. Four
  off-by-one errors shipped past typecheck here once.
- Distinguish **protocol verification** from **legal or regulatory certification**
  wherever a verified state is shown. No fake statistics, no claimed partnerships,
  certifications or customers.
- **A matching document hash proves integrity, never authenticity.** It shows the bytes
  are unchanged since registration and that the record refers to them. It says nothing
  about whether the document is genuine, whether its contents are true, or whether any
  authority accepted it — a forged certificate hashes exactly as well as a real one. Say
  both halves wherever a hash check reports success.
- **Do not render a field the contract does not have.** A maintenance record has no
  status; a document has no verification flag. Where a screen seems to need one, say what
  is actually stored and why the absence is deliberate.
- Never expose private keys, request unnecessary wallet permissions, or sign arbitrary
  messages. There is deliberately no unlimited-approval helper.
- Contract addresses come from `ProtocolAddressRegistry` at runtime; exactly one address
  is configured. Never hardcode the others.
- `src/lib/contracts/generated/` is codegen from Foundry artifacts (`npm run codegen`),
  and is committed. Do not hand-edit it. It parses ASTs for enum member names, so
  `ENUM_SOURCES` must list the **interface** that declares each enum.

### Before claiming a web phase complete

Run from **Windows PowerShell**, in `web/`:

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Then verify against live Sepolia with the preview server — a clean build proves nothing
about whether the page reads the chain. A CSP that blocked every RPC call once shipped
with all four gates green and every panel rendering a plausible error state.

**Stop the dev server before running `npm run build`.** They share `.next`, and building
underneath a running dev server leaves it serving production chunks: every route 500s
with `__webpack_modules__[moduleId] is not a function` until it is restarted. Console
errors from that window are corruption artifacts, not defects — re-read them in a fresh
tab before chasing one.

Tests live in `web/test/`: `unit/` for domain logic, `lint/` for the containment
boundary. When a test guards a contract rule, **prove it is load-bearing** by
reintroducing the bug and watching exactly that test fail.

### Web phase status

| Phase | Scope | Status |
|---|---|---|
| W0 | Repository inspection, contract map, architecture | ✅ complete |
| W1 | Design system + foundational components | ✅ complete |
| W2 | Public site — `/`, `/platform`, `/verification`, `/about`, `/documentation`, `/contact` | ✅ complete |
| W3 | Web3 infrastructure — wallet, chain, tx lifecycle, error decoding | ✅ complete |
| W4 | `/dashboard` | ✅ complete |
| W5 | Asset passport — `/assets`, `/assets/[id]` | ✅ complete |
| W6 | Marketplace — `/marketplace`, `/marketplace/[listingId]` | ✅ complete |
| W7 | Escrow and purchase — `/trades`, `/trades/[escrowId]` | ✅ complete — 28 lifecycle tests |
| W8 | Organizations and credentials — `/organizations`, `/credentials` | ✅ complete — 29 authorization tests |
| W9 | Documents and maintenance — `/documents`, `/maintenance`, hash verification | ✅ complete — 21 tests |
| W10 | Admin console — `/admin`, all 26 privileged functions | ✅ complete — 15 tests |

**Blocked:** funding the live escrow. Buyer `0xabb020a5A0C5f325CB068E90C915de2E46628145`
holds 0 USDC and the Circle faucet requires a CAPTCHA, which an agent must not complete.

The `web` CI job in `.github/workflows/ci.yml` is active and enforces the same gate.

## Audit

`audit/findings.md` is the finding catalogue and the source of truth for remediation
status. Regression tests for every fixed finding live in `test/audit/` and run in CI —
if one fails, that vulnerability is back.

Static analysis is **blocking**: `slither . --config-file slither.config.json
--fail-medium` must exit 0. Suppress at the source with `slither-disable-next-line` and a
written justification, never by excluding a detector in config. See
`docs/audit/slither-triage.md`.

**This is not a substitute for an independent human audit**, which remains a hard gate
before the protocol handles meaningful funds. The internal audit was performed by the
same agent that wrote the code.
