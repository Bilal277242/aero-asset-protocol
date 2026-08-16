# AeroAsset Design System

The visual language for the protocol's interface. Every token and component described here
is implemented in `web/src/` and rendered at **`/design`**, which is the executable version
of this document — if the two disagree, the page is right.

---

## 0. Position

The reference set is deliberately **not** other blockchain products. It is maintenance and
records software — AMOS, TRAX, CAMP — plus Jeppesen's approach to information density and
the typographic conventions of aircraft data plates and ATA chapter numbering. Dense,
tabular, unglamorous, authoritative.

Five decisions carry most of the identity:

| Decision | Consequence |
|---|---|
| **Light-first** | Enterprise aviation software runs in daylight offices and gets printed. Dark is a real second mode, not the identity. Crypto products are dark by default; this one is not. |
| **Monospace is semantic** | It marks *what the chain said* — addresses, hashes, amounts, ids, block heights. Sans carries the interface. A reader tells the protocol's claim from ours without being taught the rule. |
| **Squared geometry** | 4px radius ceiling. Placards, data plates and technical drawings have corners. |
| **Hairlines over shadows** | Technical documents separate with rules. Shadow is reserved for genuine elevation. |
| **Density is a feature** | A fleet register *is* a table. Card grids are for shopping. |

**Explicitly avoided:** neon, gradients as decoration, glassmorphism, floating 3D aircraft
renders, pill buttons, rounded cards with accent rails, meme iconography, sci-fi framing.

---

## 1. Colour

One accent, four semantic states, neutrals with a deliberate blue-green bias toward the
accent — a pure grey reads as unconsidered.

### Accent

| Token | Light | Dark | Use |
|---|---|---|---|
| `--accent` | `#0B5D6B` | `#55C2D2` | Interactive, links, focus, active nav |
| `--accent-hover` | `#084853` | `#7BD5E2` | Hover |
| `--accent-subtle` | `#E6F2F4` | `#10262C` | Active nav background, selection |
| `--accent-ink` | `#FFFFFF` | `#061014` | Text on accent |

Petrol — CAA document ink and instrument-panel bezels. Deep and desaturated; it never
glows.

### Semantic state — four values, not three

Named for meaning, never hue, so `confirmed` stays `confirmed` if the green ever moves.

| Token | Light | Dark | Meaning | Example |
|---|---|---|---|---|
| `--confirmed` | `#1D6B47` | `#57C08A` | The chain asserts it, now | listing active, org `VERIFIED` |
| `--blocked` | `#8A5804` | `#D9A23B` | An action would revert | asset unverified, component installed |
| `--adverse` | `#9C2A2A` | `#E2776F` | Terminal or hostile | `DESTROYED`, `REVOKED`, `DISPUTED`, paused |
| `--unrecorded` | `#5B4A93` | `#A99AD8` | **True by time, not yet written to the chain** | listing lapsed, expired transfer offer, deferred payout |

> **Why a fourth state exists.** This protocol has conditions that are neither good nor
> bad: a listing past its expiry still reads `ACTIVE` in storage until someone pays gas; a
> transfer offer past its deadline still has a non-zero `pendingOwner`; a failed payout
> sits claimable and silent. Colouring those amber says "be careful". Colouring them green
> is a lie. They get their own value, and always the same sentence — see `UnrecordedNote`.

### Surfaces and ink

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ground` | `#EEF1F4` | `#090E13` | Page |
| `--panel` | `#FFFFFF` | `#101820` | Cards, tables — the reading surface |
| `--raised` | `#FFFFFF` | `#16202A` | Modals, popovers |
| `--sunken` | `#F6F8FA` | `#0D141B` | Table headers, wells, code |
| `--ink` | `#0E151B` | `#E2E9EF` | Primary text |
| `--ink-2` | `#52606C` | `#8C9AA7` | Labels, descriptions |
| `--ink-3` | `#7A8792` | `#6A7783` | Captions, placeholders, units |
| `--rule` | `#D1D8DE` | `#233038` | Borders |
| `--rule-2` | `#E5EAEE` | `#1A242E` | Internal dividers |

### Accessibility

