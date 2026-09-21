import { authorizeApi } from "@/lib/auth/permissions";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { fieldDefinitions } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params;
  const parsed = z.object({ name: z.string().trim().min(1).max(100).optional(), inputMode: z.enum(["hierarchy4", "hierarchy3", "text"]).optional() }).refine((value) => value.name || value.inputMode).safeParse(await request.json());
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "잘못된 입력입니다." }, { status: 400 });
  const [field] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id)).limit(1);
  if (!field) return NextResponse.json({ error: "필드를 찾을 수 없습니다." }, { status: 404 });
  if (field.kind !== "custom") return NextResponse.json({ error: "기본 필드의 이름은 변경할 수 없습니다." }, { status: 403 });
  try {
    const [updated] = await db.update(fieldDefinitions).set({ ...parsed.data, updatedAt: new Date() }).where(eq(fieldDefinitions.id, id)).returning();
    return NextResponse.json(updated);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") return NextResponse.json({ error: "이미 존재하는 필드입니다." }, { status: 409 });
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "잘못된 ID입니다." }, { status: 400 });
  const [field] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id)).limit(1);
  if (!field) return NextResponse.json({ error: "필드를 찾을 수 없습니다." }, { status: 404 });
  if (field.kind !== "custom") return NextResponse.json({ error: "기본 필드는 보관할 수 없습니다." }, { status: 403 });
  await db.update(fieldDefinitions).set({ active: false, updatedAt: new Date() }).where(eq(fieldDefinitions.id, id));
  return new NextResponse(null, { status: 204 });
}
