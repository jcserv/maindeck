# Structural audit — 2026-06-11

Scope: structure, readability, and conciseness of the maindeck codebase at commit `2c33be2`.
Baseline verified locally: `pnpm typecheck` clean, `pnpm lint` clean (zero warnings, including
`import/no-unused-modules` and `import/no-cycle`). All findings are behavior-preserving refactors;
each names the test files that pin the current behavior.

Terminology follows `CONTEXT.md` (**Card**, **Printing**, **DeckCard**, **Zone**, **Format**,
**Legality**, **Bracket**, **Revision**, **Visibility**).

---

## Executive summary

**Overall health: strong.** The domain core is in better shape than the hotspot list assumed.
Legality is already a composable rules registry (`formatRules: Record<Format, LegalityRule[]>`,
`lib/deck/legality/format-rules.ts:12`) with a fully discriminated `LegalityIssue` union. The
mutation pipeline is already command-shaped (`PlannedChange` discriminated on `op`, one projection
switch, `DbOp` diff output, transactional apply + Revision recording). The Scryfall ingest has a
single Zod parse boundary, respects `BatchStorage` everywhere, and its checkpoint semantics are
safe under partial failure. Several hypothesized findings are explicitly *cleared* in Appendix B.

The real debt concentrates in four themes:

1. **The interactive UI surfaces are the only ungoverned code.** The five files exempted from
   `max-lines`/`complexity` (eslint.config.mjs:87–100) are also excluded from coverage thresholds
   (`app/_components/**/*.tsx`, vitest.config.ts:99). That combination — no lint ceiling, no
   coverage gate, 1,394-line component — is where change is riskiest today. `deck-mode-bar.tsx`
   models a five-view state machine with 12 independent `useState`s; `move-card-menu.tsx` renders
   the same action list twice (desktop dropdown + mobile sheet); `printing-carousel.tsx` has zero
   tests.
2. **Half-applied patterns.** The codebase usually has the right abstraction and then bypasses it
   once: `checkSingleCard` re-implements the registered legality rules inline; two Server Actions
   re-derive the `requireDeckViewable` predicate by hand; one `DbOp` dispatch uses if/else where
   every sibling switch is exhaustive.
