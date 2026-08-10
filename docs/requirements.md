# AeroAsset Protocol — Requirements

Requirement IDs are referenced from NatSpec and from test names so coverage of the
specification is mechanically checkable.

## Functional — V1

### Identity
- **FR-01** Any address may self-register an organization; it enters `PENDING`.
- **FR-02** Only `ORG_VERIFIER_ROLE` promotes `PENDING → VERIFIED`.
- **FR-03** Organizations may be suspended and reactivated; revocation is terminal.
- **FR-04** An organization has one admin address plus zero or more operators; admin
  transfer is two-step.
- **FR-05** Legal-name hashes are unique across all organizations.
- **FR-06** `CREDENTIAL_ISSUER_ROLE` issues credentials with an optional expiry.
- **FR-07** Credentials may be suspended, reinstated, revoked; revoked and expired are
  terminal. Anyone may record an expiry that has already occurred.
- **FR-08** Credential validity is computed from status **and** expiry, never status alone.

### Assets
- **FR-09** Only an address acting for a `VERIFIED` organization may register an asset.
- **FR-10** Registration never verifies. Verification is a separate `ASSET_VERIFIER_ROLE`
  action on an orthogonal axis (roadmap §7).
- **FR-11** One global asset-id space; aircraft and components attach to ids minted by
  `AssetRegistry`.
- **FR-12** Serial-number hashes are unique and stored only as commitments.
- **FR-13** Aircraft carry manufacturer, model, manufacture year, category and a hashed
  registration mark.
- **FR-14** Components carry kind, part number, install state, parent and position.
- **FR-15** A component is installed on at most one aircraft at any time (roadmap §9).
- **FR-16** Every asset has exactly one owner; direct transfer is two-step; escrow
  settlement is atomic.
- **FR-17** Terminal asset statuses (`RETIRED`, `DESTROYED`) block listing, transfer and
  verification.

### Provenance
- **FR-18** Documents are recorded as `(hash, uri, type, issuer, timestamp, status)`.
  Payloads are never stored on-chain (roadmap §11).
- **FR-19** Document hashes are unique; documents are append-only, supersedable and
  revocable but never edited.
- **FR-20** Maintenance may be recorded only by an address acting for a `VERIFIED`
  organization of type `MRO` holding a valid `MAINTENANCE_AUTHORITY` credential
  (roadmap §13).
- **FR-21** Maintenance records are immutable and append-only; `performedAt` may not be
  in the future.
- **FR-22** `AssetPassport` aggregates identity, ownership, components, documents,
  credentials, maintenance and status as `view`-only reads with pagination.

### Marketplace & settlement
- **FR-23** An owner may list a verified, non-terminal asset for an allowlisted ERC-20
  at a fixed price with an expiry.
- **FR-24** At most one `ACTIVE` listing per asset.
- **FR-25** Buyers may make, withdraw and expire offers; sellers may accept or reject.
- **FR-26** Accepting an offer opens a per-trade escrow clone.
- **FR-27** The buyer funds the escrow in full; partial funding is rejected.
- **FR-28** Release transfers the asset, pays the protocol fee to treasury and the
  remainder to the seller, and marks the listing `SOLD` — atomically.
- **FR-29** Either party may dispute a funded escrow before the settlement deadline;
  `ARBITRATOR_ROLE` resolves it to exactly one party.
- **FR-30** After the settlement deadline anyone may trigger a full refund to the buyer.
- **FR-31** Fees are centralized in `FeeManager`, hard-capped by a `constant`, and
  changes are access-controlled and evented (roadmap §18).

## Non-functional

- **NFR-01** Solidity `0.8.28`, Foundry, OpenZeppelin `v5.4.0`, EVM `cancun`.
- **NFR-02** Registries are UUPS-upgradeable; escrow, factory and fee manager are immutable.
- **NFR-03** ERC-7201 namespaced storage in every upgradeable contract.
- **NFR-04** Full NatSpec on every contract, external function, event, error, struct
  and enum member.
- **NFR-05** Custom errors only; no `require`-with-string in `src/`.
- **NFR-06** Every state change emits an event sufficient for off-chain reconstruction.
- **NFR-07** Checks-effects-interactions everywhere; reentrancy guards on all
  fund-moving functions.
- **NFR-08** No unbounded loop in any state-changing function.
- **NFR-09** Every external input validated; every state transition explicitly guarded.
- **NFR-10** ≥95% line and branch coverage on `src/`, excluding `script/`.
- **NFR-11** Unit, negative, access-control, fuzz and invariant tests for every contract.
- **NFR-12** `forge fmt --check`, `forge build` (warnings as errors), `forge test` and
  `forge snapshot --check` all pass in CI.
- **NFR-13** Slither runs on every PR; findings are fixed or triaged in writing.
- **NFR-14** Gas snapshots tracked from the first working version (roadmap §19).
- **NFR-15** Deployment is staged per module with a post-deploy `Verify.s.sol`
  assertion pass (roadmap §20).

## Out of scope for V1

Per roadmap §30, and each is a **hard gate** — an implementation PR touching any of
these is rejected regardless of quality: fractional ownership, tokenized securities,
aircraft-backed lending, DAO governance, cross-chain bridges, automated valuation,
DeFi yield, decentralized arbitration, on-chain document storage.

## Explicit non-claims

- On-chain ownership is not legal title.
- A `verified` flag is not an airworthiness certification.
- A maintenance record is not a regulatory approval or a release to service.
- Organization and credential records reflect an authorized role's attestation, not the
  position of any civil aviation authority.

These appear in the NatSpec of every contract they apply to, not only here.

## Milestone mapping (roadmap §34)

| Milestone | Phase | Exit criteria |
|---|---|---|
| M1 Architecture | 0 | Docs approved |
| M2 Foundry foundation | 0 | Clean build, zero failing tests |
| M3 Identity | 1–2 | Access + lifecycle tests pass |
| M4 Asset layer | 3–4 | Lifecycle tests pass |
| M5 Asset passport | 5 | Proof/integrity tests pass |
| M6 Marketplace | 6 | Marketplace lifecycle passes |
| M7 Financial layer | 7 | Fund/state invariants pass |
| M8 Security | 8 | Security gate passed |
| M9 Testnet | 9 | Full lifecycle passes on Sepolia |
| M10 Production | post-V1 | External audit, multisig, monitoring |
