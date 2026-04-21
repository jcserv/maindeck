import { VercelBlobStorage } from "./blob";
import { LocalFsStorage } from "./local";
import type { BatchStorage } from "./types";

export type { BatchStorage } from "./types";

export function getBatchStorage(): BatchStorage {
  const explicit = process.env.STAGING_DRIVER;
  const driver = explicit ?? (process.env.VERCEL ? "blob" : "local");
  switch (driver) {
    case "local":
      return new LocalFsStorage();
    case "blob":
      return new VercelBlobStorage();
    default:
      throw new Error(`unknown STAGING_DRIVER: ${driver}`);
  }
}
