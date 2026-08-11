# Access Control & Ownership Review

**Scope:** role model, authorization surface, privilege separation, ownership model,
deployment-time role wiring.
Findings referenced by ID are catalogued in [`findings.md`](findings.md).

---

## 1. Role model

One central `RoleManager` (OZ `AccessControlEnumerable`), queried by every module. No
`Ownable` anywhere in `src/` — verified by search. With eighteen contracts, per-contract
role state would mean eighteen places to audit and rotate; one instance means one
revocation path. This is the right call and it is applied without exception.

`RoleManager` is **immutable**. For the contract that gates all other authorization,
immutability removes the admin key from the threat model for authorization *logic*
entirely. Also correct.

| Role | Powers | Intended holder | Verified? |
|---|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Admin of every other role | `ProtocolTimelock` alone | ✅ asserted |
| `PROTOCOL_ADMIN_ROLE` | UUPS upgrades, address-registry writes, unpause, org revocation, token allowlist | `ProtocolTimelock` | ✅ asserted |
| `PAUSER_ROLE` | Pause (**not** unpause) | Separate ops keys | ⚠️ only "≠ timelock" |
| `FEE_MANAGER_ROLE` | Fee rate (≤ cap), treasury | `ProtocolTimelock` | ❌ **not asserted** |
| `ARBITRATOR_ROLE` | Resolve a `DISPUTED` escrow to one of two parties | Multisig | ❌ **not asserted** |
| `ORG_VERIFIER_ROLE` | Org verify / reject / suspend / reactivate | Ops key | ❌ not asserted |
| `ASSET_VERIFIER_ROLE` | Asset verify / unverify | Ops key | ❌ not asserted |
| `CREDENTIAL_ISSUER_ROLE` | Issue / suspend / reinstate / revoke credentials | Ops key | ❌ not asserted |
| `ASSET_MINTER_ROLE` | Mint asset ids on behalf of an org | Aircraft + Component registries | ✅ count == 2 |
| `ESCROW_FACTORY_ROLE` | Administers `SETTLEMENT_ROLE` **only** | `EscrowFactory` | ✅ count == 1 |
| `SETTLEMENT_ROLE` | Lock and settle asset transfers | Live escrow clones | ✅ count == 0 pre-launch |

**AAP-14** is the gap in that last column: `Verify.s.sol` rigorously constrains the
machine roles and says nothing about the operational ones, including the arbitrator —
the single most dangerous operational key in the protocol (**AAP-04**).

## 2. The authorization surface

Every non-`view` external function in `src/` carries an explicit access control decision.
I enumerated them; the categories are:

**Role-gated** — `onlyRole(...)` against `RoleManager`. Used for verification, credential
issuance, fee configuration, pause/unpause, upgrades, arbitration, settlement.

**Caller-identity-gated** — `msg.sender` must equal a specific stored address:
`Escrow.fund` (buyer), `Escrow.release` (buyer), `Marketplace.acceptOffer` (listing
seller), `AssetOwnership.initiateTransfer` (owner), `OrganizationRegistry` admin
functions.

**Peer-gated** — `msg.sender` must be a specific protocol contract, resolved **live**
from the address registry so a rotated module loses the privilege on the next call:
`AssetOwnership.initializeOwnership` / `freezeTransfers` (only `AssetRegistry`),
`Escrow.initialize` (only `EscrowFactory`), `EscrowFactory.openEscrow` (only
`Marketplace`).

**Data-gated** — `OrganizationRegistry.isActingFor`, used where a role grant would not
scale to thousands of participants. Correct primitive for the problem.

**Deliberately permissionless** — `expireListing`, `expireOffer`, `expireCredential`,
`claimTimeout`. Each only records elapsed time or pays a fixed party, and each reverts if
the precondition has not genuinely occurred. I checked all four: none can be induced to
act early or to redirect value.

**Three functions apply two independent gates**, which is the strongest pattern in the
codebase:

```solidity
// AssetOwnership.settleTransfer
onlyRole(ProtocolRoles.SETTLEMENT_ROLE)                          // (1) holds the role
if (record.lockedBy != msg.sender) { revert NotLockHolder(...); } // (2) locked this asset
if (record.owner != from) { revert UnexpectedOwner(...); }        // (3) asserted owner matches
```

Holding `SETTLEMENT_ROLE` is *not sufficient* to move an asset — the caller must be the
contract that locked that specific asset, and must correctly name the current owner.
`Marketplace.markSold` and `clearEscrow` apply the same pattern via
`_requireAttachedEscrow`. A rogue role-holder cannot close out a trade it is not party
to. This is well designed and worth preserving verbatim.

## 3. Privilege separation

**Pause is asymmetric and correct.** `PAUSER_ROLE` can pause but explicitly cannot
unpause; unpausing requires `PROTOCOL_ADMIN_ROLE`, i.e. the timelock. Halting during an
incident is fast and low-trust; restarting is slow and high-trust. A compromised pauser
key griefs but cannot extract value.

**The pause exemptions were chosen deliberately and I agree with each**: suspension,
revocation, rejection, unverification, credential expiry and `setTransferLock(false)` all
remain callable while paused, because each strictly *reduces* privilege or releases a
lock. `Escrow` is not pausable at all, so a pause can never strand a buyer's deposit;
pausing `AssetOwnership` blocks `settleTransfer` but not `_refund`. That asymmetry —
settlement stops, refunds do not — is exactly right.

