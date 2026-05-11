import "server-only";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "@/lib/env";
import { PrismaClient } from "@/lib/generated/prisma/client";

const env = getEnv();

neonConfig.webSocketConstructor = WebSocket;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaAdapter?: PrismaNeon | PrismaPg;
};

const adapter =
  globalForPrisma.prismaAdapter ??
  (env.IS_VERCEL
    ? new PrismaNeon({ connectionString: env.DATABASE_URL })
    : new PrismaPg({
        connectionString: env.DATABASE_URL,
        max: env.DB_POOL_MAX ?? 10,
        idleTimeoutMillis: 10_000,
      }));

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
