import type { Redis as IORedis, RedisOptions } from "ioredis";
import { getEnv } from "@/lib/env";

export type RedisClient = Pick<IORedis, "get" | "set" | "del" | "incr" | "ping">;

const globalForRedis = globalThis as unknown as { redis?: RedisClient };

// ioredis v5 still calls the legacy `url.parse()` internally when given a
// connection string (see node_modules/ioredis/built/utils/index.js), which
// triggers a Node DEP0169 deprecation warning. Parse the URL ourselves with
// the WHATWG URL API and pass structured options instead.
function optionsFromUrl(redisUrl: string): RedisOptions {
  const u = new URL(redisUrl);
  const options: RedisOptions = {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
  };
  if (u.username) options.username = decodeURIComponent(u.username);
  if (u.password) options.password = decodeURIComponent(u.password);
  if (u.pathname && u.pathname.length > 1) {
    const db = Number(u.pathname.slice(1));
    if (Number.isFinite(db)) options.db = db;
  }
  if (u.protocol === "rediss:") options.tls = {};
  return options;
}

async function createClient(): Promise<RedisClient | null> {
  const env = getEnv();
  if (!env.REDIS_URL) return null;
  const { default: IORedisCtor } = await import("ioredis");
  return new IORedisCtor({
    ...optionsFromUrl(env.REDIS_URL),
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
}

let _client: RedisClient | null | undefined;

export async function getRedis(): Promise<RedisClient | null> {
  if (_client !== undefined) return _client;
  if (process.env.NODE_ENV !== "production" && globalForRedis.redis) {
    _client = globalForRedis.redis;
    return _client;
  }
  _client = await createClient();
  if (process.env.NODE_ENV !== "production" && _client) {
    globalForRedis.redis = _client;
  }
  return _client;
}

/** Test-only: resets the cached client so fresh env stubs take effect. */
export function __resetRedisForTests(): void {
  _client = undefined;
  delete globalForRedis.redis;
}
