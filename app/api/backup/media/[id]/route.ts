import { eq } from "drizzle-orm";
import { authorizeApi } from "@/lib/auth/permissions";
import { sha256 } from "@/lib/backup/archive";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { readMediaAssetBytesDetailed } from "@/lib/media/read";
import { uuidSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) { return serveMedia(request, context, false); }
export async function HEAD(request: Request, context: RouteContext) { return serveMedia(request, context, true); }

async function serveMedia(request: Request, { params }: RouteContext, headOnly: boolean) {
  const authError = await authorizeApi("admin");
  if (authError) return authError;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return Response.json({ error: "Invalid media id" }, { status: 400 });
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  if (!asset) return Response.json({ error: `미디어 ${id} metadata를 찾을 수 없습니다.` }, { status: 404 });
  const expectedFingerprint = new URL(request.url).searchParams.get("fingerprint");
  const currentFingerprint = sha256(JSON.stringify([asset.id, asset.blobPathname, asset.sizeBytes, asset.updatedAt]));
  if (expectedFingerprint && expectedFingerprint !== currentFingerprint) return Response.json({ error: `미디어 ${id} metadata가 DB 스냅샷 이후 변경되었습니다. 새 동기화를 시작해 주세요.`, code: "SNAPSHOT_CHANGED", retryable: false }, { status: 409 });
  const read = await readMediaAssetBytesDetailed(asset);
  if (!read.ok) return Response.json({ error: `미디어 ${id} 다운로드에 실패했습니다.`, code: read.code, retryable: read.retryable }, { status: read.code === "NOT_FOUND" ? 404 : read.code === "PERMISSION_ERROR" ? 403 : 502 });
  if (read.bytes.length !== asset.sizeBytes) return Response.json({ error: `미디어 ${id}의 실제 크기(${read.bytes.length})가 metadata(${asset.sizeBytes})와 다릅니다.`, code: "SIZE_MISMATCH" }, { status: 409 });
  return new Response(headOnly ? null : new Uint8Array(read.bytes), { headers: { "Content-Type": asset.mimeType, "Content-Length": String(read.bytes.length), "X-HerbOverflow-Media-Sha256": sha256(read.bytes), "Cache-Control": "no-store" } });
}