State is **never encoded by colour alone**. Every `StateChip` carries a text label and a
dot. All body and label combinations meet WCAG AA at their size; `--ink-3` is reserved for
text at 12px and above on `--panel`.

**Implementation:** `web/src/app/globals.css`, surfaced through Tailwind in
`tailwind.config.ts`. Tailwind's default palette is **replaced**, not extended — a palette
you can reach `bg-purple-400` from is a palette that will eventually contain purple.

---

## 2. Typography

Two roles, separated by meaning rather than taste.

```
--font-sans: "Segoe UI Variable Text", "Segoe UI", -apple-system, BlinkMacSystemFont,
             "Inter", "Helvetica Neue", Arial, sans-serif
--font-mono: ui-monospace, "Cascadia Mono", "SF Mono", "JetBrains Mono", Menlo,
             Consolas, "DejaVu Sans Mono", monospace
```

System stacks, no webfont. No font CDN means no third-party origin, which is part of why
the Content-Security-Policy can stay as narrow as it is — and there is no flash of
unstyled text to design around.

**Monospace is applied to:** addresses, hashes, token amounts, ids, block heights, enum
values, function and error names, table numerics, field keys, and headings in record
contexts. **Sans is applied to:** prose, descriptions, buttons, navigation.

---

## 3. Font hierarchy

| Token | Size / line | Tracking | Use |
|---|---|---|---|
| `text-4xl` | 40 / 46 | −0.03em | Page display, rare |
| `text-3xl` | 32 / 38 | −0.025em | Page title |
| `text-2xl` | 26 / 33 | −0.02em | Section title |
| `text-xl` | 21 / 29 | −0.01em | Card group title |
| `text-lg` | 17 / 26 | — | Subhead, record headline |
| `text-md` | 15 / 24 | — | Body |
| `text-base` | 14 / 22 | — | Default UI |
| `text-sm` | 13 / 19 | — | Secondary, table cells |
| `text-xs` | 12 / 17 | — | Captions, hints |
| `text-2xs` | 11 / 16 | 0.06em | Dense mono values |
| `text-3xs` | 10 / 14 | 0.09em | `label-key` — uppercase field keys |

`.label-key` is a single utility (`font-mono text-3xs uppercase text-ink-3`) used for every
field key, table header and eyebrow in the system, so the treatment cannot drift.

Prose is capped near **70 characters**. Headings take `text-wrap: balance`. Digits use
`font-variant-numeric: tabular-nums` everywhere they appear in columns — a settlement
figure that shifts as digits change is a figure nobody trusts.

---

## 4. Spacing

4px base. The scale is intentionally short; more steps mean more inconsistency.

`0 · 1px · 2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96`

| Context | Value |
|---|---|
| Icon ↔ label | 8 |
| Control padding (md) | 12 horizontal |
| Card padding | 16 horizontal, 12 vertical |
| Table cell | 12 / 8 |
| Between form fields | 16 |
| Between sections | 40 |
| Page padding | 16 mobile · 24 tablet · 32 laptop |

Layout uses flex or grid with `gap`, never per-element margins that collapse or double.

---

## 5. Border radius

A 4px ceiling. Aircraft placards and data plates have corners; pill shapes read as
consumer software.

| Token | Value | Use |
|---|---|---|
| `rounded-none` | 0 | Table cells, full-bleed dividers |
| `rounded-xs` | 2px | Badges, chips, inline code, focus ring |
| `rounded-sm` | 3px | Dense controls |
| `rounded` | 4px | **Default** — buttons, inputs, cards, panels |
| `rounded-lg` | 6px | Modals only |
| `rounded-full` | — | Status dots and avatars only |

---

## 6. Shadows

Restrained. Rules do the separating; shadow means *this floats above the page*.

| Token | Use |
|---|---|
| `shadow-hairline` | Sticky headers |
| `shadow-raised` | Rarely — a lifted panel |
| `shadow-overlay` | Dropdowns, tooltips, toasts |
| `shadow-modal` | Dialogs |

Cards carry **no shadow**. A bordered panel on a tinted ground is enough separation, and
shadowed cards are the single strongest signal of generic marketplace UI.

---

## 7. Buttons — `components/ui/button.tsx`

