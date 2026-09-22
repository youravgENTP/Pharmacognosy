import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth/permissions";
import { previewRestoreArchive } from "@/lib/backup/restore-server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const authError = await authorizeApi("admin");
  if (authError) return authError;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "HerbOverflow 백업 ZIP을 선택해주세요." }, { status: 400 });
    return NextResponse.json(await previewRestoreArchive(Buffer.from(await file.arrayBuffer())));
  } catch (error) {
    console.error("Restore preview failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "백업을 검증하지 못했습니다." }, { status: 400 });
  }
}
