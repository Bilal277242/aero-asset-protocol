# AeroAsset Protocol — Data Model

Canonical struct and enum definitions. Implementation must match this document
field-for-field; any change requires an architecture review.

---

## 0. Global conventions

**ID type split.** All *public* function signatures use `uint256` for identifiers.
All *storage* packs them as `uint64`. Conversion happens on write via
`SafeCast.toUint64`, which reverts rather than truncating. Rationale: `uint64` allows
1.8 × 10¹⁹ records per registry — far beyond any realistic aviation fleet — while
letting several fields share one storage slot. The saving is 1–2 SSTOREs on every
registration path.

**Timestamps** are `uint40` (valid to year 36812) for the same reason.

**`0` is the universal sentinel** for "does not exist" / "unset". Every registry's
counter starts at 1, and every enum reserves member `0` as `NONE`/`UNSPECIFIED`, so a
zero-initialized storage slot can never be mistaken for a valid record.

**Strings are never stored in structs.** Short human-readable values (model, part
number) are `bytes32` short-strings. Long values (URIs) live in a separate
`mapping(uint256 => string)` so they never disturb struct packing.

**Confidential identifiers are hashed.** Per roadmap §8, aircraft serial numbers and
registration marks (tail numbers) are stored as `keccak256` commitments, never as
plaintext. The preimage is held off-chain and can be revealed selectively to a
counterparty, who verifies it against the on-chain hash.

> Hashing a low-entropy identifier is a *commitment*, not encryption. A tail number
> is brute-forceable from a hash. Callers who need confidentiality against a
> determined observer must include a salt in the preimage. This is documented in
> `DocumentRegistry` NatSpec and in `security-model.md` §7.

---

## 1. Identity layer

### 1.1 `OrganizationType`

```solidity
enum OrganizationType {
    UNSPECIFIED,   // 0 — sentinel
    AIRLINE,       // 1
    OPERATOR,      // 2
    MRO,           // 3 — maintenance, repair & overhaul
    MANUFACTURER,  // 4 — OEM
    LESSOR,        // 5
    BROKER,        // 6
    SUPPLIER,      // 7 — parts distributor
    INSPECTOR      // 8 — independent inspection body
}
```

### 1.2 `OrganizationStatus`

```solidity
enum OrganizationStatus {
    NONE,       // 0 — sentinel
    PENDING,    // 1 — self-registered, unverified; may not register assets
    VERIFIED,   // 2 — verified by ORG_VERIFIER_ROLE
    SUSPENDED,  // 3 — reversible
    REVOKED     // 4 — terminal
}
```

### 1.3 `Organization` — 3 slots

```solidity
struct Organization {
    // ── slot 0 ── 30 / 32 bytes used
    address admin;              // 20 — controlling address; may transfer
    uint40  registeredAt;       //  5
    uint40  verifiedAt;         //  5 — 0 until verified
    OrganizationType orgType;   //  1
    OrganizationStatus status;  //  1
    // ── slot 1 ──
    bytes32 nameHash;           // keccak256 of legal name
    // ── slot 2 ──
    bytes32 metadataHash;       // off-chain profile document commitment
}
```

Side tables:

```solidity
mapping(uint256 orgId => string) metadataURI;
mapping(uint256 orgId => mapping(address => bool)) isOperator;
mapping(bytes32 nameHash => uint256 orgId) orgIdByNameHash;  // uniqueness
```

`orgIdByNameHash` enforces one organization per legal-name hash, preventing a
duplicate-identity attack where an attacker registers a copy of a real MRO.

### 1.4 `CredentialType` / `CredentialStatus`

```solidity
enum CredentialType {
    UNSPECIFIED,             // 0
    MAINTENANCE_AUTHORITY,   // 1 — required to write MaintenanceRegistry
    INSPECTION_AUTHORITY,    // 2
    MANUFACTURING_APPROVAL,  // 3
    OPERATING_APPROVAL,      // 4
    DISTRIBUTION_APPROVAL,   // 5
    OTHER                    // 6
}

enum CredentialStatus {
    NONE,       // 0
    ACTIVE,     // 1
    SUSPENDED,  // 2 — reversible
    EXPIRED,    // 3 — terminal, permissionless to set
    REVOKED     // 4 — terminal
}
```

