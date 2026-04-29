# Performance Best Practices

A working reference of the techniques this app relies on to keep navigation and rendering fast. Most of the underlying ideas come from [ethanniser/NextFaster](https://github.com/ethanniser/NextFaster) (see `docs/nextfaster-performance.md`); the rest are learnings from our own perf work. Read this when adding a new page, route handler, or interactive component.

The North Star: **the next page should already be loaded by the time the user clicks.** Every guideline here exists in service of that.

---

## 1. Navigate before the click

All in-app navigation must go through the wrapper at `app/_components/link.tsx`. **Never import `next/link` directly** outside that file.

It does four things `next/link` doesn't:

1. **`onMouseDown` `router.push`** — fires ~80–150ms earlier than `onClick`. Bails out for middle-click, modifier keys, and cross-origin links so default browser behavior still works.
2. **`onMouseEnter` warmup** — re-prefetches the route and eagerly creates `new Image()` objects for every image the destination is known to render.
3. **Viewport prefetch** — links ≥10% visible for 300ms get the RSC payload + image manifest. Cancelled if the link scrolls off before the timer fires.
4. **Shared `IntersectionObserver`** — one module-level observer dispatches to a per-element callback map. A `/decks` listing with 60 cards uses one observer, not sixty.

### Bound your client-side caches

Module-level caches are fine; **unbounded** module-level caches are not. `imageCache` and `seen` in `app/_components/prefetch-image.ts` are 100-entry LRUs. Any new long-lived dedupe map you add to a SPA session should be bounded the same way.

### Prefer inline manifests over the prefetch endpoint

`/api/prefetch-images/[...rest]` exists for routes whose images we can't predict ahead of time. When the parent already knows the destination's images (e.g. `deck-card-preview.tsx` rendering deck cards), serialize them as a `prefetchManifest` prop on `<Link>`. This:

- Eliminates 20+ sequential HTTP round-trips per listing page.
- Avoids the auth-leak risk of a path-keyed cache shared across signed-in/out variants.

### Pre-warm the next page's hero image

In hot card components (see `card-tile.tsx`), use `getImageProps` from `next/image` to construct an off-screen `<Image>` for the destination's hero **while showing the current thumbnail**. Critical details:

- `fetchPriority="low"` and `decoding="async"` so warmup never competes with the current page's LCP.
- Skip images with `loading="lazy"` — no point warming what the destination doesn't want yet.
- Property order matters: `sizes` → `srcSet` → `src`. Wrong order makes the browser pick the wrong source and you miss the cache.
- Per-usage quality: thumbnails `quality: 65`, heroes `quality: 80`. Don't pick a global default.

---

## 2. Server rendering: Cache Components, not ad-hoc caches

`next.config.ts` has `cacheComponents: true`. This replaces PPR + `unstable_cache` + per-segment `revalidate`. The rules:

- **Don't use `export const revalidate`, `export const dynamic`, or `unstable_cache`.** Use `'use cache'` + `cacheLife()` + `cacheTag()` instead. (See `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md`.)
- **Wrap dynamic UI in `<Suspense>`** so the static shell flushes immediately and dynamic holes stream in.
- **Mutations are Server Actions, not API routes.** Use `updateTag(...)` for same-request invalidation, `revalidateTag(...)` for background.

We dropped a Redis cache layer in favor of this model (commit `2da6dee`). Card searches use `'use cache' + cacheTag("card-search")` and the ingest worker calls `revalidateTag("card-search")` instead of bumping a Redis version key. **Don't reach for Redis (or any external KV) for read-through caching of route data** — Cache Components fronts hot reads via `'use cache'` boundaries on route segments and is the source of truth.

The image-manifest route (`app/api/prefetch-images/[...rest]/route.ts`) demonstrates the pattern for an effectively-static endpoint: an inner `'use cache'` function with `cacheLife("max")` wraps the HTML fetch + parse, and the route handler is a thin shell.

---

## 3. Suspense fallbacks must reserve real layout space

Streaming dynamic content into a zero-height fallback **causes CLS**. Every `<Suspense fallback>` should match the rendered content's pixel footprint:

```tsx
<Suspense fallback={<div className="h-[240px]" aria-hidden />}>
  <DeckTokens />
</Suspense>
```

The `DeckTokens` row is 240px when populated; the fallback reserves 240px. If you don't know the exact height, use a skeleton with explicit `h-[Npx]` blocks (see `app/(ui)/decks/loading.tsx`). A `h-5` placeholder is almost always wrong.

This applies to every streaming boundary: auth chip in the header, recent-deck strip, search results, hero card fan, etc.

---

## 4. Bundle splitting by interactivity, not by route

Next.js code-splits per route by default. That isn't always enough — a single component imported by everyone (owner _and_ viewer) drags its whole import graph onto every visitor's first paint. Two patterns we use:

### Split by role

Editing chrome (DnD, sortable wiring, mutation menus) is owner-only, but a naive implementation pulls `@dnd-kit/*` into every viewer's bundle. The fix:

- Two siblings per component: a `viewer` (zero `@dnd-kit`) and a `-dnd` / `-sortable` variant.
- A wrapper (`deck-builder-owner.tsx`) imports the dnd variants and is itself loaded with `next/dynamic({ ssr: false })` gated on `isOwner`.
- Non-owners render the plain viewers. `@dnd-kit` is reachable only through the owner-gated dynamic chunk.

When you add a new heavy interactive feature, ask: **does every visitor need this?** If not, split it the same way.

### Split by intent

For interactive UI that is _present_ for everyone but rarely _used_ on first paint (header search, command palettes, complex dialogs), wrap a deferred client shell that lazy-imports the real component on `focus` / `mousedown` / global keybind. See `app/_components/header-search-bar-deferred.tsx`. The fallback is a static input that looks identical; the ~150 KiB interactive bar loads only on intent.

### Defer expensive computation to on-demand

Don't compute on render what the user might never see. Deck export serialization (`toPlainText`, `toArena`, `toMaindeckJson`) ran on every deck page render even though most users never open the export dialog. We moved it into a server action that runs on first dialog open (`lib/deck-io/export-action.ts`). Apply the same lens to: PDF generation, CSV builds, "share" previews, anything serializing >1KB of derived state.

---

### Skip work for anonymous users on the LCP critical path

`SessionShell` short-circuits to `LandingView` when no `better-auth` cookie is present, eliminating a DB roundtrip from the LCP critical path for anonymous traffic on `/`. Whenever you're tempted to "just check the session" on a public page, check the cookie first — the session DB call only matters if the cookie even exists.

---

## 6. Images and assets

`next.config.ts` settings, all required:

```ts
images: {
  formats: ["image/avif", "image/webp"],
  minimumCacheTTL: 31536000,           // 1 year
  qualities: [65, 75, 80],
},
experimental: {
  inlineCss: true,
  optimizePackageImports: [
    "lucide-react",
    "@base-ui/react",
    "@dnd-kit/core",
    "@dnd-kit/sortable",
    "@dnd-kit/utilities",
  ],
},
reactCompiler: true,
```

- **AVIF + WebP** — both formats served, browser picks. AVIF is ~30% smaller than WebP for our card art.
- **`minimumCacheTTL: 31536000`** — combined with content-hashed URLs, optimized images cache effectively forever after first generation.
- **`qualities: [65, 75, 80]`** — explicit allowlist. `quality` values outside this list throw at build time; use 65 for thumbnails, 80 for heroes.
- **`inlineCss: true`** — CSS inlined into the HTML document. Eliminates a render-blocking `<link rel="stylesheet">`.
- **`optimizePackageImports`** — barrel-file packages get tree-shaken at the import site. When you add a new package whose `index.ts` re-exports a wide surface, add it here.
- **`reactCompiler: true`** — auto-memoization. **Don't manually `useMemo` / `useCallback` / `React.memo`** unless the compiler bails out (you can see this in the build output).

### Use `next/image` for all bitmap content

Including thumbnails. Even small images benefit from format negotiation, responsive `srcset`, and the optimization cache. Raw `<img>` tags only for SVGs and content-controlled inline pixels.

---

## 7. Third-party hops, fonts, and chrome

- **Proxy analytics through same-origin rewrites** (`next.config.ts → rewrites`). `/insights/vitals.js`, `/insights/events.js`, `/hfi/*` all proxy to `vercel-insights.com`. No extra DNS / TLS handshake, bypasses ad blockers, no third-party render-blocking script.
- **Fonts via `next/font`** — Geist Sans + Mono are self-hosted, subset, and loaded with `font-display: swap`. Zero CLS, zero FOIT, no third-party hostname. Don't `<link>` to Google Fonts directly.
- **Fixed header / footer with explicit heights** — when content streams in below, the chrome doesn't shift.

---

## 8. Mental checklist when adding a feature

When the answer to any of these is "no" or "I don't know," stop and fix it.

- [ ] Did I import `<Link>` from `app/_components/link.tsx`?
- [ ] If the destination has predictable images, am I passing a `prefetchManifest`?
- [ ] If this is a hot card-style component on a listing, am I pre-warming the next page's hero with `getImageProps`?
- [ ] Are my `<Suspense fallback>` heights matching the rendered content (no CLS)?
- [ ] Am I using `'use cache'` + `cacheLife()` + `cacheTag()` instead of `revalidate` / `unstable_cache`?
- [ ] Are my mutations Server Actions, not API routes? Am I `updateTag`-ing the right tags?
- [ ] If this is an interactive surface only some users see (e.g. owner UI), is it dynamically imported and gated?
- [ ] If this is interactive but rarely-touched-on-first-paint (search, dialog), is the heavy bundle deferred to focus/intent?
- [ ] Are my Prisma queries `select`, not `include`?
- [ ] Are independent awaits in `Promise.all`?
- [ ] If this is a hot page, can I skip server work for anonymous users?
- [ ] Are images using `next/image` with appropriate `quality`?
- [ ] Did I add any new long-lived module-level cache? Did I bound it (LRU)?

---