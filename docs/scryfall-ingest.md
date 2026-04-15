# Scryfall Ingest — Deferred Design Notes

Deferred from the initial scaffold. Pick this up as the next change after `lib/db.ts` and the Workflow DevKit wiring are in place.

## Decisions
- Bulk file: `default_cards` (one row per English printing, ~500MB). Trade-offs:
  - `oracle_cards` (~50MB): no printing variance — wrong shape for a deckbuilder.
  - `all_cards` (~2GB): every language — only needed if non-English is in scope.
- No separate `Set` table for v1. `default_cards` already denormalizes `set_code` and `set_name` per row. Adding a `Set` model means a second `/sets` fetch and a relational upsert that doesn't earn its complexity for a card browser. Easy to add later.

## Prisma model

Add to `prisma/schema.prisma`:

```prisma
model Card {
  id              String   @id                          // Scryfall UUID
  oracleId        String   @map("oracle_id")
  name            String
  setCode         String   @map("set_code")
  setName         String   @map("set_name")
  collectorNumber String   @map("collector_number")
  rarity          String
  lang            String   @default("en")
  layout          String
  manaCost        String?  @map("mana_cost")
  cmc             Float
  typeLine        String   @map("type_line")
  oracleText      String?  @map("oracle_text")
  colors          String[] @default([])
  colorIdentity   String[] @map("color_identity") @default([])
  keywords        String[] @default([])
  imageUris       Json?    @map("image_uris")
  prices          Json?
  scryfallUri     String   @map("scryfall_uri")
  releasedAt      DateTime @map("released_at") @db.Date
  updatedAt       DateTime @updatedAt

  @@index([oracleId])
  @@index([setCode])
  @@index([name])
  @@map("cards")
}
```

Then: `pnpm db:migrate --name add_cards`.

## File layout to add

- `lib/scryfall/types.ts` — minimal hand-typed `ScryfallCard` covering only the fields the schema maps. Don't try to mirror Scryfall's full type.
- `lib/scryfall/map.ts` — pure `toCardInput(card: ScryfallCard): Prisma.CardCreateInput`. Pure → unit-testable without DB or workflow runtime.
- `workflows/scryfall/steps.ts` — two `"use step"` functions (see below).
- `workflows/scryfall/ingest.ts` — `"use workflow"` orchestrator, no Node imports.
- `app/api/ingest/route.ts` — `POST` handler that calls `start(scryfallIngestWorkflow)`.
- `app/api/cards/route.ts` — `GET` handler reading from `prisma.card`.

## Workflow shape

`workflows/scryfall/ingest.ts`:

```ts
import { fetchBulkManifest, downloadAndUpsertAll } from "./steps";

export async function scryfallIngestWorkflow() {
  "use workflow";
  const manifest = await fetchBulkManifest();
  const result = await downloadAndUpsertAll(manifest.downloadUri);
  return { updatedAt: manifest.updatedAt, count: result.count };
}
```

`workflows/scryfall/steps.ts`:

```ts
import { prisma } from "@/lib/db";
import { toCardInput } from "@/lib/scryfall/map";
import type { ScryfallCard } from "@/lib/scryfall/types";

export async function fetchBulkManifest(): Promise<{ downloadUri: string; updatedAt: string }> {
  "use step";
  const res = await fetch("https://api.scryfall.com/bulk-data", {
    headers: { "User-Agent": "maindeck/0.1", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`bulk-data manifest: ${res.status}`);
  const json = (await res.json()) as {
    data: Array<{ type: string; download_uri: string; updated_at: string }>;
  };
  const entry = json.data.find((e) => e.type === "default_cards");
  if (!entry) throw new Error("default_cards entry missing");
  return { downloadUri: entry.download_uri, updatedAt: entry.updated_at };
}

export async function downloadAndUpsertAll(downloadUri: string): Promise<{ count: number }> {
  "use step";
  const { parser } = await import("stream-json");
  const { streamArray } = await import("stream-json/streamers/StreamArray");
  const { Readable } = await import("node:stream");

  const res = await fetch(downloadUri, { headers: { "User-Agent": "maindeck/0.1" } });
  if (!res.ok || !res.body) throw new Error(`bulk download: ${res.status}`);

  const pipeline = Readable.fromWeb(res.body as any).pipe(parser()).pipe(streamArray());

  const BATCH = 500;
  let batch: ScryfallCard[] = [];
  let count = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    await prisma.$transaction(
      batch.map((c) =>
        prisma.card.upsert({
          where: { id: c.id },
          create: toCardInput(c),
          update: toCardInput(c),
        }),
      ),
    );
    count += batch.length;
    batch = [];
  };

  for await (const { value } of pipeline) {
    batch.push(value as ScryfallCard);
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  return { count };
}
```

## Pitfalls (do not "simplify" away)

1. **Never `await res.json()` on the bulk file** — it's ~500MB. Stream-parse with `stream-json`. Add `pnpm add stream-json && pnpm add -D @types/stream-json` when picking this up.
2. **Step return values are persisted as checkpoints.** Return `{ count }`, never the parsed array or the response body.
3. **Prisma cannot be imported into a `"use workflow"` function.** It only exists in `steps.ts` files. The workflow function is sandboxed.
4. **Native `fetch` is unavailable inside `"use workflow"`** for the same reason. Either `import { fetch } from "workflow"` or — cleaner here — keep all HTTP inside `"use step"` functions where Node's native `fetch` works.
5. **Upsert keyed on Scryfall UUID** → naturally idempotent. Safe to re-run.
6. **First-run perf.** Per-row upsert in batches of 500 is correct but slow (~10–20 min wall clock for ~80k cards). If painful, switch the empty-DB path to `prisma.card.createMany({ skipDuplicates: true })` behind an `INITIAL_LOAD=1` env flag — roughly 10x faster.
7. **Scryfall etiquette.** Set a descriptive `User-Agent` (e.g. `maindeck/0.1`). They rate-limit politely; we only hit them twice per ingest.

## Open questions to resolve when implementing

1. **Step duration cap.** A single `downloadAndUpsertAll` step may run 5–10 minutes. Unknown whether Workflow DevKit imposes a per-step timeout. Check `node_modules/workflow/docs/foundations/workflows-and-steps.mdx` first. **Plan B if capped:** split into `downloadToTempFile` returning a path, then `parseAndUpsertChunk(path, offset, limit)` called in a loop from the orchestrator. Loops in workflow functions are fine; each step call is its own checkpoint.
2. **Turbopack + Prisma.** Next 16 dev defaults to Turbopack. Some Prisma versions need `serverExternalPackages: ["@prisma/client"]` in `nextConfig`. If `pnpm dev` throws a Prisma client load error, add that line **before** passing `nextConfig` to `withWorkflow`.
3. **`stream-json` smoke test.** Pure JS, should work in a step (steps have full Node access), but worth confirming on a small `oracle_cards` run before committing to the full bulk pull.