> The roadmap (§12) describes the lifecycle as `ISSUED → ACTIVE → EXPIRED|REVOKED`.
> `ISSUED` and `ACTIVE` are collapsed into `ACTIVE`: there is no protocol action
> between them, so a separate `ISSUED` state would be a state no credential could
> observably occupy. `SUSPENDED` is added because a reversible hold is operationally
> necessary and revocation is terminal.

### 1.5 `Credential` — 3 slots

```solidity
struct Credential {
    // ── slot 0 ── 32 / 32 bytes, exactly full
    uint64 issuerOrgId;         // 8 — 0 when issued by the protocol itself
    uint64 subjectOrgId;        // 8 — 0 when the subject is a bare address
    uint40 issuedAt;            // 5
    uint40 expiresAt;           // 5 — 0 means never expires
    CredentialType credType;    // 1
    CredentialStatus status;    // 1
    uint32 __reserved;          // 4 — reserved for future use, must be 0
    // ── slot 1 ── 20 / 32
    address subject;            // 20 — address form of the subject
    // ── slot 2 ──
    bytes32 credentialHash;     // commitment to the off-chain credential document
}
```

**Effective validity** is `status == ACTIVE && (expiresAt == 0 || expiresAt > now)`.
Consumers must call `isValid(credentialId)`, never read `status` directly — a
credential can be past `expiresAt` while its stored status still reads `ACTIVE`,
because nobody has yet paid the gas to record the expiry. Enforced by `INV-CRED-02`.

---

## 2. Asset layer

### 2.1 `AssetKind` / `AssetStatus`

```solidity
enum AssetKind {
    UNSPECIFIED,  // 0
    AIRCRAFT,     // 1
    ENGINE,       // 2
    APU,          // 3
    COMPONENT,    // 4
    PART,         // 5
    EQUIPMENT     // 6
}

enum AssetStatus {
    NONE,               // 0
    REGISTERED,         // 1 — exists; NOT verified
    IN_SERVICE,         // 2
    STORED,             // 3
    UNDER_MAINTENANCE,  // 4
    RETIRED,            // 5 — terminal
    DESTROYED           // 6 — terminal
}
```

### 2.2 `Asset` — 3 slots

```solidity
struct Asset {
    // ── slot 0 ── 28 / 32 bytes used
    uint64 registrarOrgId;   // 8 — org that registered it
    uint64 verifierOrgId;    // 8 — 0 until verified
    uint40 registeredAt;     // 5
    uint40 verifiedAt;       // 5 — 0 == unverified (see below)
    AssetKind kind;          // 1
    AssetStatus status;      // 1
    // ── slot 1 ──
    bytes32 serialNumberHash; // confidential; commitment only
    // ── slot 2 ──
    bytes32 metadataHash;
}
```

**Verification is not a status.** Roadmap §7 requires `registered` and `verified` to be
independent, so verification is `verifiedAt != 0` — a separate axis from `status`.
There is deliberately **no** `verified` boolean: a boolean plus a timestamp is two
sources of truth that can disagree, and `verifiedAt != 0` cannot.

`updatedAt` is deliberately absent. It is fully reconstructible from events, and
carrying it would push the struct into a fourth slot and add an SSTORE to every write.

Side tables:

```solidity
mapping(uint256 assetId => string) metadataURI;
mapping(bytes32 serialHash => uint256 assetId) assetIdBySerialHash; // uniqueness
uint256 assetCount;  // last minted id; ids are 1..assetCount
```

### 2.3 `Aircraft` — 4 slots, keyed by `assetId`

```solidity
enum AircraftCategory {
    UNSPECIFIED,           // 0
    COMMERCIAL_TRANSPORT,  // 1
    BUSINESS_JET,          // 2
    TURBOPROP,             // 3
    ROTORCRAFT,            // 4
    GENERAL_AVIATION,      // 5
    FREIGHTER,             // 6
    UAS                    // 7 — uncrewed
}

struct Aircraft {
    // ── slot 0 ── 12 / 32
    uint64 manufacturerOrgId;    // 8 — 0 if OEM is not a registered org
    uint16 manufactureYear;      // 2
    AircraftCategory category;   // 1
    uint8  __reserved;           // 1
    // ── slot 1 ──
    bytes32 model;               // short string, e.g. "A320-214"
    // ── slot 2 ──
    bytes32 manufacturerName;    // short string; used when manufacturerOrgId == 0
    // ── slot 3 ──
    bytes32 registrationMarkHash; // tail number commitment (confidential)
}
```

