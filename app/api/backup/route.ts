import { authorizeApi } from "@/lib/auth/permissions";
import { backupFilename } from "@/lib/backup/archive";
import { generateFullBackup } from "@/lib/backup/server";
import { NextResponse } from "next/server";
import { isUndefinedColumnError } from "@/lib/db/migration-health";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const authError = await authorizeApi("admin");
  if (authError) return authError;
  try {
    const now = new Date();
    const { buffer, manifest } = await generateFullBackup(now);
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/zip", "Content-Length": String(buffer.length), "Content-Disposition": `attachment; filename="${backupFilename("HerbOverflow-Backup", now)}"`, "X-HerbOverflow-Backup-Created-At": manifest.createdAt, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Full backup failed", error);
    if (isUndefinedColumnError(error, "archived_at")) return NextResponse.json({ error: "Database Migration 0015가 적용되지 않아 Backup을 생성할 수 없습니다.", code: "DATABASE_MIGRATION_REQUIRED" }, { status: 503 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "전체 백업을 생성하지 못했습니다." }, { status: 500 });
  }
}
