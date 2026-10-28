import { and, eq, gt, isNull, max, or, sql } from "drizzle-orm";
import { authorizeApi } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { loadBackupTables } from "@/lib/backup/server";
import { lockManualSynchronization } from "@/lib/data-card-integrity";

export const runtime = "nodejs";
export const maxDuration = 300;
const SESSION_TTL_MS = 90_000;

export async function GET() {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const blockers = await loadSessionBlockers(db);
  return Response.json({ canSynchronize: blockers.length === 0, blockers }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const current = await getCurrentUser(request.headers); if (!current) return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`set transaction isolation level repeatable read`);
      await lockManualSynchronization(tx);
      const blockers = await loadSessionBlockers(tx);
      if (blockers.length) return { blocked: true as const, blockers };

      const [cards, revisions] = await Promise.all([tx.select().from(schema.crudeDrugs), tx.select().from(schema.dataCardRevisions)]);
      const revisionMap = new Map(revisions.map((revision) => [`${revision.drugId}:${revision.revision}`, revision]));
      const missing = cards.filter((card) => !revisionMap.has(`${card.id}:${card.dataRevision}`));
      if (missing.length) return { unverified: true as const, missing: missing.map((card) => ({ id: card.id, koreanName: card.koreanName, revision: card.dataRevision })) };

      const [[boundary], tables, migration] = await Promise.all([
        tx.select({ revision: max(schema.backupOutbox.revision), consistency: sql<string>`txid_current_snapshot()::text` }).from(schema.backupOutbox),
        loadBackupTables(tx),
        tx.execute(sql`select max(created_at)::text as version from drizzle.__drizzle_migrations`),
      ]);
      const consistencyBoundary = boundary?.consistency ?? "unknown";
      const schemaVersion = String((migration as unknown as { version: string | null }[])[0]?.version ?? "unknown");
      // This state prevents the legacy external worker from claiming a browser-local capture.
      const [snapshot] = await tx.insert(schema.backupSnapshots).values({ requestedBy: current.id, targetRevision: boundary?.revision ?? 0, includedRevision: boundary?.revision ?? 0, consistencyBoundary, schemaVersion, status: "superseded", dataCardCount: cards.length, progressCurrent: 1, progressTotal: 1 }).returning();
      await tx.insert(schema.backupSnapshotCaptures).values({ snapshotId: snapshot.id, tables, consistencyBoundary, schemaVersion });
      return { snapshotId: snapshot.id, capturedAt: new Date().toISOString() };
    });
    if ("blocked" in result) return Response.json({ error: "열려 있거나 저장 검증이 끝나지 않은 Data Card가 있습니다.", code: "OPEN_DATA_CARDS", blockers: result.blockers }, { status: 409 });
    if ("unverified" in result) return Response.json({ error: "현재 Data Card Revision 중 불변 기록이 없는 항목이 있습니다.", code: "UNVERIFIED_REVISIONS", cards: result.missing }, { status: 409 });
    return Response.json({ ...result, status: "captured", mode: "local-full" }, { status: 201 });
  } catch (error) {
    console.error("Local backup synchronization failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "로컬 전체 백업 스냅샷을 준비하지 못했습니다." }, { status: 500 });
  }
}

type SessionDatabase = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
async function loadSessionBlockers(database: SessionDatabase) {
  const cutoff = new Date(Date.now() - SESSION_TTL_MS);
  const rows = await database.select({ sessionId: schema.dataCardEditSessions.id, drugId: schema.crudeDrugs.id, koreanName: schema.crudeDrugs.koreanName, catalogIndex: schema.crudeDrugs.catalogIndex, referenceIndex: schema.crudeDrugs.referenceIndex, archivePrefix: schema.archiveGroups.prefix, archiveOriginalIndex: schema.archiveEntries.originalIndex, archiveOriginalIndexType: schema.archiveEntries.originalIndexType, userId: schema.user.id, userName: schema.user.name, userEmail: schema.user.email, lastSeenAt: schema.dataCardEditSessions.lastSeenAt, closedAt: schema.dataCardEditSessions.closedAt, closeVerified: schema.dataCardEditSessions.closeVerified, lastError: schema.dataCardEditSessions.lastError }).from(schema.dataCardEditSessions).innerJoin(schema.crudeDrugs, eq(schema.crudeDrugs.id, schema.dataCardEditSessions.drugId)).innerJoin(schema.user, eq(schema.user.id, schema.dataCardEditSessions.userId)).leftJoin(schema.archiveEntries, eq(schema.archiveEntries.drugId, schema.crudeDrugs.id)).leftJoin(schema.archiveGroups, eq(schema.archiveGroups.id, schema.archiveEntries.archiveGroupId)).where(or(and(isNull(schema.dataCardEditSessions.closedAt), gt(schema.dataCardEditSessions.lastSeenAt, cutoff)), eq(schema.dataCardEditSessions.closeVerified, false)));
  return rows.map((row) => ({ ...row, displayIndex: row.archivePrefix && row.archiveOriginalIndex != null ? `${row.archivePrefix}${row.archiveOriginalIndexType === "reference" ? "R" : ""}${String(row.archiveOriginalIndex).padStart(2, "0")}` : row.catalogIndex != null ? String(row.catalogIndex) : row.referenceIndex != null ? `R${String(row.referenceIndex).padStart(2, "0")}` : "—", state: !row.closedAt && row.lastSeenAt > cutoff ? "active" : row.lastError ? "verification-failed" : "expired-unverified" }));
}
