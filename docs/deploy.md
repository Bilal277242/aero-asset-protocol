# Deployment Runbook

How to deploy AeroAsset Protocol, end to end.

Deployment is **eight stages plus a verification pass**. Each stage deploys one layer,
records its addresses to `deployments/<chainId>.json`, and reads earlier stages back from
that file. A stage that reverts halfway leaves a truthful record and a known resume
point, rather than a protocol in a state nobody has a name for.

**The deployment is not finished when the last contract is mined. It is finished when
`Verify` passes and the manual checks in §7 pass.** A forgotten role grant is
indistinguishable from a working deployment until the first settlement fails with real
funds already in escrow.

---

## 0. Before you start

### You need

| | |
|---|---|
| **An RPC endpoint** | Infura, Alchemy, or your own node |
| **A funded deployer key** | ~0.3 ETH on a testnet; budget more on mainnet, this deploys 20 contracts |
| **An Etherscan API key** | Only if using `--verify` |
| **A Safe (or equivalent) multisig** | For the timelock proposer and the arbitrator. See §1. |
| **Foundry** | Run from WSL: `export PATH=$HOME/.foundry/bin:$PATH` |

### The tree must be green first

```bash
forge fmt --check && forge build && forge test && slither . --config-file slither.config.json --fail-medium
```

Expect **540 tests across 30 suites** and `slither` exit 0. Do not deploy from a tree
that does not pass; the deployment scripts are themselves covered by
`test/integration/FullLifecycle.t.sol`, so a failing suite may mean the deployment path
is broken, not just a feature.

Note the default profile compiles through the **IR pipeline**, so a cold build is slow
(~25–30 min in WSL over DrvFs). That is deliberate — it is the bytecode that ships.

---

## 1. Decide key custody before touching a keyboard

This is the part that actually matters, and it cannot be fixed after the fact without a
timelocked migration. Six distinct roles, and **the deployment is only as good as the
separation between them**.

| Role | Env var | What it can do | Custody |
|---|---|---|---|
| **Timelock proposer** | `PROTOCOL_ADMIN` | Queue *every* privileged action: upgrades, address-registry writes, unpause, org revocation, all role changes | **Multisig. Non-negotiable on mainnet.** |
| **Pauser** | `PROTOCOL_PAUSER` | Halt the protocol. **Cannot unpause.** | Separate keys, fast to reach. A hot key is acceptable here — a compromised pauser griefs, it cannot extract. |
| **Arbitrator** | `DISPUTE_ARBITRATOR` | Resolve a disputed escrow to one of two parties | **Multisig — `Verify` enforces that it has code.** |
| **Org verifier** | `ORG_VERIFIER` | Verify / suspend / reject organizations | Ops key |
| **Asset verifier** | `ASSET_VERIFIER` | Verify aircraft | Ops key, **distinct from the org verifier** |
| **Credential issuer** | `CREDENTIAL_ISSUER` | Issue and revoke credentials | Ops key |

`Verify` enforces that the verifier, issuer, arbitrator and pauser are **four different
accounts**. That is not bureaucracy: one key holding two of them collapses the trust
chain, because verifying an organization, issuing its credentials and arbitrating its
disputes are the three steps that make a counterparty trustworthy.

The deployer EOA is temporary. It holds `DEFAULT_ADMIN_ROLE` through stages 1–7 and
renounces it at the end of stage 7. After that it has **no power over the protocol** and
is just an address that paid for gas.

---

## 2. Configure the environment

```bash
cp .env.example .env
```

Fill it in. `.env` is git-ignored and must never be committed.

```bash
SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/<key>"
ETHERSCAN_API_KEY="..."

# Deployer. Prefer a keystore over a raw key:
#   cast wallet import deployer --interactive
DEPLOYER_ACCOUNT="deployer"

PROTOCOL_ADMIN="0x..."        # timelock proposer — multisig
TIMELOCK_MIN_DELAY="172800"   # 48h. See the warning below.

FEE_TREASURY="0x..."
SETTLEMENT_TOKEN="0x..."      # verify this address yourself
MARKETPLACE_FEE_BPS="200"

ORG_VERIFIER="0x..."
ASSET_VERIFIER="0x..."
CREDENTIAL_ISSUER="0x..."
DISPUTE_ARBITRATOR="0x..."    # multisig
PROTOCOL_PAUSER="0x..."
```

> ### `TIMELOCK_MIN_DELAY` has a hard floor of 48 hours
>
> `DeployCore` reverts with `TimelockDelayTooShort` below it, and `Verify` independently
> asserts the deployed delay. Overriding requires setting `ALLOW_SHORT_TIMELOCK_DELAY=true`
> explicitly — deliberately awkward, because a shorter delay is legitimate for local
> rehearsal and almost never anywhere else.
>
> This was unenforced until audit **AAP-27**: the 48-hour constant was only the default
> when the variable was unset, so `TIMELOCK_MIN_DELAY=0` produced a zero-delay timelock
> that passed the entire verification gate. If you are reading a fork from before that
> fix, check `getMinDelay()` by hand.

