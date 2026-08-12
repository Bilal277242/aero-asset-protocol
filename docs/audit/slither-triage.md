# Slither Triage

**Status:** ✅ **Executed.** First real run performed during the Gate 1 audit remediation.
**Tool:** `slither-analyzer` (latest via pip), 100 detectors, 76 contracts analyzed.
**Config:** `slither.config.json` — `filter_paths: lib/|test/|script/`.
**CI:** blocking at `fail-on: medium` (`.github/workflows/ci.yml`).

Reproduce locally:

```bash
slither . --config-file slither.config.json --fail-medium
```

---

## History

This file previously recorded *expected* detector output because Slither had never been
run — there was no `pip` in the development environment, and the CI step carried
`continue-on-error: true`, so its first execution would also have been non-blocking.
Audit finding **AAP-24** flagged that the Phase 8 static-analysis gate was therefore
**unmet rather than merely unreported**.

It has now actually run. The results below are real output, not predictions.

---

## Baseline

| Impact | Confidence | Detector | Count | Disposition |
|---|---|---|---|---|
| Medium | High | `incorrect-equality` | 3 | ❌ false positive — suppressed at source |
| Medium | Medium | `reentrancy-no-eth` | 1 | ⚠️ true pattern, not exploitable — suppressed at source |
| Low | Medium | `reentrancy-benign` | 3 | ✅ accepted |
| Low | Medium | `reentrancy-events` | 6 | ✅ accepted (overlaps audit AAP-23) |
| Low | Medium | `timestamp` | 22 | ✅ accepted — inherent to the design |
| Informational | High | `assembly` | 10 | ✅ accepted — required by ERC-7201 |
| Informational | High | `low-level-calls` | 1 | ✅ accepted — deliberate, see AAP-13 |

**46 findings initially; 42 after suppressing the four Medium ones. Zero Medium or
above remain, so `--fail-medium` exits 0.**

---

## Medium findings — full triage

### `incorrect-equality` ×3 — false positive

All three are the detector firing on `== 0` **sentinel** comparisons, which is its known
noisy mode. It exists to catch strict equality against balances or timestamps that an
attacker can nudge; none of these is that.

| Location | Expression | Why it is fine |
|---|---|---|
| `Escrow._payout` | `amount == 0` | Early return for a zero fee. Not a balance comparison. |
| `Escrow._payout` | `ok && (data.length == 0 \|\| abi.decode(data,(bool)))` | The standard ERC-20 acceptance rule, byte-identical in intent to OpenZeppelin's `SafeERC20`. `data.length == 0` is how a non-standard token that returns nothing is distinguished from one returning `false`. |
| `Escrow.disputeDeadline` | `raisedAt == 0` | Sentinel for "no dispute has been raised". |

Suppressed with `// slither-disable-next-line incorrect-equality` at each site.

### `reentrancy-no-eth` ×1 — true pattern, not exploitable

`Marketplace.acceptOffer` writes `listing.escrowId` and `$.escrowOf[listingId]` **after**
calling `EscrowFactory.openEscrow`.

The pattern is real. It is also **unavoidable**: both values are *returned by* that call,
so there is nothing to write beforehand.

It is not exploitable because `openEscrow` reaches no untrusted code:

- `Clones.cloneDeterministic` — deploys a known implementation, no callback;
- `RoleManager.grantRole` — protocol contract, no callback;
- `IEscrow(escrow).initialize(...)` — the clone it just deployed, which only reads the
  address registry.

There is no attacker-controlled callee anywhere in that subtree. On top of that,
`acceptOffer` carries `nonReentrant`, and the offer is written to `ACCEPTED` *before* the
call, so a reentrant path would fail the transition guard regardless.

Suppressed at the function with a comment recording the condition under which the
suppression must be revisited: **if `openEscrow` ever calls out to a caller-supplied
address, this becomes live.**

---

## Low and Informational — accepted classes

### `timestamp` ×22 — inherent to the design

Every instance is a deadline comparison: funding windows, settlement windows, listing and
offer expiry, credential validity, the dispute-resolution window. The protocol's shortest
meaningful interval is **7 days**; validator timestamp drift is bounded at seconds. There
is no state where a manipulable few seconds changes an outcome.

Accepted permanently. If a future feature introduces a sub-hour deadline, this class
needs re-review rather than blanket acceptance.

### `reentrancy-benign` ×3 — state written after a trusted call

| Function | External call | Assessment |
|---|---|---|
| `Escrow._payout` | `token.call(transfer)` | Credit necessarily follows the attempt — you cannot know a transfer failed before making it. Status is already terminal and every caller is `nonReentrant`; a reentering token finds a closed guard and a terminal state machine. Documented in the function's NatSpec. |
| `AircraftRegistry.registerAircraft` | `AssetRegistry.registerAssetFor` | Callee is a protocol contract; its own subtree (`AssetOwnership.initializeOwnership`) reaches no untrusted code. |
| `ComponentRegistry.registerComponent` | `AssetRegistry.registerAssetFor` | As above. |

### `reentrancy-events` ×6 — event ordering

Events emitted after an external call, so a naive log-order reconstruction can report a
sequence that never occurred. No correctness impact. This overlaps audit finding
**AAP-23**, which is open at Gate 3.

### `assembly` ×10 — required

One per ERC-7201 namespaced-storage accessor:

```solidity
function _s() private pure returns (XStorage storage $) {
    assembly ("memory-safe") { $.slot := _X_STORAGE; }
}
```

This is the ERC-7201 reference pattern. The namespace constants are asserted against the
derivation formula in `test/upgrade/Namespaces.t.sol`, which is the check that actually
matters — a mistyped constant is invisible at runtime.

### `low-level-calls` ×1 — deliberate

`Escrow._payout` uses a raw `call` rather than `SafeERC20`. That is the entire point of
the AAP-13 remediation: a recipient that cannot receive — a blacklisted account on a
token like USDC — must not be able to revert the escrow's terminal transition. The return
value is checked with SafeERC20's own acceptance rule.

---

## Detectors that must never appear

If any of these fires, treat it as a release blocker rather than a triage item:

`arbitrary-send-eth` · `arbitrary-send-erc20` · `suicidal` · `controlled-delegatecall` ·
`delegatecall-loop` · `unchecked-transfer` · `unprotected-upgrade` · `uninitialized-state`
· `uninitialized-storage` · `reentrancy-eth` · `weak-prng` · `tx-origin` ·
`incorrect-modifier` · `shadowing-state`

None is present in the current baseline.

## Excluded detectors

`naming-convention` and `solc-version` are excluded in `slither.config.json`.
The first conflicts with the protocol's deliberate `_s()` / `$` / `SCREAMING_CASE`
immutable conventions; the second objects to the pinned `0.8.28`, which is pinned on
purpose for reproducible bytecode.

---

## Maintaining this baseline

1. **CI is blocking.** A new Medium fails the build. Do not restore
   `continue-on-error: true` to get a merge through.
2. **Suppress at the source, never in config.** `slither-disable-next-line` keeps the
   justification next to the code and keeps the detector live everywhere else. A
   config-level exclusion silences the whole codebase.
3. **Every suppression carries a written reason**, and where the reasoning depends on a
   property that could change, it names that property.
4. **Re-run after any change to the escrow, ownership or upgrade paths**, not only when
   CI happens to run.
