import { getEnv, type StagingDriver } from "@/lib/env";
import { VercelBlobStorage } from "./blob";
import { LocalFsStorage } from "./local";
import { S3CompatibleStorage } from "./s3";
import type { BatchStorage } from "./types";

export type { BatchStorage } from "./types";

export function getBatchStorage(): BatchStorage {
  const env = getEnv();
  const driver: StagingDriver =
    env.STAGING_DRIVER ?? (env.IS_VERCEL ? "blob" : "local");
  switch (driver) {
    case "local":
      return new LocalFsStorage();
    case "blob":
      return new VercelBlobStorage();
    case "s3":
      return new S3CompatibleStorage();
  }
}
