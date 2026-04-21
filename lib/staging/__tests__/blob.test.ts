import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScryfallCard } from "@/lib/scryfall/types";
import { VercelBlobStorage } from "../blob";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  del: vi.fn(),
}));

const { put, get, list, del } = await import("@vercel/blob");
const putMock = vi.mocked(put);
const getMock = vi.mocked(get);
const listMock = vi.mocked(list);
const delMock = vi.mocked(del);

const TOKEN = "vercel_blob_rw_test";

function makeCard(name: string): ScryfallCard {
  return {
    id: `id-${name}`,
    lang: "en",
    layout: "normal",
    games: ["paper"],
    name,
    set: "tst",
    set_name: "Test",
    collector_number: "1",
  };
}

describe("VercelBlobStorage", () => {
  beforeEach(() => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    putMock.mockReset();
    getMock.mockReset();
    listMock.mockReset();
    delMock.mockReset();
  });

  describe("constructor", () => {
    it("throws when no token is available", () => {
      expect(() => new VercelBlobStorage()).toThrow(/BLOB_READ_WRITE_TOKEN/);
    });

    it("accepts an explicit token argument", () => {
      expect(() => new VercelBlobStorage(TOKEN)).not.toThrow();
    });

    it("reads the token from the environment", () => {
      vi.stubEnv("BLOB_READ_WRITE_TOKEN", TOKEN);
      expect(() => new VercelBlobStorage()).not.toThrow();
    });
  });

  describe("writeBatch", () => {
    it("calls put with the expected key, options, and token", async () => {
      const storage = new VercelBlobStorage(TOKEN);
      const cards = [makeCard("A"), makeCard("B")];
      putMock.mockResolvedValueOnce({
        url: "https://blob.vercel-storage.test/scryfall/run1/batch-0.json",
        downloadUrl: "",
        pathname: "scryfall/run1/batch-0.json",
        contentType: "application/json",
        contentDisposition: "",
      } as never);

      await storage.writeBatch("run1", 0, cards);

      expect(putMock).toHaveBeenCalledTimes(1);
      const call = putMock.mock.calls[0]!;
      expect(call[0]).toBe("scryfall/run1/batch-0.json");
      expect(call[1]).toBe(JSON.stringify(cards));
      expect(call[2]).toMatchObject({
        access: "private",
        contentType: "application/json",
        allowOverwrite: true,
        addRandomSuffix: false,
        token: TOKEN,
      });
    });
  });

  describe("readBatch", () => {
    it("returns parsed JSON from get() stream", async () => {
      const storage = new VercelBlobStorage(TOKEN);
      const cards = [makeCard("A")];
      const stream = new Response(JSON.stringify(cards)).body;
      getMock.mockResolvedValueOnce({
        statusCode: 200,
        stream,
        headers: new Headers(),
        blob: {},
      } as never);

      const result = await storage.readBatch("run1", 0);

      expect(getMock).toHaveBeenCalledWith("scryfall/run1/batch-0.json", {
        access: "private",
        token: TOKEN,
      });
      expect(result).toEqual(cards);
    });

    it("throws 'missing batch' when get rejects", async () => {
      const storage = new VercelBlobStorage(TOKEN);
      getMock.mockRejectedValueOnce(new Error("not found"));

      await expect(storage.readBatch("run1", 7)).rejects.toThrow(
        /missing batch scryfall\/run1\/batch-7\.json/,
      );
    });

    it("throws 'missing batch' when get returns null", async () => {
      const storage = new VercelBlobStorage(TOKEN);
      getMock.mockResolvedValueOnce(null as never);

      await expect(storage.readBatch("run1", 0)).rejects.toThrow(
        /missing batch scryfall\/run1\/batch-0\.json/,
      );
    });
  });

  describe("cleanup", () => {
    it("paginates list() and deletes each page's pathnames", async () => {
      const storage = new VercelBlobStorage(TOKEN);
      listMock
        .mockResolvedValueOnce({
          blobs: [
            { pathname: "scryfall/run1/batch-0.json" },
            { pathname: "scryfall/run1/batch-1.json" },
          ],
          hasMore: true,
          cursor: "cursor-2",
        } as never)
        .mockResolvedValueOnce({
          blobs: [{ pathname: "scryfall/run1/batch-2.json" }],
          hasMore: false,
          cursor: undefined,
        } as never);
      delMock.mockResolvedValue(undefined as never);

      await storage.cleanup("run1");

      expect(listMock).toHaveBeenNthCalledWith(1, {
        prefix: "scryfall/run1/",
        cursor: undefined,
        token: TOKEN,
      });
      expect(listMock).toHaveBeenNthCalledWith(2, {
        prefix: "scryfall/run1/",
        cursor: "cursor-2",
        token: TOKEN,
      });
      expect(delMock).toHaveBeenNthCalledWith(
        1,
        ["scryfall/run1/batch-0.json", "scryfall/run1/batch-1.json"],
        { token: TOKEN },
      );
      expect(delMock).toHaveBeenNthCalledWith(
        2,
        ["scryfall/run1/batch-2.json"],
        { token: TOKEN },
      );
    });

    it("skips del() when a page is empty", async () => {
      const storage = new VercelBlobStorage(TOKEN);
      listMock.mockResolvedValueOnce({
        blobs: [],
        hasMore: false,
        cursor: undefined,
      } as never);

      await storage.cleanup("run-empty");

      expect(listMock).toHaveBeenCalledTimes(1);
      expect(delMock).not.toHaveBeenCalled();
    });
  });
});
