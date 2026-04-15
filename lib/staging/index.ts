import { VercelBlobStorage } from "./blob";
import { LocalFsStorage } from "./local";
import type { BatchStorage } from "./types";

export type { BatchStorage } from "./types";

export function getBatchStorage(): BatchStorage {
  const driver =
    process.env.STAGING_DRIVER ?? (process.env.VERCEL ? "blob" : "local");
  switch (driver) {
    case "blob":
      return new VercelBlobStorage();
    case "local":
      return new LocalFsStorage();
    default:
      throw new Error(`unknown STAGING_DRIVER: ${driver}`);
  }
}