**`SETTLEMENT_ROLE`'s admin is narrowed to `ESCROW_FACTORY_ROLE`** rather than handing
the factory `DEFAULT_ADMIN_ROLE`. `RoleManager.setRoleAdmin` exists solely to enable
this, and it refuses to re-administer `DEFAULT_ADMIN_ROLE` so the timelock cannot be
routed around. Escrows then **renounce their own role** on reaching a terminal state, so
disarming involves no admin key at all. This is the best-engineered part of the access
control model.

**Last-admin protection** overrides the internal `_revokeRole` rather than only the
external `revokeRole`, so `renounceRole` is covered by the same guard. Guarding only the
external path would have left an open route to an unrecoverable protocol.

## 4. Ownership model

Custom ownership registry rather than ERC-721. The cost is losing generic wallet and
marketplace tooling; that cost is the point, because an aircraft record must not be
sellable on a third-party marketplace outside the escrow layer.

Verified properties:

- **Two-step direct transfers.** `initiateTransfer` → `acceptTransfer`, with either party
  able to `cancelTransfer` and an optional expiry. A mistyped recipient in a one-step
  push would permanently orphan an aircraft's entire provenance chain, so this is the
  right trade.
- **Taking a lock clears any pending transfer**, so a seller's armed offer cannot fire
  the instant settlement releases.
- **Locks are held by address, not by role.** `setTransferLock(false)` requires
  `currentHolder == msg.sender`, so one escrow cannot release another's lock.
- **`isTransferable`** correctly composes existence, freeze and lock.

Two gaps:

- **AAP-02:** the *owner* can trigger a permanent freeze via `AssetRegistry.setAssetStatus`
  while an escrow holds the lock. Ownership-based authorization is correct for that
  function in general; the missing check is the lock.
- **AAP-06:** ownership is entirely decoupled from component installation, so an
  installed engine is freely sellable off its airframe.

`initializeOwnership` correctly refuses to re-initialize (`OwnershipAlreadyInitialized`),
so an asset can never have its ownership record reset.

## 5. Deployment-time wiring

`ConfigureProtocol.handOverToTimelock` gets the ordering right in a way that is easy to
get wrong:

```solidity
roles.grantRole(roles.DEFAULT_ADMIN_ROLE(), a.protocolTimelock);   // grant first
...
roles.renounceRole(roles.DEFAULT_ADMIN_ROLE(), deployer);          // then renounce
```

`RoleManager` refuses to remove the last admin, so reversing these reverts rather than
bricking the protocol. `FullLifecycle.t.sol` asserts the deployer retains nothing
afterwards, and separately that the canonical lifecycle needs no deployer privilege —
the second assertion is the more valuable one, because it proves the handover did not
merely *look* complete.

`FEE_MANAGER_ROLE` correctly ends up with the timelock alone; the deployer grants it to
itself for the middle steps and renounces. Good.

The weaknesses are in what is *not* constrained:

- **AAP-25:** `ORG_VERIFIER_ROLE` and `ASSET_VERIFIER_ROLE` are both granted to
  `c.orgVerifier`. `docs/roles.md` describes them as distinct roles with distinct
  competencies; the deployment collapses them into one key by default.
- **AAP-14:** nothing prevents an operator from filling `ORG_VERIFIER`,
  `CREDENTIAL_ISSUER` and `DISPUTE_ARBITRATOR` with the same address in `.env`.
  `Verify.s.sol` would pass. One phished key would then verify organizations, issue their
  credentials, and arbitrate their disputes — the entire trust chain.
- **AAP-04:** `ARBITRATOR_ROLE` may be a single EOA and nothing checks otherwise.

## 6. Timelock

`ProtocolTimelock` is a thin `TimelockController` wrapper with no added behaviour, which
is right — the value is in what holds it. `DeployCore` enforces a ≥48h minimum outside
test chains, and the self-admin role is renounced at construction so the timelock is
governed by its proposers rather than a standing admin key.

Two operational notes, both already stated in the contract NatSpec and worth repeating
because they are launch-blocking rather than advisory:

1. **A delay nobody watches only inconveniences the attacker.** Queue monitoring is a
   prerequisite for the timelock to be a mitigation at all.
2. **The proposer must be a multisig on mainnet.** `.env.example` says so; nothing
   enforces it, and `Verify.s.sol` does not check that the proposer has code.

## 7. Recommendations

1. **Extend `Verify.s.sol` to operational roles** with explicit separation-of-duties
   assertions (concrete code in AAP-14). The script is documented as the gate that makes
   a deployment real; right now it gates half the roles.
2. **Require the arbitrator and the timelock proposer to be contracts**
   (`code.length > 0`) and the arbitrator to have ≥2 holders.
3. **Split `ASSET_VERIFIER` from `ORG_VERIFIER`** in `Config`.
4. **Preserve the two-gate pattern** on `settleTransfer` / `markSold` / `clearEscrow`
   through any future refactor. It is the reason a compromised `SETTLEMENT_ROLE` is
   containable, and it is the kind of check that looks redundant to someone optimizing
   external calls.