| Variant | Use |
|---|---|
| `primary` | The one action a screen exists for. One per view. |
| `secondary` | Everything else actionable |
| `ghost` | Toolbar, icon-only, tertiary |
| `danger` | **Irreversible protocol actions only** — revoke, destroy, resolve a dispute |
| `link` | Inline navigation, explorer links |

Sizes `sm` (28px) · `md` (32px, default) · `lg` (40px) · `icon` (32²).

States: hover, `:focus-visible` (2px accent ring, 2px offset), `disabled` (45% opacity,
pointer-events off), and `loading` — which renders a spinner, sets `aria-busy`, blocks the
click, and announces a screen-reader label.

`danger` should stay rare enough to mean something. A disabled control should be paired
with a tooltip or inline text saying *why*; "greyed out with no explanation" is the most
common failure in permissioned interfaces, and this protocol has a lot of preconditions.

---

## 8. Inputs — `components/ui/input.tsx`, `field.tsx`

`Input`, `Textarea`, `Select` (native, styled) and `Field`.

`mono` is a prop, not a class: it marks a field whose value is chain data. Set it for
addresses, hashes, ids and amounts.

`Field` owns the accessibility wiring — `htmlFor`, `aria-describedby`, `aria-invalid`,
`role="alert"` on errors — because doing it per call site is how the one field that
mattered ends up missing it. **Error text replaces hint text** rather than stacking, so the
message a user needs is never the second thing they read.

Native `<select>` is used deliberately: a Radix listbox would look identical and cost a
dependency plus the keyboard and screen-reader behaviour the platform already has right.

---

## 9. Cards — `components/ui/card.tsx`

`Card`, `CardHeader`, `CardBody`, `CardFooter`, `DataRow`.

Flat: a hairline border, no shadow, no accent rail. **Cards are for a single record's
detail, never for browsing a collection.**

`DataRow` is the key/value workhorse. It stacks on narrow screens rather than squeezing two
columns into 320px — a wrapped address beats a truncated one.

---

## 10. Tables — `components/ui/table.tsx`, `components/data/data-table.tsx`

The core data surface. `DataTable` takes typed columns with per-column `numeric`, `mono`,
`sortable`, `sticky` and `hideBelow`.

Responsive behaviour, in priority order:

1. **Horizontal scroll inside the container.** The page body never scrolls sideways.
2. **The identity column pins** (`sticky`), so a scrolled row is still identifiable.
3. **Low-value columns drop by breakpoint** (`hideBelow`), rather than shrinking everything.

Sorting sets `aria-sort` and is driven by the caller, because the interesting sorts here —
effective state, price across mixed decimals — are domain decisions, not string compares.
Every table takes a `caption`, rendered `sr-only`.

**Pagination** reads "showing X–Y of Z" rather than page numbers, because the protocol's
accessors are offset-based and a user must know when a list is truncated. A list that
quietly stops is the same class of lie as a stale status.

---

## 11. Badges — `components/ui/badge.tsx`

Badges say **what a thing is**: Aircraft, Engine, Airline, MRO, L2, Sepolia. Variants
`neutral`, `accent`, `outline`, `solid`.

For **what state it is in**, use `StateChip`. Keeping classification and state apart is what
stops semantic colour becoming decoration.

---

## 12. Status indicators — `components/protocol/state-chip.tsx`

`StateChip` renders one of the four semantic states plus `neutral`. Every chip carries a
coloured dot **and a text label** — never colour alone. An optional `hint` explains *why*
the state holds and renders as a `title`.

`UnrecordedNote` is the standard sentence accompanying any `unrecorded` state. It exists as
a component so the phrasing cannot drift: users learn this concept once and must meet it
identically everywhere.

### `VerificationStrip` — `components/protocol/verification-strip.tsx`

The signature component. On every record, three bands, always in this order:

1. **What it is** — name, id, classification, state
2. **What the chain asserts, and at which height** — attested fields plus `BlockStamp`
3. **What none of it claims** — the `NonClaim` qualifiers for that record type

The order is the argument: a reader meets the claim, then its provenance, then its limits —
with the limits attached to the claim rather than exiled to a footer.

`BlockStamp` is not debug output. It is the honest answer to "as of when?", and stating it
on every record is most of what separates verification infrastructure from a listings site.

