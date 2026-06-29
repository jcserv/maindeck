# Maindeck

A Magic: The Gathering deckbuilder. The domain splits into three concerns: **cards** (the canonical reference data ingested from Scryfall), **decks** (what a user is building), and **formats** (the rules a deck is judged against).

## Language

### Cards

**Card**:
The oracle entity for a Magic card — one row per unique name, holding the rules text, mana cost, type line, color identity, and per-format legalities.
_Avoid_: oracle card, base card.

**Printing**:
A specific release of a **Card** — a Scryfall printing keyed by `scryfallId`, carrying set, collector number, finishes, image, and prices.
_Avoid_: variant, edition, version, SKU.

**Token**:
A creature or artifact that a **Card** produces but that isn't itself a deckable **Card**. Stored as `CardToken` rows linking a producer **Card** to a Scryfall token id.

**Game changer**:
A **Card** Wizards has flagged as power-shifting in Commander. The boolean drives **Bracket** suggestion.

**Color identity**:
The set of mana symbols (W/U/B/R/G) a **Card** is permitted to play under in singleton formats. Distinct from `colors`, which is just what's printed in the cost.

**Universes Beyond**:
Wizards' branding for **Printings** built around non-Magic IP (Lord of the Rings, Warhammer 40K, Fallout, …). Scryfall exposes no single flag and `Printing` doesn't store `set_type`, so maindeck detects it by a curated set of UB set codes (`lib/card/universes-beyond.ts`); `sld` (Secret Lair) is deliberately excluded as a mixed product. Drives the "No Universes Beyond" **printing heuristic**.
_Avoid_: UB (in prose), non-Magic.

**Printing heuristic**:
A rule for bulk-reselecting the pinned **Printing** of every **DeckCard** in a **Deck**: `cheapest`, `most-expensive`, or `no-universes-beyond` (`lib/card/printing-heuristics.ts`). Cards with no matching alternative are left untouched, and price heuristics only repin **DeckCards** that already pin a **Printing**.

### Decks

**Deck**:
A user-owned collection of **DeckCards** under one **Format**, with a **Visibility** and an optional **Bracket** override. May be **forked** from another **Deck**.

**DeckCard**:
A single line in a **Deck** — `(Card, Zone, Category?, Printing?, quantity, isFoil)`. The unit of mutation in the editor.
_Avoid_: deck entry, slot, card-in-deck. When the surrounding code is unambiguous, "card" is acceptable shorthand — but at module interfaces, prefer **DeckCard**.

**Zone**:
Where a **DeckCard** sits inside a **Deck**: `MAINBOARD`, `SIDEBOARD`, `CONSIDERING`, or `COMMANDER`. `CONSIDERING` is maindeck's name for the on-deck/maybeboard concept.
_Avoid_: maybeboard (use `CONSIDERING`), board (ambiguous with mainboard).

**Category**:
A user-defined free-text grouping within a **Zone** (e.g. "Ramp", "Removal"). Distinct from **CardType** (Creature/Instant/...) and from **Format**.

**Visibility**:
`PRIVATE` (owner-only, 404s for others), `UNLISTED` (link-accessible, not indexed), or `PUBLIC` (discoverable). Default is `PRIVATE`. Discovery is `kind=DECK` only: a wishlist (`kind=WISHLIST`) made `PUBLIC` is link-accessible via `/deck/[id]` but stays out of discovery and is always `noindex`.

**Fork**:
A copy of another **Deck**, retaining a `forkedFromId` pointer to its origin.

**Revision**:
A `DeckRevision` row capturing a JSON change payload for a **Deck** edit, used for the history view.

### Formats and legality

**Format**:
The rules system a **Deck** is built under (`COMMANDER`, `STANDARD`, `MODERN`, ...). Drives deck-size, singleton, and per-card legality checks.

**Singleton format**:
A **Format** that allows at most one copy of each non-basic **Card**: `COMMANDER`, `BRAWL`, `OATHBREAKER`.

