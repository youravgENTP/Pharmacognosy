import { after } from "next/server";
import { and, desc, eq, gt, inArray, isNull, max, or, sql } from "drizzle-orm";
import { authorizeApi } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { backupStorageConfigured, incrementalBackupEnabled } from "@/lib/backup/storage";
import { loadBackupTables } from "@/lib/backup/server";
import { runBackupWorker } from "@/lib/backup/worker";
import { lockManualSynchronization } from "@/lib/data-card-integrity";

export const runtime = "nodejs";
export const maxDuration = 300;
const ACTIVE_SNAPSHOT_STATES: schema.BackupSnapshotStatus[] = ["pending", "collecting", "building", "verifying", "retrying"];
const SESSION_TTL_MS = 90_000;

export async function GET() {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  return Response.json(await synchronizationReadiness(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const current = await getCurrentUser(request.headers); if (!current) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!incrementalBackupEnabled()) return Response.json({ error: "증분 백업 Worker가 비활성화되어 있습니다.", code: "WORKER_DISABLED" }, { status: 503 });
  if (!backupStorageConfigured()) return Response.json({ error: "독립 백업 저장소가 구성되지 않았습니다.", code: "STORAGE_UNAVAILABLE" }, { status: 503 });
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`set transaction isolation level repeatable read`);
      await lockManualSynchronization(tx);
      const blockers = await loadSessionBlockers(tx);
      if (blockers.length) return { blocked: true as const, blockers };
      const [active] = await tx.select({ id: schema.backupSnapshots.id }).from(schema.backupSnapshots).where(inArray(schema.backupSnapshots.status, ACTIVE_SNAPSHOT_STATES)).orderBy(desc(schema.backupSnapshots.createdAt)).limit(1);
      if (active) return { busy: true as const, snapshotId: active.id };
      const [cards, revisions] = await Promise.all([
        tx.select().from(schema.crudeDrugs),
        tx.select().from(schema.dataCardRevisions),
      ]);
      const revisionMap = new Map(revisions.map((revision) => [`${revision.drugId}:${revision.revision}`, revision]));
      const missing = cards.filter((card) => !revisionMap.has(`${card.id}:${card.dataRevision}`));
      if (missing.length) return { unverified: true as const, missing: missing.map((card) => ({ id: card.id, koreanName: card.koreanName, revision: card.dataRevision })) };
      const [[boundary], tables, migration] = await Promise.all([
        tx.select({ revision: max(schema.backupOutbox.revision), consistency: sql<string>`txid_current_snapshot()::text` }).from(schema.backupOutbox),
        loadBackupTables(tx),
        tx.execute(sql`select max(created_at)::text as version from drizzle.__drizzle_migrations`),
      ]);
      const schemaVersion = String((migration as unknown as { version: string | null }[])[0]?.version ?? "unknown");
      const [snapshot] = await tx.insert(schema.backupSnapshots).values({ requestedBy: current.id, targetRevision: boundary?.revision ?? 0, includedRevision: boundary?.revision ?? 0, consistencyBoundary: boundary?.consistency ?? "unknown", schemaVersion, status: "pending" }).returning();
      await tx.insert(schema.backupSnapshotCaptures).values({ snapshotId: snapshot.id, tables, consistencyBoundary: boundary?.consistency ?? "unknown", schemaVersion });
      const now = new Date();
      if (cards.length) await tx.insert(schema.dataCardBackupSnapshots).values(cards.map((card) => {
        const revision = revisionMap.get(`${card.id}:${card.dataRevision}`)!;
        return { drugId: card.id, revision: card.dataRevision, content: revision.content, eligibleAt: now, frozenAt: now, status: "pending" as const };
      })).onConflictDoNothing();
      return { snapshot, initial: !(await tx.select({ id: schema.backupSnapshots.id }).from(schema.backupSnapshots).where(eq(schema.backupSnapshots.status, "ready")).limit(1)).length };
    });
    if ("blocked" in result) return Response.json({ error: "열려 있거나 저장 검증이 끝나지 않은 Data Card가 있습니다.", code: "OPEN_DATA_CARDS", blockers: result.blockers }, { status: 409 });
    if ("busy" in result) return Response.json({ error: "이미 동기화 작업이 진행 중입니다.", code: "SYNC_IN_PROGRESS", snapshotId: result.snapshotId }, { status: 409 });
    if ("unverified" in result) return Response.json({ error: "현재 Data Card Revision 중 불변 기록이 없는 항목이 있습니다.", code: "UNVERIFIED_REVISIONS", cards: result.missing }, { status: 409 });
    after(async () => {
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          const worker = await runBackupWorker({ forceSnapshot: true });
          if (!("busy" in worker) || !worker.busy) return;
          await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
        }
        console.error("Manual backup synchronization worker remained busy after immediate retries");
      } catch (error) { console.error("Manual backup synchronization worker failed", error); }
    });
    return Response.json({ snapshotId: result.snapshot.id, status: "pending", mode: result.initial ? "initial" : "incremental", workerTriggered: true }, { status: 202 });
  } catch (error) {
    console.error("Manual synchronization failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "수동 동기화를 시작하지 못했습니다." }, { status: 500 });
  }
}

