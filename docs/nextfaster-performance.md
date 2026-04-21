# NextFaster Performance Techniques

A reference of every performance technique used in [ethanniser/NextFaster](https://github.com/ethanniser/NextFaster), grouped by what they actually do. The point of this doc is to be a checklist you can apply to any Next.js 15 project.

---

## 1. Make navigation fire before the click

NextFaster's biggest win is a custom `<Link>` (`src/components/ui/link.tsx`) that replaces `next/link`'s default behavior. It disables Next's built-in `prefetch` and orchestrates its own.

### 1a. `onMouseDown` navigation

```tsx
onMouseDown={(e) => {
  if (sameOrigin && plainLeftClick) {
    e.preventDefault();
    router.push(String(props.href));
  }
}}
```

Browsers wait ~80–150ms between `mousedown` and `click` while they decide if it's a drag, double-click, etc. NextFaster doesn't wait — it pulls the trigger on `mousedown`. This alone shaves a perceptible chunk off every navigation.

Edge cases handled: it bails out for middle-click, modifier keys (open-in-new-tab), and cross-origin links so default browser behavior still works.

### 1b. `onMouseEnter` warm-up

```tsx
onMouseEnter={() => {
  router.prefetch(String(props.href));
  const images = imageCache.get(String(props.href)) || [];
  for (const image of images) prefetchImage(image);
}}
```

On hover, re-prefetch the route _and_ eagerly create `new Image()` objects for every image that the destination page is known to render. By the time the user clicks, the destination's images are already in the browser HTTP cache.

### 1c. Viewport prefetch via `IntersectionObserver`

```tsx
const observer = new IntersectionObserver(
  (entries) => {
    if (entries[0].isIntersecting) {
      prefetchTimeout = setTimeout(async () => {
        router.prefetch(String(props.href));
        // ...also fetch the destination's image manifest
      }, 300);
    } else if (prefetchTimeout) {
      clearTimeout(prefetchTimeout);
    }
  },
  { rootMargin: "0px", threshold: 0.1 },
);
```

When a link becomes ≥10% visible for 300ms, prefetch the RSC payload and fetch the destination's image manifest. The 300ms debounce avoids prefetching links the user is just scrolling past. Cancel if the link leaves the viewport before the timer fires.

### 1d. Module-level caches

```tsx
const seen = new Set<string>(); // images already warmed
const imageCache = new Map<string, PrefetchImage[]>(); // per-route image manifests
```

Plain JS module state, no React. Cheap dedupe across the whole session — a link prefetched once stays prefetched.

---

## 2. Pre-resolve images for the destination page

To know which images to warm on hover, NextFaster needs the list of images on the destination page _before_ navigating. It does this with a tiny static API route.

### 2a. The `/api/prefetch-images/[...rest]` endpoint

```ts
// src/app/api/prefetch-images/[...rest]/route.ts
export const dynamic = "force-static";

export async function GET(_, { params }) {
  const url = `${schema}://${host}/${params.rest.join("/")}`;
  const body = await fetch(url).then((r) => r.text());
  const { document } = parseHTML(body);
  const images = Array.from(document.querySelectorAll("main img")).map(
    (img) => ({
      srcset: img.getAttribute("srcset"),
      sizes: img.getAttribute("sizes"),
      src: img.getAttribute("src"),
      alt: img.getAttribute("alt"),
      loading: img.getAttribute("loading"),
    }),
  );
  return NextResponse.json(
    { images },
    {
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
```

Key properties:

- **`force-static`** — every unique URL becomes a permanently cached edge response. The HTML parsing happens once per route and is then free forever.
- **Server-side fetch + `linkedom`** — `linkedom` is a tiny, fast HTML parser; no headless browser needed.
- **Only `<main> img`** — header/footer/chrome images are excluded.
- **Returns `srcset`, `sizes`, `src`, `loading`, `alt`** — everything the client needs to construct a matching `<img>` element that hits the same Vercel image-optimization cache key.

### 2b. Constructing prefetch images on the client

```ts
function prefetchImage(image: PrefetchImage) {
  if (image.loading === "lazy" || seen.has(image.srcset)) return;
  const img = new Image();
  img.decoding = "async";
  img.fetchPriority = "low";
  img.sizes = image.sizes; // order matters: sizes → srcset → src
  seen.add(image.srcset);
  img.srcset = image.srcset;
  img.src = image.src;
  img.alt = image.alt;
}
```

Notes:

- **`decoding="async"`** — don't block the main thread decoding warmup images.
- **`fetchPriority="low"`** — don't compete with critical resources (current page's LCP, scripts).
- **Skip `loading="lazy"` images** — no point warming images the destination page itself doesn't want yet.
- **Property order matters**: `sizes` must be set before `srcset`, and `srcset` before `src`, otherwise the browser picks the wrong source.

---

## 3. Prefetch the _next page's_ hero image from the _current page's_ card

`src/components/ui/product-card.tsx` does something even sneakier: while the small 48×48 thumbnail is rendered, it constructs an off-screen `<img>` for the 256×256 hero image of the product detail page.

```tsx
const prefetchProps = getImageProps({
  height: 256,
  width: 256,
  quality: 80,
  src: imageUrl ?? "/placeholder.svg",
  alt: `A small picture of ${product.name}`,
});

useEffect(() => {
  const iprops = prefetchProps.props;
  const img = new Image();
  img.fetchPriority = "low";
  img.decoding = "async";
  if (iprops.sizes) img.sizes = iprops.sizes;
  if (iprops.srcSet) img.srcset = iprops.srcSet;
  if (iprops.src) img.src = iprops.src;
}, [prefetchProps]);
```

Two important details:

- **`getImageProps` from `next/image`** — gives you the same `srcSet`/`sizes`/`src` that `<Image>` would generate, so the prefetched image has the _exact_ URL the destination's `<Image>` will request. Cache hit guaranteed.
- **Different quality per usage** — thumbnails are `quality: 65`, hero images are `quality: 80`. Per-image tuning, not a global default.

Combined with the `<Link>` warmup, by the time you click a product card the product page's RSC payload, all `<main>` images, _and_ the LCP hero are already cached.

---

## 4. Render the page shell instantly with PPR

`next.config.mjs`:

```js
experimental: {
  ppr: true,
  inlineCss: true,
},
reactCompiler: true,
images: { minimumCacheTTL: 31536000 },
```

### 4a. Partial Prerendering (`ppr: true`)

Every page is split into a static shell (precomputed at build time, served from the edge) and dynamic holes wrapped in `<Suspense>`. The shell flushes immediately as HTML; the dynamic parts stream in.

In `src/app/layout.tsx`:

```tsx
<Suspense fallback={<AuthSkeleton />}>
  <AuthServer />
</Suspense>
// ...
<Suspense>
  <Cart />
</Suspense>
```

Auth state and cart are dynamic, but they don't block the shell. Result: TTFB is essentially CDN latency, even though the page has personalized data.

### 4b. Inline CSS (`inlineCss: true`)

CSS is injected directly into the HTML document instead of being a render-blocking `<link rel="stylesheet">`. Eliminates a request, eliminates a round-trip, eliminates flash-of-unstyled-content. Best for sites with small per-route CSS payloads (Tailwind compiles to one).

### 4c. React Compiler (`reactCompiler: true`)

Auto-memoizes components, hooks, and JSX so that re-renders only touch changed nodes. Removes the need for manual `useMemo` / `useCallback` / `React.memo`, and tends to cut client CPU significantly on interactive pages.

### 4d. Image cache TTL

```js
images: {
  minimumCacheTTL: 31536000;
} // 1 year
```

Sets the minimum CDN TTL for optimized images to one year. Combined with content-hashed URLs, this means images are effectively cached forever after first generation.

---

## 5. Make the rest of the data layer cache-friendly

### 5a. Layout-level ISR

```tsx
// src/app/layout.tsx
export const revalidate = 86400; // one day
```

Static segments are revalidated daily. Most page renders are CDN cache hits, not server invocations.

### 5b. Server Actions for all mutations

No client-side `fetch` glue, no `useState`/`useEffect` loading dance, no API route boilerplate. Mutations stream their result back into the RSC payload, so the client doesn't have to reconcile two sources of truth.

### 5c. Pre-generate the catalog

NextFaster's 1M+ products and images are AI-generated _once_ (gpt-4o-mini batch + stable-diffusion v1.5) and stored in Postgres + Vercel Blob. The DB is barely on the hot path — almost every page is a static shell + cached image.

The takeaway isn't "use AI", it's: **whenever your dataset can be precomputed, precompute it.** Static beats dynamic every time.

---

## 6. Eliminate third-party network hops

```js
// next.config.mjs rewrites
{ source: "/insights/vitals.js",     destination: "https://cdn.vercel-insights.com/v1/speed-insights/script.js" },
{ source: "/insights/events.js",     destination: "https://cdn.vercel-insights.com/v1/script.js" },
{ source: "/hfi/events/:slug*",      destination: "https://vitals.vercel-insights.com/v1/:slug*?dsn=..." },
{ source: "/hfi/vitals",             destination: "https://vitals.vercel-insights.com/v2/vitals?dsn=..." },
```

Analytics scripts and beacons are proxied through same-origin paths:

- **No extra DNS lookup, TLS handshake, or TCP connection** for the analytics CDN — reuses the existing connection to the site.
- **Bypasses ad blockers**, which usually filter on third-party hostnames.
- **Avoids a render-blocking script from another origin.**

The Analytics component is wired up with the proxied paths:

```tsx
<Analytics scriptSrc="/insights/events.js" endpoint="/hfi/events" />
```

---

## 7. Fonts, CLS, and the small stuff

- **`next/font` with Geist** — fonts are self-hosted, subset, and loaded with `font-display: swap`. Zero CLS, zero FOIT, no third-party hostname.
- **`<Suspense fallback={...}>`** wrappers reserve layout space (e.g. the auth button skeleton has `<div className="h-[20px]" />`) so streaming dynamic content doesn't shift the page.
- **Fixed header/footer** with explicit heights — no jank when content streams in below.

---

## Composite effect

Each technique is small. Stacked, they collapse the perceived latency of navigation to near zero:

| Phase                         | What's already done by the time it happens                                           |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Link enters viewport (>300ms) | RSC payload + image manifest fetched                                                 |
| Hover                         | Hero images warmed in browser cache                                                  |
| `mousedown`                   | `router.push()` fires — navigation already starting                                  |
| Render                        | Static shell streamed from edge, CSS inlined, images cached, dynamic holes streaming |

The architectural choices (PPR, ISR, Server Actions, pre-generated catalog) make most requests cheap on the server side. The custom `<Link>` and image-prefetch pipeline make the _client side_ feel like the next page is already loaded — because it almost is.

---

## Checklist for your own project

- [ ] Replace `next/link` with a custom `<Link>` that fires `router.push` on `onMouseDown`.
- [ ] Add `IntersectionObserver`-based prefetch with a 300ms debounce.
- [ ] Build a `force-static` API route that returns the `<main> img` manifest for a given path.
- [ ] In hot card components, use `getImageProps` to warm the _next page's_ hero image while showing the current thumbnail.
- [ ] Set `experimental.ppr: true` and wrap dynamic UI in `<Suspense>`.
- [ ] Set `experimental.inlineCss: true`.
- [ ] Set `reactCompiler: true`.
- [ ] Set `images.minimumCacheTTL` to one year.
- [ ] Use `export const revalidate` at the layout/page level for ISR.
- [ ] Use Server Actions instead of API routes for mutations.
- [ ] Proxy analytics/observability scripts through same-origin rewrites.
- [ ] Self-host fonts via `next/font` and reserve layout space with skeletons.
- [ ] Precompute as much of your dataset as possible.
