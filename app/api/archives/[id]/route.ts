import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApi } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { archiveEntries, archiveGroups } from "@/lib/db/schema";

const schema = z.object({ name: z.string().trim().min(1).max(120), prefix: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{0,7}$/), description: z.string().trim().max(500).nullable().optional() });
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "입력값을 확인해 주세요." }, { status: 400 });
  try {
    const { id } = await params;
    const [group] = await db.update(archiveGroups).set({ ...parsed.data, description: parsed.data.description || null, updatedAt: new Date() }).where(eq(archiveGroups.id, id)).returning();
    return group ? NextResponse.json(group) : NextResponse.json({ error: "그룹을 찾을 수 없습니다." }, { status: 404 });
  } catch { return NextResponse.json({ error: "같은 이름 또는 Prefix의 그룹이 이미 있습니다." }, { status: 409 }); }
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const { id } = await params;
  const [entry] = await db.select({ id: archiveEntries.id }).from(archiveEntries).where(eq(archiveEntries.archiveGroupId, id)).limit(1);
  if (entry) return NextResponse.json({ error: "생약이 포함된 Archive 그룹은 삭제할 수 없습니다." }, { status: 409 });
  const [deleted] = await db.delete(archiveGroups).where(eq(archiveGroups.id, id)).returning({ id: archiveGroups.id });
  return deleted ? NextResponse.json(deleted) : NextResponse.json({ error: "그룹을 찾을 수 없습니다." }, { status: 404 });
}