async function synchronizationReadiness() {
  const blockers = await loadSessionBlockers(db);
  const [latestReady, active] = await Promise.all([
    db.select({ id: schema.backupSnapshots.id, completedAt: schema.backupSnapshots.completedAt }).from(schema.backupSnapshots).where(eq(schema.backupSnapshots.status, "ready")).orderBy(desc(schema.backupSnapshots.completedAt)).limit(1).then((rows) => rows[0] ?? null),
    db.select({ id: schema.backupSnapshots.id, status: schema.backupSnapshots.status }).from(schema.backupSnapshots).where(inArray(schema.backupSnapshots.status, ACTIVE_SNAPSHOT_STATES)).orderBy(desc(schema.backupSnapshots.createdAt)).limit(1).then((rows) => rows[0] ?? null),
  ]);
  return { canSynchronize: incrementalBackupEnabled() && backupStorageConfigured() && !blockers.length && !active, enabled: incrementalBackupEnabled(), storageConfigured: backupStorageConfigured(), mode: latestReady ? "incremental" : "initial", latestReady, active, blockers };
}

type SessionDatabase = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
async function loadSessionBlockers(database: SessionDatabase) {
  const cutoff = new Date(Date.now() - SESSION_TTL_MS);
  const rows = await database.select({ sessionId: schema.dataCardEditSessions.id, drugId: schema.crudeDrugs.id, koreanName: schema.crudeDrugs.koreanName, catalogIndex: schema.crudeDrugs.catalogIndex, referenceIndex: schema.crudeDrugs.referenceIndex, archivePrefix: schema.archiveGroups.prefix, archiveOriginalIndex: schema.archiveEntries.originalIndex, archiveOriginalIndexType: schema.archiveEntries.originalIndexType, userId: schema.user.id, userName: schema.user.name, userEmail: schema.user.email, lastSeenAt: schema.dataCardEditSessions.lastSeenAt, closedAt: schema.dataCardEditSessions.closedAt, closeVerified: schema.dataCardEditSessions.closeVerified, lastError: schema.dataCardEditSessions.lastError }).from(schema.dataCardEditSessions).innerJoin(schema.crudeDrugs, eq(schema.crudeDrugs.id, schema.dataCardEditSessions.drugId)).innerJoin(schema.user, eq(schema.user.id, schema.dataCardEditSessions.userId)).leftJoin(schema.archiveEntries, eq(schema.archiveEntries.drugId, schema.crudeDrugs.id)).leftJoin(schema.archiveGroups, eq(schema.archiveGroups.id, schema.archiveEntries.archiveGroupId)).where(or(and(isNull(schema.dataCardEditSessions.closedAt), gt(schema.dataCardEditSessions.lastSeenAt, cutoff)), eq(schema.dataCardEditSessions.closeVerified, false)));
  return rows.map((row) => ({ ...row, displayIndex: row.archivePrefix && row.archiveOriginalIndex != null ? `${row.archivePrefix}${row.archiveOriginalIndexType === "reference" ? "R" : ""}${String(row.archiveOriginalIndex).padStart(2, "0")}` : row.catalogIndex != null ? String(row.catalogIndex) : row.referenceIndex != null ? `R${String(row.referenceIndex).padStart(2, "0")}` : "—", state: !row.closedAt && row.lastSeenAt > cutoff ? "active" : row.lastError ? "verification-failed" : "expired-unverified" }));
}
