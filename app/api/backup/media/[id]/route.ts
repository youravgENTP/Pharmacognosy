import { eq } from "drizzle-orm";
import { authorizeApi } from "@/lib/auth/permissions";
import { sha256 } from "@/lib/backup/archive";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { readMediaAssetBytesDetailed } from "@/lib/media/read";
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
  const read = await readMediaAssetBytesDetailed(asset);
  if (!read.ok) return Response.json({ error: `미디어 ${id} 다운로드에 실패했습니다.`, code: read.code, retryable: read.retryable }, { status: read.code === "NOT_FOUND" ? 404 : read.code === "PERMISSION_ERROR" ? 403 : 502 });
  if (read.bytes.length !== asset.sizeBytes) return Response.json({ error: `미디어 ${id}의 실제 크기(${read.bytes.length})가 metadata(${asset.sizeBytes})와 다릅니다.`, code: "SIZE_MISMATCH" }, { status: 409 });
  return new Response(new Uint8Array(read.bytes), { headers: { "Content-Type": asset.mimeType, "Content-Length": String(read.bytes.length), "X-HerbOverflow-Media-Sha256": sha256(read.bytes), "Cache-Control": "no-store" } });
}
