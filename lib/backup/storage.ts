import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type BackupStorage = {
  backend: "s3" | "local";
  putBuffer(key: string, bytes: Buffer, metadata?: Record<string, string>): Promise<void>;
  publishFile(key: string, filename: string, metadata?: Record<string, string>): Promise<void>;
  readStream(key: string): Promise<Readable>;
  head(key: string): Promise<{ size: number; metadata: Record<string, string> } | null>;
  downloadUrl(key: string): Promise<string | null>;
};

export function incrementalBackupEnabled() { return process.env.INCREMENTAL_BACKUP_ENABLED === "true"; }

export function backupStorageConfigured() {
  const provider = process.env.BACKUP_STORAGE_PROVIDER ?? (process.env.NODE_ENV === "production" ? "" : "local");
  if (provider === "local") return process.env.NODE_ENV !== "production";
  return provider === "s3" && Boolean(process.env.BACKUP_S3_BUCKET && process.env.BACKUP_S3_REGION && process.env.BACKUP_S3_ACCESS_KEY_ID && process.env.BACKUP_S3_SECRET_ACCESS_KEY);
}

export function getBackupStorage(): BackupStorage {
  const provider = process.env.BACKUP_STORAGE_PROVIDER ?? (process.env.NODE_ENV === "production" ? "" : "local");
  if (provider === "local" && process.env.NODE_ENV !== "production") return localStorage();
  if (provider !== "s3" || !backupStorageConfigured()) throw new Error("독립 백업 저장소가 구성되지 않았습니다. BACKUP_S3_* 환경 변수를 확인해 주세요.");
  return s3Storage();
}

function localStorage(): BackupStorage {
  const root = path.join(process.cwd(), ".backup-storage");
  const resolve = (key: string) => { const target = path.resolve(root, key); if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("Invalid backup storage key"); return target; };
  return {
    backend: "local",
    async putBuffer(key, bytes) { const target = resolve(key); await mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.tmp-${crypto.randomUUID()}`; const handle = await open(temporary, "wx"); try { await handle.writeFile(bytes); await handle.close(); await rename(temporary, target); } catch (error) { await handle.close().catch(() => undefined); await unlink(temporary).catch(() => undefined); throw error; } },
    async publishFile(key, filename) { const target = resolve(key); await mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.tmp-${crypto.randomUUID()}`; await new Promise<void>((resolveCopy, reject) => { const source = createReadStream(filename); const destination = createWriteStream(temporary, { flags: "wx" }); source.on("error", reject); destination.on("error", reject); destination.on("finish", resolveCopy); source.pipe(destination); }); await rename(temporary, target); },
    async readStream(key) { return createReadStream(resolve(key)); },
    async head(key) { try { const value = await stat(resolve(key)); return { size: value.size, metadata: {} }; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } },
    async downloadUrl() { return null; },
  };
}

function s3Storage(): BackupStorage {
  const bucket = process.env.BACKUP_S3_BUCKET!;
  const prefix = (process.env.BACKUP_S3_PREFIX ?? "herboverflow").replace(/^\/+|\/+$/g, "");
  const client = new S3Client({ region: process.env.BACKUP_S3_REGION!, endpoint: process.env.BACKUP_S3_ENDPOINT || undefined, forcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE === "true", credentials: { accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID!, secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY! } });
  const objectKey = (key: string) => `${prefix}/${key}`;
  return {
    backend: "s3",
    async putBuffer(key, bytes, metadata) { await new Upload({ client, params: { Bucket: bucket, Key: objectKey(key), Body: bytes, Metadata: metadata } }).done(); },
    async publishFile(key, filename, metadata) { const finalKey = objectKey(key); const temporaryKey = `${finalKey}.pending-${crypto.randomUUID()}`; await new Upload({ client, params: { Bucket: bucket, Key: temporaryKey, Body: createReadStream(filename), Metadata: metadata } }).done(); try { await client.send(new CopyObjectCommand({ Bucket: bucket, CopySource: `${bucket}/${temporaryKey}`, Key: finalKey, MetadataDirective: "COPY" })); } finally { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: temporaryKey })).catch(() => undefined); } },
    async readStream(key) { const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey(key) })); if (!result.Body) throw new Error(`백업 객체 ${key}를 읽을 수 없습니다.`); return Readable.fromWeb(result.Body.transformToWebStream() as never); },
    async head(key) { try { const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey(key) })); return { size: result.ContentLength ?? 0, metadata: result.Metadata ?? {} }; } catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null; throw error; } },
    async downloadUrl(key) { const incomplete = key.includes("-INCOMPLETE"); return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: objectKey(key), ResponseContentType: "application/zip", ResponseContentDisposition: `attachment; filename="${incomplete ? "HerbOverflow-INCOMPLETE" : "HerbOverflow-Full"}-${path.basename(key)}"` }), { expiresIn: 900 }); },
  };
}