### `NonClaim` — `components/protocol/non-claim.tsx`

Four variants: `title`, `airworthiness`, `maintenance`, `attestation`. Renders **adjacent to
the claim it qualifies**, never collected in a footer.

> This is the one element in the system that must never be dropped for space, at any
> breakpoint. A green "Verified" chip without its qualifier misrepresents something with
> real safety and legal weight. `docs/requirements.md` states these and every contract they
> apply to repeats them in NatSpec.

### `chain-value.tsx`

`AddressDisplay`, `HashDisplay`, `Amount`, `BlockStamp`, `CopyButton`. All monospace.
Addresses truncate in the **middle**, never the end — the tail is how an address is checked.
`Amount` takes a pre-formatted string, never a number: `uint128` base units do not survive
a round trip through a double.

---

## 13. Modals — `components/ui/dialog.tsx`

Radix Dialog: focus trap, restore, Escape, scroll lock. Sizes `sm` / `md` / `lg`.
`DialogHeader` / `Body` / `Footer` are separate so a long body scrolls while actions stay put.

Full-width minus a 16px margin on phones with `max-h-[calc(100vh-32px)]` and internal
scroll, so a long modal is scrollable rather than clipped. Footer buttons stack
`column-reverse` on mobile, putting the primary action nearest the thumb.

**Every signature request is preceded by a plain-language summary** — what moves, to whom,
how much, and what happens next. That is the practical anti-phishing measure: a user who
can read what they are signing can refuse it.

---

## 14. Toasts — `components/ui/toast.tsx`

Radix Toast with a `useToast()` hook. Tones `info` / `success` / `warning` / `error`.
`duration: null` persists until dismissed — the right default for anything carrying a
transaction hash.

Toasts are for **outcomes that do not deserve a screen**: a transaction confirmed, a value
copied. Never for something the user must act on or read carefully. A failed transaction
gets an inline explanation with a remedy, not a message that vanishes in five seconds.

Viewport: bottom on phones where the thumb is, top-right above `tablet` where it will not
cover a primary action.

---

## 15–16. Navigation and sidebar — `components/layout/app-shell.tsx`

Organised by **what the connected account can do**, not by contract. Three tiers:

| Tier | Shown when | Items |
|---|---|---|
| Public | Always | Fleet · Market · Registry · Protocol |
| Account | Wallet connected | My assets · My trades |
| Operations | Address holds any operational role | Operations |

> **Eleven protocol roles do not become eleven nav items.** Operations is one destination
> whose *contents* are role-gated. A single Sepolia address holds both `ORG_VERIFIER` and
> `ASSET_VERIFIER` — that person should see two work queues on one screen, not navigate
> between two places that look the same.

The permanent column (≥1024px, `position: sticky`) and the mobile drawer are **separate
renders**, not one element that slides. A single translated element has two failure modes
that both occurred during implementation: while off-screen it stays in the tab order, so
keyboard users tab into invisible links; and it keeps contributing to document scroll
width, letting the whole page slide sideways on a phone. Mounting the drawer only when open
removes both by construction.

Drawer behaviour: scrim click closes, Escape closes, route change closes.
`aria-current="page"` marks the active item. Exactly **one** `Primary` landmark is exposed
to assistive technology at every width — verified.

A skip-to-content link is the first focusable element on every page.

---

## 17. Loading states — `components/ui/skeleton.tsx`

`Skeleton`, `TableSkeleton`, `RecordSkeleton`.

Skeletons are used where the **shape** of the result is known — a table of eight rows, a
record with six fields — so nothing shifts when data lands. Where the shape is unknown, use
a spinner and a sentence; a skeleton that guesses wrong is a layout shift with extra steps.

All carry `role="status"` with an `sr-only` label. `Spinner` is a plain arc: a spinning
propeller would be a joke read a hundred times a day, and this product does not make jokes
about aircraft.

---

## 18. Empty states — `components/data/states.tsx`

`EmptyState` with `variant="empty"` (nothing exists) or `"filtered"` (a filter excluded
everything).

Distinguishing the two matters. Rendering both as "No data" is how a user concludes the
protocol is broken when their filter is merely too narrow. Every empty state names what
would have to be true for content to appear, and offers the action that gets there.

