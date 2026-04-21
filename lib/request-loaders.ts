import { cache } from "react";
import { createLoaders } from "@/lib/loaders";

// React.cache() memoizes per RSC request — safe under serverless warm-reuse
// because the memoization key lives inside the request's React tree, not on a
// module-level singleton. Never swap this for a top-level `const loaders = ...`.
export const getRequestLoaders = cache(() => createLoaders());
