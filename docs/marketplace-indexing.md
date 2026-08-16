# Marketplace discovery and indexing

The marketplace currently reads everything directly from the chain. This documents where
that stops working, what the protocol does and does not let a client do, and the
recommended path when discovery outgrows direct reads.

**No centralized source of truth is introduced.** An index is a cache that can be rebuilt
from the chain and checked against it — never an authority. That distinction is the whole
point of this note.

---

## 1. What the contracts actually provide

| Query | On-chain support | Cost today |
|---|---|---|
| Listing by id | `getListing(id)` | O(1) |
| Is a listing live | `isListingActive(id)` | O(1) |
| Active listing for an asset | `activeListingOf(assetId)` | O(1), already freshness-filtered |
| Escrow attached to a listing | `escrowOf(listingId)` | O(1) |
| Total listings ever | `listingCount()` | O(1) |
| Offer by id | `getOffer(id)` | O(1) |
| **All active listings** | **none** | walk ids descending |
| **Listings by seller** | **none** | `ListingCreated.seller` is indexed — log filter |
| **Offers for a listing** | **none** | `OfferMade.listingId` is indexed — log filter |
| **Offers by buyer** | **none** | `OfferMade.buyer` is indexed — log filter |
| **Escrows by party** | **none** | `buyer`/`seller` **not indexed** — client-side filter |

There is no enumeration by owner, seller or buyer anywhere in the protocol. That is a
deliberate consequence of forbidding unbounded loops in state-changing functions, not an
oversight — see `docs/security-model.md` §5.

---

## 2. What the app does now

**Listing discovery** walks `listingCount()` downward and reads a fixed window
(60 listings) in one multicall, pinned to a single block height. Sorting, filtering and
search run client-side over that window.

**Offers** come from `OfferMade` logs filtered on the indexed `listingId`, so the provider
does the filtering. The logs supply **ids only**; every rendered field is then read fresh
with `getOffer` at a pinned height.

> A log records what was true when it was emitted. An offer that has since been withdrawn,
> rejected, accepted or expired still has its original `OfferMade` sitting in the chain,
> unchanged and completely misleading. Any index built from logs must re-read current
> state before rendering it.

**Every read is pinned to one block.** `componentsOf` is a swap-and-pop array, so paging
across a removal skips one entry and duplicates another; and a stored status read at block
N can contradict its effective-status check at N+1.

---

## 3. Where this stops working

| Signal | Threshold | Symptom |
|---|---|---|
| `listingCount()` | **~1,000** | The descending window stops representing the market; a buyer cannot find an old-but-active listing |
| `offerCount()` per listing | **~200** | Log range for one listing gets slow on a public RPC |
| `escrowCount()` | **~5,000** | "My trades" downloads every escrow event because `buyer`/`seller` are unindexed |
| Log scan range | **>50,000 blocks** | Cold start exceeds a reasonable page load |

The escrow one is the hardest limit and cannot be fixed on-chain: `EscrowFactory` is
immutable, and neither its `EscrowOpened` nor the `Marketplace` one indexes the parties.

---

## 4. Recommended approach, in order

### Stage 1 — stay on direct reads (now)

Correct while `listingCount()` is small. Requires only what is already built: a pinned
block height, `allowFailure` on every batch, and effective status computed rather than
read.

### Stage 2 — a browser-side cache

Persist scanned logs in IndexedDB with a cursor, keyed by chain id and contract address.
Resume from the cursor rather than rescanning from the deployment block.

- Invalidate on chain id or contract address change (a redeploy must not read a stale cache).
- Store **ids and block numbers only** — never rendered values, so a stale cache cannot
  produce a stale status.
- Re-read current state for anything displayed.

This buys roughly an order of magnitude and adds no infrastructure.

### Stage 3 — a self-hosted indexer

When Stage 2 stops being enough, run an indexer that consumes events and serves queries.
Recommended: a **subgraph** (The Graph, hosted or self-hosted) or **Ponder**. Both are
event-sourced, deterministic, and reproducible by anyone from the same chain data.

Index these entities:

```
Listing   id, assetId, seller, paymentToken, price, createdAt, expiresAt,
          status, escrowId                       ← from ListingCreated + ListingStatusChanged
Offer     id, listingId, buyer, price, createdAt, expiresAt, status
                                                 ← from OfferMade + OfferStatusChanged
Escrow    id, address, listingId, buyer, seller, price, feeAmount
                                                 ← from EscrowFactory.EscrowOpened
                                                   (the only source of buyer/seller)
Asset     id, kind, owner, verified, registrarOrgId
                                                 ← from AssetRegistered + transfers +
                                                   AssetVerificationChanged
```

**Rules the indexer must follow to remain a cache rather than an authority:**

1. **Never store effective status.** Store the raw `status` and `expiresAt`; compute
   active/lapsed at query time against the caller's block timestamp. An index that
   persists "active" is wrong the moment a deadline passes with no transaction.
2. **Every id it returns is re-read on-chain before the UI acts on it.** The index
   narrows the candidate set; the chain decides the truth. This is what keeps it
   non-authoritative in practice and not just in principle.
3. **Reorg handling is mandatory.** Both tools support it; a naive log tailer does not.
4. **It must be rebuildable from genesis** by a third party with no access to the
   operator. If it cannot be, it has become a source of truth.

### Stage 4 — read-through with fallback

Keep the direct-read path alive and select at runtime: use the index for discovery, fall
back to the chain when it is unreachable or lagging. The app should degrade to slower and
narrower, never to wrong.

Surface index lag in the UI (`indexed to block N` against the chain head) so a user can
see when they are looking at something behind.

---

## 5. The seam this plugs into

The read layer was written with this substitution in mind. Two functions are
transport-agnostic — they take ids and return view types:

```ts
readListingPage(client, book, ids, now, blockNumber): Promise<ListingView[]>
readOffersForListing(client, book, listingId, now, fromBlock, blockNumber): Promise<OfferView[]>
```

Only the **id source** changes when an index arrives. `descendingWindow(count, size)`
becomes an index query; everything downstream — the effective-status derivation, the
tripwire that compares it against `isListingActive`, the pinned block height — is
untouched.

---

## 6. What must not be done

| Anti-pattern | Why |
|---|---|
| A database that accepts writes from anywhere but the chain | It stops being a cache and becomes an unverifiable authority |
| Serving `status` straight from the index | It goes stale by time alone, which is the exact bug the protocol exposes `isListingActive` to prevent |
| Hiding listings the index has not caught up to | A seller whose listing is invisible has no way to tell whether the protocol or the interface failed them |
| Indexing on a private RPC with no public rebuild path | Nobody can check the index against the chain |
| Trusting log data for current state | A log records what *was* true, permanently |

---

*Current deployment: `listingCount() = 3`. Stage 1 is correct and will remain so for a
long time. This note exists so that when it stops being correct, the answer is already
decided rather than improvised.*
