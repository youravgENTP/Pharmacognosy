import "server-only";
import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { isDatabaseMedia, readDatabaseMedia } from "@/lib/media/database";
import { isLocalMedia, readLocalMedia } from "@/lib/media/local";

export async function readMediaAsset(id: string) {
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  if (!asset) return null;
  const buffer = await readMediaAssetBytes(asset);
  return buffer ? { asset, buffer } : null;
}

export async function readMediaAssetBytes(asset: typeof mediaAssets.$inferSelect) {
  if (isLocalMedia(asset.blobPathname)) return readLocalMedia(asset.blobPathname);
  if (isDatabaseMedia(asset.blobPathname)) return readDatabaseMedia(asset.blobUrl);
  const result = await get(asset.blobUrl, { access: "private" });
  if (!result || result.statusCode !== 200) return null;
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}
