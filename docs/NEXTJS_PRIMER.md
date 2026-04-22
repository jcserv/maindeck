# Next.js Primer — what Maindeck taught me

> A cheat-sheet of the Next.js 16 concepts this codebase leans on, each pinned to the file where you can see it in action. Pair with [`ARCHITECTURE.md`](./ARCHITECTURE.md) for system design and [`nextfaster-performance.md`](./nextfaster-performance.md) for the deeper perf techniques.

---

## 1. App Router — file-based routing

Every folder under `app/` is a URL segment. A `page.tsx` makes the segment routable; a `layout.tsx` wraps it and its children. The default rendering mode is **React Server Components (RSC)** — nothing ships to the client unless you opt in.

**Route groups** — a folder wrapped in parens like `(auth)` organizes files without adding a URL segment. Both `app/(auth)/sign-in/` and `app/(ui)/decks/` render under `/sign-in` and `/decks`.

**Dynamic segments** — brackets make a folder a parameter:

```
app/(ui)/deck/[id]/page.tsx        → /deck/:id
app/(ui)/card/[slug]/page.tsx      → /card/:slug
app/api/auth/[...all]/             → catch-all for better-auth
```

See: `app/(auth)/`, `app/(ui)/`, `app/(ui)/deck/[id]/page.tsx`, `app/api/auth/[...all]/`.

---

## 2. Nested layouts

Each segment can define its own `layout.tsx`; React composes them from root to leaf on every navigation without re-rendering the parents. The root layout (`app/layout.tsx`) holds fonts, theme, and analytics; `(ui)/layout.tsx` adds the header and mobile nav for authenticated pages.

```tsx
// app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <ThemeProvider>{children}<SiteFooter /></ThemeProvider>
      </body>
    </html>
  );
}
```

See: `app/layout.tsx`, `app/(ui)/layout.tsx`, `app/(auth)/layout.tsx`.

---

## 3. Server vs Client Components

RSC is the default. A file becomes a **client component** only when the top of it declares `"use client"` — which is a boundary, not a flag. Everything imported by that file is also sent to the client. Keep `"use client"` at the leaves (interactive forms, context providers, hook-using widgets); let pages, layouts, and data-fetching components stay server-side.

Rule of thumb: if it needs `useState`, `useEffect`, event handlers, or browser APIs — it's a client component. Otherwise, leave it server.

See a server component: `lib/card/queries.ts` → callers in `app/(ui)/card/[slug]/page.tsx`.
See a client component: `app/_components/sign-in-form.tsx` (first line is `"use client"`).

---

## 4. `loading.tsx` and `error.tsx`

Two convention files wrap a segment automatically. `loading.tsx` becomes a Suspense fallback; `error.tsx` becomes an error boundary and **must be a client component** (it needs a `reset` callback).

```tsx
// app/(ui)/decks/loading.tsx
export default function DecksLoading() {
  return (
    <div className="px-4 py-6 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[120px] rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}
```

`app/global-error.tsx` is a special variant that wraps the root `<html>`/`<body>` — used only if the root layout itself throws.

See: `app/(ui)/decks/loading.tsx`, `app/(ui)/error.tsx`, `app/global-error.tsx`.

---

## 5. Suspense boundaries with reserved layout space

Streaming content into a zero-height fallback causes CLS (cumulative layout shift). Every manual `<Suspense>` in this repo pins an explicit pixel height.

```tsx
// app/(ui)/layout.tsx
<Suspense fallback={<div className="h-14 border-b" aria-hidden />}>
  <Header />
</Suspense>
{/* Suspense isolates usePathname() from static prerender */}
<Suspense fallback={<div className="h-[56px] md:hidden" aria-hidden />}>
  <MobileNav />
</Suspense>
```

The second Suspense exists for a subtler reason: `usePathname()` inside `MobileNav` would otherwise force the whole layout to become dynamic. Wrapping it in Suspense lets the rest of the layout stay static.

See: `app/(ui)/layout.tsx`, and the convention in `AGENTS.md`.

---

## 6. Data fetching in RSC

Server components are `async`. You call the database directly — no `fetch('/api/...')`, no SWR, no React Query. The client never sees the query; it sees the rendered output.

```ts
// lib/card/queries.ts
export async function getCardBySlug(slug: string): Promise<CardDetail | null> {
  "use cache";
  cacheLife("weeks");
  cacheTag(`card:${slug}`);

  return getOrSet(`card:${slug}`, CARD_TTL_SECONDS, async () => {
    const card = await prisma.card.findFirst({ /* ... */ });
    return card && toCardDetail(card);
  });
}
```

The Prisma client is a module singleton so serverless invocations don't leak pool connections:

```ts
// lib/db.ts
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
```