**Legality**:
The result of validating a **Deck** against its **Format** — a list of `LegalityIssue`s (banned/restricted card, color-identity violation, deck-size, singleton, sideboard size).
_Avoid_: validation result (too generic), check.

**Bracket**:
A 1–5 power-level tier for Commander **Decks** (`Exhibition`, `Core`, `Upgraded`, `Optimized`, `cEDH`). Suggested from **game changer** count; can be manually overridden via `manualBracket`. **Bracket** is Commander-only and is not a **Format**.

### Ingestion

**Bulk manifest**:
The Scryfall `/bulk-data` response. Maindeck only consumes the `default_cards` entry, identified by its `updatedAt` timestamp.

**Checkpoint**:
The last `updatedAt` successfully ingested for a given source (`IngestCheckpoint`). If the manifest's `updatedAt` matches the **Checkpoint**, the run is skipped.

**Staging**:
The pluggable batch store between Scryfall download and Postgres upsert (local FS in dev, Vercel Blob in prod, S3 as an option). The interface is `BatchStorage` (`writeBatch`/`readBatch`/`cleanup`).

**Batch**:
A 500-card chunk written during download and read back during upsert. Batches are addressed by `(runId, index)`.

**Diff**:
The split of a **Batch** into insert / update / unchanged buckets, keyed by Scryfall `version` hash. Drives the `cardsInserted` / `cardsUpdated` / `cardsUnchanged` stats.

### Import/export

**Decklist**:
A textual representation of a **Deck**. Three on-the-wire shapes: plain `text`, `arena` (MTG Arena export), and `dek` (XML).

## Relationships

- A **Card** has many **Printings** and may produce many **Tokens**.
- A **Deck** has many **DeckCards** and many **Categories**; each **DeckCard** points at one **Card** and optionally pins one **Printing**.
- A **DeckCard** belongs to exactly one **Zone**; **Category** is meaningful only within `MAINBOARD`.
- A **Deck** has one **Format**; **Bracket** applies only when the **Format** is `COMMANDER`.
- **Legality** is computed from a **Deck** against its **Format** (and, for singleton formats, the commander-zone **Color identity**).
- A **Deck** may be **forked** from another **Deck** (`forkedFromId`).
- The Scryfall workflow reads a **Bulk manifest**, compares to the **Checkpoint**, streams cards into **Staging** as **Batches**, then **Diffs** each batch into Postgres.

## Example dialogue

> **Dev:** "If a user pins a specific **Printing** on a **DeckCard** and that **Printing** later gets pulled from Scryfall, do we drop the **DeckCard**?"
> **Domain expert:** "No — only the pin is nullable. The **DeckCard** still references the **Card**, so the deck stays whole; the **Printing** picker just falls back to the canonical first **Printing**."

> **Dev:** "A user moved a **DeckCard** from `MAINBOARD` to `SIDEBOARD`. Does its **Category** come along?"
> **Domain expert:** "No. **Category** is mainboard-only — moving out of `MAINBOARD` clears it. **Categories** are per-**Deck** strings, not first-class entities the **DeckCard** belongs to."

> **Dev:** "Should we recompute the **Bracket** when the user changes the **Format** from `COMMANDER` to `MODERN`?"
> **Domain expert:** "**Bracket** doesn't exist outside Commander. Hide it. The `manualBracket` value can stay on the row — it just isn't surfaced — so they don't lose the override if they switch back."

## Flagged ambiguities

- **"card"** is used in code to mean three different things: the oracle **Card**, a **DeckCard** instance, or a specific **Printing**. At module interfaces, prefer the precise term; inside a self-contained function operating on one of them, "card" is fine.
- **"version"** on `Card` and `Printing` is a content hash used for ingest diffing — not a semver, not a user-facing version. Don't surface it in the UI; don't conflate it with **Revision**.
- **"set"** in this codebase always means an MTG set (`Printing.setCode` / `setName`), never a `Set` data structure. The collection type is always written `Set<...>`.
- **"source"** on `IngestCheckpoint` is the Scryfall feed identifier (e.g. `scryfall:default_cards`), not a generic data source.
