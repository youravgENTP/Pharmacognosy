import { and, eq, isNull, or } from "drizzle-orm";
import { authorizeApi } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { crudeDrugIdentityTerms, crudeDrugRelationships, crudeDrugs, dataCardEditSessions, dataCardRevisions, fieldDefinitions } from "@/lib/db/schema";
import { dataCardContentHash, lockDataCardMutation } from "@/lib/data-card-integrity";
import { dataCardContentSchema, uuidSchema } from "@/lib/validators";
import { normalizeDataCardContent } from "@/lib/data-card-content";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params; const body = await request.json().catch(() => null);
  const sessionId = body && typeof body === "object" && "sessionId" in body ? body.sessionId : null;
  if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(sessionId).success) return Response.json({ error: "Invalid editing session" }, { status: 400 });
  const current = await getCurrentUser(request.headers); if (!current) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await db.transaction(async (tx) => {
    await lockDataCardMutation(tx);
    await tx.insert(dataCardEditSessions).values({ id: sessionId, drugId: id, userId: current.id, lastSeenAt: new Date(), closedAt: null, closeVerified: false, verifiedRevision: null, verifiedAt: null, lastError: null }).onConflictDoUpdate({ target: dataCardEditSessions.id, set: { lastSeenAt: new Date(), closedAt: null, closeVerified: false, verifiedRevision: null, verifiedAt: null, lastError: null } });
  });
  return Response.json({ status: "open" });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params; const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const sessionId = body && typeof body === "object" && "sessionId" in body ? body.sessionId : null;
  if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(sessionId).success) return Response.json({ error: "Invalid editing session" }, { status: 400 });
  const current = await getCurrentUser(request.headers); if (!current) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const content = dataCardContentSchema.safeParse(body?.content);
  const revision = typeof body?.revision === "number" && Number.isInteger(body.revision) && body.revision >= 0 ? body.revision : null;
  const requestedHash = typeof body?.contentHash === "string" ? body.contentHash : null;
  const relationshipIds = Array.isArray(body?.relationshipIds) && body.relationshipIds.every((value) => uuidSchema.safeParse(value).success) ? [...body.relationshipIds as string[]].sort() : null;
  const identityTermIds = Array.isArray(body?.identityTermIds) && body.identityTermIds.every((value) => uuidSchema.safeParse(value).success) ? [...body.identityTermIds as string[]].sort() : null;
  if (!content.success || revision == null || !requestedHash || !relationshipIds || !identityTermIds) return Response.json({ error: "저장 검증 정보가 완전하지 않습니다." }, { status: 400 });
  const result = await db.transaction(async (tx) => {
    await lockDataCardMutation(tx);
    const [[drug], [recorded], [mnemonicField], storedRelationships, storedIdentityTerms] = await Promise.all([
      tx.select().from(crudeDrugs).where(eq(crudeDrugs.id, id)).limit(1),
      tx.select({ revision: dataCardRevisions.revision }).from(dataCardRevisions).where(and(eq(dataCardRevisions.drugId, id), eq(dataCardRevisions.revision, revision))).limit(1),
      tx.select({ id: fieldDefinitions.id }).from(fieldDefinitions).where(eq(fieldDefinitions.name, "암기법")).limit(1),
      tx.select({ id: crudeDrugRelationships.id }).from(crudeDrugRelationships).where(or(eq(crudeDrugRelationships.sourceId, id), eq(crudeDrugRelationships.targetId, id))),
      tx.select({ id: crudeDrugIdentityTerms.termId }).from(crudeDrugIdentityTerms).where(eq(crudeDrugIdentityTerms.crudeDrugId, id)),
    ]);
    const normalizedContent = normalizeDataCardContent(content.data, mnemonicField?.id);
    const expectedHash = dataCardContentHash(normalizedContent);
    const storedHash = drug ? dataCardContentHash(drug) : null;
    const relationshipsMatch = sameIds(storedRelationships.map((row) => row.id), relationshipIds);
    const identityTermsMatch = sameIds(storedIdentityTerms.map((row) => row.id), identityTermIds);
    if (!drug || drug.dataRevision !== revision || !recorded || requestedHash !== expectedHash || storedHash !== expectedHash || !relationshipsMatch || !identityTermsMatch) {
      await tx.update(dataCardEditSessions).set({ lastError: "SERVER_CONTENT_MISMATCH", lastSeenAt: new Date() }).where(and(eq(dataCardEditSessions.id, sessionId as string), eq(dataCardEditSessions.drugId, id), eq(dataCardEditSessions.userId, current.id)));
      return null;
    }
    const [closed] = await tx.update(dataCardEditSessions).set({ closedAt: new Date(), lastSeenAt: new Date(), closeVerified: true, verifiedRevision: revision, verifiedAt: new Date(), lastError: null }).where(and(eq(dataCardEditSessions.id, sessionId as string), eq(dataCardEditSessions.drugId, id), eq(dataCardEditSessions.userId, current.id), isNull(dataCardEditSessions.closedAt))).returning();
    return closed ? { revision, contentHash: storedHash } : null;
  });
  return result ? Response.json({ status: "closed", verified: true, ...result }) : Response.json({ error: "서버 저장 내용이 현재 편집 내용과 일치하지 않아 카드를 닫지 않았습니다.", code: "SAVE_VERIFICATION_FAILED" }, { status: 409 });
}

function sameIds(left: string[], right: string[]) { return [...left].sort().join("\n") === [...right].sort().join("\n"); }
