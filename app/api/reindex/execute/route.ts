import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApi } from "@/lib/auth/permissions";
import { reindexImportSchema } from "@/lib/reindex";
import { executeReindex, executeSafeReindex } from "@/lib/reindex-server";
import { MaintenancePrerequisiteError } from "@/lib/maintenance-readiness";
import { safeMaintenancePlanSchema } from "@/lib/safe-maintenance-plan";

const requestSchema = z.object({ payload: z.union([safeMaintenancePlanSchema, reindexImportSchema]), confirmed: z.literal(true) });

export async function POST(request: Request) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Preview 이후 명시적인 실행 확인이 필요합니다." }, { status: 400 });
  try {
    const payload = parsed.data.payload;
    const safePlan = safeMaintenancePlanSchema.safeParse(payload);
    return NextResponse.json(safePlan.success ? await executeSafeReindex(safePlan.data) : await executeReindex(reindexImportSchema.parse(payload).drugs));
  } catch (error) {
    if (error instanceof MaintenancePrerequisiteError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reindex 실행에 실패했습니다." }, { status: 409 });
  }
}
