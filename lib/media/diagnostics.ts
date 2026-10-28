import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { getMediaReferences } from "@/lib/media/references";
import { readMediaAssetBytesDetailed, type MediaReadFailureCode } from "@/lib/media/read";

export type MediaDiagnosticCode = MediaReadFailureCode | "SIZE_MISMATCH" | null;
export type MediaDiagnostic = {
  id: string;
  metadataExists: boolean;
  storage: "local" | "database" | "vercel_blob" | null;
  metadata: { mimeType: string; sizeBytes: number; originalFilename: string | null; updatedAt: Date } | null;
  actualSizeBytes: number | null;
  code: MediaDiagnosticCode;
  detail: string;
  retryable: boolean;
  recoverable: boolean;
  references: Awaited<ReturnType<typeof getMediaReferences>> extends Map<string, infer Value> ? Value : never;
};

export async function diagnoseMediaAsset(id: string): Promise<MediaDiagnostic> {
  const [[asset], references] = await Promise.all([db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1), getMediaReferences()]);
  const linked = references.get(id) ?? [];
  if (!asset) return { id, metadataExists: false, storage: null, metadata: null, actualSizeBytes: null, code: "NOT_FOUND", detail: "DB metadata is missing", retryable: false, recoverable: false, references: linked };
  const read = await readMediaAssetBytesDetailed(asset);
  const metadata = { mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, originalFilename: asset.originalFilename, updatedAt: asset.updatedAt };
  if (!read.ok) return { id, metadataExists: true, storage: read.storage, metadata, actualSizeBytes: null, code: read.code, detail: read.detail, retryable: read.retryable, recoverable: read.code === "TRANSIENT_ERROR", references: linked };
  if (read.bytes.length !== asset.sizeBytes) return { id, metadataExists: true, storage: read.storage, metadata, actualSizeBytes: read.bytes.length, code: "SIZE_MISMATCH", detail: `Actual bytes (${read.bytes.length}) differ from metadata (${asset.sizeBytes})`, retryable: false, recoverable: true, references: linked };
  return { id, metadataExists: true, storage: read.storage, metadata, actualSizeBytes: read.bytes.length, code: null, detail: "Media is readable and size matches metadata", retryable: false, recoverable: true, references: linked };
}