### 2.4 `Component` — 2 slots, keyed by `assetId`

```solidity
enum ComponentKind {
    UNSPECIFIED,         // 0
    ENGINE,              // 1
    APU,                 // 2
    LANDING_GEAR,        // 3
    AVIONICS,            // 4
    AIRFRAME_STRUCTURE,  // 5
    INTERIOR,            // 6
    PROPELLER,           // 7
    OTHER                // 8
}

enum ComponentStatus {
    NONE,          // 0
    UNINSTALLED,   // 1 — exists, not fitted to any aircraft
    INSTALLED,     // 2 — fitted to exactly one parent
    IN_REPAIR,     // 3
    QUARANTINED,   // 4 — suspected unapproved part
    SCRAPPED       // 5 — terminal
}

struct Component {
    // ── slot 0 ── 22 / 32
    uint64 parentAssetId;     // 8 — MUST be 0 unless status == INSTALLED
    uint40 installedAt;       // 5
    uint40 removedAt;         // 5
    uint16 position;          // 2 — e.g. engine position 1..4
    ComponentKind kind;       // 1
    ComponentStatus status;   // 1
    // ── slot 1 ──
    bytes32 partNumber;       // short string
}
```

The single most important structural invariant in the asset layer:
**`parentAssetId != 0` if and only if `status == INSTALLED`** (`INV-COMP-01`).
A component can never be installed on two aircraft simultaneously, because
installation state is stored on the *component*, not as a list on the aircraft. There
is no data structure in which the conflicting fact could be represented.

Reverse index for passport reads:

```solidity
mapping(uint256 parentAssetId => uint256[]) installedComponents;
```

This list is append-on-install / swap-and-pop-on-remove, and is **read only by `view`
functions**. No state-changing path ever iterates it — see `security-model.md` §5 on
unbounded loops.

### 2.5 Ownership — `AssetOwnership`

```solidity
struct OwnershipRecord {
    // ── slot 0 ── 27 / 32
    address owner;           // 20
    uint40  since;           //  5
    bool    transferLocked;  //  1 — set while an escrow settlement is pending
    uint8   __reserved;      //  1
    // ── slot 1 ── 25 / 32
    address pendingOwner;    // 20 — two-step transfer target; 0 if none
    uint40  offerExpiresAt;  //  5
}
```

Ownership transfer is **two-step** (`initiateTransfer` → `acceptTransfer`) on the
direct path. An aircraft record cannot be pushed to an address that has not
acknowledged it, which prevents both fat-finger loss and unsolicited-liability
grief. The escrow settlement path is atomic instead (`settleTransfer`), because the
buyer's acceptance is already proven by their funding of the escrow.

---

## 3. Provenance layer

### 3.1 `Document` — 2 slots

```solidity
enum DocumentType {
    UNSPECIFIED,                // 0
    AIRWORTHINESS_CERTIFICATE,  // 1
    REGISTRATION_CERTIFICATE,   // 2
    MAINTENANCE_RECORD,         // 3
    AD_COMPLIANCE,              // 4 — airworthiness directive
    SB_COMPLIANCE,              // 5 — service bulletin
    LOGBOOK,                    // 6
    WEIGHT_AND_BALANCE,         // 7
    LEASE_AGREEMENT,            // 8
    BILL_OF_SALE,               // 9
    INSPECTION_REPORT,          // 10
    OTHER                       // 11
}

enum DocumentStatus { NONE, ACTIVE, SUPERSEDED, REVOKED }

struct Document {
    // ── slot 0 ── 31 / 32
    uint64 assetId;          // 8
    uint64 issuerOrgId;      // 8
    uint64 supersededById;   // 8 — 0 unless status == SUPERSEDED
    uint40 issuedAt;         // 5 — real-world issuance date, caller-supplied
    DocumentType docType;    // 1
    DocumentStatus status;   // 1
    // ── slot 1 ──
    bytes32 documentHash;    // keccak256 of the document bytes
}
```

Side tables:

```solidity
mapping(uint256 documentId => string) documentURI;   // ipfs://… or https://…
mapping(bytes32 documentHash => uint256 documentId); // duplicate detection
mapping(uint256 assetId => uint256[]) assetDocuments; // view-only index
```

