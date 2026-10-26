import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApi } from "@/lib/auth/permissions";
import { previewArchive } from "@/lib/archive";
const schema = z.object({ groupId: z.string().uuid(), drugIds: z.array(z.string().uuid()).min(1) });
export async function POST(request: Request) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Archive 대상을 확인해 주세요." }, { status: 400 });
  try { return NextResponse.json(await previewArchive(parsed.data.groupId, parsed.data.drugIds)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Preview를 만들지 못했습니다." }, { status: 400 }); }
}
