<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Conventions

- **Always import the wrapper `<Link>` from `app/_components/link.tsx`. Never import `next/link` directly outside that file.** The wrapper handles `onMouseDown` navigation, hover prefetch, and per-route image manifest warmup. Bypassing it loses the perf wins.
- **Suspense fallbacks must reserve layout space** with explicit pixel heights (e.g. `h-[20px]`). Streaming content into a zero-height fallback causes CLS.
- **Mutations are Server Actions, not API routes.** Use `updateTag` for same-request invalidation, `revalidateTag` for background.
- **Cache Components is enabled.** Don't use `export const revalidate`, `export const dynamic`, or `unstable_cache` — use `'use cache'` + `cacheLife()` + `cacheTag()` instead. See `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md`.
