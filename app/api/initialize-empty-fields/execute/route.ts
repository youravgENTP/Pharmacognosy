import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApi } from "@/lib/auth/permissions";
import { executeEmptyFieldInitialization } from "@/lib/empty-field-initialization-server";
import { MaintenancePrerequisiteError } from "@/lib/maintenance-readiness";
import { safeMaintenancePlanSchema } from "@/lib/safe-maintenance-plan";

const schema = z.object({ plan: safeMaintenancePlanSchema, confirmed: z.literal(true) });

export async function POST(request: Request) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Preview 대상과 명시적인 확인이 필요합니다." }, { status: 400 });
  try { return NextResponse.json(await executeEmptyFieldInitialization(parsed.data.plan)); }
  catch (error) {
    if (error instanceof MaintenancePrerequisiteError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "빈 필드 초기화에 실패했습니다." }, { status: 409 });
  }
}
