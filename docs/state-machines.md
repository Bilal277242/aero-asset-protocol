# AeroAsset Protocol — State Machines

Every transition below is enforced on-chain by an explicit guard. Any transition not
listed is illegal and reverts with `InvalidStateTransition(current, attempted)`.

Implementation rule: each registry exposes a `pure` `_isValidTransition(from, to)`
helper so the legal set is expressed **once** and is directly testable, rather than
being scattered across `require` statements. Fuzz tests assert the exhaustive negative:
for all `(from, to)` pairs not in the legal set, the call reverts.

---

## 1. Organization

```
                 registerOrganization()
                          │
                          ▼
                     ┌─────────┐
                     │ PENDING │
                     └────┬────┘
             verify()     │      reject()
          ┌───────────────┴───────────────┐
          ▼                               ▼
    ┌──────────┐   suspend()        ┌─────────┐
    │ VERIFIED │◀──────────────────▶│ REVOKED │ (terminal)
    └────┬─────┘   reactivate()     └─────────┘
         │                               ▲
         │ suspend()                     │
         ▼                               │
   ┌───────────┐      revoke()           │
   │ SUSPENDED │─────────────────────────┘
   └───────────┘
```

| From | To | Caller |
|---|---|---|
| — | `PENDING` | anyone (self-registration) |
| `PENDING` | `VERIFIED` | `ORG_VERIFIER_ROLE` |
| `PENDING` | `REVOKED` | `ORG_VERIFIER_ROLE` |
| `VERIFIED` | `SUSPENDED` | `ORG_VERIFIER_ROLE` |
| `SUSPENDED` | `VERIFIED` | `ORG_VERIFIER_ROLE` |
| `VERIFIED` \| `SUSPENDED` | `REVOKED` | `PROTOCOL_ADMIN_ROLE` |

`REVOKED` is terminal — no path leaves it. Revoking is restricted to
`PROTOCOL_ADMIN_ROLE` (timelocked) because it permanently strips an organization's
ability to act; suspension is the reversible tool for routine compliance action.

**Effect on existing records:** suspending or revoking an organization does **not**
invalidate assets it registered or maintenance it recorded. History is append-only.
It only blocks *future* actions. This is a deliberate design choice: retroactively
invalidating provenance would make the registry useless as an audit trail.

---

## 2. Credential

```
        issueCredential()
               │
               ▼
         ┌──────────┐  suspend()   ┌───────────┐
         │  ACTIVE  │─────────────▶│ SUSPENDED │
         └────┬─────┘◀─────────────└─────┬─────┘
              │        reinstate()       │
     revoke() │                          │ revoke()
              ▼                          ▼
         ┌─────────┐              ┌─────────┐
         │ REVOKED │◀─────────────│ REVOKED │  (terminal)
         └─────────┘              └─────────┘
              ▲
              │
   expireCredential()  ┌─────────┐
   ───────────────────▶│ EXPIRED │  (terminal)
   from ACTIVE|SUSPENDED└─────────┘
   only when expiresAt <= now
```

| From | To | Caller | Guard |
|---|---|---|---|
| — | `ACTIVE` | `CREDENTIAL_ISSUER_ROLE` | `expiresAt == 0 \|\| expiresAt > now` |
| `ACTIVE` | `SUSPENDED` | `CREDENTIAL_ISSUER_ROLE` | — |
| `SUSPENDED` | `ACTIVE` | `CREDENTIAL_ISSUER_ROLE` | still unexpired |
| `ACTIVE` \| `SUSPENDED` | `REVOKED` | `CREDENTIAL_ISSUER_ROLE` | — |
| `ACTIVE` \| `SUSPENDED` | `EXPIRED` | **anyone** | `expiresAt != 0 && expiresAt <= now` |

`EXPIRED` and `REVOKED` are terminal. Roadmap §16 requires that *"revoked credentials
cannot become valid without authorized reissuance"* — reissuance means **a new
credential with a new id**, never a resurrection of the old one (`INV-CRED-03`).

Permissionless expiry exists so that on-chain state can be brought into agreement with
elapsed time by any observer. It cannot be abused: the guard makes it a no-op-or-revert
for any credential that has not genuinely expired.

**Reinstatement has two guards beyond the transition table.** A credential whose
`expiresAt` passed while it was suspended cannot be reinstated — reinstatement must not
resurrect authority that time has already ended; the correct action is to issue a new
credential. And reinstatement fails if another credential of the same type has become
valid for the same organization in the meantime, which would otherwise produce two
simultaneously-valid credentials and break `INV-CRED-04`.

