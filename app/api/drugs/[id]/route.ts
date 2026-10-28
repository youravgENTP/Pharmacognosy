import { authorizeApi } from "@/lib/auth/permissions";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { crudeDrugs, dataCardRevisions, fieldDefinitions } from "@/lib/db/schema";
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
    const current = await getCurrentUser(request.headers);
    const { baseRevision, ...patch } = parsed.data;
    const [mnemonicField] = parsed.data.sections ? await db.select({ id: fieldDefinitions.id }).from(fieldDefinitions).where(eq(fieldDefinitions.name, "암기법")).limit(1) : [];
    const sections = parsed.data.sections?.map((section) => section.title === "암기법" || section.fieldDefinitionId === mnemonicField?.id ? { ...section, items: [], blocks: [] } : section);
    const where = and(eq(crudeDrugs.id, id), eq(crudeDrugs.dataRevision, baseRevision));
    const [updated] = await db.update(crudeDrugs).set({ ...patch, ...(sections ? { sections } : {}), dataRevision: sql`${crudeDrugs.dataRevision} + 1`, updatedAt: new Date() }).where(where).returning();
    if (!updated) {
      const [latest] = await db.select({ revision: crudeDrugs.dataRevision }).from(crudeDrugs).where(eq(crudeDrugs.id, id)).limit(1);
      return latest ? NextResponse.json({ error: "다른 편집 내용이 먼저 저장되었습니다. 최신 내용을 새로고침한 뒤 다시 시도해 주세요.", code: "REVISION_CONFLICT", currentRevision: latest.revision }, { status: 409 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    let revisionRecorded = false;
    try {
      await db.insert(dataCardRevisions).values({ drugId: id, revision: updated.dataRevision, content: updated, savedBy: current?.id }).onConflictDoNothing();
      revisionRecorded = true;
    } catch (revisionError) {
      // The primary Data Card write is authoritative. Reconciliation can capture a
      // missed revision; backup bookkeeping must never invalidate a saved edit.
      console.error("Unable to record immutable Data Card revision", revisionError);
    }
    return NextResponse.json({ ...updated, dataRevision: updated.dataRevision, revisionRecorded });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") return NextResponse.json({ error: "이미 존재하는 생약명입니다." }, { status: 409 });
    throw error;
  }
}
