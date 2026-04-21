import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "@/lib/env";
import { PrismaClient } from "@/lib/generated/prisma/client";

const env = getEnv();

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaAdapter?: PrismaPg;
};

// Cap pool tightly on Vercel — each serverless instance opens its own pool, and
// they multiply fast under concurrent invocations.
const poolMax = env.DB_POOL_MAX ?? (env.IS_VERCEL ? 3 : 10);

const adapter =
  globalForPrisma.prismaAdapter ??
  new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: poolMax,
    idleTimeoutMillis: 10_000,
  });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaAdapter = adapter;
  globalForPrisma.prisma = prisma;
}
