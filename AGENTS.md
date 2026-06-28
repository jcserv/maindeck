<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Conventions

- **Always import the wrapper `<Link>` from `app/_components/link.tsx`. Never import `next/link` directly outside that file.** The wrapper handles `onMouseDown` navigation, hover prefetch, and per-route image manifest warmup. Bypassing it loses the perf wins.
- **Suspense fallbacks must reserve layout space** with explicit pixel heights (e.g. `h-[20px]`). Streaming content into a zero-height fallback causes CLS.
- **Mutations are Server Actions, not API routes.** Use `updateTag` for same-request invalidation, `revalidateTag` for background.
- **Cache Components is enabled.** Don't use `export const revalidate`, `export const dynamic`, or `unstable_cache` — use `'use cache'` + `cacheLife()` + `cacheTag()` instead. See `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md`.
- **The card browser (`app/_components/builder/card-browser/`) has pluggable data sources** selected via `source-picker.tsx` (`scryfall` = local DB browse; `edhrec` = commander suggestions). Each source feeds the shared `BrowserState` from its own hook, but every result is a `CardSearchResult` so the add-to-deck flow is source-agnostic. External sources must be fetched server-side behind a rate-limited route with a timeout (see `lib/edhrec/recommendations.ts` + `app/api/cards/edhrec/route.ts`) and map names→cards via `findCardsByNames` — never block the UI on the upstream call.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) — defaults, no remap. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
