import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { isLocalMedia, readLocalMedia } from "@/lib/media/local";
import { uuidSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (isLocalMedia(asset.blobPathname)) {
    const content = await readLocalMedia(asset.blobPathname).catch(() => null);
    if (!content) return NextResponse.json({ error: "File not found" }, { status: 404 });
    return new Response(content, { headers: { "Content-Type": asset.mimeType, "Content-Length": String(asset.sizeBytes), "Cache-Control": "private, max-age=3600" } });
  }
  const result = await get(asset.blobUrl, { access: "private", headers: { "If-None-Match": request.headers.get("if-none-match") ?? "" } });
  if (!result) return NextResponse.json({ error: "Blob not found" }, { status: 404 });
  if (result.statusCode === 304) return new Response(null, { status: 304, headers: { ETag: result.blob.etag } });
  return new Response(result.stream, { headers: { "Content-Type": result.blob.contentType, "Content-Length": String(result.blob.size), ETag: result.blob.etag, "Cache-Control": "private, max-age=3600" } });
}
