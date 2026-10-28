import { eq } from "drizzle-orm";
import { authorizeApi } from "@/lib/auth/permissions";
import { sha256 } from "@/lib/backup/archive";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { readMediaAssetBytes } from "@/lib/media/read";
import { uuidSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await authorizeApi("admin");
  if (authError) return authError;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return Response.json({ error: "Invalid media id" }, { status: 400 });
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  if (!asset) return Response.json({ error: `미디어 ${id} metadata를 찾을 수 없습니다.` }, { status: 404 });
  try {
    const bytes = await readMediaAssetBytes(asset);
    if (!bytes) return Response.json({ error: `미디어 ${id} 원본을 스토리지에서 찾을 수 없습니다.` }, { status: 404 });
    if (bytes.length !== asset.sizeBytes) return Response.json({ error: `미디어 ${id}의 실제 크기(${bytes.length})가 metadata(${asset.sizeBytes})와 다릅니다.` }, { status: 409 });
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": asset.mimeType, "Content-Length": String(bytes.length), "X-HerbOverflow-Media-Sha256": sha256(bytes), "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Full media backup asset retrieval failed", { id, error });
    return Response.json({ error: `미디어 ${id} 다운로드에 실패했습니다.` }, { status: 502 });
  }
}
