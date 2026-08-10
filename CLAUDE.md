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
- Checks-effects-interactions, without exception on fund-moving paths.
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
| 7 | `EscrowFactory`, `Escrow`, disputes | ⬜ |
| 8 | Invariants, fuzz, static analysis, gas | ⬜ |
| 9 | Deployment scripts, Sepolia, E2E | ⬜ |