**At most one valid credential per `(subjectOrgId, credentialType)`.** Issuance reverts
with `DuplicateValidCredential` if the organization already holds a valid one. This is
what lets `validCredentialOfType` answer in O(1), so Phase 5's maintenance
authorization needs no loop over an organization's credential history. Renewal is
therefore explicit: revoke the incumbent first, or simply let it lapse — a credential
past `expiresAt` stops blocking issuance immediately, with no expiry transaction
required. Credentials with an address-only subject are exempt, since they are not
indexed.

---

## 3. Asset

```
   registerAsset()
        │
        ▼
  ┌────────────┐         ┌──────────────────┐
  │ REGISTERED │◀───────▶│   IN_SERVICE     │
  └──────┬─────┘         └────────┬─────────┘
         │                        │
         │      ┌─────────────────┴──────────┐
         │      ▼                            ▼
         │  ┌────────┐            ┌────────────────────┐
         ├─▶│ STORED │◀──────────▶│ UNDER_MAINTENANCE  │
         │  └────┬───┘            └──────────┬─────────┘
         │       │                           │
         └───────┴──────────┬────────────────┘
                            ▼
              ┌─────────┐       ┌───────────┐
              │ RETIRED │       │ DESTROYED │   (both terminal)
              └─────────┘       └───────────┘
```

Operational statuses (`REGISTERED`, `IN_SERVICE`, `STORED`, `UNDER_MAINTENANCE`) are
mutually reachable. Terminal statuses are reachable from any operational status and
have no exit.

**Verification is an orthogonal axis, not a status** (see `asset-model.md` §2.2):

```
  verifiedAt == 0  ──[ verifyAsset(), ASSET_VERIFIER_ROLE ]──▶  verifiedAt = now
                   ◀─[ unverifyAsset(), ASSET_VERIFIER_ROLE ]──
```

`registerAsset` must never set `verifiedAt` (roadmap §7, `INV-ASSET-03`).
A `RETIRED` or `DESTROYED` asset cannot be verified, listed, or transferred.

---

## 4. Component installation

```
   registerComponent()
          │
          ▼
   ┌──────────────┐   install(parentAssetId)   ┌───────────┐
   │ UNINSTALLED  │───────────────────────────▶│ INSTALLED │
   └──────┬───────┘◀───────────────────────────└─────┬─────┘
          │              remove()                    │
          │                                          │
          │  sendToRepair()          sendToRepair()  │
          ▼                                          │
   ┌───────────┐                                     │
   │ IN_REPAIR │◀────────────────────────────────────┘
   └─────┬─────┘
         │ returnFromRepair()
         ▼
   ┌──────────────┐    quarantine()     ┌─────────────┐
   │ UNINSTALLED  │────────────────────▶│ QUARANTINED │
   └──────────────┘◀────────────────────└──────┬──────┘
                       release()                │ scrap()
                                                ▼
                                          ┌──────────┐
                                          │ SCRAPPED │ (terminal)
                                          └──────────┘
```

Guards on `install(componentId, parentAssetId, position)`:

1. component status is `UNINSTALLED`
2. `parentAssetId` exists and `kind == AIRCRAFT`
3. parent status is not `RETIRED` / `DESTROYED`
4. caller owns **both** the component and the parent, or is acting for the owning org
5. `position` is not already occupied by another installed component of the same kind

Guards on `remove(componentId)`: status is `INSTALLED`; caller owns the parent.
`removeComponent` sets `parentAssetId = 0` and `status = UNINSTALLED` **in the same
write**, which is what makes `INV-COMP-01` unbreakable.

A component whose parent aircraft is `DESTROYED` is *not* auto-removed — that would be
an unbounded loop over the component list. It is removed explicitly, or read as
"installed on a destroyed aircraft", which is the truthful state.

---

## 5. Listing

Roadmap §15: `CREATED → ACTIVE → SOLD`, `ACTIVE → CANCELLED`, `ACTIVE → EXPIRED`.
`CREATED` and `ACTIVE` are collapsed — a listing is `ACTIVE` on creation, since no
protocol action separates the two.

