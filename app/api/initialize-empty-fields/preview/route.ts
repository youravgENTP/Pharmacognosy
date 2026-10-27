import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth/permissions";
import { previewEmptyFieldInitialization } from "@/lib/empty-field-initialization-server";

export async function GET() {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  try { return NextResponse.json(await previewEmptyFieldInitialization()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "빈 Data Card 조사에 실패했습니다." }, { status: 500 }); }
}
