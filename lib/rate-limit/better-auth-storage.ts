import { Redis } from "@upstash/redis";
import { logWarn } from "@/lib/telemetry";

interface BetterAuthRateLimitRecord {
  key: string;
  count: number;
  lastRequest: number;
}

interface BetterAuthRateLimitStorage {
  get: (key: string) => Promise<BetterAuthRateLimitRecord | null | undefined>;
  set: (
    key: string,
    value: BetterAuthRateLimitRecord,
    update?: boolean | undefined,
  ) => Promise<void>;
}

// Better-auth doesn't issue deletes; without a TTL, every keyed bucket lives
// forever. 1h covers all current customRules windows (max 60s) with headroom
// — stale entries just expire after the window has long since reset.
const KEY_TTL_SECONDS = 60 * 60;
const KEY_PREFIX = "betterauth:ratelimit:";

let cachedClient: Redis | null = null;

function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_KV_REST_API_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

export function isUpstashConfigured(): boolean {
  return Boolean(process.env.UPSTASH_KV_REST_API_URL && process.env.UPSTASH_KV_REST_API_TOKEN);
}

/**
 * Better-auth rate-limit storage backed by Upstash Redis.
 *
 * Fails open: get() returns null and set() swallows on Redis failure so an
 * Upstash outage doesn't 5xx every auth route. Better-auth treats a missing
 * key as a fresh window, which is the correct degraded behaviour.
 */
export const betterAuthRateLimitStorage: BetterAuthRateLimitStorage = {
  async get(key) {
    const client = getClient();
    if (!client) return null;
    try {
      return await client.get<BetterAuthRateLimitRecord>(`${KEY_PREFIX}${key}`);
    } catch (err) {
      logWarn(
        { source: "rate-limit.better-auth", key },
        "rate-limit storage get failed, treating as fresh window",
        err,
      );
      return null;
    }
  },

  async set(key, value) {
    const client = getClient();
    if (!client) return;
    try {
      await client.set(`${KEY_PREFIX}${key}`, value, { ex: KEY_TTL_SECONDS });
    } catch (err) {
      logWarn(
        { source: "rate-limit.better-auth", key },
        "rate-limit storage set failed, counter will reset",
        err,
      );
    }
  },
};
