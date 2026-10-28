import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { authorizeApi } from "@/lib/auth/permissions";
import { getBackupStorage } from "@/lib/backup/storage";
import { db } from "@/lib/db";
import { backupSnapshots } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return Response.json({ error: "Invalid snapshot id" }, { status: 400 });
  const [snapshot] = await db.select().from(backupSnapshots).where(eq(backupSnapshots.id, id)).limit(1);
  if (!snapshot || snapshot.status !== "ready" || !snapshot.storageKey || !snapshot.zipSha256) return Response.json({ error: "검증 완료된 전체 스냅샷을 찾을 수 없습니다." }, { status: 404 });
  const storage = getBackupStorage(); const signed = await storage.downloadUrl(snapshot.storageKey);
  if (signed) return Response.redirect(signed, 307);
  const stream = await storage.readStream(snapshot.storageKey);
  return new Response(Readable.toWeb(stream) as ReadableStream, { headers: { "Content-Type": "application/zip", "Content-Length": String(snapshot.zipBytes ?? ""), "Content-Disposition": `attachment; filename="HerbOverflow-Full-${snapshot.id}.zip"`, "X-HerbOverflow-Snapshot-Sha256": snapshot.zipSha256, "Cache-Control": "no-store" } });
}