---

## 19. Error states — `components/data/states.tsx`

`ErrorState` takes a `kind`, which is not cosmetic:

| Kind | Meaning | User's next move |
|---|---|---|
| `infrastructure` | RPC unreachable or rate-limited | Wait and retry |
| `not-found` | The record does not exist | Check the id |
| `permission` | The account lacks standing | Use a different account |
| `protocol` | The protocol refused | Satisfy the precondition |

Structure is always **title → cause → remedy → verbatim detail**. Say what happened, then
what to do about it. No apologies, no shrugs, no generic illustration standing in for an
explanation.

`detail` renders the decoded error verbatim and selectable — `ComponentIsInstalled(4, 3)` —
so a user can search or report it. With 116 custom errors in the protocol and no
`require`-with-string anywhere, every failure is decodable and none should ever surface as
"Transaction failed".

`Banner` handles conditions that persist across a page rather than replacing it: address-
book drift, a paused module, an undelivered payout waiting to be claimed.

---

## 20. Responsive strategy

| Class | Width | Layout |
|---|---|---|
| Mobile | < 640 | Single column · drawer nav · tables scroll with pinned identity column · modals full-width · toasts bottom |
| Tablet | 640–1023 | Two-column forms · drawer nav · more table columns |
| Laptop | 1024–1439 | Permanent sidebar · three-column record fields · full tables |
| Desktop | ≥ 1440 | Content capped at 1600px · no further widening |

Verified at each width: the page body never scrolls sideways; wide content scrolls inside
its own container; exactly one Primary landmark is exposed; column visibility steps
6 → 5 → 4 as width decreases.

Non-negotiable at every width: non-claims stay adjacent to the claims they qualify;
amounts stay tabular; addresses stay monospace and truncate in the middle.

---

## 21. Accessibility

- **Focus** — one treatment everywhere, `:focus-visible`, 2px accent ring at 2px offset, never removed.
- **Landmarks** — one `main`, one `Primary` nav, skip link first in tab order.
- **Colour** — never the sole carrier of meaning; every state chip has a text label.
- **Motion** — `prefers-reduced-motion` collapses all animation to 0.01ms globally.
- **Forms** — `Field` owns label association, description wiring and `role="alert"`.
- **Tables** — `scope="col"`, `aria-sort`, `sr-only` caption.
- **Overlays** — Radix supplies focus trap, restore, Escape and scroll lock.
- **Live regions** — loading skeletons are `role="status"`; errors are `role="alert"`.

---

## 22. Theming

Three states, not two: `light`, `dark`, and `system` (the default). An inline script in
`<head>` applies the class before first paint, so there is no flash of the wrong theme.
An explicit choice persists to `localStorage` and survives sunset; only `system` follows the
OS.

Every colour is a token. No component references a literal, which is what keeps light and
dark a single design decision rather than two stylesheets that drift.

---

## 23. What is implemented

```
web/src/
├── app/
│   ├── globals.css              all tokens, both themes
│   ├── layout.tsx               providers, skip link, theme script
│   ├── page.tsx                 holding page
│   └── design/page.tsx          the executable specification
├── components/
│   ├── ui/                      button · spinner · input · field · card · badge
│   │                            table · dialog · tooltip · toast · tabs
│   │                            dropdown-menu · skeleton
│   ├── protocol/                state-chip · non-claim · chain-value
│   │                            verification-strip
│   ├── data/                    data-table · states
│   └── layout/                  app-shell · theme-toggle
└── lib/utils/cn.ts
```

**No blockchain code.** No wagmi, no viem, no contract ABIs. `components/protocol/` is
protocol-*aware* — it knows the shape of the domain — but it is purely presentational:
props in, JSX out, no fetching. The ESLint boundary that will forbid components from
reaching the chain is already stubbed in `eslint.config.mjs`.

Sample data on `/design` mirrors the real seeded Sepolia state — assets #1–#4, the lapsed
listing, escrow `0x60e1…5Fa2` — so the components are exercised against shapes the protocol
actually produces.

---

*Implemented and verified in both themes at mobile, tablet, laptop and desktop widths.
Typecheck, lint and production build clean.*
