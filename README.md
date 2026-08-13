# AeroAsset Protocol

Blockchain infrastructure for aviation assets — a verified asset registry, digital
asset passport, maintenance and document proofs, ownership tracking, marketplace and
escrow.

> **Status: internally audited and remediated** — all five layers are implemented and
> tested, the 18 protocol invariants are executable rather than aspirational, the
> protocol deploys from staged scripts into a timelock-governed configuration that a
> verification script asserts on-chain, and all 25 valid findings from the internal
> audit are closed with regression tests in CI.
>
> **That is not an audit.** The review in [`audit/`](audit/) was performed by the same
> agent that wrote the code, and its two most severe findings were design decisions that
> same agent had written and defended before catching them. An independent human audit
> remains a hard gate. This is not audited software and must not be used with real funds.

---

## What this is

AeroAsset provides trusted digital records for aircraft, engines, components,
documents, maintenance events, credentials, ownership and transactions.

**Design principle:** the chain stores proofs, identities, ownership, permissions and
critical state. Large or confidential aviation documents stay off-chain; the chain
records verifiable hashes and references.

### What it does not claim

- On-chain ownership state is **not** legal title under any aviation authority.
- A protocol "verified" flag is **not** an airworthiness certification.
- A recorded maintenance event is **not** a regulatory approval or release to service.
- Organization and credential records reflect an authorized role's attestation, not the
  position of any civil aviation authority.

---

## Architecture

Five layers; every dependency points downward.

```
L4  TRANSACTION   Marketplace · EscrowFactory · Escrow · FeeManager
L3  PROVENANCE    DocumentRegistry · MaintenanceRegistry · AssetPassport
L2  ASSET         AssetRegistry · AssetOwnership · AircraftRegistry · ComponentRegistry
L1  IDENTITY      OrganizationRegistry · CredentialRegistry
L0  CORE          ProtocolAddressRegistry · RoleManager · ProtocolTimelock
```

Key decisions (full rationale in [`docs/architecture.md`](docs/architecture.md) §4):

| | Decision |
|---|---|
| **Upgradeability** | UUPS proxies for registries; **immutable** escrow, factory and fee manager |
| **Identifiers** | Sequential `uint256` per registry, one global asset-id space, `0` = sentinel |
| **Ownership** | Custom ownership registry, not ERC-721 — transfers are protocol-gated |
| **Access control** | One central `RoleManager`; no `Ownable` anywhere |
| **Address resolution** | `ProtocolAddressRegistry`; no hardcoded addresses |
| **Passport** | `view`-only aggregator with zero state |
| **Escrow** | Per-trade EIP-1167 clone, so funds are isolated per trade |
| **Storage** | ERC-7201 namespaced storage in every upgradeable contract |

---

## Getting started (WSL)

Foundry is installed inside WSL and is not on the Windows `PATH`.

```bash
cd /mnt/d/Solidity-Foundry/aero-asset-protocol && export PATH=$HOME/.foundry/bin:$PATH && forge build && forge test
```

Other useful commands:

```bash
forge fmt && forge test -vvv && forge snapshot && forge coverage --no-match-coverage "(test|script)/" --report summary
```

The default profile compiles through the **IR pipeline** (`via_ir = true`), so the
bytecode the tests run against is the bytecode that ships. That costs roughly 5–10× in
compile time; use the `lite` profile for a fast inner loop, but anything you commit must
pass under the default.

```bash
FOUNDRY_PROFILE=lite forge test
```

Static analysis is blocking, and must exit 0 before a change is complete:

```bash
slither . --config-file slither.config.json --fail-medium
```

---

## Deployment

Copy `.env.example` to `.env` and fill it in first. `.env` is git-ignored and must never
be committed.

Deployment is staged rather than monolithic: each script deploys one layer, writes its
addresses to `deployments/<chainId>.json`, and reads the previous stages back from disk.
A stage that reverts halfway can be re-run without redeploying the layers beneath it.

```bash
forge script script/DeployCore.s.sol --rpc-url sepolia --account deployer --broadcast --verify
```

Then in order: `DeployIdentity`, `DeployAssets`, `DeployProvenance`, `DeployMarketplace`,
`DeployEscrow`, `ConfigureProtocol`, and finally:

```bash
forge script script/Verify.s.sol --rpc-url sepolia
```

`ConfigureProtocol` ends by granting every admin role to `ProtocolTimelock` and
renouncing the deployer's own — after that step the deployer EOA has no power over the
protocol, and every further change must go through the timelock's ≥48h delay.
`Verify.s.sol` asserts that handover actually happened, along with every address-book
entry, machine-role grant and fee bound. **Deployment is not complete until `Verify`
passes**; a forgotten role grant is indistinguishable from a working deployment until
the first settlement fails with real funds in escrow.

