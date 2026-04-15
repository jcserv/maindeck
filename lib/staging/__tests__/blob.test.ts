import { describe, expect, it } from "vitest";
import { VercelBlobStorage } from "../blob";

describe("VercelBlobStorage", () => {
  const storage = new VercelBlobStorage();
  const NOT_IMPLEMENTED = /not implemented/;

  it.each([
    ["writeBatch", () => storage.writeBatch("run", 0, [])],
    ["readBatch", () => storage.readBatch("run", 0)],
    ["cleanup", () => storage.cleanup("run")],
  ] as const)("%s rejects with not-implemented", async (_name, call) => {
    await expect(call()).rejects.toThrow(NOT_IMPLEMENTED);
  });
});
