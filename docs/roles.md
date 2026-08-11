# AeroAsset Protocol — Roles & Key Custody

All authorization in the protocol resolves through a **single** `RoleManager`
(OpenZeppelin `AccessControlEnumerable`). No module inherits `AccessControl`
independently, and `Ownable` is not used anywhere. See `architecture.md` §D4.

---

## 1. Role catalogue

Role identifiers are `keccak256` of a namespaced string, never `keccak256("ADMIN")`,
so a role constant can never collide with an unrelated protocol's constant if the
`RoleManager` is ever shared or forked.

| Constant | Value | Held by | Timelocked |
|---|---|---|---|
| `DEFAULT_ADMIN_ROLE` | `0x00` (OZ) | `ProtocolTimelock` **only** | n/a — it *is* the timelock |
| `PROTOCOL_ADMIN_ROLE` | `keccak256("aeroasset.role.PROTOCOL_ADMIN")` | `ProtocolTimelock` | Yes |
| `PAUSER_ROLE` | `keccak256("aeroasset.role.PAUSER")` | Ops multisig (2/3) | **No** — see §3 |
| `ORG_VERIFIER_ROLE` | `keccak256("aeroasset.role.ORG_VERIFIER")` | Compliance multisig | No |
| `ASSET_VERIFIER_ROLE` | `keccak256("aeroasset.role.ASSET_VERIFIER")` | Compliance multisig | No |
| `CREDENTIAL_ISSUER_ROLE` | `keccak256("aeroasset.role.CREDENTIAL_ISSUER")` | Compliance multisig | No |
| `ARBITRATOR_ROLE` | `keccak256("aeroasset.role.ARBITRATOR")` | Named arbitrator EOA/multisig | No |
| `FEE_MANAGER_ROLE` | `keccak256("aeroasset.role.FEE_MANAGER")` | `ProtocolTimelock` | Yes |
| `ASSET_MINTER_ROLE` | `keccak256("aeroasset.role.ASSET_MINTER")` | `AircraftRegistry`, `ComponentRegistry` (machine role) | n/a |
| `ESCROW_FACTORY_ROLE` | `keccak256("aeroasset.role.ESCROW_FACTORY")` | `EscrowFactory` (machine role) | n/a |
| `SETTLEMENT_ROLE` | `keccak256("aeroasset.role.SETTLEMENT")` | Escrow clones (machine role) | n/a |

### 1.1 Role admin graph

`DEFAULT_ADMIN_ROLE` is the admin of every other role **except one**, and is granted
to `ProtocolTimelock` and nothing else. Consequence: every grant and revoke in the
protocol — including revoking a compromised `ORG_VERIFIER` — passes through the
timelock's delay and is publicly visible before it takes effect.

**The one exception is `SETTLEMENT_ROLE`, administered by `ESCROW_FACTORY_ROLE`.**
`EscrowFactory` must grant `SETTLEMENT_ROLE` to every clone it deploys, and granting
requires holding that role's admin. The alternative — giving the factory
`DEFAULT_ADMIN_ROLE` — would hand a factory total control of protocol authorization to
solve a far narrower problem. `ESCROW_FACTORY_ROLE` confers exactly one power: granting
`SETTLEMENT_ROLE`. It is itself administered by the timelock, so it remains revocable
on the normal path.

`RoleManager.setRoleAdmin` performs this narrowing and is itself `DEFAULT_ADMIN_ROLE`-
gated. `DEFAULT_ADMIN_ROLE` cannot be re-administered — allowing that would let the
timelock be routed around entirely.

Escrows are never revoked by the factory: each clone **renounces its own**
`SETTLEMENT_ROLE` on reaching a terminal state, so disarming involves no admin key at
all.

The deployer's `DEFAULT_ADMIN_ROLE` is renounced in `ConfigureProtocol.s.sol`, and
`Verify.s.sol` asserts `getRoleMemberCount(DEFAULT_ADMIN_ROLE) == 1` and that the sole
member is the timelock. **A deployment that fails this assertion is not a valid
deployment.**

---

## 2. Role semantics

### `PROTOCOL_ADMIN_ROLE`
Authorizes UUPS upgrades (`_authorizeUpgrade`), writes to `ProtocolAddressRegistry`,
and settlement-token allowlist changes. This is the most powerful role in the protocol:
it can replace registry logic. It is held exclusively by the timelock, and the
threat model treats a timelock compromise as a total protocol compromise
(`threat-model.md` T-01).

### `PAUSER_ROLE`
Can pause, and **cannot unpause**. Unpausing requires `PROTOCOL_ADMIN_ROLE`, i.e. a
timelocked action. This asymmetry is deliberate: stopping the protocol during an
incident must be fast and low-trust, restarting it must be slow and high-trust. A
compromised pauser key can grief the protocol but cannot use the pause to extract
value or to unpause into a malicious state.

Pausing never traps funds: `Escrow.refund` and `Escrow.claimTimeout` remain callable
while paused so a buyer can always recover an unsettled deposit.

