import "server-only";
import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { isDatabaseMedia, readDatabaseMedia } from "@/lib/media/database";
import { isLocalMedia, readLocalMedia } from "@/lib/media/local";
import { classifyStorageError, classifyStorageStatus, mediaReadFailure, type MediaReadFailureCode, type MediaStorageKind } from "@/lib/media/read-failure";

export type { MediaReadFailureCode, MediaStorageKind } from "@/lib/media/read-failure";
export type MediaReadResult = { ok: true; bytes: Buffer; storage: MediaStorageKind } | { ok: false; code: MediaReadFailureCode; storage: MediaStorageKind; detail: string; retryable: boolean; statusCode?: number };

export class MediaReadError extends Error {
  constructor(readonly result: Extract<MediaReadResult, { ok: false }>) { super(result.detail); }
}

export async function readMediaAsset(id: string) {
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  if (!asset) return null;
  const buffer = await readMediaAssetBytes(asset);
  return buffer ? { asset, buffer } : null;
}

export async function readMediaAssetBytes(asset: typeof mediaAssets.$inferSelect) {
  const result = await readMediaAssetBytesDetailed(asset);
  if (result.ok) return result.bytes;
  if (result.code === "NOT_FOUND") return null;
  throw new MediaReadError(result);
}

export async function readMediaAssetBytesDetailed(asset: typeof mediaAssets.$inferSelect): Promise<MediaReadResult> {
  if (isLocalMedia(asset.blobPathname)) {
    try {
      const bytes = await readLocalMedia(asset.blobPathname);
      return bytes ? { ok: true, bytes, storage: "local" } : mediaReadFailure("NOT_FOUND", "local", "Local media pathname is unavailable", false);
    } catch (error) { return classifyStorageError(error, "local"); }
  }
  if (isDatabaseMedia(asset.blobPathname)) {
    const bytes = readDatabaseMedia(asset.blobUrl);
    return bytes ? { ok: true, bytes, storage: "database" } : mediaReadFailure("STORAGE_ERROR", "database", "Database media payload is malformed", false);
  }
  try {
    const response = await get(asset.blobUrl, { access: "private" });
    if (!response) return mediaReadFailure("NOT_FOUND", "vercel_blob", "Blob object was not found", false, 404);
    if (response.statusCode !== 200) return classifyStorageStatus(response.statusCode, "vercel_blob");
    return { ok: true, bytes: Buffer.from(await new Response(response.stream).arrayBuffer()), storage: "vercel_blob" };
  } catch (error) { return classifyStorageError(error, "vercel_blob"); }
}
