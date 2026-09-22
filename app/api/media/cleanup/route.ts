import { authorizeApi } from "@/lib/auth/permissions";
import { del } from "@vercel/blob";
import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { isDatabaseMedia } from "@/lib/media/database";
import { deleteLocalMedia, isLocalMedia } from "@/lib/media/local";
import { getMediaReferences } from "@/lib/media/references";

export async function POST() { const authError = await authorizeApi("editor"); if (authError) return authError;
  const [assets, references] = await Promise.all([db.select().from(mediaAssets), getMediaReferences()]);
  const unused = assets.filter((asset) => !references.has(asset.id));
  if (!unused.length) return NextResponse.json({ deleted: 0, bytes: 0 });
  const local = unused.filter((asset) => isLocalMedia(asset.blobPathname));
  const remote = unused.filter((asset) => !isLocalMedia(asset.blobPathname) && !isDatabaseMedia(asset.blobPathname));
  if (remote.length) await del(remote.map((asset) => asset.blobUrl));
  await Promise.all(local.map((asset) => deleteLocalMedia(asset.blobPathname)));
  await db.delete(mediaAssets).where(inArray(mediaAssets.id, unused.map((asset) => asset.id)));
  return NextResponse.json({ deleted: unused.length, bytes: unused.reduce((sum, asset) => sum + asset.sizeBytes, 0) });
}
