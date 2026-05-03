import { getEnv, type StagingDriver } from "@/lib/env";
import { VercelBlobStorage } from "./blob";
import { LocalFsStorage } from "./local";
import { S3CompatibleStorage } from "./s3";
import type { BatchStorage } from "./types";

export type { BatchStorage } from "./types";

export function getBatchStorage<T>(namespace: string): BatchStorage<T> {
  const env = getEnv();
  const driver: StagingDriver =
    env.STAGING_DRIVER ?? (env.IS_VERCEL ? "blob" : "local");
  switch (driver) {
    case "local":
      return new LocalFsStorage<T>(namespace);
    case "blob":
      return new VercelBlobStorage<T>(namespace);
    case "s3":
      return new S3CompatibleStorage<T>(namespace);
  }
}
