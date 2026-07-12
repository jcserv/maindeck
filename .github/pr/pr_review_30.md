<!-- PR Review Notes
Generated: 2026-07-12
PR: none open — review of branch jarrod/30-multi-category-cards vs main (issue #30)
Title: feat(deck): multi-category cards
Author: jcserv
Reviewer: private
Command: /pr-review
-->

# Review Notes: Branch `jarrod/30-multi-category-cards` — Multi-category cards (issue #30)

> No PR exists yet for this branch; these notes review `main...HEAD` (6 commits, 91 files, +2663/−1142). File under PR number once opened.
>
> **Verification pass (2026-07-12)**: C1, I1–I10, M1–M7, M9, M11, L6, and the 🔴 test gap were independently re-verified against the working tree and `main` (code read directly; `main` versions diffed for every regression claim). None refuted. Caveats: L6 is conditional on legacy data actually containing `category = ''`; I8's keyboard-unreachability relies on Base UI's standard roving-focus menu behavior (structurally confirmed: nested `<button>` in menuitem, no keyboard promote path exists); M8/M10 and the L-tier UI items are code-confirmed patterns but were not exercised at runtime; the "776 tests pass" figure is the test agent's local run, not re-run.

---
## CONTEXT (Understand What This Change Does)
---

### Quick Summary

Replaces `DeckCard.category: string | null` with an ordered many-to-many (`DeckCardCategory` join table, `position 0` = primary). Card renders full under its primary category and ghosted (`isSecondary`) under each secondary; all tallies count primary only. Mutation core, server actions, decklist IO, revision payloads, and the builder UI are all rewritten to carry `categories: string[]`.

### Commits

| Commit | Scope |
|---|---|
| `d18e9fb` | Mutation core: `PlannedChange`/`SnapshotCard`/`DbOp`/`RevisionDelta` carry `categories: string[]`; merge identity drops category |
| `ce501f2` | Server actions rewrite: `setCardCategories` replaces `moveCardSubcategory`; delete/rename/move semantics |
| `d1718bf` | Decklist IO: JSON carries full ordered list + legacy single-category union; text/Arena group by primary only |
| `095f46a` | UI: primary/ghost fan-out, composite dnd ids, multi-select category menu (star = primary, keys 1–9/0) |
| `2ffef16` | CONTEXT.md domain definition |

### Files Changed by Risk

| Risk | Area | Files |
|---|---|---|
| 🔴 High | Schema + data migration | `prisma/schema.prisma`, `prisma/migrations/20260711000000_deck_card_multi_category/migration.sql` |
| 🔴 High | Mutation core | `lib/deck/mutation/{apply,plan,invariants,diff,diff-snapshots,snapshot,types}.ts`, `lib/deck/revision.ts` |
| 🟡 Medium | Server actions | `app/_actions/deck/{categories,duplicate,collaboration,export,revisions}.ts`, `app/_actions/inventory.ts` |
| 🟡 Medium | Decklist IO | `lib/deck/io/{intake,parse,serialize}.ts`, `lib/deck/io/adapters/{json,dek,_shared}.ts` |
| 🟡 Medium | Builder UI | `app/_components/builder/*` (dnd, move-card-menu, sortables), `lib/deck/{group-sort,zone-view,editor-actions}.ts`, `app/_components/stats/role-bar.tsx` |
| 🟢 Low | Tests, docs | 30+ test files, `CONTEXT.md` |

### Downstream Impact

- **Revision history**: new delta shape (`categories: string[]`), legacy per-category payloads normalized on read via zod union transform.
- **JSON export consumers**: shape change (`categories` array + top-level registry); legacy `category` field still parses.
- **Text/Arena export**: multi-category cards emit once under primary — deliberately lossy for secondaries (documented in-code).

---
## REVIEW ANALYSIS (What to Scrutinize)
---

### Review Priority Matrix

```
                         HIGH IMPACT
                              │
    ┌─────────────────────────┼─────────────────────────┐
    │ 🔴 CRITICAL             │ 🟡 IMPORTANT             │
    │ • C1 merge-move wipes   │ • I3 recategorize = no   │
    │   target categories     │   revision (decision)    │
    │ • I1 deleteCategory     │ • I7 moveAll optimistic  │
    │   non-atomic destroy    │   divergence             │
    │ • I5 import keeper can  │ • I9 toggle race loses   │
    │   delete categorized row│   membership             │
HIGH├─────────────────────────┼─────────────────────────┤LOW
RISK│ 🟡 MODERATE             │ 🟢 LOW PRIORITY          │RISK
    │ • I2 dup-membership     │ • M-tier items (wishlist │
    │   P2002 mid-tx          │   name cap, autogen N+1, │
    │ • I4 dup deck 5s tx     │   updatedAt, role-bar 0%)│
    │ • I6 import batch nuked │ • L-tier items           │
    │   by zone+category      │                          │
    │ • I8 star not keyboard- │                          │
    │   reachable             │                          │
    └─────────────────────────┼─────────────────────────┘
                              │
                          LOW IMPACT
```

### Critical Issues (Must Address)

#### [C1] Merging zone-move silently wipes the target row's category memberships

**Location**: `lib/deck/mutation/invariants.ts:111-114`, triggered by `app/_actions/deck/categories.ts:233-235`

**Problem**: `applyMove`'s merge branch overwrites the target's categories with the move's:

```ts
if (target) {
  target.quantity += row.quantity;
  target.categories = [...change.categories];
```

`moveCardZone` always passes `categories: []`. Deck has Sol Ring in MAINBOARD `["Ramp"]` + same printing in SIDEBOARD; user moves the sideboard copy to MAINBOARD → merge sets categories to `[]` → `diffSnapshots` emits `categories: []` (`diff-snapshots.ts:82-84`) → `replaceCategoryLinks` deletes the memberships. **"Ramp" silently destroyed.** Old code merged on `(cardId, zone, category)` so the categorized row was never touched. Same root cause drops the target's secondaries on `moveCardTo` merges — the overwrite is even asserted as expected in `__tests__/invariants.test.ts:213-232`.

**Note the asymmetry**: `applyAdd` (`invariants.ts:53-57`) deliberately preserves target categories when the incoming list is empty. `applyMove` does the opposite.

**Fix**: mirror `applyAdd` in the merge branch — keep `target.categories` when `change.categories.length === 0`; for non-empty moves, merge (`[...change.categories, ...target.categories.filter(n => !change.categories.includes(n))]`). Add a test: empty-categories move merging into a categorized target (the existing test at `invariants.test.ts:198` uses an uncategorized target, so this hole is untested).

### Important Issues (Should Address)

#### [I1] `deleteCategory` lost transaction atomicity on the destructive path

**Location**: `app/_actions/deck/categories.ts:121-138`

```ts
if (parsedMode === "deleteCards") {
  await applyChanges(deckId, userId, primaryMembers.map(...));  // own tx, commits
}
await prisma.deckCategory.delete({ where: { id: category.id } }); // separate write
```

On main this was one `$transaction`. If the registry delete fails, user sees an error but their cards are already gone — destructive partial state. Pre-transaction `loadCategoryMembers` read also races concurrent edits.
**Fix**: `applyChanges` supports `opts.tx` (`lib/deck/mutation/apply.ts:141`) — wrap body in one `prisma.$transaction`.

#### [I2] No duplicate-membership guard; dup names crash mid-transaction (P2002)

**Location**: `lib/deck/mutation/invariants.ts:149-166`, `lib/deck/editor-actions.ts:19-31,45-56`

`checkStructural` validates zone mismatch and unknown names, not duplicates within `change.categories`. `replaceCategoryLinks` `createMany` has no `skipDuplicates`; PK is `(deck_card_id, deck_category_id)` — `["Ramp","Ramp"]` throws P2002. `setCardCategories` and the JSON adapter dedupe, but `addCardToDeck`/`addCardsToDeck` pass the client array through raw, and don't run `normalizeCategory` (case-mismatched name fails `unknown_category` here but succeeds via `setCardCategories`).
**Fix**: dedupe/emit `duplicate_category` structural issue in `checkStructural`; normalize names in editor add actions.

#### [I3] Recategorizations no longer produce a revision — decision needed

**Location**: `lib/deck/mutation/plan.ts:29` (`key = \`${cardId}|${zone}\``), `lib/deck/mutation/apply.ts:165` (`deltas.length > 0` gate)

Old deltas keyed `${cardId}|${zone}|${category}` → recategorize showed as −N/+N in history and was revertible. Now every `setCardCategories` call and MAINBOARD-internal `moveCardTo`/`moveCategoryCards` nets zero deltas → **no `DeckRevision` row at all**. History misses all recategorization activity; revert can't restore prior memberships. Tests document this as designed (`plan.test.ts:149-171`, `apply.test.ts:569-589`) — but it's an unstated audit-trail regression vs main. Make the decision explicit; if intended, document in CONTEXT.md.

#### [I4] `duplicateDeck` N+1 creates inside a 5s interactive transaction

**Location**: `app/_actions/deck/duplicate.ts:97-118`

Per-card `tx.deckCard.create` with nested `categoryLinks.create` (main used one `createMany`). `lib/db.ts:27-33` sets no `transactionOptions` → 5s default; on Neon each create is a round trip. Large deck/wishlist plausibly exceeds 5s → `P2028`, duplication fails entirely.
**Fix**: `createMany` DeckCards, re-select by identity tuple `(cardId, zone, printingId, isFoil)`, one `createMany` for all join rows.

#### [I5] Decklist replace-import keeper selection can delete the categorized row

**Location**: `lib/deck/mutation/diff.ts:52-54`

Old code sorted categorized rows first when collapsing `(cardId, zone)` duplicates; now keeper is lowest cuid. If the uncategorized foil row wins, the categorized row is removed (`diff.ts:88-90`) and memberships cascade away — import over an organized deck can shred categorization depending on id order.
**Fix**: carry membership presence in `ExistingDeckCard` (populated in `intake.ts` `buildReplaceChanges`); prefer the membered row, id as tiebreak.

#### [I6] Categories on non-MAINBOARD cards in imported JSON kill the whole import

**Location**: `lib/deck/io/adapters/json.ts:68-88`

No zone guard in the card mapper → `checkStructural` flags `category_zone_mismatch` (`invariants.ts:156-157`) → `applyChanges` throws → `intakeDecklist` drops the **entire batch** (`intake.ts:161-166`). One line like `{"zone":"SIDEBOARD","categories":["ramp"]}` zeroes a valid import. Domain rule is "leaving MAINBOARD clears memberships" — adapter should clear, not detonate.
**Fix**: emit `categories: []` for non-MAINBOARD zones in parse; optionally push a warning.

#### [I7] `ensureCategories` mutates the deck before validation — failed import leaves phantom categories

**Location**: `lib/deck/io/intake.ts:158-160`

Registry rows created outside `applyChanges`'s transaction, before structural/legality checks. When `applyChanges` throws, empty `DeckCategory` rows persist in a deck whose import "failed" — not rolled back, not reported.
**Fix**: run `ensureCategories` inside the same tx (`opts.tx` pathway), or validate first.

#### [I8] Desktop "make primary" star is keyboard-inaccessible; nested interactive inside menuitem

**Location**: `app/_components/builder/move-card-menu.tsx:417-429`

`<button>` inside Base UI `Menu.Item`: roving focus never reaches it, Tab closes the menu — keyboard users cannot promote a category on desktop. Also an interactive-in-`role="menuitem"` a11y violation; `stopPropagation()` guard is fragile against pointerup-based activation.
**Fix**: keyboard path (e.g. `Shift+1..9` promotes, or Enter on an already-member item), registered in `useMenuShortcuts`/hotkeys registry; render star as visual state, not nested button.

#### [I9] Rapid toggles race: concurrent wholesale `setCardCategories` can lose a membership

**Location**: `app/_components/builder/move-card-menu.tsx:139-153`

Menu stays open (`closeOnClick={false}`); each toggle fires a full replacement array in its own transition. Press `1` then `2` fast → `[A]` and `[A,B]` run as parallel server actions; out-of-order execution persists `[A]` — silently lost membership, confirmed by revalidate. Related: toggle right after zone move races `moveCardTo` and throws "Subcategories only apply to MAINBOARD cards".
**Fix**: serialize client-side (promise queue in a ref) or switch to an idempotent single-membership add/remove op.

#### [I10] "Move all cards to" optimistic state diverges from server and sweeps up ghosts

**Location**: `app/_components/builder/decklist-dnd.tsx:265`, `:391-400`

`cardIds` includes `isSecondary` fan-out copies (real DeckCard ids); `moveAll` dispatches wholesale `[category]`/`[]` per id. Server (`moveCategoryCards`) moves only primary members and preserves secondaries. Multi-category cards visibly jump, then snap back on revalidation.
**Fix**: `section.cards.filter((dc) => !dc.isSecondary)`; dispatch per-card `categories` mirroring the server's promote-preserving formula.

### Moderate Issues (Consider)

| # | Issue | Location | Note |
|---|---|---|---|
| M1 | Wishlist registers category names exceeding `CATEGORY_NAME_MAX` (deck name ≤100, category ≤50); later `reorderCategories` rejects app-created state | `app/_actions/inventory.ts:149-168` | Truncate/schema-check before upsert |
| M2 | `autogenerateCategories` registry creation non-atomic + up-to-3-queries-per-name N+1; stray empty categories if `applyChanges` throws; P2002 race | `app/_actions/deck/categories.ts:479-499` | One `findMany` + `createMany({skipDuplicates})` in same tx |
| M3 | Nondeterministic categories on revision deltas: snapshot cards query has no `orderBy`; last-write-wins when foil/nonfoil rows share `(cardId, zone)` | `lib/deck/mutation/plan.ts:31`, `snapshot.ts:34-55` | Add stable `orderBy: { id: "asc" }` |
| M4 | Category-only update skips `tx.deckCard.update` → `updatedAt` stale/lying | `lib/deck/mutation/apply.ts:100-113` | Touch row when `op.categories !== undefined` |
| M5 | Imported category names bypass `CATEGORY_NAME_MAX`, no array cap — crafted JSON can create thousands of over-length categories | `lib/deck/io/adapters/json.ts:20`, `intake.ts:78-80` | `.max(CATEGORY_NAME_MAX)` + array cap in zod |
| M6 | JSON round-trip not lossless for registry: top-level `categories` validated but never parsed; empty categories dropped, `sortOrder` re-alphabetized — contradicts `ensureCategories` docstring | `json.ts:39`, `intake.ts:51-54,73-79` | Carry registry through `ParsedDecklist`, or fix docstring |
| M7 | Replace-mode import discards all imported categories (`diffDeck` emits adds with `categories: []`) — parity with main but undermines "lossless JSON" | `intake.ts:84-104`, `diff.ts:77` | Thread first-occurrence categories through `buildDesired`, or document |
| M8 | Stale deleted category in open menu → toggle throws unhandled inside `startTransition` → error boundary | `move-card-menu.tsx:160-168` | Filter `currentCategories` against live `subcategories`, or server drops unknown names |
| M9 | Duplicate React keys for legacy per-category deltas | `deck-proposal-review-list.tsx:142`, `revision-diff.tsx:34` | Squash via existing `deltaKey` squash or add index to key |
| M10 | Ghost rows indistinguishable to assistive tech; ghost Trash button deletes card from whole deck | `card-row-sortable.tsx:218,249,320-329`, `card-stack-sortable.tsx:194` | aria qualifier "(also in {primary})"; consider ghost-remove = strip membership |
| M11 | RoleBar renders zero-count legend rows/segments when all members of a category are secondary | `app/_components/stats/role-bar.tsx:80-94` | Filter on computed count, not `cards.length` |

### Low Priority

- **L1** `moveCategoryCards` source category not normalized/validated (target is) — silent no-op hides client bugs (`categories.ts:402-405`).
- **L2** `setCardCategories` bypasses zod layer siblings use; O(n²) dedup on unbounded client array (`categories.ts:317-322`).
- **L3** Wishlist `sortOrder` race (`inventory.ts:151-163`) — ordering ambiguity only, matches pre-existing pattern.
- **L4** Propose page picks arbitrary row's memberships when aggregating same-card printings (`propose/page.tsx:26-36`).
- **L5** No DB uniqueness on `(deck_card_id, position)`; `orderBy position` has no tiebreak (`schema.prisma:330-340`) — suggest `@@unique([deckCardId, position])`.
- **L6** Migration backfill includes `category = ''` → registry row named `""` (`migration.sql:26-46`) — add `AND btrim(dc."category") <> ''`.
- **L7** Legacy revert restores only last delta's categories after merge (`revision.ts:70-73`) — union would be strictly better.
- **L8** Legacy mixed-case `category` renamed on import (by-design lowercase registry) — worth a comment on the legacy schema.
- **L9** (pre-existing) Text-export `// <category>` headers collide with zone markers for categories named "sideboard"/"commander"/etc. (`text.ts:50` vs `_shared.ts:15-19`) — follow-up: escape or blocklist.
- **L10** Union rejection warning for card missing both `category` and `categories` is opaque — include `issue.path` (`json.ts:31,63`).
- **L11** Ghost stack tiles keep grab cursor + sortable ARIA despite disabled (`card-stack-sortable.tsx:157,162-163`).
- **L12** `CategoryActionsMenu` treats ghost-only sections as non-empty — offers no-op "Move all" (`decklist-dnd.tsx:264`).
- **L13** Fan-out allocates fresh objects per render; rows unmemoized — amplified by ghosts (`group-sort.ts:252`).

### Suggested Review Order

| Step | File | Time | Focus | Priority |
|---|---|---|---|---|
| 1️⃣ | `lib/deck/mutation/invariants.ts` | 15 min | C1 merge semantics vs `applyAdd`; dup-membership guard (I2) | 🔴 |
| 2️⃣ | `prisma/.../migration.sql` + `schema.prisma` | 10 min | Backfill correctness (solid — see below), `''` edge (L6), position uniqueness (L5) | 🔴 |
| 3️⃣ | `lib/deck/mutation/{plan,apply,diff}.ts` | 15 min | I3 revision decision, I5 keeper selection, M3/M4 | 🔴 |
| 4️⃣ | `app/_actions/deck/categories.ts` | 15 min | I1 atomicity, delete/rename/move semantics, L1/L2 | 🔴 |
| 5️⃣ | `lib/deck/io/{intake,adapters/json}.ts` | 10 min | I6 batch nuke, I7 phantom categories, M5–M7 | 🟡 |
| 6️⃣ | `app/_components/builder/move-card-menu.tsx` | 10 min | I8 a11y, I9 race, M8 | 🟡 |
| 7️⃣ | `decklist-dnd.tsx`, `card-row/stack-sortable.tsx`, `group-sort.ts` | 10 min | I10 moveAll, ghost handling M10/M11 | 🟡 |
| 8️⃣ | `app/_actions/deck/duplicate.ts`, `inventory.ts` | 5 min | I4 tx timeout, M1 | 🟡 |
| 9️⃣ | Test files (spot-check per guide below) | 10 min | 🔴 tally gap, cascade-promotion gap | 🟢 |

---
## TEST REVIEW GUIDE
---

All changed suites pass locally (776 tests). Quality rating: **MINOR slop** — disciplined exact-object assertions across parse → plan → apply → actions → IO; negative paths well represented; no tautologies or assert-anemia.

### What IS Tested (highlights)

| Scenario | Test | Verdict |
|---|---|---|
| Merge with differing category sets | `invariants.test.ts:61,82,213`; `apply.test.ts:326,526` | ✅ Good (but asserts the C1 bug as expected behavior at `:213-232`) |
| Zone exit clears memberships | `categories.test.ts:372,658,733`; `invariants.test.ts:299,313` | ✅ Good |
| deleteCards removes only primary members; secondaries untouched | `categories.test.ts:220-272` | ✅ Good |
| Legacy JSON `category` / revision payloads | `json.test.ts:162-210`; `revision.test.ts:58-91,163-202` | ✅ Good |
| Normalization (trim/lowercase/dedupe, first-seen order) | `json.test.ts:137-159`; `categories.test.ts:443-474` | ✅ Good |
| Duplicate deck copies memberships (positions, remapped registry ids) | `duplicate.test.ts:115-183` | ✅ Good |
| setCardCategories dedup/validation/no-op/order-only | `categories.test.ts:457-547` | ✅ Good |
| Cross-deck scoping (name-based; lookups deck-scoped) | `categories.test.ts:445-448,549,647`; `apply.test.ts:155-180,369-372` | ✅ Good |
| Revision: recategorize = zero deltas (as designed) | `plan.test.ts:149-171`; `apply.test.ts:569-589` | ✅ Good (see I3 decision) |

### What is NOT Tested (gaps)

| Gap | Impact | Why It Matters |
|---|---|---|
| **Ghost cards uncounted in section counts / role bar** — the tally is implemented twice independently (`decklist-section.tsx:252`, `role-bar.tsx:90`) and tested zero times | 🔴 | The feature's headline invariant ("nothing double-counted", CONTEXT.md). One render test with `categories: ["a","b"]` asserting `(1/10)` not `(2/10)` closes it |
| Primary promotion after category deletion — pushed entirely onto FK cascade + `orderBy position asc`; no integration test, no unit test feeding gapped positions (`[1,2]`) through `queries.ts:566` flattening | 🟡 | CONTEXT.md guarantee exercised nowhere |
| Composed text/Arena export → re-import round-trip with a multi-category card (halves tested separately; only arena round-trip at `serialize.test.ts:471` uses zero categories) | 🟡 | User flow inferred, not asserted |
| DnD interaction layer: composite `${id}::${bodyId}` ids, drag-disabled secondaries | 🟡 | Only tested at action boundary |
| `getDeckById` `orderBy: { position: "asc" }` select arg | 🟢 | Pinned elsewhere (`categories.test.ts:231-244`) |

### Slop Findings

- **Assert-by-absence**: `categories.test.ts:196-198` proves the code does nothing ("cascade handles memberships") while nothing proves the DB does the something.
- **Copy-paste fixture**: identical Sol Ring card-meta literal ×8 in `apply.test.ts` (130-138 … 701-709); same in `import.test.ts`.
- **Maintained dead test**: `editor-actions.test.ts:315-332` — fully commented-out `InvariantViolation` test *updated in this diff* inside the comment. New `apply.test.ts:127-180` suggests the gate it awaits already exists — re-enable or delete.
- **Type-evading fixtures**: `decklist.test.tsx:54,75,156,251` `as unknown as Deck` casts; helper at line 61 bypassed by inline duplicates (142-156, 237-251).

---
## PARITY ANALYSIS (single-category → multi-category)
---

| Behavior | Old (main) | New (branch) | Status |
|---|---|---|---|
| Merge identity | `(cardId, zone, category)` | `(cardId, zone, printingId, isFoil)` — category dropped | 🔴 C1: merge-move wipes target categories |
| Recategorize in history | −N/+N delta pair, revertible | Zero deltas, no revision row | 🟡 I3: decision needed |
| Replace-import keeper | Categorized row first | Lowest cuid | 🔴 I5 |
| Replace-import categories | `category: null` on adds | `categories: []` on adds | ➖ Parity (both lossy) — M7 |
| `moveCardSubcategory` → `setCardCategories` | null → `[]`, MAINBOARD-only guard, registry validation, no-op short-circuit | preserved | ✅ Clean |
| Zone move clears memberships | (single category cleared) | all memberships cleared, documented in CONTEXT.md | ✅ Intentional |
| `deleteCategory` atomicity | one `$transaction` | `applyChanges` tx + separate registry delete | 🟡 I1 regression |
| `duplicateDeck` | one `createMany` | per-card creates in interactive tx | 🟡 I4 regression |
| Category-only edit touches `updatedAt` | yes | no | 🟡 M4 |

---
## SECURITY REVIEW
---

### Threat Context

- **Data sensitivity**: Low (deck lists; no PII beyond ownership).
- **Attack surface**: Authenticated users; import paths accept arbitrary text/JSON.
- **Trust level of inputs**: Untrusted (client arrays, imported files).

### Findings

| Category | Status | Evidence |
|---|---|---|
| Auth & authorization | ✅ | Airtight: every category action via `runOwnerDeckMutation` → `requireDeckOwner` (`lib/deck/mutation/runner.ts:69`); duplicate enforces owner-or-forkable; propose gates on `requireDeckCollaborator`; collaboration keeps advisory-lock + CAS |
| Cross-deck injection | ✅ | No client-supplied category ids exist anywhere; name-based, resolved against owning `deckId` (`apply.ts:34-44`, `categories.ts:346`); duplicate remaps onto copy's own registry |
| Input validation | ⚠️ | M5 (import bypasses name-length/array caps), L2 (`setCardCategories` skips zod, O(n²) dedup on unbounded array), M1 (wishlist over-length names) — resource-exhaustion/self-DoS class, not privilege escalation |
| SQL injection / secrets | ✅ | Prisma-parameterized throughout; migration uses `gen_random_uuid()` (precedented); no secrets touched |

---
## PERFORMANCE REVIEW
---

### Scale Context

- **Frequency**: builder mutations are hot interactive paths; import/duplicate occasional.
- **Volume**: decks ≤ ~500 rows; wishlists can be larger.

### Findings

| Category | Status | Evidence |
|---|---|---|
| DB operations | 🔴 | I4 `duplicateDeck` per-card creates in 5s interactive tx (Neon round trips); M2 `autogenerateCategories` 3-queries-per-name |
| Query shape | ✅ | Snapshot/read paths fetch `categoryLinks` inside the single deck query (no N+1); position-ordered |
| React render | ⚠️ | L13 fan-out multiplies rows, fresh objects per render, rows unmemoized — fine today, watch on big decks |
| Algorithmic | ⚠️ | L2 O(n²) `includes` dedup on unbounded client array |

---
## PRE-MERGE CHECKLIST
---

**Critical (must fix before merge):**
- [x] C1 — `applyMove` merge preserves/merges target categories (`invariants.ts:111-114`); update the test at `invariants.test.ts:213-232` that asserts the wrong behavior; add empty-categories-merge-into-categorized-target test
- [x] I5 — replace-import keeper prefers membered row (`diff.ts:52-54`)
- [x] I1 — `deleteCategory` deleteCards path in one transaction (`categories.ts:121-138`)

**Should address:**
- [x] I3 — explicit decision on recategorize-not-in-history; document in CONTEXT.md if intended
- [x] I2 — dedupe/structural-issue for duplicate memberships; normalize names in editor add actions
- [x] I4 — `duplicateDeck` bulk creates
- [ ] I6 — JSON parse clears categories on non-MAINBOARD zones instead of killing the batch
- [ ] I7 — `ensureCategories` inside the apply transaction
- [ ] I9 — serialize category toggles (or single-membership toggle op)
- [ ] I10 — moveAll optimistic dispatch mirrors server semantics, excludes ghosts
- [ ] I8 — keyboard path for promote-primary

**Test quality:**
- [ ] 🔴 Render test: multi-category card counted once in section header + role bar
- [ ] 🟡 Gapped-position promotion test through `queries.ts` flattening (or one integration test on the cascade)
- [ ] 🟡 Composed export→re-import round-trip with a multi-category card (text + arena)
- [ ] Resolve dead test `editor-actions.test.ts:315-332`

**Nice to have:**
- [ ] M3 snapshot `orderBy` ✅; M4 `updatedAt` touch ✅; M5 import caps; M11 role-bar zero rows; L5 `@@unique([deckCardId, position])`; L6 migration `btrim` guard

---
## QUESTIONS FOR AUTHOR
---

1. **Revision trail** (`lib/deck/mutation/plan.ts:29`): Recategorizations no longer write a `DeckRevision` — intentional trade-off of the quantity-only delta shape, or oversight? If intentional, should CONTEXT.md's **Revision** entry say so?
2. **Merge semantics** (`invariants.test.ts:213-232`): The test asserts a merging move *replaces* the target's categories — was that a deliberate choice (vs `applyAdd`'s preserve-when-empty), or did the test canonize a bug?
3. **Replace-mode JSON** (`intake.ts:84-104`): JSON is positioned as the lossless format, but replace-mode drops all memberships on adds (parity with main). Ship as-is and document, or thread categories through `buildDesired` now?
4. **Ghost remove** (`card-row-sortable.tsx:320-329`): Should the Trash button on a ghost strip just that secondary membership rather than delete the DeckCard from the deck? Current behavior is surprising from the section the user is looking at.
5. **Registry round-trip** (`intake.ts:73-79`): Empty categories and `sortOrder` are lost on JSON import (re-alphabetized). Acceptable, or carry the exported registry through `ParsedDecklist`?

---
## OVERALL ASSESSMENT
---

**Verdict: Request changes — one data-loss bug plus two data-shredding import/delete paths; architecture is sound.**

The design is genuinely good: migration is careful and loss-aware (windowed merge with deterministic keeper, quantity-exact, union memberships, gap-free positions); auth is airtight; the primary/ghost fan-out is cleanly confined to `groupByCategory` with one flag; legacy payloads are handled with proper zod unions on all three ingestion paths; tests are disciplined (776 passing, exact-object assertions, real negative paths).

Blockers are concentrated where merge identity changed: **C1** (zone-move merge silently destroys the target's categories — the one true data-loss bug, and a test canonizes it), **I5** (replace-import can delete the categorized duplicate row), and **I1** (deleteCards path can destroy cards then fail to delete the category). All three are small, local fixes. The I3 history regression needs an explicit product decision, not necessarily code. UI issues (race, a11y, optimistic divergence) are real but non-blocking polish.
