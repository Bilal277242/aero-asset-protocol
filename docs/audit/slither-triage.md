# Slither triage

Static analysis runs on every pull request via `crytic/slither-action` (see
`.github/workflows/ci.yml`, job `static-analysis`) with `fail-on: medium` and the
configuration in `slither.config.json`.

> **Status: not yet run.** Slither is a Python tool and this development environment
> has no `pip`, so it has not been executed locally. The CI job is wired and will
> produce the first real report on the next push. **Every finding it reports must be
> either fixed or recorded in the table below with a written justification before the
> Phase 24 external audit** — roadmap §28 and `docs/threat-model.md` treat an untriaged
> static-analysis report as a blocking gap, not a formality.

Nothing in this file should be read as "Slither passed". It has not been run.

---

## Detectors expected to fire, and why

These are predictable from the code as written. Recording the reasoning now means the
first real run can be triaged quickly rather than argued about.

| Detector | Where | Expected disposition |
|---|---|---|
| `reentrancy-benign` / `reentrancy-events` | `Escrow._settle`, `Escrow._refund` | **Accept.** Events are emitted after `safeTransfer`. Status is already terminal before any external call and `ReentrancyGuardTransient` is active, so the ordering affects log sequence only, not state. |
| `reentrancy-no-eth` | `Marketplace.acceptOffer` | **Accept.** The offer is marked `ACCEPTED` before `EscrowFactory` is called; a reentrant path fails the transition guard. `nonReentrant` is also applied. |
| `unused-return` | `EscrowFactory.openEscrow` | **Verify.** `IEscrow.initialize` returns nothing; if flagged, confirm no return value is being dropped. |
| `timestamp` | every deadline comparison | **Accept.** All deadlines are hours-to-days; validator drift of seconds is immaterial and no randomness derives from block properties (`security-model.md` T-A6). |
| `assembly` | ERC-7201 storage accessors, `AssetPassport` slot sweep | **Accept.** Every block is `memory-safe` and does nothing but set a storage pointer. |
| `low-level-calls` | none in `src/` | Should not fire. If it does, investigate — the protocol makes no arbitrary-target calls. |
| `arbitrary-send-erc20` | `Escrow.fund` | **Verify carefully.** `safeTransferFrom(msg.sender, ...)` pulls only from the caller, who must be the named buyer. Confirm the detector is not seeing a path where `from` is attacker-controlled. |

## Detectors that must **not** fire

If any of these appear, treat it as a real finding rather than noise:

- `arbitrary-send-eth`, `suicidal`, `controlled-delegatecall` — the protocol makes no
  ETH transfers, has no `selfdestruct`, and no `delegatecall` outside the UUPS proxy
  mechanism.
- `uninitialized-state`, `uninitialized-storage` — would indicate an ERC-7201 accessor
  is wrong.
- `incorrect-equality` on balance checks — the escrow's `received != price` comparison
  is deliberate and exact; a warning here would mean the measured-delta logic changed.
- `unprotected-upgrade` — every implementation constructor calls
  `_disableInitializers()`, asserted by `test/upgrade/UpgradeSafety.t.sol`.

## Triage record

| Date | Slither version | Findings | Fixed | Accepted | Notes |
|---|---|---|---|---|---|
| _pending first CI run_ | — | — | — | — | — |