See: `lib/card/queries.ts`, `lib/deck/queries.ts`, `lib/db.ts`.

---

## 7. `'use cache'` — Cache Components in place of `unstable_cache`

Enabled via `cacheComponents: true` in `next.config.ts`. The `"use cache"` directive at the top of a function caches its return value keyed on its arguments — similar to `unstable_cache`, but first-class and composable. Do **not** combine it with `export const revalidate` or `export const dynamic`; those are the old model.

```ts
// lib/card/queries.ts
export async function getCardBySlug(slug: string) {
  "use cache";
  cacheLife("weeks");
  cacheTag(`card:${slug}`);
  // ...
}
```

See: every function in `lib/card/queries.ts` and `lib/deck/queries.ts`.

---

## 8. `cacheLife()` — freshness profiles

`cacheLife(profile)` declares how long an entry is considered fresh. Maindeck uses two built-in profiles:

- `"weeks"` — card data. Cards are immutable once ingested from Scryfall.
- `"minutes"` — deck lists and public-deck feeds. Mutation-heavy, small staleness tolerance.

```ts
// lib/card/queries.ts
cacheLife("weeks");

// lib/deck/queries.ts
cacheLife("minutes");
```

See: `lib/card/queries.ts:53`, `lib/deck/queries.ts:72`.

---

## 9. `cacheTag()` — granular invalidation

A cache entry can carry multiple tags; any tag can invalidate the entry later. Use generic tags for list queries and specific tags for single-record queries.

```ts
// Specific
cacheTag(`card:${slug}`);
cacheTag(`deck:${id}`);

// Generic
cacheTag("deck-list");
cacheTag("decks:public");

// Composite — user-scoped
cacheTag(`decks:user:${userId}`);
```

See: `lib/card/queries.ts`, `lib/deck/queries.ts`.

---

## 10. Server Actions — mutations without API routes

A function that starts with `"use server"` can be called directly from a client component; Next.js turns the call into a POST to the server and returns the result. No `/api/createDeck` route, no `fetch`, no JSON boilerplate.

```ts
// lib/deck/actions.ts
"use server";

export const createDeck = withActionLogging(
  "deck.create",
  async (formData: FormData): Promise<string> => {
    const session = await requireSession();
    const input = parseDeckForm(createDeckSchema, formData, [ /* ... */ ]);
    const deck = await prisma.deck.create({ data: { /* ... */ } });

    updateTag("deck-list");
    updateTag("decks:public");
    await invalidate(`decks:user:${session.userId}:minimal`, /* ... */);
    return deck.id;
  },
);
```

See: `lib/deck/actions.ts`.

---

## 11. `updateTag` vs `revalidateTag`

Both invalidate tagged cache entries, but at different times:

- `updateTag(tag)` — **same request**. By the time this action's response is sent, anything tagged with `tag` has already been evicted, so the next render in the same navigation sees fresh data.
- `revalidateTag(tag)` — **background**. Evicts in the background; the current response may still return stale data.

Maindeck reaches for `updateTag` inside mutations because the user expects to see their new deck immediately after clicking Create. The Redis layer is invalidated in parallel via the `invalidate()` helper to keep the two caches in lockstep.

```ts
// lib/deck/invalidation.ts
export function deckInvalidationKeys(deckId: string, userId: string): string[] {
  return [
    `deck:${deckId}`,
    `deck:${deckId}:revisions`,
    `decks:user:${userId}:minimal`,
    `decks:user:${userId}:strip`,
    `decks:user:${userId}:preview`,
  ];
}
```

See: `lib/deck/actions.ts`, `lib/deck/invalidation.ts`.

---

## 12. Forms with `useActionState` (React 19)

`useActionState` wires a form to a server action and returns `[state, formAction, isPending]` in one shot. No `useFormStatus`, no manual loading flag.

```tsx
// app/(ui)/deck/new/_components/create-deck-form.tsx
const [state, formAction, isPending] = useActionState<FormState, FormData>(
  createDeckAction,
  null,
);

return (
  <form action={formAction}>
    {state?.error && <FormError>{state.error}</FormError>}
    {/* ...inputs... */}
    <Button type="submit" disabled={isPending}>
      {isPending ? "Creating..." : "Create Deck"}
    </Button>
  </form>
);
```

The wrapping `createDeckAction` catches errors and shapes them into the form's state object; success triggers a `router.push` in a `useEffect`.

See: `app/(ui)/deck/new/_components/create-deck-form.tsx`, `app/_components/sign-in-form.tsx`.

---

## 13. `next/image` + remote patterns

`next/image` resizes, format-converts, and long-caches images through a server-side optimizer. Any remote host has to be allow-listed in `next.config.ts`; Scryfall CDN is the only one Maindeck uses.

