import { and, eq } from "drizzle-orm";
import { authorizeApi } from "@/lib/auth/permissions";
import { backupFilename, createBackupArchive, sha256, type BackupTables } from "@/lib/backup/archive";
import { createMediaBackupPlan, DEFAULT_FULL_MEDIA_BACKUP_LIMIT_BYTES } from "@/lib/backup/media-plan";
import { db } from "@/lib/db";
import { backupSnapshotCaptures, backupSnapshots } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return Response.json({ error: "Invalid snapshot id" }, { status: 400 });
  const [capture] = await db.select({ tables: backupSnapshotCaptures.tables, capturedAt: backupSnapshotCaptures.capturedAt, consistencyBoundary: backupSnapshotCaptures.consistencyBoundary }).from(backupSnapshotCaptures).innerJoin(backupSnapshots, eq(backupSnapshots.id, backupSnapshotCaptures.snapshotId)).where(and(eq(backupSnapshotCaptures.snapshotId, id), eq(backupSnapshots.status, "superseded"))).limit(1);
  if (!capture) return Response.json({ error: "고정된 로컬 백업 스냅샷을 찾을 수 없습니다." }, { status: 404 });

  const tables = capture.tables as BackupTables;
  const now = capture.capturedAt;
  if (new URL(request.url).searchParams.get("download") === "database") {
    const generated = await createBackupArchive(tables, [], now);
    return new Response(new Uint8Array(generated.buffer), { headers: { "Content-Type": "application/zip", "Content-Length": String(generated.buffer.length), "Content-Disposition": `attachment; filename="${backupFilename("HerbOverflow-Snapshot", now)}"`, "Cache-Control": "private, no-store" } });
  }

  const assets = (tables["media-assets"] ?? []).map((row) => {
    const asset = row as { id: string; blobPathname: string; originalFilename: string | null; mimeType: string; width: number; height: number; sizeBytes: number; updatedAt: string | Date };
    return { ...asset, sourceFingerprint: sha256(JSON.stringify([asset.id, asset.blobPathname, asset.sizeBytes, asset.updatedAt])) };
  });
  const configured = Number(process.env.FULL_MEDIA_BACKUP_MAX_BYTES ?? DEFAULT_FULL_MEDIA_BACKUP_LIMIT_BYTES);
  const limit = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_FULL_MEDIA_BACKUP_LIMIT_BYTES;
  return Response.json({ snapshotId: id, capturedAt: now.toISOString(), consistencyBoundary: capture.consistencyBoundary, databaseUrl: `/api/backup/synchronize/${id}?download=database`, filename: backupFilename("HerbOverflow-Full", now), media: createMediaBackupPlan(assets, limit) }, { headers: { "Cache-Control": "private, no-store" } });
}