```
   createListing()
        │
        ▼
   ┌──────────┐   settle() from Escrow      ┌────────┐
   │  ACTIVE  │────────────────────────────▶│  SOLD  │ (terminal)
   └────┬─────┘                             └────────┘
        │
        ├── cancelListing() ─────────────▶ ┌───────────┐
        │   seller only, no funded escrow  │ CANCELLED │ (terminal)
        │                                  └───────────┘
        │
        └── expireListing() ─────────────▶ ┌─────────┐
            anyone, once now > expiresAt   │ EXPIRED │ (terminal)
                                           └─────────┘
```

All three exits are terminal. **`SOLD` can never return to `ACTIVE`** — required by
roadmap §16 and encoded as `INV-MKT-01`.

`cancelListing` reverts while an escrow for the listing is `AWAITING_FUNDING` or
`FUNDED`. A seller must not be able to cancel out from under a buyer who has already
committed funds.

---

## 6. Offer

```
   makeOffer()
       │
       ▼
  ┌─────────┐  acceptOffer() (seller)   ┌──────────┐
  │ ACTIVE  │─────────────────────────▶ │ ACCEPTED │ → creates escrow
  └────┬────┘                           └──────────┘
       │
       ├─ withdrawOffer() (buyer)   ─▶ WITHDRAWN
       ├─ rejectOffer()   (seller)  ─▶ REJECTED
       └─ expireOffer()   (anyone)  ─▶ EXPIRED
```

Accepting an offer implicitly rejects nothing: sibling offers on the same listing stay
`ACTIVE` but become unacceptable once the listing leaves `ACTIVE`. Bulk-rejecting
siblings would be an unbounded loop over an attacker-controlled array
(`security-model.md` §5). Buyers withdraw their own stale offers; no funds are locked
by an unaccepted offer, so nothing is at risk while one sits idle.

---

## 7. Escrow

```
             EscrowFactory.openEscrow()
                        │
                        ▼
              ┌───────────────────┐
              │ AWAITING_FUNDING  │
              └─────────┬─────────┘
        fund() │                  │ cancel() / fundingDeadline passed
               ▼                  ▼
         ┌──────────┐       ┌───────────┐
         │  FUNDED  │       │ CANCELLED │ (terminal)
         └────┬─────┘       └───────────┘
              │
    ┌─────────┼──────────────────────┬─────────────────────┐
    │         │                      │                     │
    │ release()               raiseDispute()      claimTimeout()
    │ (buyer, or both parties)  (buyer|seller)  (anyone, after
    │                                │           settlementDeadline)
    ▼                                ▼                     ▼
┌──────────┐                  ┌──────────┐          ┌──────────┐
│ RELEASED │                  │ DISPUTED │          │ REFUNDED │
│(terminal)│                  └────┬─────┘          │(terminal)│
└──────────┘                       │                └──────────┘
                        resolve(ARBITRATOR_ROLE)
                                   │
                     ┌─────────────┴─────────────┐
                     ▼                           ▼
               ┌──────────┐                ┌──────────┐
               │ RELEASED │                │ REFUNDED │
               └──────────┘                └──────────┘
```

| Transition | Caller | Effects |
|---|---|---|
| → `AWAITING_FUNDING` | `EscrowFactory` (once) | params frozen; `SETTLEMENT_ROLE` granted |
| `AWAITING_FUNDING` → `FUNDED` | buyer | measured balance delta must equal `price` |
| `AWAITING_FUNDING` → `CANCELLED` | either party, or anyone after deadline | no funds moved |
| `FUNDED` → `RELEASED` | buyer, or arbitrator from `DISPUTED` | asset → buyer, fee → treasury, remainder → seller, listing → `SOLD` |
| `FUNDED` → `DISPUTED` | buyer or seller, before `settlementDeadline` | funds frozen |
| `FUNDED` → `REFUNDED` | anyone, after `settlementDeadline` | buyer repaid in full, asset unmoved |
| `DISPUTED` → `RELEASED`\|`REFUNDED` | `ARBITRATOR_ROLE` | exactly one of the two |

`SETTLEMENT_ROLE` is revoked from the clone on entry to **any** terminal state, so an
escrow's ability to move an aircraft exists only for the window in which it is live.

`claimTimeout` is permissionless and callable **while the protocol is paused**. A
buyer's deposit must never be strandable by an unresponsive counterparty or by an
administrative pause. `raiseDispute` is not available after `settlementDeadline`, so a
seller cannot use a last-second dispute to block the refund path.
