import { authorizeApi } from "@/lib/auth/permissions";
import { createMediaBackupPlan, DEFAULT_FULL_MEDIA_BACKUP_LIMIT_BYTES } from "@/lib/backup/media-plan";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const authError = await authorizeApi("admin");
  if (authError) return authError;
  const assets = await db.select({ id: mediaAssets.id, originalFilename: mediaAssets.originalFilename, mimeType: mediaAssets.mimeType, width: mediaAssets.width, height: mediaAssets.height, sizeBytes: mediaAssets.sizeBytes }).from(mediaAssets);
  const configured = Number(process.env.FULL_MEDIA_BACKUP_MAX_BYTES ?? DEFAULT_FULL_MEDIA_BACKUP_LIMIT_BYTES);
  const limit = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_FULL_MEDIA_BACKUP_LIMIT_BYTES;
  return Response.json(createMediaBackupPlan(assets, limit), { headers: { "Cache-Control": "no-store" } });
}