`test/integration/FullLifecycle.t.sol` runs the entire sequence in-process — deploy,
configure, hand over, verify, then a full aircraft sale through escrow — so the scripts
are covered by CI rather than only exercised on a live chain.

---

## Documentation

| Document | Contents |
|---|---|
| [`architecture.md`](docs/architecture.md) | Layering, module boundaries, decisions D1–D8, call graph |
| [`requirements.md`](docs/requirements.md) | FR/NFR catalogue, V1 scope gate, milestone map |
| [`roles.md`](docs/roles.md) | Role catalogue, key custody, emergency runbook |
| [`permissions.md`](docs/permissions.md) | Function-level permission matrix |
| [`asset-model.md`](docs/asset-model.md) | Structs, enums, packing, field semantics |
| [`state-machines.md`](docs/state-machines.md) | Every lifecycle and legal transition |
| [`events.md`](docs/events.md) | Event catalogue and indexing strategy |
| [`errors.md`](docs/errors.md) | Custom error catalogue |
| [`storage-model.md`](docs/storage-model.md) | ERC-7201 namespaces, packing, upgrade rules |
| [`security-model.md`](docs/security-model.md) | Trust assumptions and controls |
| [`threat-model.md`](docs/threat-model.md) | Attacker profiles, threats T-01…T-16 |
| [`invariants.md`](docs/invariants.md) | Protocol invariants and Foundry encodings |

---

## Known limitations (V1, accepted)

1. Timelock compromise is a total compromise of the L1–L3 registries. Bounded by a ≥48h
   delay, multisig custody and queue monitoring — mitigated, not eliminated.
2. Dispute arbitration is centralized (roadmap §13, deliberate for V1). Bounded since
   audit AAP-01: an unresolved dispute refunds the buyer permissionlessly after
   `DISPUTE_RESOLUTION_WINDOW`, so an absent arbitrator delays a trade rather than
   freezing the deposit.
3. Hashed serial numbers and tail numbers are **commitments, not encryption**, and are
   brute-forceable unless the caller salts the preimage. Squatting a serial is
   recoverable — `PROTOCOL_ADMIN_ROLE` can release the index entry behind the timelock
   (AAP-08) — but the confidentiality caveat stands regardless.
4. **Griefing is bounded but not priced.** Remediation removed the permanence of every
   griefing outcome; it did not make griefing cost anything. Apart from the escrow
   timeout penalty, each attack still costs an attacker one transaction's gas. Bonds are
   proposed but unimplemented — `audit/economic-review.md` §7.
5. Passport reads require pagination for assets with very many documents.
6. Off-chain data availability is out of scope. Every on-chain guarantee here is
   conditional on it.
7. Maintenance `performedAt` is a caller's claim the protocol cannot verify. Backdating
   is made **visible** via `recordedAt`, not prevented — historical backfill is a
   legitimate use case (AAP-12).

---

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Specification + Foundry foundation | ✅ |
| 1 | Protocol core + `OrganizationRegistry` | ✅ |
| 2 | `CredentialRegistry` | ✅ |
| 3 | `AssetRegistry` + `AssetOwnership` | ✅ |
| 4 | `AircraftRegistry` + `ComponentRegistry` | ✅ |
| 5 | Provenance + `AssetPassport` | ✅ |
| 6 | `FeeManager` + `Marketplace` | ✅ |
| 7 | Escrow + disputes | ✅ |
| 8 | Invariants, fuzz, static analysis, gas | ✅ |
| 9 | Deployment scripts + local E2E | ✅ |
| 10 | Internal audit — 26 findings raised, 25 valid | ✅ |
| 10a | Gate 0 — permanent fund/state loss (CRITICAL + all HIGH) | ✅ |
| 10b | Gate 1 — identifier burns, `via_ir`, Slither made blocking | ✅ |
| 10c | Gate 2 — economic + data integrity | ✅ |
| 10d | Gate 3 — housekeeping | ✅ all 25 findings closed |
| 9b | Sepolia deploy + verify | ⬜ needs your RPC + funded key |

The audit lives in [`audit/`](audit/): five domain reviews plus
[`findings.md`](audit/findings.md), the catalogue and remediation tracker. Every fixed
finding has a regression test in `test/audit/` — if one fails, that vulnerability is
back. Static analysis is blocking in CI.

**The audit was performed by the same agent that wrote the code**, which is a real
weakness in it and is stated plainly at the top of `findings.md`. It does not replace an
independent human review.

Post-V1: independent security audit, multisig key custody, monitoring, mainnet.
**AI-generated Solidity is not automatically secure** — an independent human audit is a
hard gate before this protocol handles meaningful funds.

## License

MIT
