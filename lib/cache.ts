import { getRedis } from "@/lib/redis";

/**
 * Read-through cache. Returns the cached value if present; otherwise invokes
 * `loader`, writes the result back fire-and-forget, and returns it. Degrades
 * transparently to a direct loader call when Redis is unavailable.
 */
export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const redis = await getRedis();
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached !== null) return JSON.parse(cached) as T;
    } catch {
      // fall through to loader — never let Redis take down the request path
    }
  }

  const value = await loader();

  if (redis && value !== null && value !== undefined) {
    // fire-and-forget: don't block the response on the write
    void redis
      .set(key, JSON.stringify(value), "EX", ttlSeconds)
      .catch(() => {});
  }

  return value;
}

/** Delete-on-write invalidation. No-ops when Redis is absent. */
export async function invalidate(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.del(...keys);
  } catch {
    // swallow — invalidation is best-effort; stale entries expire via TTL
  }
}