### `ORG_VERIFIER_ROLE`
Moves organizations `PENDING → VERIFIED`, and `VERIFIED → SUSPENDED`. Cannot register
organizations (anyone may self-register into `PENDING`) and cannot delete them.

### `ASSET_VERIFIER_ROLE`
Sets the `verifiedAt` field on an asset. Roadmap §7 requires registration and
verification be distinct: **registering an asset must never auto-verify it**, and only
this role may verify. Enforced by invariant `INV-ASSET-03`.

### `CREDENTIAL_ISSUER_ROLE`
Issues and revokes credentials. Note that *expiry* requires no role — anyone may call
`expireCredential` on a credential past `expiresAt`, since it only makes on-chain state
agree with time that has already passed.

### `ARBITRATOR_ROLE`
Resolves a `DISPUTED` escrow to exactly one of buyer or seller. Cannot alter amounts,
cannot resolve a non-disputed escrow, and cannot pay a third party. V1 uses the
controlled-arbitrator model per roadmap §13; decentralized arbitration is out of scope.

### `FEE_MANAGER_ROLE`
Adjusts fee rates within compile-time hard caps and sets the treasury address. It
**cannot** raise a fee above `MAX_FEE_BPS`, which is a `constant` — not storage — so no
upgrade-free path exists to exceed it. Enforced by invariant `INV-FEE-01`.

### `ASSET_MINTER_ROLE` (machine role)
Authorizes `AssetRegistry.registerAssetFor`, which mints an asset id on behalf of an
organization without the caller being that organization. Held only by
`AircraftRegistry` and `ComponentRegistry`, which perform their own
`requireActingFor` check on the original caller before delegating — a specialization
registry cannot forward `msg.sender` through a call, so the trust is delegated
explicitly rather than smuggled. `registerAssetFor` still independently re-checks that
the organization is `VERIFIED`.

Never granted to an EOA. `Verify.s.sol` asserts every holder is a known protocol
contract.

### `SETTLEMENT_ROLE` (machine role)
The single role held by contracts rather than humans. `EscrowFactory` grants it to each
`Escrow` clone at deployment and revokes it when the escrow reaches a terminal state.
It authorizes exactly one operation: `AssetOwnership.settleTransfer`.

This role is the protocol's highest-value target (`threat-model.md` T-04). Mitigations:
`EscrowFactory` is immutable and grants only to addresses it just deployed via
`Clones.cloneDeterministic`, verified against the predicted address; and
`AssetOwnership.settleTransfer` additionally requires the caller to be the contract
currently **holding that asset's lock** and to correctly name the current owner. A
rogue holder of the role therefore cannot move an asset it did not itself lock.

---

## 3. Non-role authorization

Two important permissions are **data-driven, not role-driven**. This is intentional:
they must scale to thousands of participants, which a role grant cannot.

**Organization membership.** An address acts for organization `N` if it is that
organization's `admin` or a registered operator. Checked via
`OrganizationRegistry.isActingFor(orgId, account)`, which also requires the
organization be `VERIFIED`.

**MRO authorization.** Per roadmap §13, recording a maintenance event requires the
caller to be acting for an organization that (a) is `VERIFIED`, (b) has
`OrganizationType.MRO`, and (c) holds a currently-`ACTIVE`, unexpired credential of
type `MAINTENANCE_AUTHORITY`. All three are checked on-chain at record time, and the
credential relied upon is emitted in the event for audit.

> This authorizes an action *within the protocol*. It is not a claim that the protocol
> constitutes regulatory approval or a release to service.

---

## 4. Key custody requirements

Mandatory before mainnet (roadmap §29 gate):

| Role | Testnet | Mainnet minimum |
|---|---|---|
| `DEFAULT_ADMIN` / `PROTOCOL_ADMIN` | deployer EOA | Timelock ≥ 48h, proposer = 3/5 multisig on hardware wallets |
| `PAUSER` | deployer EOA | 2/3 multisig, keys held separately from the admin multisig |
| `ORG_VERIFIER`, `ASSET_VERIFIER`, `CREDENTIAL_ISSUER` | deployer EOA | 2/3 compliance multisig |
| `ARBITRATOR` | deployer EOA | Named legal entity, 2/3 multisig |
| `FEE_MANAGER` | deployer EOA | Timelock |

No single hardware key may hold two of: `PROTOCOL_ADMIN`, `PAUSER`, `ARBITRATOR`.
`Verify.s.sol` asserts the disjointness of these member sets.

---

## 5. Emergency runbook (summary)

1. `PAUSER` calls `pause()` on affected modules — immediate, no delay.
2. Assess. Escrow refunds and timeout claims remain live throughout.
3. If a key is compromised, the timelock proposes `revokeRole` and a replacement grant.
4. If logic is compromised, the timelock proposes a UUPS upgrade of the affected
   registry. Finance contracts are immutable and cannot be patched — the response there
   is to pause, drain via the refund path, and redeploy behind a new address-registry
   entry.
5. Unpause is a timelocked `PROTOCOL_ADMIN` action, never a pauser action.
