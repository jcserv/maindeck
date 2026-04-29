export const STAGING_DRIVERS = ["local", "blob", "s3"] as const;
export type StagingDriver = (typeof STAGING_DRIVERS)[number];

export type Env = {
  DATABASE_URL: string;
  CRON_SECRET: string;
  STAGING_DRIVER: StagingDriver | undefined;
  DB_POOL_MAX: number | undefined;
  IS_VERCEL: boolean;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  BLOB_READ_WRITE_TOKEN: string | undefined;
};

class EnvError extends Error {
  constructor(message: string) {
    super(`env: ${message}`);
    this.name = "EnvError";
  }
}

function requireString(key: string): string {
  const raw = process.env[key];
  if (raw === undefined || raw === "") {
    throw new EnvError(`${key} is required but missing`);
  }
  return raw;
}

function optionalDriver(): StagingDriver | undefined {
  const raw = process.env.STAGING_DRIVER;
  if (raw === undefined || raw === "") return undefined;
  if (!(STAGING_DRIVERS as readonly string[]).includes(raw)) {
    const allowed = STAGING_DRIVERS.map((d) => `"${d}"`).join(", ");
    throw new EnvError(
      `STAGING_DRIVER must be one of ${allowed} (got "${raw}")`,
    );
  }
  return raw as StagingDriver;
}

function optionalPositiveInt(key: string): number | undefined {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new EnvError(`${key} must be a positive integer (got "${raw}")`);
  }
  return n;
}

function optionalStringWithDefault(key: string, fallback: string): string {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  return raw;
}

function optionalString(key: string): string | undefined {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return undefined;
  return raw;
}

export function getEnv(): Env {
  return {
    DATABASE_URL: requireString("DATABASE_URL"),
    CRON_SECRET: requireString("CRON_SECRET"),
    STAGING_DRIVER: optionalDriver(),
    DB_POOL_MAX: optionalPositiveInt("DB_POOL_MAX"),
    IS_VERCEL: Boolean(process.env.VERCEL),
    BETTER_AUTH_SECRET: optionalStringWithDefault(
      "BETTER_AUTH_SECRET",
      "dev-secret-change-me",
    ),
    BETTER_AUTH_URL: optionalStringWithDefault(
      "BETTER_AUTH_URL",
      "http://localhost:3000",
    ),
    RESEND_API_KEY: requireString("RESEND_API_KEY"),
    EMAIL_FROM: requireString("EMAIL_FROM"),
    BLOB_READ_WRITE_TOKEN: optionalString("BLOB_READ_WRITE_TOKEN"),
  };
}
