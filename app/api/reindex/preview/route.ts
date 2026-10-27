import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth/permissions";
import { reindexImportSchema } from "@/lib/reindex";
import { previewReindex } from "@/lib/reindex-server";

export async function POST(request: Request) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const parsed = reindexImportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "pharmacognosy.import v1 JSON과 모든 koreanName/catalogIndex를 확인해 주세요.", issues: parsed.error.issues }, { status: 400 });
  return NextResponse.json(await previewReindex(parsed.data.drugs));
}
