import { and, eq, inArray } from "drizzle-orm";
import { authorizeApi } from "@/lib/auth/permissions";
import { retryFailedBackupMedia } from "@/lib/backup/worker";
import { db } from "@/lib/db";
import { backupMediaAssets } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const body = await request.json().catch(() => null);
  const rawIds: unknown[] = body && typeof body === "object" && Array.isArray(body.ids) ? body.ids : [];
  if (!rawIds.length || rawIds.length > 100 || rawIds.some((id) => typeof id !== "string" || !uuidSchema.safeParse(id).success)) return Response.json({ error: "Provide 1–100 valid media IDs." }, { status: 400 });
  const ids = [...new Set(rawIds as string[])];
  const failed = await db.select({ id: backupMediaAssets.mediaAssetId }).from(backupMediaAssets).where(and(inArray(backupMediaAssets.mediaAssetId, ids), eq(backupMediaAssets.status, "failed")));
  const result = await retryFailedBackupMedia(failed.map((item) => item.id));
  return Response.json({ ...result, ignored: ids.filter((id) => !result.ids?.includes(id)) });
}