3. **Boundary shapes repeated instead of shared.** The "counted zones" (`MAINBOARD`+`COMMANDER`)
   predicate exists in ≥7 places (in-memory and as a Prisma `where` fragment); the
   Prisma-`Decimal`→`number` price serializer exists twice (and its absence already caused bug
   #65); the `as Legalities` JSON cast appears at 6 sites.
4. **Inconsistent action error contracts.** Auth actions return `{ error } | { ok }`; deck actions
   throw raw `Error`s; `addCardToDeck` silently swallows `InvariantViolation`, so a rejected add
   produces no user feedback.

**Land first:** F1–F4 (shared zone/legalities/price helpers + exhaustiveness fixes) — a day of
mechanical, fully test-pinned work that removes the most-duplicated shapes. Then F10
(deck-mode-bar reducer): it is the largest file, the stated subject of "active iterative refactor"
(eslint.config.mjs:88), and every other header-search finding gets cheaper after it.

---

## Tier 1 — Land now

### F1: The "counted zones" predicate is re-derived in seven modules
- Where: `lib/deck/brackets.ts:45-47`, `lib/deck/add-intent.ts:100`,
  `lib/deck/legality/shared.ts:90,117`, `lib/deck/legality/rules/commander.ts:11-12`,
  `lib/stats/compute.ts:23` (as the inverse `EXCLUDED_ZONES = new Set(["SIDEBOARD","CONSIDERING"])`),
  `app/_components/builder/decklist.tsx:186-197`; and as a Prisma fragment
  `zone: { in: ["MAINBOARD", "COMMANDER"] }` in `lib/deck/queries.ts:37,138,200,381,451` and
  `lib/deck/saved-queries.ts:72`.
- Problem: "Which **Zones** count toward the deck" is a single domain rule (it drives **Legality**
  deck-size, **Bracket** game-changer counts, card counts, and every preview query) but each module
  re-states it — twice as a positive list, once as a negative list, five times as a Prisma literal.
  A future Zone (or a decision that `COMMANDER` shouldn't count somewhere) means a grep-and-hope
  sweep across in-memory predicates *and* query strings.
- Change: add `lib/deck/zones.ts`:
  ```ts
  export const COUNTED_ZONES = [Zone.MAINBOARD, Zone.COMMANDER] as const satisfies readonly Zone[];
  export function isCountedZone(zone: Zone): boolean { ... }
  export const COUNTED_ZONES_FILTER = { zone: { in: [...COUNTED_ZONES] } } satisfies Prisma.DeckCardWhereInput;
  ```
  Replace the seven sites. `decklist.tsx` keeps its four per-Zone partitions but switches string
  literals to the `Zone` enum.
- Effort: S    Risk: low
- Pinned by: `lib/deck/legality.test.ts` (617), `lib/stats/__tests__/compute.test.ts` (475),
  `lib/deck/__tests__/queries.test.ts` (924), brackets/add-intent tests.

### F2: `as Legalities` cast repeated at six Prisma JSON boundary sites
- Where: `lib/search/card-search.ts:97,205`, `lib/deck/mutation/snapshot-pure.ts:55`,
  `lib/deck/mutation/snapshot.ts:84,91,104`.
- Problem: the `Card.legalities` JSON column crosses into the domain via a raw `as Legalities`
  cast in six places, with two different null-handling spellings
  (`(row.legalities ?? {}) as Legalities` vs `(dc.card.legalities as Legalities) ?? {}` vs
  `as Legalities | null`). This is exactly the "external data should cross into the domain once,
  through a typed parser" boundary — ingest already has `normalizeLegalities`
  (`lib/scryfall/formats.ts`), but the read side launders instead.
- Change: add `toLegalities(value: unknown): Legalities` next to the `Legalities` type in
  `lib/card/types-meta.ts` (a thin guard/normalizer, defaulting to `{}`), and route all six sites
  through it. Casts disappear; null-handling becomes uniform.
- Effort: S    Risk: low
- Pinned by: `lib/search/__tests__/card-search.test.ts` (256),
  `lib/deck/mutation/__tests__/snapshot.test.ts` (198), `snapshot-pure.test.ts` (200).

### F3: Printing price `Decimal`→`number` serialization duplicated; `SerializedPrinting` is a dead-end type
- Where: `lib/card/printing-types.ts:24-29` vs `lib/deck/queries.ts:638-659`; the
  `SerializedPrinting` type (`lib/deck/queries.ts:17-27`) has no importer outside the file.
- Problem: Prisma `Decimal` isn't serializable across the Server→Client boundary, so prices must be
  coerced to `number` at every cache boundary — a constraint important enough that missing one site
  was a recent production fix (commit `2c33be2`, PR #65 "coerce printing Decimal prices inside
  cache boundary"). Today the coercion exists as a helper in `printing-types.ts` *and* as ~20
  hand-written ternaries inside `getDeckById`. The next query that selects prices will copy the
  ternaries again.
- Change: extract the price-field mapping from `lib/card/printing-types.ts:24-29` into an exported
  `serializePrintingPrices(p)` (or widen `toClientPrinting`), and have `getDeckById` spread it
  instead of the inline ternaries. Move/retire `SerializedPrinting` accordingly — as written it
  documents a shape nothing consumes by name.
- Effort: S    Risk: low
- Pinned by: `lib/deck/__tests__/queries.test.ts` (924), `lib/card` printing tests.

### F4: Two dispatches silently swallow new variants (the only exhaustiveness gaps found)
- Where: `lib/deck/mutation/apply.ts:20-41` and `lib/stats/compute.ts:196-206`.
- Problem: every other switch on a domain union in the repo is exhaustive (no default, or
  `default: assertNever(...)` — e.g. `runner.ts:45-46`, `invariants.ts:125-138`,
  `formatLegalityIssue`). These two break the pattern. `applyOps` dispatches `DbOp` with
  `if ("create") ... else if ("delete") ... else` — a fourth `DbOp` variant would be written to the
  DB as an update. `formatTargets` ends in a `default:` that (a) makes the explicit `BRAWL` case
  dead code (identical return) and (b) silently assigns 60-card targets to any future **Format**.
  Also, `FormatTargets` declares `requiredCards: number | null` but no branch returns null — a
  dishonest type.
- Change: convert `applyOps` to `switch (op.kind)` with `default: assertNever(op)` (helper exists,
  `lib/utils.ts:22-24`). Replace `formatTargets`'s switch with explicit cases per `Format` (or a
  `Record<Format, FormatTargets> satisfies` table) and drop `| null` unless a null case is added.
- Effort: S    Risk: low
- Pinned by: `lib/deck/mutation/__tests__/apply.test.ts` (425),
  `lib/stats/__tests__/compute.test.ts` (475).

### F5: JP-collector enrichment is a second pipeline embedded in `workflows/scryfall/steps.ts`
- Where: `workflows/scryfall/steps.ts:260-349` (`fetchScryfallSearch`,
  `ingestCollectorPrintings`) and the stats alias chain at `steps.ts:91-106`.
- Problem: `steps.ts` (623 lines) hosts two pipelines with different inputs: the bulk
  manifest→**Staging**→**Diff**→upsert flow, and a search-API enrichment that ingests curated JP
  **Printings**. The seam is already acknowledged in-code: `type BatchStats = IngestStats; type
  PrintingStats = BatchStats` exists solely because the enrichment "touches only Printings … but
  reuses the shared printing helpers, which write the full BatchStats shape" (steps.ts:104-106).
  The enrichment correctly reuses `buildPrintings`/`loadExistingPrintings`/`applyPrintingWrites`,
  so this is module placement, not logic duplication.
- Change: move `fetchScryfallSearch` + `ingestCollectorPrintings` to
  `workflows/scryfall/jp-collector.ts`; export the shared printing helpers (and `emptyStats`) from
  steps.ts (or a small `upsert-helpers.ts`). Then collapse the three-way stats alias to
  `IngestStats` plus one named alias with the explanatory comment. ~90 lines leave steps.ts; the
  two pipelines become independently readable.
- Effort: S–M    Risk: low
- Pinned by: `workflows/scryfall/__tests__/steps.test.ts` (1,258 — includes
  `ingestCollectorPrintings` cases), `ingest.test.ts` (223).

### F6: **Visibility** authz predicates re-implemented inline in three actions
- Where: `app/_actions/saved-decks.ts:22-33` vs `lib/auth/deck-access.ts:22-37`
  (`requireDeckViewable`); `app/_actions/deck-likes.ts:32-35` and `:65-68` (same
  "PUBLIC-only" check twice in one file); `app/_actions/deck/duplicate.ts:51-58` (fork-allowed
  check).
- Problem: `lib/auth/deck-access.ts` is the designated home for deck access rules, yet
  `saveDeck` re-derives `isOwner`/`PRIVATE` by hand (`const isOwner = deck.userId ===
  session.userId; if (deck.visibility === Visibility.PRIVATE && !isOwner) throw ...`), and the
  like/fork predicates live only inline. The hand-rolled copies already drift on failure mode
  (helper 404s to prevent existence probing; inline copies throw `Error` with a message that
  confirms the deck exists — undermining the helper's documented anti-probing contract).
- Change: add to `lib/auth/deck-access.ts`: `canViewDeck(session, deck)` (pure predicate shared by
  `requireDeckViewable`), `requireDeckLikeable(deckId)` (PUBLIC-only), and an `isForkable`
  predicate for duplicate. Actions call the helpers; failure mode (404 vs thrown message) becomes a
  single deliberate decision per rule instead of four accidental ones.
- Effort: S–M    Risk: low (behavior change only if you *choose* to unify failure modes; can be
  done shape-preserving first)
- Pinned by: `app/_actions/__tests__/saved-decks.test.ts` (146), `deck-likes.test.ts`,
  duplicate tests.

### F7: `checkSingleCard` re-implements the registered legality rules inline
- Where: `lib/deck/legality/index.ts:79-105` vs `checkPerCardLegality` (index.ts:24-38),
  `singletonRule`/`colorIdentityRule` (`lib/deck/legality/shared.ts:85,106`).
- Problem: the module's own pattern is "rules are composable functions registered per **Format**" —
  and the add-time check bypasses it, restating the per-card status lookup
  (`card.legalities[format.toLowerCase() as Lowercase<Format>]` appears verbatim at index.ts:29 and
  index.ts:79) and inlining the singleton and color-identity logic. The comment at index.ts:74-76
  shows the intent (share the *formatter* so messages match) but the *predicates* can still drift —
  e.g. a basic-land exemption tweak in `singletonRule` would not reach add-time checks.
- Change: extract `perCardStatusIssue(cardName, legalities, format): LegalityIssue | null` used by
  both `checkPerCardLegality` and `checkSingleCard`; have `checkSingleCard`'s singleton branch call
  the same `isBasicLandCard` + threshold core that `singletonRule` uses (small shared helpers in
  `shared.ts`, not a forced snapshot construction). Same issues, one source of truth per rule.
- Effort: S    Risk: low
- Pinned by: `lib/deck/legality.test.ts` (617), `lib/deck/legality/__tests__/shared.test.ts` (261).

### F8: `lib/deck/queries.ts` launders Prisma result types through `as unknown as`
- Where: `lib/deck/queries.ts:207` (`as unknown as Omit<DeckWithPreview, "cardCount">[]`),
  `:390-399` (a 9-line tuple cast over a `Promise.all`); the select being cast around is
  *duplicated inline* in `lib/deck/saved-queries.ts:76-86` (structurally identical to
  `PREVIEW_CARD_SELECT`, queries.ts:115-125).
- Problem: the hand-maintained `DeckWithPreview`/`PublicDeckWithPreview` interfaces are asserted,
  not checked, against the `select` trees. Add a field to the interface without touching the select
  (or vice versa) and the compiler stays silent — `as unknown as` is the one construct strict mode
  can't see through. Meanwhile the select tree itself is copy-pasted into `saved-queries.ts`.
- Change: define the selects with `satisfies Prisma.DeckSelect` / `Prisma.DeckCardSelect`, derive
  row types via `Prisma.DeckGetPayload<{ select: typeof ... }>`, and keep the exported interfaces
  only where they add serialization fields (`cardCount`, `likeCount`). Export `PREVIEW_CARD_SELECT`
  and import it in `saved-queries.ts`. Both casts and the duplicate select disappear.
- Effort: M    Risk: low
- Pinned by: `lib/deck/__tests__/queries.test.ts` (924), saved-queries tests.

### F9: `moveCardZone` / `moveCardTo` duplicate their load-guard-and-resolve preamble
- Where: `app/_actions/deck/categories.ts:178-214` vs `:216-260`.
- Problem: both actions fetch the same `deckCard` projection, repeat the
  `!sourceCard || sourceCard.deckId !== deckId` guard, and both run a "does this **Category** exist
  in this **Deck**" `findUnique` — but with silently different semantics (zone-move drops a
  now-missing Category to `null`; explicit move throws). The shared mechanics and the deliberate
  difference are interleaved, so a reader can't tell which divergence is intended.
- Change: extract a `lib/deck`-side helper `loadDeckCardForMove(deckId, deckCardId)` (fetch +
  guard) and `categoryExists(deckId, name)`; keep the two policies (`fallback-to-null` vs `throw`)
  as explicit one-liners in each action. Alternatively fold `moveCardZone` into `moveCardTo` with a
  `categoryPolicy` parameter — both are thin wrappers over the same `applyChanges` `move` op.
- Effort: S–M    Risk: low
- Pinned by: `app/_actions/deck/__tests__/categories.test.ts` (981).

---

## Tier 2 — Schedule

### F10: `deck-mode-bar.tsx` is a five-view state machine spread across 12 `useState`s
- Where: `app/_components/header-search/deck-mode-bar.tsx:107-139` (state),
  `:391-403` (`closeAndReset` — ten setters plus a context call), `:569-695` (~127-line
  `onInputKeyDown` if/else chain), `:204-223` + `:116-119` (add-card pagination), exemption at
  `eslint.config.mjs:87-100`.
- Problem: `view` is a 5-literal union (`"list" | "destination" | "shortcuts" | "more-add" |
  "more-deck"`, line 110-112) whose companion data lives in *separate* states (`staged`,
  `destName`, `activeIndex`), so illegal combinations are representable — `view === "destination"`
  with `staged === null` is only prevented by runtime guards (`confirmAdd`, line 421). Every
  transition is a multi-setter ritual (`closeAndReset` resets 10 of them; the `shortcutsTick`
  handler at 129-139 sets six), and four render-time `prev*` syncers (128, 187, 198, 355) patch
  state during render. This is the textbook trigger for a reducer with discriminated-union actions.
- Change: model the bar as
  ```ts
  type BarView =
    | { kind: "list" }
    | { kind: "destination"; staged: StagedAddIntent; destName: string }
    | { kind: "shortcuts"; showOther: boolean }
    | { kind: "more-add" } | { kind: "more-deck" };
  type BarAction = { type: "open-shortcuts" } | { type: "stage"; card: CardSearchResult; quantity: number }
    | { type: "close" } | { type: "results-arrived"; results: CardSearchResult[] } | ...;
  ```
  with one `useReducer` (`closeAndReset` becomes `dispatch({type:"close"})`). Extract
  `useAddCardPagination(searchedTerm, globalResults)` (owns `extraAddPages`/`addOffset`/
  `addHasMore`/`addLoadingMore` + `loadMoreAdd`); convert `onInputKeyDown` to a per-view dispatch
  table — the repo already has the precedent in `printing-carousel.tsx:48-76`
  (`SEARCH_KEY_ACTIONS` record). Extract `<ListPanel>`/`<DestinationPanel>` with narrow props.
  End state: the file drops out of the lint exemption, and the reducer + hooks are plain `.ts`
  that fall under the 100% coverage gate.
- Effort: L    Risk: medium — `deck-mode-bar.test.tsx` is 213 lines and pins debounce/retry and
  Partner-commander legality, but *not* view transitions; components are excluded from coverage
  thresholds (vitest.config.ts:99), so add reducer tests first, then refactor against them.
- Pinned by: `deck-mode-bar.test.tsx` (213), `use-card-search.test.tsx` (223) — partial.

### F11: `move-card-menu.tsx` renders the same action list twice (desktop dropdown vs mobile sheet)
- Where: `app/_components/builder/move-card-menu.tsx:243-391` (desktop) vs `:416-606` (mobile) —
  e.g. quantity +/− at 276-292 vs 448-477, change-printing at 293-302 vs 478-492, zone moves at
  323-341 vs 518-546, **Category** selection at 347-388 vs 550-604.
- Problem: every menu capability is written twice with different chrome; only the desktop copy gets
  keyboard shortcuts (`onMenuKeyDown`, 165-221, re-lists the same actions a *third* time as key
  bindings). Adding one menu action today means three edits that can drift — the disabled-state
  logic for "Remove one" already lives in two slightly different spellings (prop vs className
  branch).
- Change: define the menu as data once —
  `type MenuAction = { id: string; label: string; icon: LucideIcon; shortcut?: string; disabled?: boolean; onSelect: () => void }`,
  built by a `buildMenuActions(props)` pure function (groups: actions / zones / categories) — and
  render it through two thin presenters, `<DesktopMenu actions={...}>` and `<SheetMenu
  actions={...}>`. `onMenuKeyDown` derives bindings from the same array. ~250 duplicated lines
  collapse; the exemption for this file becomes deletable.
- Effort: M    Risk: medium — `__tests__/move-card-menu.test.tsx` is 32 lines and covers only the
  `orderZoneOptions` helper; the component itself is unpinned. Write a render test per surface
  (assert both surfaces expose the same action ids) before refactoring.
- Pinned by: effectively nothing (32-line helper test) — raises risk grade.

### F12: `simple-bar.tsx` and `deck-mode-bar.tsx` hand-copy the same search-bar shell
- Where: `simple-bar.tsx:51-100` vs `deck-mode-bar.tsx:107-139,225-231` — both own
  `query/open/view/activeIndex/showOther`, the same `shortcutsTick` `prev`-sync block that fans out
  to 4–6 setters (simple-bar:62-73, deck-mode-bar:128-139), the same outside-click close listener,
  and the same wrapping-index keyboard nav (`(i + 1) % len`).
- Problem: these are the two instances of one concept — a header search popover with views and a
  keyboard-driven list — and they will keep drifting (deck-mode-bar's nav handles five views,
  simple-bar's two, but the wrapping/escape/outside-click mechanics are identical). Fixing a focus
  or dismiss bug currently requires remembering both files.
- Change: after F10 lands, extract the shared shell as a hook —
  `useSearchBarShell({ shortcutsTick, onClose })` owning open/query/activeIndex/outside-click — and
  reuse the same key-dispatch-table helper in both. simple-bar then comfortably leaves the lint
  exemption too (~150 lines shed per the decomposition sketch).
- Effort: M    Risk: medium (simple-bar.test.tsx is 120 lines: render + 429-retry only).
- Pinned by: `simple-bar.test.tsx` (120) — partial.

### F13: `printing-carousel.tsx` mixes three concerns and has no tests at all
- Where: `app/_components/builder/printing-carousel.tsx` — set-filter search (84-129), carousel
  index + snap-on-filter-change (156-173), local foil toggle reset (176-183); no test file exists.
- Problem: three independent stateful concerns share one 512-line component, each with its own
  render-time `prev*` syncer (104, 163, 179 — the densest use of that pattern in the repo), and
  none of it is pinned: this is the only exempted component with zero tests, so today *any* change
  here is unverifiable.
- Change: extract `useSetSearch(printings)` (query, suggestions, `SEARCH_KEY_ACTIONS` dispatch —
  the table at 48-76 is already the right shape, just module-level instead of parameterized) and
  `useCarouselIndex(filtered, selectedPrintingId)` (index + snap). Both become coverage-gated
  `.ts` hooks; write their tests as part of the extraction. Rename the `selectedId` prop to
  `selectedPrintingId` — at this interface it is a **Printing** id and the bare name invites
  confusion with **Card**/**DeckCard** ids.
- Effort: M    Risk: medium-high (no pinning today — the extraction itself is what creates it).
- Pinned by: none — raises risk grade; add hook tests first.

### F14: Server Actions expose three incompatible failure contracts, including a silent swallow
- Where: `app/_actions/auth.ts:110,123,132` returns `{ error: string } | { ok: true }`;
  `app/_actions/deck-likes.ts:32,35`, `saved-decks.ts:27-33`, `deck/categories.ts` throw raw
  `Error(msg)`; `deck/bulk-edit.ts:24-31` / `deck/import.ts:38-45` return result DTOs whose
  `warnings: string[]` carry **Legality** issues; and `lib/deck/editor-actions.ts:34,60` catches
  `InvariantViolation` and `return`s void — the add silently no-ops.
- Problem: a client author must know per-action whether to read `result.error`, `try/catch`, or
  inspect `warnings`. The worst case is the swallow: `addCardToDeck`/`addCardsToDeck` discard the
  structured `LegalityIssue[]` that the mutation layer carefully constructs
  (`lib/deck/mutation/errors.ts`), so the UI cannot tell the user *why* a card didn't appear —
  while the sibling consumer (`lib/deck/io/intake.ts:127-136`) correctly surfaces the same issues
  as warnings.
- Change: needs a one-pager of buy-in, then mechanical work. Recommendation: keep
  `{ error } | { ok }` for `useActionState` form actions (auth), and standardize mutating deck
  actions on a returned `ActionResult<T> = { ok: true; value: T } | { ok: false; issues:
  LegalityIssue[] } `— starting with `addCardToDeck`/`addCardsToDeck` returning the rejected
  issues instead of swallowing them (callers in deck-mode-bar/quick-add can then toast the
  formatted issue). Do *not* migrate the whole codebase at once; convert the swallow sites first,
  where callers demonstrably mishandle today.
- Effort: M (first slice S)    Risk: medium — return types of deployed actions change; clients in
  `deck-mode-bar.tsx:411,425` currently ignore the return value, so the first slice is additive.
- Pinned by: `app/_actions/__tests__/*` (auth 146+, deck action tests), `lib/deck/io/__tests__`
  intake tests.

### F15: `autogenerateCategories` keeps its persistence orchestration in the action layer
- Where: `app/_actions/deck/categories.ts:383-445`.
- Problem: the classification rule correctly lives in `lib/deck/category-autogen.ts`
  (`classifyCard`), but the action retains ~60 lines of orchestration: build assignments map,
  then a per-**Category** loop of `findUnique` + `findFirst` (max sortOrder) + `create` — an N+1
  sequence — then per-Category `updateMany`. By the project's own layering rule (AGENTS.md: thin
  orchestrators), this belongs beside `classifyCard`, where it could also batch (`findMany` the
  existing names once, `createMany` the missing ones) without the action changing shape.
- Change: move the body into
  `applyAutogeneratedCategories(deckId, preset)` in `lib/deck/category-autogen.ts`; the action
  becomes `runOwnerDeckMutation("deck.autogenerateCategories", "category", ({deckId}, preset) =>
  applyAutogeneratedCategories(deckId, preset))`. Batch the existence/creation queries while
  moving (same observable behavior, fewer round-trips).
- Effort: M    Risk: low-medium (hot path for the preset feature; well pinned).
- Pinned by: `app/_actions/deck/__tests__/categories.test.ts` (981).

### F16: Split `lib/deck/queries.ts` along its four non-overlapping caller families
- Where: `lib/deck/queries.ts` (663 lines, 10 exports). Caller map (verified by grep): user-deck
  lists (`getDecksByUserMinimal`/`getDecksByUser`/`getDecksByUserWithPreview` ← decks page,
  home-view, `app/api/decks/mine`), public discovery (`getPublicDecksWithPreview`/
  `getRecentPublicDecksForStrip` ← explore page/actions, landing strip, featured-decks),
  single-deck page (`getDeckById`/`hasViewerLikedDeck` ← deck page, OG image, play page), and
  sitemap (`getPublicDecksForSitemap` ← `app/sitemap.ts`). No caller imports across families.
- Problem: not one module with one job but four read-models sharing a file because they're all
  "deck queries". Each family has its own cache-tag discipline (`deckListTag`/`userDecksTag` vs
  `publicDecksTag` vs `deckTag`+`deckLikesTag`), and the 924-line test file mirrors the tangle.
  At 663 lines it sits at the `max-lines` boundary and every added query nudges it over.
- Change: split into `lib/deck/queries/deck-lists.ts`, `queries/explore.ts` (public + sitemap),
  and `queries/deck-page.ts`, with the shared projection pieces (`PREVIEW_CARD_SELECT`,
  `STRIP_CARD_SELECT`, `deriveStripExtras`, `getDeckCardCounts`, `SerializedPrinting` successor
  from F3) in `queries/shared.ts`. Mechanical import updates at ~10 call sites; split the test file
  along the same lines. Pairs naturally with F8 (do F8 first or together).
- Effort: M    Risk: low (pure file moves + import updates; `import/no-cycle` guards regressions).
- Pinned by: `lib/deck/__tests__/queries.test.ts` (924).

---

## Tier 3 — Optional

### F17: `search-form.tsx` — extract the AI-translation flow and rename `aiTranslated`
- Where: `app/_components/search/search-form.tsx:61-64,131-145`.
- Problem: smallest of the exempted five (294 lines) and mostly fine, but the AI flow
  (`aiResults`, `aiTranslated`, accept/reject) is interleaved with URL-sync and filter chips, and
  `aiTranslated` holds a *syntax string*, not a boolean — the name misleads at a glance.
- Change: `useAiTranslation(query)` hook owning `aiResults`/`translatedSyntax`/`accept()`; extract
  `<SearchFilterRail>` (lines 173-225). The file then clears the 200-line function cap and exits
  the exemption.
- Effort: S–M    Risk: low-medium (search-form.test.ts, 108 lines, pins mode tabs + URL sync but
  not the AI flow).
- Pinned by: `app/_components/search/__tests__/search-form.test.tsx` (108) — partial.

### F18: "subcategory" vs **Category** — ubiquitous-language drift at module interfaces
- Where: `app/_actions/deck/categories.ts` error strings and comments ("Subcategories only apply to
  MAINBOARD cards", also `lib/deck/editor-actions.ts:26,52`), `move-card-menu.tsx` props
  `currentSubcategory`/`subcategories` while its UI tab says "Category" (lines 226, 345, 549).
- Problem: `CONTEXT.md` defines **Category** (and explicitly lists terms to avoid for other
  concepts); "subcategory" is an unofficial synonym that forces readers to confirm the two are the
  same thing. The drift sits exactly at module interfaces (props, server-action error strings),
  where the glossary says precision matters most.
- Change: rename props/locals to `category`/`categories` (or `mainboardCategories` where the
  MAINBOARD-only constraint is worth stating) and align user-facing strings ("Categories only apply
  to MAINBOARD cards"). Pure rename + string updates.
- Effort: S    Risk: low
- Pinned by: existing action/component tests exercise the strings — update snapshots/assertions
  in the same change.

### F19: `isSingletonFormat` probes rule membership by function identity
- Where: `lib/deck/legality/format-rules.ts:28-34`
  (`formatRules[format].includes(singletonRule)`).
- Problem: "is this **Format** singleton" is derived from whether the exact `singletonRule`
  function reference appears in the rule list. Clever, but any composition — wrapping a rule with
  logging, currying a variant — silently flips the predicate to `false` with no compiler or test
  feedback localized to the cause. Two predicates already rely on it (`isSingletonFormat`,
  `isColorIdentityFormat`) and `checkSingleCard` (F7) branches on them.
- Change: make the registry entry carry capabilities explicitly:
  `Record<Format, { rules: LegalityRule[]; singleton: boolean; colorIdentity: boolean }> satisfies ...`,
  or derive the rule list *from* the flags. Identity probing disappears.
- Effort: S    Risk: low
- Pinned by: `lib/deck/legality.test.ts` (617) + per-format rule tests.

### F20: The hand-rolled "previous value" render-sync pattern is repeated ten times across the exempted components
- Where: `deck-mode-bar.tsx:128,187,198,355,381`; `simple-bar.tsx:64,96`;
  `printing-carousel.tsx:104,163,179`; `search-form.tsx:64-69`.
- Problem: each instance is the React-sanctioned "adjust state during render" idiom — that part is
  fine — but ten hand-rolled copies of `const [prevX, setPrevX] = useState(x); if (x !== prevX) {
  setPrevX(x); ...resets }` is boilerplate with a built-in foot-gun (forgetting the `setPrevX`
  causes an render loop; nothing pins these).
- Change: one tiny shared hook, e.g.
  `useOnValueChange<T>(value: T, onChange: (prev: T) => void)` in `app/_components/` (or prefer a
  `key=` remount where the reset is "clear everything", e.g. printing-carousel's foil reset).
  Largely absorbed by F10/F12/F13 if those land — do this only for the survivors.
- Effort: S    Risk: low-medium (behavioral subtleties in render-phase updates; land after the
  Tier-2 component work, not before).
- Pinned by: partial component tests only.

### F21: `deckId`/`userId` travel as interchangeable positional `string`s through the mutation seam
- Where: `lib/deck/mutation/apply.ts:49` (`applyChanges(deckId: string, userId: string, ...)`),
  `lib/deck/queries.ts:520-523` (`hasViewerLikedDeck(deckId: string, userId: string |
  undefined)`), `lib/deck/io/intake.ts` (`{ deckId, userId }` everywhere).
- Problem: swapping the first two arguments of `applyChanges` compiles. Card-side ids are safe by
  luck (`cardId`/`printingId` are `number`), but the deck/user seam is all-`string` and threaded
  through every mutation. One brand at this seam (not codebase-wide) buys compile-time protection
  where the blast radius is a write.
- Change: `type DeckId = string & { readonly __brand: "DeckId" }` (+ `UserId`) minted in
  `lib/auth/deck-access.ts` (`requireDeckOwner` returns them) and accepted by
  `applyChanges`/`intakeDecklist`/`runOwnerDeckMutation`. Internals keep using them as strings.
  Scope strictly to the mutation path; widen later only if it pays for itself.
- Effort: M    Risk: low (compile-time only; no runtime change)
- Pinned by: full mutation test suite (1,929 LOC across `lib/deck/mutation/__tests__/`).

---

## Appendix A — Conventions to revisit

1. **The five-file lint exemption is all-or-nothing** (`eslint.config.mjs:87-100`): it turns off
   `max-lines`, `max-lines-per-function`, *and* `complexity` wholesale, so an exempted file can
   regress without any signal. Consider a ratchet instead — raised per-file caps (e.g.
   `max-lines: 1450` for deck-mode-bar today) that are tightened as F10–F13 land, so the trend can
   only go down. The block's own comment ("under active iterative refactor") implies the exemption
   was meant to be temporary; a ratchet makes that enforceable.
2. **`app/_components/**/*.tsx` is excluded from coverage thresholds** (vitest.config.ts:99). The
   stated reason ("no per-component unit-coverage strategy yet") is reasonable, but combined with
   (1) it makes the components simultaneously the largest and least-guarded code. The Tier-2
   findings deliberately move logic into `.ts` hooks/reducers, which the denylist model then
   auto-ratchets into the 100% gate — note for whoever lands them that the extraction *must* ship
   with tests or coverage fails. That's a feature, but it should be a known cost up front.

## Appendix B — Non-findings (hotspots investigated and cleared)

- **`lib/deck/legality/` does not need a specification refactor** — it already is one:
  per-rule functions composed via `formatRules: Record<Format, LegalityRule[]>`
  (format-rules.ts:12-26, exhaustive over `Format` by construction), `LegalityIssue` is a closed
  discriminated union (mutation/types.ts:4-13), and `formatLegalityIssue` switches exhaustively
  with no default. Adding a Format = one rules file + one registry line. Only F7/F19 remain.
- **`lib/deck/mutation/` is already command-shaped** — `PlannedChange` (op-discriminated) →
  single projection switch (invariants.ts:125-138, no default, compiler-checked) → `DbOp` diff
  (diff-snapshots.ts) → transactional apply + Revision. No parallel apply/diff/serialize paths
  found; 1,929 LOC of tests pin it. Only F4's `applyOps` else-branch remains.
- **`workflows/scryfall` + `lib/scryfall` parse-don't-validate is done right** — Scryfall JSON
  crosses the boundary exactly once (`parseScryfallCard`, lib/scryfall/parse.ts:43-46, Zod
  `safeParse`); zero `as ScryfallCard` casts in production code; the JP enrichment *reuses* the
  diff/upsert helpers rather than duplicating them (F5 is about module placement only).
- **Checkpoint semantics are safe** — the **Checkpoint** is written last
  (`commitScryfallCheckpoint` combines upsert + cache invalidation atomically per its comment,
  steps.ts:237-258), upserts are idempotent under step retry, and stats deliberately credit diff
  sizes for retry-stability (documented at steps.ts:378-381). No advance-past-unprocessed-data
  window found.
- **`lib/staging/` strategy interface is leak-free** — all FS/Blob/S3 I/O is behind
  `BatchStorage`; no direct calls outside the module.
- **`lib/search/` parse errors are already values** — `parseSyntax` never throws (invalid tokens
  demote to name fragments by design); `evaluate-where` is a pure in-memory evaluator; the only
  boundary cast is covered by F2. The ranked matcher in `deck-search-matcher.ts` is intentional
  strategy duplication (ranking vs binary matching), not drift.
- **Cache-tag usage is consistent** — all actions route through `lib/deck/cache-tags.ts` helpers;
  no hand-built tag strings found. (One over-broad invalidation — `deckMetaMutationTagsAll`
  bumping `decks:public` for PRIVATE decks — was noted but is a perf tuning question, not a
  structural defect.)
- **No dead exports** — `pnpm lint` runs `import/no-unused-modules` over app/lib/workflows and is
  clean; `getDecksByUserMinimal` (suspected dead) is consumed by `app/api/decks/mine/route.ts:2`.
- **`lib/utils.ts` / `lib/concurrency.ts` are lean** — four purposeful helpers and one worker
  pool; no misplaced or dead code. `readonly` discipline at module boundaries is generally good
  (cache-tags, mutation ops, search fragments).
- **"maybeboard" does not leak past the IO boundary** — it exists only as an import-format header
  pattern mapped to `CONSIDERING` (lib/deck/io/adapters/_shared.ts:19), exactly where it belongs.
