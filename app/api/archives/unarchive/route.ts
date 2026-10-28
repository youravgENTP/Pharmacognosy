import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { unarchiveDrug } from "@/lib/archive";
const schema = z.object({ entryId: z.string().uuid(), index: z.number().int().positive().optional(), catalogIndex: z.number().int().positive().optional() }).refine((value) => value.index === undefined || value.catalogIndex === undefined, "인덱스는 한 번만 지정해 주세요.");
export async function POST(request: Request) {
  const current = await getCurrentUser(request.headers);
  if (!current) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (current.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Archive 항목 또는 인덱스를 확인해 주세요." }, { status: 400 });
  try { return NextResponse.json(await unarchiveDrug(parsed.data.entryId, parsed.data.index ?? parsed.data.catalogIndex, current.id)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Archive 해제에 실패했습니다." }, { status: 409 }); }
}
