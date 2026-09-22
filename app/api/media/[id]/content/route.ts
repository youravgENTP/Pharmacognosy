import { authorizeApi } from "@/lib/auth/permissions";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { readMediaAssetBytes } from "@/lib/media/read";
import { uuidSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("user"); if (authError) return authError;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const content = await readMediaAssetBytes(asset).catch(() => null);
  if (!content) return NextResponse.json({ error: "File not found" }, { status: 404 });
  return new Response(content, { headers: { "Content-Type": asset.mimeType, "Content-Length": String(content.length), "Cache-Control": "private, max-age=3600" } });
}
