import { authorizeApi } from "@/lib/auth/permissions";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { crudeDrugs, dataCardRevisions, fieldDefinitions } from "@/lib/db/schema";
import { dataCardContentHash, lockDataCardMutation } from "@/lib/data-card-integrity";
import { drugPatchSchema, uuidSchema } from "@/lib/validators";
import { getDrugProfile } from "@/lib/data/drug";
import { normalizeStudySections } from "@/lib/data-card-content";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("user"); if (authError) return authError;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const drug = await getDrugProfile(id);
  return drug ? NextResponse.json(drug) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params;
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const editingSessionId = request.headers.get("x-editing-session-id");
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const parsed = drugPatchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const current = await getCurrentUser(request.headers);
    const { baseRevision, ...patch } = parsed.data;
    const [mnemonicField] = parsed.data.sections ? await db.select({ id: fieldDefinitions.id }).from(fieldDefinitions).where(eq(fieldDefinitions.name, "암기법")).limit(1) : [];
    const sections = parsed.data.sections ? normalizeStudySections(parsed.data.sections, mnemonicField?.id) : undefined;
    const updated = await db.transaction(async (tx) => {
      await lockDataCardMutation(tx);
      const where = and(eq(crudeDrugs.id, id), eq(crudeDrugs.dataRevision, baseRevision));
      const [saved] = await tx.update(crudeDrugs).set({ ...patch, ...(sections ? { sections } : {}), dataRevision: sql`${crudeDrugs.dataRevision} + 1`, updatedAt: new Date() }).where(where).returning();
      if (!saved) return null;
      await tx.insert(dataCardRevisions).values({ drugId: id, revision: saved.dataRevision, content: saved, savedBy: current?.id });
      return saved;
    });
    if (!updated) {
      const [latest] = await db.select({ revision: crudeDrugs.dataRevision }).from(crudeDrugs).where(eq(crudeDrugs.id, id)).limit(1);
      console.info("data_card_save", { drugId: id, requestId, editingSessionId, baseRevision, currentRevision: latest?.revision, saveResult: latest ? "conflict" : "not_found", conflictType: "revision_mismatch", timestamp: new Date().toISOString() });
      return latest ? NextResponse.json({ error: "다른 편집 내용이 먼저 저장되었습니다. 최신 내용을 새로고침한 뒤 다시 시도해 주세요.", code: "REVISION_CONFLICT", currentRevision: latest.revision, requestId }, { status: 409 }) : NextResponse.json({ error: "Not found", requestId }, { status: 404 });
    }
    console.info("data_card_save", { drugId: id, requestId, editingSessionId, baseRevision, currentRevision: updated.dataRevision, saveResult: "saved", timestamp: new Date().toISOString() });
    return NextResponse.json({ ...updated, dataRevision: updated.dataRevision, contentHash: dataCardContentHash(updated), revisionRecorded: true });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") return NextResponse.json({ error: "이미 존재하는 생약명입니다." }, { status: 409 });
    throw error;
  }
}