```ts
// next.config.ts
images: {
  minimumCacheTTL: 31536000,
  qualities: [65, 75, 80],
  remotePatterns: [{ protocol: "https", hostname: "cards.scryfall.io" }],
},
```

See: `next.config.ts`.

---

## 14. `next/font` — self-hosted, zero layout shift

`next/font/google` downloads the font at build time and self-hosts it with the rest of the app. You get a CSS variable you can wire into Tailwind without a FOUT.

```tsx
// app/layout.tsx
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

<html className={`${geistSans.variable} ${geistMono.variable}`}>
```

See: `app/layout.tsx`.

---

## 15. Metadata API

Static metadata is exported from a page or layout as a `Metadata` object. For dynamic titles (e.g. `/deck/[id]`), use `generateMetadata` instead — Maindeck hasn't needed it yet.

```tsx
// app/layout.tsx
export const metadata: Metadata = {
  title: "maindeck",
  description: "Magic: The Gathering deckbuilding and card discovery.",
};
```

See: `app/layout.tsx`.

---

## 16. Custom `<Link>` wrapper

**The one rule:** always import `<Link>` from `app/_components/link.tsx`, never from `next/link` directly. The wrapper disables Next's default prefetch and runs three cheap optimizations instead:

1. **`onMouseDown` navigation** — fire `router.push` on mousedown, not click (saves ~100ms).
2. **Hover prefetch** — `router.prefetch` + image warmup on `onMouseEnter`.
3. **Viewport prefetch** — `IntersectionObserver` triggers prefetch when a link scrolls into view, debounced 300ms.

```tsx
// app/_components/link.tsx (abridged)
onMouseDown={(e) => {
  if (isSameOrigin(hrefStr) && isPlainLeftClick(e)) {
    e.preventDefault();
    router.push(hrefStr);
  }
}}
onMouseEnter={() => {
  router.prefetch(hrefStr);
  const images = imageCache.get(hrefStr) ?? [];
  for (const image of images) prefetchImage(image);
}}
```

The image warmup uses a per-route manifest fetched from `/api/prefetch-images/:path`, cached in a module-level `Map`.

See: `app/_components/link.tsx`, `app/_components/prefetch-image.ts`, `nextfaster-performance.md` for the full walkthrough.

---

## 17. `next.config.ts` flags worth knowing

```ts
// next.config.ts
const nextConfig: NextConfig = {
  cacheComponents: true,     // enables 'use cache' / cacheLife / cacheTag
  reactCompiler: true,       // automatic memoization — no useMemo/useCallback needed
  experimental: {
    inlineCss: true,         // inline critical CSS, faster first paint on cross-route nav
  },
  images: { /* ... */ },
};
```

- **`cacheComponents`** is the big one. It's what makes sections 7–11 work.
- **`reactCompiler`** means you write components without `useMemo` / `useCallback` / `React.memo`. The compiler adds memoization where it's safe. Manual memoization is *removed*, not added.
- **`inlineCss`** inlines the critical path CSS into the HTML response, shaving a round-trip off cross-route navigations.

See: `next.config.ts`.

---

## 18. API routes (used sparingly)

API routes under `app/api/` still exist, but only for endpoints that a client-side caller has to hit directly:

- `app/api/auth/[...all]/` — better-auth catch-all (external contract).
- `app/api/cards/search/` — typeahead search, called from a client-side `fetch` in the search input.
- `app/api/prefetch-images/` — image manifest consumed by the custom Link wrapper.
- `app/api/decks/mine/`, `app/api/ingest/` — internal JSON endpoints for specific background jobs.

**Mutations never live here.** Deck creates/updates/deletes are Server Actions (`lib/deck/actions.ts`), not API routes.

See: `app/api/`.

---

## 19. Conventions unique to this repo

Copy-pasted from `AGENTS.md` so the primer stands alone:

1. **Always import `<Link>` from `app/_components/link.tsx`.** Never `next/link` outside that file.
2. **Suspense fallbacks must reserve layout space** with explicit pixel heights (e.g. `h-[240px]`). Zero-height fallbacks cause CLS.
3. **Mutations are Server Actions, not API routes.** Use `updateTag` for same-request invalidation, `revalidateTag` for background.
4. **Cache Components is enabled.** Don't use `export const revalidate`, `export const dynamic`, or `unstable_cache` — use `'use cache'` + `cacheLife()` + `cacheTag()` instead.

---

## Where to look next

- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — system design, data model, bigger architectural decisions.
- [`docs/nextfaster-performance.md`](./nextfaster-performance.md) — the deep-dive on Link prefetch and other perf techniques.
- `node_modules/next/dist/docs/` — Next 16 ships authoritative docs in the package itself. When in doubt, read those before trusting anything older online.
