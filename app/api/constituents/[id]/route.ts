import { authorizeApi } from "@/lib/auth/permissions";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { constituents, crudeDrugConstituents } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

const patchSchema = z.object({ name: z.string().trim().min(1).max(160).optional(), aliases: z.array(z.string().trim().min(1).max(160)).max(40).optional() }).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params; const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const [updated] = await db.update(constituents).set(parsed.data).where(eq(constituents.id, id)).returning();
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") return NextResponse.json({ error: "이미 존재하는 constituent 이름입니다." }, { status: 409 });
    throw error;
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params; if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const references = await db.select({ drugId: crudeDrugConstituents.crudeDrugId }).from(crudeDrugConstituents).where(eq(crudeDrugConstituents.constituentId, id));
  if (references.length) return NextResponse.json({ error: `이 constituent는 ${references.length}개 생약의 과학 데이터에서 참조 중이므로 삭제할 수 없습니다.` }, { status: 409 });
  const [deleted] = await db.delete(constituents).where(eq(constituents.id, id)).returning({ id: constituents.id });
  return deleted ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