`documentHash` must be non-zero and must not already be registered. The registry
records *that a document with this hash was asserted by this issuer at this time*; it
makes no claim about the document's contents or validity.

### 3.2 `MaintenanceRecord` — 2 slots

```solidity
enum MaintenanceType {
    UNSPECIFIED,           // 0
    LINE_CHECK,            // 1
    A_CHECK,               // 2
    B_CHECK,               // 3
    C_CHECK,               // 4
    D_CHECK,               // 5
    ENGINE_OVERHAUL,       // 6
    COMPONENT_REPLACEMENT, // 7
    AD_COMPLIANCE,         // 8
    SB_COMPLIANCE,         // 9
    REPAIR,                // 10
    INSPECTION,            // 11
    OTHER                  // 12
}

struct MaintenanceRecord {
    // ── slot 0 ── 30 / 32
    uint64 assetId;            // 8
    uint64 performedByOrgId;   // 8
    uint64 documentId;         // 8 — 0 if no document registered
    uint40 performedAt;        // 5 — real-world date, must be <= block.timestamp
    MaintenanceType mType;     // 1
    // ── slot 1 ──
    bytes32 recordHash;        // commitment to the full work package
}
```

Maintenance records are **append-only and immutable**. There is no edit and no delete.
A correction is a new record referencing the prior one through its `recordHash`
preimage off-chain. The credential the MRO relied upon is checked at write time and
emitted in `MaintenanceRecorded`, but is not stored — it is audit data, not state any
later on-chain logic reads.

---

## 4. Transaction layer

### 4.1 `Listing` — 3 slots

```solidity
enum ListingStatus { NONE, ACTIVE, SOLD, CANCELLED, EXPIRED }

struct Listing {
    // ── slot 0 ── 31 / 32
    address seller;         // 20 — snapshot of owner at listing time
    uint40  createdAt;      //  5
    uint40  expiresAt;      //  5
    ListingStatus status;   //  1
    // ── slot 1 ── 28 / 32
    address paymentToken;   // 20 — must be allowlisted at listing time
    uint64  assetId;        //  8
    // ── slot 2 ── 24 / 32
    uint128 price;          // 16 — in `paymentToken` base units
    uint64  escrowId;       //  8 — 0 until a buyer commits
}
```

`seller` is a snapshot. If ownership changes while a listing is `ACTIVE`, the listing
is no longer settleable: settlement re-checks that `AssetOwnership.ownerOf(assetId)`
still equals `listing.seller` and reverts otherwise (`INV-MKT-04`). This closes the
"sell it twice" race without needing to hunt down and cancel listings on transfer.

`EXPIRED` is a *derived* state for reads and a *recordable* state for writes: a listing
past `expiresAt` reports `EXPIRED` from `getListing`, and anyone may call
`expireListing` to persist it. No fund movement depends on the persisted flag.

### 4.2 `Offer` — 2 slots

```solidity
enum OfferStatus { NONE, ACTIVE, ACCEPTED, WITHDRAWN, REJECTED, EXPIRED }

struct Offer {
    // ── slot 0 ── 31 / 32
    address buyer;        // 20
    uint40  createdAt;    //  5
    uint40  expiresAt;    //  5
    OfferStatus status;   //  1
    // ── slot 1 ── 24 / 32
    uint64  listingId;    //  8
    uint128 price;        // 16
}
```

### 4.3 Escrow

```solidity
enum EscrowStatus {
    NONE,              // 0
    AWAITING_FUNDING,  // 1 — deployed, buyer has not paid
    FUNDED,            // 2 — funds held
    DISPUTED,          // 3
    RELEASED,          // 4 — terminal: seller paid, asset transferred
    REFUNDED,          // 5 — terminal: buyer repaid, asset unmoved
    CANCELLED          // 6 — terminal: expired before funding
}
```

Each `Escrow` clone stores its parameters once at `initialize` and never mutates them:
`listingId`, `assetId`, `buyer`, `seller`, `paymentToken`, `price`, `feeAmount`,
`fundingDeadline`, `settlementDeadline`. Only `status` and `depositedAmount` change.

`depositedAmount` records the **measured** balance delta from the buyer's transfer, not
the requested amount. A token that delivers less than requested therefore leaves the
escrow under-funded and unable to reach `FUNDED`, rather than silently short-paying the
seller at settlement (`INV-ESC-02`).
