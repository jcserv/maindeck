# Description

<!-- What changed, and the reason behind it. Link the issue. -->

Fixes: #

## Checklist

- [ ] Tests pass (`pnpm test`) and lint is clean
- [ ] New behavior is covered by tests
- [ ] No `revalidate` / `dynamic` / `unstable_cache` — used `'use cache'` + `cacheLife`/`cacheTag`
- [ ] `<Link>` imported from `app/_components/link.tsx`, not `next/link`
- [ ] Suspense fallbacks reserve layout space (explicit heights)

## Screenshots / notes

<!-- bug-fixes: display the before/after. Anything reviewers should know. -->
