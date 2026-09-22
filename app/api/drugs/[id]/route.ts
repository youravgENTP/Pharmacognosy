import { authorizeApi } from "@/lib/auth/permissions";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crudeDrugs, fieldDefinitions } from "@/lib/db/schema";
import { drugPatchSchema, uuidSchema } from "@/lib/validators";
import { getDrugProfile } from "@/lib/data/drug";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("user"); if (authError) return authError;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const drug = await getDrugProfile(id);
  return drug ? NextResponse.json(drug) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const parsed = drugPatchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const [mnemonicField] = parsed.data.sections ? await db.select({ id: fieldDefinitions.id }).from(fieldDefinitions).where(eq(fieldDefinitions.name, "암기법")).limit(1) : [];
    const sections = parsed.data.sections?.map((section) => section.title === "암기법" || section.fieldDefinitionId === mnemonicField?.id ? { ...section, items: [], blocks: [] } : section);
    const [updated] = await db.update(crudeDrugs).set({ ...parsed.data, ...(sections ? { sections } : {}), updatedAt: new Date() }).where(eq(crudeDrugs.id, id)).returning();
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") return NextResponse.json({ error: "이미 존재하는 생약명입니다." }, { status: 409 });
    throw error;
  }
}
