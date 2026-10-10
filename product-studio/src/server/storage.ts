import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

// Object storage abstraction. Local disk by default; S3-compatible storage
// (AWS S3, Cloudflare R2, MinIO...) when S3_BUCKET is configured.

export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

function safeKey(key: string) {
  if (!/^[A-Za-z0-9/_.-]+$/.test(key) || key.includes("..")) throw new Error(`Invalid storage key: ${key}`);
  return key;
}

class LocalStorage implements Storage {
  constructor(private root: string) {}
  private full(key: string) {
    return path.join(this.root, safeKey(key));
  }
  async put(key: string, data: Buffer) {
    const file = this.full(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  }
  async get(key: string) {
    return fs.readFile(this.full(key));
  }
  async delete(key: string) {
    await fs.rm(this.full(key), { force: true });
  }
  async exists(key: string) {
    try {
      await fs.access(this.full(key));
      return true;
    } catch {
      return false;
    }
  }
}

class S3Storage implements Storage {
  private clientPromise: Promise<import("@aws-sdk/client-s3").S3Client>;
  constructor(private bucket: string) {
    this.clientPromise = import("@aws-sdk/client-s3").then(
      ({ S3Client }) =>
        new S3Client({
          region: process.env.S3_REGION || "auto",
          endpoint: process.env.S3_ENDPOINT || undefined,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
          credentials:
            process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
              ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
              : undefined,
        }),
    );
  }
  async put(key: string, data: Buffer, contentType: string) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    await client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: safeKey(key), Body: data, ContentType: contentType }),
    );
  }
  async get(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    const res = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  async delete(key: string) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
  }
  async exists(key: string) {
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    try {
      await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
      return true;
    } catch {
      return false;
    }
  }
}

const g = globalThis as unknown as { __vitrineStorage?: Storage };

export function storage(): Storage {
  if (!g.__vitrineStorage) {
    g.__vitrineStorage = process.env.S3_BUCKET ? new S3Storage(process.env.S3_BUCKET) : new LocalStorage(env.storageDir);
  }
  return g.__vitrineStorage;
}

/** Local disk cache for derived renditions (resized previews, watermarked exports). */
export const cacheDir = () => path.join(env.dataDir, "cache");
