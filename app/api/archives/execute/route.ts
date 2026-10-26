import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { archiveDrugs } from "@/lib/archive";
const schema = z.object({ groupId: z.string().uuid(), drugIds: z.array(z.string().uuid()).min(1), confirmed: z.literal(true) });
export async function POST(request: Request) {
  const current = await getCurrentUser(request.headers);
  if (!current) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (current.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "명시적인 확인이 필요합니다." }, { status: 400 });
  try { return NextResponse.json(await archiveDrugs(parsed.data.groupId, parsed.data.drugIds, current.id)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Archive 실행에 실패했습니다." }, { status: 409 }); }
}
