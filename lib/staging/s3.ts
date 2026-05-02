import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ScryfallCard } from "@/lib/scryfall/types";
import type { BatchStorage } from "./types";

const ROOT_PREFIX = "scryfall";

const keyFor = (runId: string, index: number) =>
  `${ROOT_PREFIX}/${runId}/batch-${index}.json`;

export interface S3StorageConfig {
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

function loadConfigFromEnv(): S3StorageConfig {
  const region = process.env.S3_REGION;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;
  const endpoint = process.env.S3_ENDPOINT || undefined;

  const missing: string[] = [];
  if (!region) missing.push("S3_REGION");
  if (!accessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("S3_SECRET_ACCESS_KEY");
  if (!bucket) missing.push("S3_BUCKET");

  if (missing.length > 0) {
    throw new Error(
      `S3CompatibleStorage requires ${missing.join(", ")}. ` +
        "Set them in your environment or use STAGING_DRIVER=local for dev.",
    );
  }

  return {
    region: region as string,
    ...(endpoint !== undefined && { endpoint }),
    accessKeyId: accessKeyId as string,
    secretAccessKey: secretAccessKey as string,
    bucket: bucket as string,
  } as S3StorageConfig;
}

export class S3CompatibleStorage implements BatchStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config?: S3StorageConfig) {
    const resolved = config ?? loadConfigFromEnv();
    this.bucket = resolved.bucket;
    this.client = new S3Client({
      region: resolved.region,
      ...(resolved.endpoint !== undefined && { endpoint: resolved.endpoint }),
      forcePathStyle: true,
      credentials: {
        accessKeyId: resolved.accessKeyId,
        secretAccessKey: resolved.secretAccessKey,
      },
    });
  }

  async writeBatch(
    runId: string,
    index: number,
    cards: ScryfallCard[],
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: keyFor(runId, index),
        Body: JSON.stringify(cards),
        ContentType: "application/json",
      }),
    );
  }

  async readBatch(runId: string, index: number): Promise<ScryfallCard[]> {
    const key = keyFor(runId, index);
    let body: string;
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!response.Body) {
        throw new Error(`S3CompatibleStorage.readBatch: missing batch ${key}`);
      }
      body = await response.Body.transformToString();
    } catch (err) {
      if (err instanceof Error && err.name === "NoSuchKey") {
        throw new Error(`S3CompatibleStorage.readBatch: missing batch ${key}`, {
          cause: err,
        });
      }
      throw err;
    }
    return JSON.parse(body) as ScryfallCard[];
  }

  async cleanup(runId: string, totalBatches: number): Promise<void> {
    if (totalBatches <= 0) return;
    const keys = Array.from({ length: totalBatches }, (_, i) =>
      keyFor(runId, i),
    );
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
  }
}
