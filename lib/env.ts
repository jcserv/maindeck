export type StagingDriver = "local" | "blob";

export type Env = {
  DATABASE_URL: string;
  INGEST_TOKEN: string;
  STAGING_DRIVER: StagingDriver | undefined;
  DB_POOL_MAX: number | undefined;
  IS_VERCEL: boolean;
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
  if (raw !== "local" && raw !== "blob") {
    throw new EnvError(
      `STAGING_DRIVER must be "local" or "blob" (got "${raw}")`,
    );
  }
  return raw;
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

export function getEnv(): Env {
  return {
    DATABASE_URL: requireString("DATABASE_URL"),
    INGEST_TOKEN: requireString("INGEST_TOKEN"),
    STAGING_DRIVER: optionalDriver(),
    DB_POOL_MAX: optionalPositiveInt("DB_POOL_MAX"),
    IS_VERCEL: Boolean(process.env.VERCEL),
  };
}
