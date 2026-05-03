import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import type { BatchStorage } from "./types";

type S3StorageConfig = z.infer<typeof s3StorageConfigSchema>;

const s3StorageConfigSchema = z.object({
  region: z.string().min(1),
  endpoint: z.string().optional(),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  bucket: z.string().min(1),
});

function loadConfigFromEnv(): S3StorageConfig {
  const result = s3StorageConfigSchema.safeParse({
    region: process.env["S3_REGION"] || undefined,
    endpoint: process.env["S3_ENDPOINT"] || undefined,
    accessKeyId: process.env["S3_ACCESS_KEY_ID"] || undefined,
    secretAccessKey: process.env["S3_SECRET_ACCESS_KEY"] || undefined,
    bucket: process.env["S3_BUCKET"] || undefined,
  });

  if (!result.success) {
    const fields = result.error.flatten().fieldErrors;
    const missing = (Object.keys(fields) as (keyof typeof fields)[]).map(
      (k) =>
        ({
          region: "S3_REGION",
          accessKeyId: "S3_ACCESS_KEY_ID",
          secretAccessKey: "S3_SECRET_ACCESS_KEY",
          bucket: "S3_BUCKET",
          endpoint: "S3_ENDPOINT",
        })[k],
    );
    throw new Error(
      `S3CompatibleStorage requires ${missing.join(", ")}. ` +
        "Set them in your environment or use STAGING_DRIVER=local for dev.",
    );
  }

  return result.data;
}

export class S3CompatibleStorage<T> implements BatchStorage<T> {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly namespace: string;

  constructor(namespace: string, config?: S3StorageConfig) {
    const resolved = config ?? loadConfigFromEnv();
    this.bucket = resolved.bucket;
    this.namespace = namespace;
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

  private keyFor(runId: string, index: number): string {
    return `${this.namespace}/${runId}/batch-${index}.json`;
  }

  async writeBatch(runId: string, index: number, items: T[]): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.keyFor(runId, index),
        Body: JSON.stringify(items),
        ContentType: "application/json",
      }),
    );
  }

  async readBatch(runId: string, index: number): Promise<T[]> {
    const key = this.keyFor(runId, index);
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
    return JSON.parse(body) as T[];
  }

  async cleanup(runId: string, totalBatches: number): Promise<void> {
    if (totalBatches <= 0) return;
    const keys = Array.from({ length: totalBatches }, (_, i) =>
      this.keyFor(runId, i),
    );
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
  }
}
