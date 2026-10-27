import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApi } from "@/lib/auth/permissions";
import { reindexImportSchema } from "@/lib/reindex";
import { executeReindex } from "@/lib/reindex-server";

const requestSchema = z.object({ payload: reindexImportSchema, confirmed: z.literal(true) });

export async function POST(request: Request) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Preview 이후 명시적인 실행 확인이 필요합니다." }, { status: 400 });
  try { return NextResponse.json(await executeReindex(parsed.data.payload.drugs)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Reindex 실행에 실패했습니다." }, { status: 409 }); }
}
