# AeroAsset Protocol

Blockchain infrastructure for aviation assets — a verified asset registry, digital
asset passport, maintenance and document proofs, ownership tracking, marketplace and
escrow.

> **Status: Phase 3 complete** — the protocol core (L0), the identity layer (L1) and
> the generic asset layer (`AssetRegistry`, `AssetOwnership`) are implemented and
> tested. Specialization (L2c), provenance (L3) and the transaction layer (L4) are not
> built yet. This is not audited software and must not be used with real funds.

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
forge fmt && forge test -vvv && forge snapshot && forge coverage --report summary
```

Deployment (Phase 9) uses staged scripts; copy `.env.example` to `.env` first.

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
2. Dispute arbitration is centralized (roadmap §13, deliberate for V1).
3. Hashed serial numbers and tail numbers are **commitments, not encryption**, and are
   brute-forceable unless the caller salts the preimage.
4. Name-hash squatting on `PENDING` organizations is possible; squatted records can do
   nothing and can be revoked.
5. Passport reads require pagination for assets with very many documents.
6. Off-chain data availability is out of scope.

---

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Specification + Foundry foundation | ✅ |
| 1 | Protocol core + `OrganizationRegistry` | ✅ |
| 2 | `CredentialRegistry` | ✅ |
| 3 | `AssetRegistry` + `AssetOwnership` | ✅ |
| 4 | `AircraftRegistry` + `ComponentRegistry` | ⬜ |
| 5 | Provenance + `AssetPassport` | ⬜ |
| 6 | `FeeManager` + `Marketplace` | ⬜ |
| 7 | Escrow + disputes | ⬜ |
| 8 | Invariants, fuzz, static analysis, gas | ⬜ |
| 9 | Deployment + Sepolia E2E | ⬜ |

Post-V1: independent security audit, multisig key custody, monitoring, mainnet.
**AI-generated Solidity is not automatically secure** — an independent human audit is a
hard gate before this protocol handles meaningful funds.

## License

MIT