**On `PRIVATE_KEY`.** `_startBroadcast` uses `PRIVATE_KEY` when set, and otherwise falls
back to `--account`. Leave it empty and use a keystore for anything with real value; a
raw key in an environment file is one `cat` away from a compromise.

---

## 3. Rehearse on anvil first

Never let a live network be the first time a script runs.

```bash
anvil
```

In a second shell:

```bash
export PATH=$HOME/.foundry/bin:$PATH
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80  # anvil #0, public
export PROTOCOL_ADMIN=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
export TIMELOCK_MIN_DELAY=60
# ...remaining vars, all distinct addresses
```

Then run §4 against `--rpc-url http://localhost:8545`. Artifacts land in
`deployments/31337.json`; delete it to start over.

`test/integration/FullLifecycle.t.sol` already runs this whole sequence in-process on
every CI run, including a full aircraft sale through escrow. The anvil rehearsal exists
to catch **environment** problems — a malformed `.env`, a missing key, an RPC that drops
— not logic problems.

---

## 4. Deploy, stage by stage

Run in order. Each depends on the artifacts of the last.

```bash
forge script script/DeployCore.s.sol --rpc-url sepolia --account deployer --broadcast --verify
```

| # | Script | Deploys | Reads env |
|---|---|---|---|
| 1 | `DeployCore` | `ProtocolTimelock`, `RoleManager`, `ProtocolAddressRegistry` | `PROTOCOL_ADMIN`, `TIMELOCK_MIN_DELAY` |
| 2 | `DeployIdentity` | `OrganizationRegistry`, `CredentialRegistry` (+ impls) | — |
| 3 | `DeployAssets` | `AssetOwnership`, `AssetRegistry`, `AircraftRegistry`, `ComponentRegistry` (+ impls) | — |
| 4 | `DeployProvenance` | `DocumentRegistry`, `MaintenanceRegistry` (+ impls), `AssetPassport` | — |
| 5 | `DeployMarketplace` | `Marketplace` (+ impl) | — |
| 6 | `DeployEscrow` | `FeeManager`, `Escrow` implementation, `EscrowFactory` | `FEE_TREASURY` |
| 7 | `ConfigureProtocol` | *nothing* — wires everything and hands over | all role vars, `SETTLEMENT_TOKEN`, `MARKETPLACE_FEE_BPS` |
| 8 | `Verify` | *nothing* — asserts | `SETTLEMENT_TOKEN`, `PROTOCOL_ADMIN` |

Stages 1–6 are the same command with the script name swapped. Stage 8 needs no
`--broadcast` — it is a `view` call:

```bash
forge script script/Verify.s.sol --rpc-url sepolia
```

### Stage 7 is the one that matters

`ConfigureProtocol` does four things in order, and the order is load-bearing:

1. **`wireAddresses`** — publishes all 14 module addresses into the registry. Nothing
   works before this; a module that cannot resolve a peer reverts on its first call.
2. **`wireRoles`** — narrows `SETTLEMENT_ROLE`'s admin to `ESCROW_FACTORY_ROLE`, grants
   the machine roles (`ASSET_MINTER_ROLE` to the two specialization registries,
   `ESCROW_FACTORY_ROLE` to the factory), then the operational roles.
3. **`wireFees`** — allowlists the settlement token, sets the marketplace fee.
4. **`handOverToTimelock`** — grants `DEFAULT_ADMIN_ROLE`, `PROTOCOL_ADMIN_ROLE` and
   `FEE_MANAGER_ROLE` to the timelock, **then** renounces the deployer's own.

The grant strictly precedes the renounce because `RoleManager` refuses to remove the last
admin. Get that order wrong and the call reverts rather than bricking the protocol — but
it is why stage 7 must not be run piecemeal.

**After stage 7 the deployer is powerless.** There is no undo.

### If a stage fails

Artifacts are written per-key as each contract deploys, so the record is truthful even
after a partial failure. Re-run the failed stage; it redeploys only what it owns.
Stages already recorded are untouched.

Foundry's own `--resume` works for a transaction-level failure within one stage:

```bash
forge script script/DeployAssets.s.sol --rpc-url sepolia --account deployer --resume
```

Delete `deployments/<chainId>.json` only if you intend to redeploy from scratch.

---

## 5. What `Verify` checks

It asserts, and reverts with `VerificationFailed(<what>)` naming the first failure:

- **Timelock** — delay at or above the 48h floor; the configured proposer holds
  PROPOSER_ROLE and is a contract; execution is permissionless; the proposer does not
  also hold timelock admin. Checked first, since it roots every other claim (AAP-27).
- **Timelock** — delay at or above the 48h floor; the configured proposer holds
  `PROPOSER_ROLE` and is a contract; execution is permissionless; the proposer does not
  also hold timelock admin. Checked **first**, since it roots every other claim here
  (audit AAP-27).
- **Address book** — all 14 entries present and matching the recorded deployment.
- **Admin handover** — exactly one `DEFAULT_ADMIN_ROLE` holder, and it is the timelock;
  the timelock also holds `PROTOCOL_ADMIN_ROLE`; no pauser is the timelock.
