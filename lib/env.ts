import "server-only";
import { z } from "zod";

const STAGING_DRIVERS = ["local", "blob", "s3"] as const;
export type StagingDriver = (typeof STAGING_DRIVERS)[number];

const allowedDrivers = STAGING_DRIVERS.map((d) => `"${d}"`).join(", ");

const EnvSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required but missing"),
    CRON_SECRET: z.string().min(1, "CRON_SECRET is required but missing"),
    STAGING_DRIVER: z
      .string()
      .optional()
      .transform((raw, ctx) => {
        if (raw === undefined || raw === "") return undefined;
        if (!(STAGING_DRIVERS as readonly string[]).includes(raw)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `STAGING_DRIVER must be one of ${allowedDrivers} (got "${raw}")`,
          });
          return z.NEVER;
        }
        return raw as StagingDriver;
      }),
    DB_POOL_MAX: z
      .string()
      .optional()
      .transform((raw, ctx) => {
        if (raw === undefined || raw === "") return undefined;
        const n = Number(raw);
        if (!Number.isInteger(n) || n <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `DB_POOL_MAX must be a positive integer (got "${raw}")`,
          });
          return z.NEVER;
        }
        return n;
      }),
    VERCEL: z.string().optional(),
    BETTER_AUTH_SECRET: z
      .string()
      .min(1, "BETTER_AUTH_SECRET is required but missing"),
    BETTER_AUTH_URL: z
      .string()
      .optional()
      .transform((v) => (v === undefined || v === "" ? "http://localhost:3000" : v)),
    RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required but missing"),
    EMAIL_FROM: z.string().min(1, "EMAIL_FROM is required but missing"),
    BLOB_READ_WRITE_TOKEN: z
      .string()
      .optional()
      .transform((v) => (v === undefined || v === "" ? undefined : v)),
  })
  .transform((raw) => ({
    DATABASE_URL: raw.DATABASE_URL,
    CRON_SECRET: raw.CRON_SECRET,
    STAGING_DRIVER: raw.STAGING_DRIVER as StagingDriver | undefined,
    DB_POOL_MAX: raw.DB_POOL_MAX,
    IS_VERCEL: Boolean(raw.VERCEL),
    BETTER_AUTH_SECRET: raw.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: raw.BETTER_AUTH_URL,
    RESEND_API_KEY: raw.RESEND_API_KEY,
    EMAIL_FROM: raw.EMAIL_FROM,
    BLOB_READ_WRITE_TOKEN: raw.BLOB_READ_WRITE_TOKEN,
  }));

type Env = z.infer<typeof EnvSchema>;

export function getEnv(): Env {
  return EnvSchema.parse(process.env);
}
