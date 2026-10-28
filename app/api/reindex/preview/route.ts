import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth/permissions";
import { reindexImportSchema } from "@/lib/reindex";
import { previewReindex, previewSafeReindex } from "@/lib/reindex-server";
import { safeMaintenancePlanSchema } from "@/lib/safe-maintenance-plan";

export async function POST(request: Request) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const body = await request.json().catch(() => null);
  const safePlan = safeMaintenancePlanSchema.safeParse(body);
  if (safePlan.success) return NextResponse.json(await previewSafeReindex(safePlan.data));
  const legacy = reindexImportSchema.safeParse(body);
  if (legacy.success) return NextResponse.json(await previewReindex(legacy.data.drugs));
  return NextResponse.json({ error: "안전 유지보수 계획 또는 pharmacognosy.import v1 JSON을 확인해 주세요.", issues: safePlan.error.issues }, { status: 400 });
}