- **Machine roles** — `SETTLEMENT_ROLE`'s admin narrowed to `ESCROW_FACTORY_ROLE`;
  exactly one factory; exactly two asset minters; the factory points at the recorded
  escrow implementation; zero escrows and zero `SETTLEMENT_ROLE` holders pre-launch.
- **Operational roles** — at least one arbitrator, every arbitrator is a contract;
  verifier / issuer / arbitrator / pauser mutually distinct; `FEE_MANAGER_ROLE` held by
  the timelock alone.
- **Fees** — treasury set, settlement token allowlisted, fee within `MAX_FEE_BPS`.

---

## 6. Verify the source on the explorer

`--verify` handles this inline. If it failed or you skipped it:

```bash
forge verify-contract <address> src/core/RoleManager.sol:RoleManager \
  --chain sepolia --watch --constructor-args $(cast abi-encode "constructor(address)" <deployer>)
```

Proxies need the **implementation** verified; the explorer then offers "read as proxy".

---

## 7. Manual checks the scripts do not perform

The timelock's delay, proposer, permissionless execution and absence of a standing admin
are all asserted by `Verify` as of audit AAP-27. What remains is what no script can
check, because it depends on facts outside the chain:

- **The settlement token address is the real one.** Nothing validates it beyond "is a
  contract that answers `transfer`". Check it against the issuer's published address, not
  a search result.
- **The treasury can actually receive the token.** If it is a contract that reverts on
  receipt, protocol fees defer rather than blocking settlement — but you will accrue an
  unclaimable balance.
- **Queue monitoring is live before you announce the deployment.** A timelock nobody
  watches only inconveniences an attacker. This is an operational prerequisite, not a
  nice-to-have.

---

## 8. Operating the protocol afterwards

Every privileged action now goes through the timelock. To upgrade a registry:

```bash
# 1. Queue (from the proposer multisig)
cast send <timelock> "schedule(address,uint256,bytes,bytes32,bytes32,uint256)" \
  <target> 0 <calldata> 0x0 <salt> 172800

# 2. Wait out the delay. It is public the whole time — this is the point.

# 3. Execute (permissionless: executors is [address(0)])
cast send <timelock> "execute(address,uint256,bytes,bytes32,bytes32)" \
  <target> 0 <calldata> 0x0 <salt>
```

**Before queueing any UUPS upgrade**, diff the storage layout. Nothing on-chain checks
it and a mismatch silently corrupts every record:

```bash
forge inspect src/assets/AssetRegistry.sol:AssetRegistry storageLayout > new.json
# compare against the layout of the deployed implementation
```

**Pausing does not go through the timelock** — that is the asymmetry. `PAUSER_ROLE` acts
immediately; unpausing requires `PROTOCOL_ADMIN_ROLE` and therefore the full delay. Fast
and low-trust to stop, slow and high-trust to restart.

---

## 9. Mainnet differences

Everything above, plus:

1. **Leave `TIMELOCK_MIN_DELAY` unset** so the 48-hour default applies. See §2.
2. **Every privileged address is a multisig**, not just the two `Verify` insists on.
3. **Rehearse on a fork first**: `anvil --fork-url $MAINNET_RPC_URL`, then run stages 1–8
   against it. This catches a bad `SETTLEMENT_TOKEN` before it costs anything.
4. **Get the independent audit first.** The review in `audit/` closed 25 of 25 findings
   and was written by the same agent that wrote the code. Its two most severe findings
   were design decisions that agent had written and defended before catching them. That
   is not a substitute for a reviewer who did not write it.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `MissingArtifact("roleManager")` | Ran a stage out of order, or `deployments/<chainId>.json` is missing. Chain id comes from the RPC — check you are on the network you think. |
| `TimelockDelayTooShort(0, 172800)` | `TIMELOCK_MIN_DELAY` is below the 48h floor. Set `ALLOW_SHORT_TIMELOCK_DELAY=true` only for local rehearsal. |
| `VerificationFailed("timelock delay below the production floor")` | Deployed with a short delay. The delay is immutable except through the timelock itself — redeploy. |
| `VerificationFailed("timelock proposer is an EOA")` | `PROTOCOL_ADMIN` has no code. It must be a multisig. |
| `VerificationFailed("proposer lacks PROPOSER_ROLE")` | `PROTOCOL_ADMIN` differs from the address stage 1 was deployed with. |
| `VerificationFailed("arbitrator is an EOA")` | `DISPUTE_ARBITRATOR` has no code. It must be a multisig. |
| `VerificationFailed("two trust-chain roles share a key")` | Two of verifier / issuer / arbitrator / pauser are the same address. |
| `VerificationFailed("more than one protocol admin")` | Stage 7 did not complete. Re-run `ConfigureProtocol`. |
| `AddressNotRegistered(<key>)` on first use | Stage 7's `wireAddresses` did not run. |
| Script reverts with no message on a fresh chain | `deployments/` missing or not writable — it is git-ignored, so it may not exist in a fresh clone. `mkdir -p deployments`. |
