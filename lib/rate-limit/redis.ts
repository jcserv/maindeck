import { Redis } from "@upstash/redis";
import { logWarn } from "@/lib/telemetry";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

let cachedClient: Redis | null = null;

function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_KV_REST_API_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

/**
 * Fixed-window IP rate limiter backed by Upstash Redis.
 *
 * Fails open: if Redis is unreachable or env is unset, the request is allowed
 * and a warn line is logged. Rate limiting is a defense-in-depth layer; an
 * outage of the limiter must not 5xx the underlying route.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const client = getClient();
  if (!client) {
    return { success: true, limit, remaining: limit, resetSeconds: windowSeconds };
  }

  const windowIndex = Math.floor(Date.now() / 1000 / windowSeconds);
  const bucket = `ratelimit:${key}:${windowIndex}`;

  try {
    const pipeline = client.pipeline();
    pipeline.incr(bucket);
    pipeline.expire(bucket, windowSeconds);
    const [count] = (await pipeline.exec()) as [number, number];

    const resetAt = (windowIndex + 1) * windowSeconds;
    return {
      success: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetSeconds: Math.max(0, resetAt - Math.floor(Date.now() / 1000)),
    };
  } catch (err) {
    logWarn({ source: "rate-limit", key }, "rate limiter unavailable, failing open", err);
    return { success: true, limit, remaining: limit, resetSeconds: windowSeconds };
  }
}
