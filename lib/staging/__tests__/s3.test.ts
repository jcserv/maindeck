import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScryfallCard } from "@/lib/scryfall/types";
import { S3CompatibleStorage } from "../s3";

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(function () {
    return { send: sendMock };
  }),
  PutObjectCommand: vi.fn(function (input: unknown) {
    return { __cmd: "Put", input };
  }),
  GetObjectCommand: vi.fn(function (input: unknown) {
    return { __cmd: "Get", input };
  }),
  DeleteObjectsCommand: vi.fn(function (input: unknown) {
    return { __cmd: "DeleteObjects", input };
  }),
}));

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} = await import("@aws-sdk/client-s3");
const S3ClientMock = vi.mocked(S3Client);
const PutObjectCommandMock = vi.mocked(PutObjectCommand);
const GetObjectCommandMock = vi.mocked(GetObjectCommand);
const DeleteObjectsCommandMock = vi.mocked(DeleteObjectsCommand);

const CONFIG = {
  region: "auto",
  endpoint: "https://acct.r2.cloudflarestorage.com",
  accessKeyId: "AKIA-test",
  secretAccessKey: "secret-test",
  bucket: "maindeck-test",
} as const;

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

describe("S3CompatibleStorage", () => {
  beforeEach(() => {
    vi.stubEnv("S3_REGION", "");
    vi.stubEnv("S3_ENDPOINT", "");
    vi.stubEnv("S3_ACCESS_KEY_ID", "");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "");
    vi.stubEnv("S3_BUCKET", "");
    sendMock.mockReset();
    S3ClientMock.mockClear();
    PutObjectCommandMock.mockClear();
    GetObjectCommandMock.mockClear();
    DeleteObjectsCommandMock.mockClear();
  });

  describe("constructor", () => {
    it("throws when S3_REGION is missing", () => {
      vi.stubEnv("S3_ACCESS_KEY_ID", CONFIG.accessKeyId);
      vi.stubEnv("S3_SECRET_ACCESS_KEY", CONFIG.secretAccessKey);
      vi.stubEnv("S3_BUCKET", CONFIG.bucket);
      expect(() => new S3CompatibleStorage("scryfall")).toThrow(/S3_REGION/);
    });

    it("throws when S3_ACCESS_KEY_ID is missing", () => {
      vi.stubEnv("S3_REGION", CONFIG.region);
      vi.stubEnv("S3_SECRET_ACCESS_KEY", CONFIG.secretAccessKey);
      vi.stubEnv("S3_BUCKET", CONFIG.bucket);
      expect(() => new S3CompatibleStorage("scryfall")).toThrow(/S3_ACCESS_KEY_ID/);
    });

    it("throws when S3_SECRET_ACCESS_KEY is missing", () => {
      vi.stubEnv("S3_REGION", CONFIG.region);
      vi.stubEnv("S3_ACCESS_KEY_ID", CONFIG.accessKeyId);
      vi.stubEnv("S3_BUCKET", CONFIG.bucket);
      expect(() => new S3CompatibleStorage("scryfall")).toThrow(/S3_SECRET_ACCESS_KEY/);
    });

    it("throws when S3_BUCKET is missing", () => {
      vi.stubEnv("S3_REGION", CONFIG.region);
      vi.stubEnv("S3_ACCESS_KEY_ID", CONFIG.accessKeyId);
      vi.stubEnv("S3_SECRET_ACCESS_KEY", CONFIG.secretAccessKey);
      expect(() => new S3CompatibleStorage("scryfall")).toThrow(/S3_BUCKET/);
    });

    it("accepts an explicit config object", () => {
      expect(() => new S3CompatibleStorage("scryfall", CONFIG)).not.toThrow();
      expect(S3ClientMock).toHaveBeenCalledTimes(1);
      expect(S3ClientMock).toHaveBeenCalledWith({
        region: CONFIG.region,
        endpoint: CONFIG.endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: CONFIG.accessKeyId,
          secretAccessKey: CONFIG.secretAccessKey,
        },
      });
    });

    it("reads config from the environment", () => {
      vi.stubEnv("S3_REGION", CONFIG.region);
      vi.stubEnv("S3_ENDPOINT", CONFIG.endpoint);
      vi.stubEnv("S3_ACCESS_KEY_ID", CONFIG.accessKeyId);
      vi.stubEnv("S3_SECRET_ACCESS_KEY", CONFIG.secretAccessKey);
      vi.stubEnv("S3_BUCKET", CONFIG.bucket);
      expect(() => new S3CompatibleStorage("scryfall")).not.toThrow();
    });
  });

  describe("writeBatch", () => {
    it("sends PutObjectCommand with the expected key, body, and content type", async () => {
      const storage = new S3CompatibleStorage("scryfall", CONFIG);
      const cards = [makeCard("A"), makeCard("B")];
      sendMock.mockResolvedValueOnce({});

      await storage.writeBatch("run1", 0, cards);

      expect(PutObjectCommandMock).toHaveBeenCalledTimes(1);
      expect(PutObjectCommandMock).toHaveBeenCalledWith({
        Bucket: CONFIG.bucket,
        Key: "scryfall/run1/batch-0.json",
        Body: JSON.stringify(cards),
        ContentType: "application/json",
      });
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("readBatch", () => {
    it("decodes the body via transformToString and returns parsed cards", async () => {
      const storage = new S3CompatibleStorage("scryfall", CONFIG);
      const cards = [makeCard("A")];
      sendMock.mockResolvedValueOnce({
        Body: { transformToString: vi.fn().mockResolvedValue(JSON.stringify(cards)) },
      });

      const result = await storage.readBatch("run1", 0);

      expect(GetObjectCommandMock).toHaveBeenCalledWith({
        Bucket: CONFIG.bucket,
        Key: "scryfall/run1/batch-0.json",
      });
      expect(result).toEqual(cards);
    });

    it("throws 'missing batch' on NoSuchKey", async () => {
      const storage = new S3CompatibleStorage("scryfall", CONFIG);
      const err = new Error("not found");
      err.name = "NoSuchKey";
      sendMock.mockRejectedValueOnce(err);

      await expect(storage.readBatch("run1", 7)).rejects.toThrow(
        /missing batch scryfall\/run1\/batch-7\.json/,
      );
    });

    it("throws 'missing batch' when response.Body is empty", async () => {
      const storage = new S3CompatibleStorage("scryfall", CONFIG);
      sendMock.mockResolvedValueOnce({});

      await expect(storage.readBatch("run1", 0)).rejects.toThrow(
        /missing batch scryfall\/run1\/batch-0\.json/,
      );
    });
  });

  describe("cleanup", () => {
    it("sends DeleteObjectsCommand with all expected keys in a single call", async () => {
      const storage = new S3CompatibleStorage("scryfall", CONFIG);
      sendMock.mockResolvedValueOnce({});

      await storage.cleanup("run1", 3);

      expect(DeleteObjectsCommandMock).toHaveBeenCalledTimes(1);
      expect(DeleteObjectsCommandMock).toHaveBeenCalledWith({
        Bucket: CONFIG.bucket,
        Delete: {
          Objects: [
            { Key: "scryfall/run1/batch-0.json" },
            { Key: "scryfall/run1/batch-1.json" },
            { Key: "scryfall/run1/batch-2.json" },
          ],
        },
      });
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it("skips send when totalBatches is 0", async () => {
      const storage = new S3CompatibleStorage("scryfall", CONFIG);

      await storage.cleanup("run-empty", 0);

      expect(DeleteObjectsCommandMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });
  });
});
