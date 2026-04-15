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
      throw new Error(
        "STAGING_DRIVER=blob is not implemented yet. Set STAGING_DRIVER=local explicitly until the @vercel/blob driver lands.",
      );
    default:
      throw new Error(`unknown STAGING_DRIVER: ${driver}`);
  }
}
