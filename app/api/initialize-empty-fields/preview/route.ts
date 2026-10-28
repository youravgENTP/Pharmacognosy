import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth/permissions";
import { previewEmptyFieldInitialization } from "@/lib/empty-field-initialization-server";
import { safeMaintenancePlanSchema } from "@/lib/safe-maintenance-plan";

export async function POST(request: Request) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const parsed = safeMaintenancePlanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "안전 유지보수 계획 JSON을 확인해 주세요.", issues: parsed.error.issues }, { status: 400 });
  try { return NextResponse.json(await previewEmptyFieldInitialization(parsed.data)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "빈 Data Card 조사에 실패했습니다." }, { status: 500 }); }
}
