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
  if (isLocalMedia(asset.blobPathname)) return { asset, buffer: await readLocalMedia(asset.blobPathname) };
  if (isDatabaseMedia(asset.blobPathname)) { const buffer = readDatabaseMedia(asset.blobUrl); return buffer ? { asset, buffer } : null; }
  const result = await get(asset.blobUrl, { access: "private" });
  if (!result || result.statusCode !== 200) return null;
  return { asset, buffer: Buffer.from(await new Response(result.stream).arrayBuffer()) };
}
