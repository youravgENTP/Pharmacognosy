import "server-only";
import { createHash } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, asc, desc, eq, inArray, lte, max, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { loadBackupTables } from "@/lib/backup/server";
import { backupFreshness, backupRetryDelayMs, shouldScheduleSnapshot, snapshotDownloadState, snapshotIdsBeyondRetention } from "@/lib/backup/incremental";
import { dataCardBackupEligibility } from "@/lib/backup/data-card-lifecycle";
import { buildStreamingBackupArchive, inspectByteStream, sha256File, verifyStreamingBackupArchive, type CachedSnapshotMedia } from "@/lib/backup/streaming-archive";
import { backupStorageConfigured, getBackupStorage, incrementalBackupEnabled } from "@/lib/backup/storage";
import { MediaReadError, readMediaAssetBytesDetailed } from "@/lib/media/read";

const ACTIVE_SNAPSHOT_STATES: schema.BackupSnapshotStatus[] = ["pending", "collecting", "building", "verifying", "retrying"];

export async function currentBackupRevision() {
  const [row] = await db.select({ value: max(schema.backupOutbox.revision) }).from(schema.backupOutbox);
  return row?.value ?? 0;
}

export async function requestFullSnapshot(userId?: string, allowIncomplete = false) {
  if (!incrementalBackupEnabled() || !backupStorageConfigured()) throw new Error("증분 전체 백업 인프라가 아직 구성되지 않았습니다.");
  const revision = await currentBackupRevision();
  const active = await db.select().from(schema.backupSnapshots).where(inArray(schema.backupSnapshots.status, ACTIVE_SNAPSHOT_STATES)).orderBy(desc(schema.backupSnapshots.createdAt));
  const existing = active.find((snapshot) => !snapshot.allowIncomplete || allowIncomplete);
  if (existing) return { snapshot: existing, coalesced: true };
  const [snapshot] = await db.insert(schema.backupSnapshots).values({ requestedBy: userId, targetRevision: revision, status: "pending", allowIncomplete }).returning();
  return { snapshot, coalesced: false };
}

export async function getIncrementalBackupStatus() {
  const [latestRevision, latestReady, active, pendingMedia, failedMedia, failedMediaItems, worker, lastChange, objectUsage, snapshotUsage] = await Promise.all([
    currentBackupRevision(),
    db.select().from(schema.backupSnapshots).where(eq(schema.backupSnapshots.status, "ready")).orderBy(desc(schema.backupSnapshots.completedAt)).limit(1).then((rows) => rows[0] ?? null),
    db.select().from(schema.backupSnapshots).where(inArray(schema.backupSnapshots.status, ACTIVE_SNAPSHOT_STATES)).orderBy(desc(schema.backupSnapshots.createdAt)).limit(1).then((rows) => rows[0] ?? null),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.backupMediaAssets).where(inArray(schema.backupMediaAssets.status, ["pending", "processing", "retrying"])).then((rows) => rows[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.backupMediaAssets).where(eq(schema.backupMediaAssets.status, "failed")).then((rows) => rows[0]?.count ?? 0),
    db.select({ id: schema.backupMediaAssets.mediaAssetId, attempts: schema.backupMediaAssets.attempts, lastError: schema.backupMediaAssets.lastError, updatedAt: schema.backupMediaAssets.updatedAt }).from(schema.backupMediaAssets).where(eq(schema.backupMediaAssets.status, "failed")).orderBy(desc(schema.backupMediaAssets.updatedAt)).limit(25),
    db.select().from(schema.backupWorkerState).where(eq(schema.backupWorkerState.id, "primary")).limit(1).then((rows) => rows[0] ?? null),
    db.select({ at: max(schema.backupOutbox.createdAt) }).from(schema.backupOutbox).then((rows) => rows[0]?.at ?? null),
    db.select({ bytes: sql<number>`coalesce(sum(${schema.backupMediaObjects.sizeBytes}),0)::bigint` }).from(schema.backupMediaObjects).then((rows) => Number(rows[0]?.bytes ?? 0)),
    db.select({ bytes: sql<number>`coalesce(sum(${schema.backupSnapshots.zipBytes}),0)::bigint` }).from(schema.backupSnapshots).where(inArray(schema.backupSnapshots.status, ["ready", "superseded"])).then((rows) => Number(rows[0]?.bytes ?? 0)),
  ]);
  const freshness = backupFreshness(latestRevision, latestReady?.includedRevision);
  return { enabled: incrementalBackupEnabled(), storageConfigured: backupStorageConfigured(), latestRevision, lastChangeAt: lastChange, latestReady, active, pendingMedia, failedMedia, failedMediaItems, worker, storageBytes: objectUsage + snapshotUsage, ...freshness, download: snapshotDownloadState(latestRevision, latestReady) };
}

export async function retryFailedBackupMedia(ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return { retried: 0 };
  const rows = await db.update(schema.backupMediaAssets).set({ status: "retrying", attempts: 0, availableAt: new Date(), claimedAt: null, lastError: null, updatedAt: new Date() }).where(and(inArray(schema.backupMediaAssets.mediaAssetId, unique), eq(schema.backupMediaAssets.status, "failed"))).returning({ id: schema.backupMediaAssets.mediaAssetId });
  return { retried: rows.length, ids: rows.map((row) => row.id) };
}

export async function runBackupWorker(options: { mediaLimit?: number; outboxLimit?: number; forceSnapshot?: boolean } = {}) {
  if (!incrementalBackupEnabled()) return { disabled: true, reason: "INCREMENTAL_BACKUP_ENABLED is not true" };
  if (!backupStorageConfigured()) throw new Error("독립 백업 저장소가 구성되지 않았습니다.");
  const acquired = await acquireWorkerLease();
  if (!acquired) return { busy: true };
  let processed = 0;
  try {
    await reconcileBackupState();
    processed += await processDataCardBackupSnapshots();
    processed += await processMediaJobs(options.mediaLimit ?? 6);
    processed += await acknowledgeOutbox(options.outboxLimit ?? 500);
    await scheduleSnapshotIfNeeded(Boolean(options.forceSnapshot));
    const snapshot = await claimSnapshot();
    if (snapshot) { await buildSnapshot(snapshot); processed++; }
    await db.update(schema.backupWorkerState).set({ status: "idle", heartbeatAt: new Date(), lastRunCompletedAt: new Date(), lastError: null, processedJobs: sql`${schema.backupWorkerState.processedJobs} + ${processed}` }).where(eq(schema.backupWorkerState.id, "primary"));
    return { busy: false, processed, snapshotId: snapshot?.id ?? null };
  } catch (error) {
    await db.update(schema.backupWorkerState).set({ status: "failed", heartbeatAt: new Date(), lastRunCompletedAt: new Date(), lastError: safeError(error) }).where(eq(schema.backupWorkerState.id, "primary"));
    throw error;
  }
}

async function acquireWorkerLease() {
  const stale = new Date(Date.now() - 10 * 60_000);
  const [row] = await db.update(schema.backupWorkerState).set({ status: "running", heartbeatAt: new Date(), lastRunStartedAt: new Date(), lastError: null }).where(and(eq(schema.backupWorkerState.id, "primary"), or(ne(schema.backupWorkerState.status, "running"), lte(schema.backupWorkerState.heartbeatAt, stale)))).returning({ id: schema.backupWorkerState.id });
  return Boolean(row);
}

export async function reconcileBackupState() {
  const stale = new Date(Date.now() - 15 * 60_000);
  const [state] = await db.select().from(schema.backupWorkerState).where(eq(schema.backupWorkerState.id, "primary")).limit(1);
  const reconciliationInterval = Number(process.env.BACKUP_RECONCILIATION_INTERVAL_MS ?? 60 * 60_000);
  const fullReconciliationDue = !state?.lastReconciledAt || Date.now() - state.lastReconciledAt.getTime() >= reconciliationInterval;
  if (fullReconciliationDue) await db.insert(schema.backupOutbox).values({ tableName: "system", operation: "RECONCILE", entityId: `reconcile-${Date.now()}` });
  await db.update(schema.backupOutbox).set({ status: "retrying", availableAt: new Date(), claimedAt: null, lastError: "abandoned job recovered" }).where(and(eq(schema.backupOutbox.status, "processing"), lte(schema.backupOutbox.claimedAt, stale)));
  await db.update(schema.backupMediaAssets).set({ status: "retrying", availableAt: new Date(), claimedAt: null, lastError: "abandoned media job recovered", updatedAt: new Date() }).where(and(eq(schema.backupMediaAssets.status, "processing"), lte(schema.backupMediaAssets.claimedAt, stale)));
  await db.update(schema.backupSnapshots).set({ status: "retrying", availableAt: new Date(), lastError: "interrupted snapshot recovered" }).where(and(inArray(schema.backupSnapshots.status, ["collecting", "building", "verifying"]), lte(schema.backupSnapshots.startedAt, stale)));
  if (fullReconciliationDue) {
    const assets = await db.select({ id: schema.mediaAssets.id }).from(schema.mediaAssets);
    if (assets.length) await db.insert(schema.backupMediaAssets).values(assets.map((asset) => ({ mediaAssetId: asset.id }))).onConflictDoNothing();
    // A successful card save must never be rolled back merely because its
    // immutable revision record could not be written immediately afterwards.
    // Reconciliation closes that (rare) gap from the primary record, without
    // putting storage, ZIP, or outbox work back on the user's save path.
    const [cards, recordedRevisions] = await Promise.all([
      db.select().from(schema.crudeDrugs),
      db.select({ drugId: schema.dataCardRevisions.drugId, revision: schema.dataCardRevisions.revision }).from(schema.dataCardRevisions),
    ]);
    const recorded = new Set(recordedRevisions.map((row) => `${row.drugId}:${row.revision}`));
    const missingRevisions = cards.filter((card) => !recorded.has(`${card.id}:${card.dataRevision}`));
    if (missingRevisions.length) {
      await db.insert(schema.dataCardRevisions).values(missingRevisions.map((card) => ({
        drugId: card.id,
        revision: card.dataRevision,
        content: card,
        savedAt: card.updatedAt,
      }))).onConflictDoNothing();
    }
  }
  await db.update(schema.backupWorkerState).set({ ...(fullReconciliationDue ? { lastReconciledAt: new Date() } : {}), heartbeatAt: new Date() }).where(eq(schema.backupWorkerState.id, "primary"));
}

async function processDataCardBackupSnapshots() {
  const now = new Date();
  const [revisions, sessions, snapshots] = await Promise.all([
    db.select().from(schema.dataCardRevisions).orderBy(desc(schema.dataCardRevisions.revision)),
    db.select().from(schema.dataCardEditSessions),
    db.select().from(schema.dataCardBackupSnapshots),
  ]);
  const latestByDrug = new Map<string, typeof revisions[number]>();
  for (const revision of revisions) if (!latestByDrug.has(revision.drugId)) latestByDrug.set(revision.drugId, revision);
  const sessionsByDrug = new Map<string, typeof sessions>();
  for (const session of sessions) sessionsByDrug.set(session.drugId, [...(sessionsByDrug.get(session.drugId) ?? []), session]);
  const existing = new Set(snapshots.map((snapshot) => `${snapshot.drugId}:${snapshot.revision}`));
  let processed = 0;
  for (const revision of latestByDrug.values()) {
    if (existing.has(`${revision.drugId}:${revision.revision}`)) continue;
    const cardSessions = sessionsByDrug.get(revision.drugId) ?? [];
    const eligibility = dataCardBackupEligibility({ savedAt: revision.savedAt, sessions: cardSessions, now });
    if (!eligibility.eligible) continue;
    const eligibleAt = eligibility.eligibleAt;
    const [created] = await db.insert(schema.dataCardBackupSnapshots).values({ drugId: revision.drugId, revision: revision.revision, content: revision.content, eligibleAt, frozenAt: now, status: "pending" }).onConflictDoNothing().returning();
    if (created) processed++;
  }
  const pending = await db.select().from(schema.dataCardBackupSnapshots).where(and(inArray(schema.dataCardBackupSnapshots.status, ["pending", "retrying"]), lte(schema.dataCardBackupSnapshots.availableAt, now))).orderBy(asc(schema.dataCardBackupSnapshots.eligibleAt)).limit(20);
  for (const candidate of pending) {
    const [snapshot] = await db.update(schema.dataCardBackupSnapshots).set({ status: "pending", attempts: sql`${schema.dataCardBackupSnapshots.attempts} + 1` }).where(and(eq(schema.dataCardBackupSnapshots.id, candidate.id), inArray(schema.dataCardBackupSnapshots.status, ["pending", "retrying"]))).returning();
    if (!snapshot) continue;
    try { await publishDataCardSnapshot(snapshot); processed++; }
    catch (error) {
      const terminal = snapshot.attempts >= Number(process.env.BACKUP_MAX_RETRIES ?? 8);
      await db.update(schema.dataCardBackupSnapshots).set({ status: terminal ? "failed" : "retrying", availableAt: new Date(Date.now() + backupRetryDelayMs(snapshot.attempts)), lastError: safeError(error) }).where(eq(schema.dataCardBackupSnapshots.id, snapshot.id));
    }
  }
  return processed;
}

async function publishDataCardSnapshot(snapshot: typeof schema.dataCardBackupSnapshots.$inferSelect) {
  const storage = getBackupStorage();
  const frozenAt = snapshot.frozenAt ?? snapshot.createdAt;
  const payload = Buffer.from(JSON.stringify({ schema: "herboverflow.data-card-snapshot", version: 1, drugId: snapshot.drugId, revision: snapshot.revision, frozenAt: frozenAt.toISOString(), content: snapshot.content }));
  const digest = createHash("sha256").update(payload).digest("hex");
  const storageKey = `data-card-snapshots/${snapshot.drugId}/${snapshot.revision}-${digest}.json`;
  await storage.putBuffer(storageKey, payload, { sha256: digest, "data-card-revision": String(snapshot.revision) });
  const verified = await inspectByteStream(await storage.readStream(storageKey));
  if (verified.size !== payload.length || verified.sha256 !== digest) throw new Error("data card snapshot verification failed");
  await db.transaction(async (tx) => {
    await tx.update(schema.dataCardBackupSnapshots).set({ status: "ready", storageKey, sha256: digest, completedAt: new Date(), lastError: null }).where(eq(schema.dataCardBackupSnapshots.id, snapshot.id));
    // This is emitted by the worker after the immutable object is safe; it never
    // participates in the editor's primary save transaction.
    await tx.insert(schema.backupOutbox).values({ tableName: "data_card_backup_snapshots", operation: "INSERT", entityId: snapshot.id });
  });
}

async function processMediaJobs(limit: number) {
  const ids = await db.select({ id: schema.backupMediaAssets.mediaAssetId }).from(schema.backupMediaAssets).where(and(inArray(schema.backupMediaAssets.status, ["pending", "retrying"]), lte(schema.backupMediaAssets.availableAt, new Date()))).orderBy(asc(schema.backupMediaAssets.availableAt)).limit(limit);
  let processed = 0;
  await runLimited(ids, 3, async ({ id }) => { const claimed = await claimMedia(id); if (!claimed) return; try { const [asset] = await db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.id, id)).limit(1); if (!asset) throw new Error("primary media metadata no longer exists"); await cacheMediaAsset(asset); processed++; } catch (error) { await failMedia(id, claimed.attempts, error); } });
  return processed;
}

async function claimMedia(id: string) {
  const [row] = await db.update(schema.backupMediaAssets).set({ status: "processing", claimedAt: new Date(), attempts: sql`${schema.backupMediaAssets.attempts} + 1`, updatedAt: new Date() }).where(and(eq(schema.backupMediaAssets.mediaAssetId, id), inArray(schema.backupMediaAssets.status, ["pending", "retrying"]), lte(schema.backupMediaAssets.availableAt, new Date()))).returning();
  return row;
}

async function cacheMediaAsset(asset: typeof schema.mediaAssets.$inferSelect) {
  const primary = await readMediaAssetBytesDetailed(asset);
  if (!primary.ok) throw new MediaReadError(primary);
  const bytes = primary.bytes;
  if (bytes.length !== asset.sizeBytes) throw new Error(`media size mismatch: metadata=${asset.sizeBytes}, actual=${bytes.length}`);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const storage = getBackupStorage(); const storageKey = `media/${digest.slice(0, 2)}/${digest}`;
  const existing = await storage.head(storageKey);
  if (!existing) await storage.putBuffer(storageKey, bytes, { sha256: digest, "media-id": asset.id });
  const verified = await inspectByteStream(await storage.readStream(storageKey));
  if (verified.size !== bytes.length || verified.sha256 !== digest) throw new Error("backup media object verification failed");
  await db.transaction(async (tx) => {
    await tx.insert(schema.backupMediaObjects).values({ sha256: digest, storageKey, sizeBytes: bytes.length, mimeType: asset.mimeType, verifiedAt: new Date() }).onConflictDoNothing();
    await tx.update(schema.backupMediaAssets).set({ sha256: digest, sourceFingerprint: mediaSourceFingerprint(asset), status: "verified", verifiedAt: new Date(), claimedAt: null, lastError: null, updatedAt: new Date() }).where(eq(schema.backupMediaAssets.mediaAssetId, asset.id));
  });
  return { digest, storageKey };
}

async function failMedia(id: string, attempts: number, error: unknown) {
  const maximum = Number(process.env.BACKUP_MAX_RETRIES ?? 8); const terminal = attempts >= maximum;
  await db.update(schema.backupMediaAssets).set({ status: terminal ? "failed" : "retrying", availableAt: new Date(Date.now() + backupRetryDelayMs(attempts)), claimedAt: null, lastError: backupFailureDetail(error), updatedAt: new Date() }).where(eq(schema.backupMediaAssets.mediaAssetId, id));
}

async function acknowledgeOutbox(limit: number) {
  const rows = await db.select({ id: schema.backupOutbox.id }).from(schema.backupOutbox).where(and(inArray(schema.backupOutbox.status, ["pending", "retrying"]), lte(schema.backupOutbox.availableAt, new Date()))).orderBy(asc(schema.backupOutbox.revision)).limit(limit);
  if (!rows.length) return 0;
  await db.update(schema.backupOutbox).set({ status: "completed", completedAt: new Date(), claimedAt: null, lastError: null }).where(inArray(schema.backupOutbox.id, rows.map((row) => row.id)));
  return rows.length;
}

async function scheduleSnapshotIfNeeded(force: boolean) {
  const status = await getIncrementalBackupStatus();
  const [oldest] = await db.select({ at: schema.backupOutbox.createdAt }).from(schema.backupOutbox).where(status.latestReady?.includedRevision ? sql`${schema.backupOutbox.revision} > ${status.latestReady.includedRevision}` : undefined).orderBy(asc(schema.backupOutbox.revision)).limit(1);
  const should = shouldScheduleSnapshot({ pendingChanges: status.pendingChanges, hasActiveBuild: Boolean(status.active), oldestPendingAt: oldest?.at, latestReadyAt: status.latestReady?.completedAt, debounceMs: Number(process.env.BACKUP_SNAPSHOT_DEBOUNCE_MS ?? 5 * 60_000), maximumStalenessMs: Number(process.env.BACKUP_MAX_STALENESS_MS ?? 60 * 60_000), force });
  if (should) await db.insert(schema.backupSnapshots).values({ targetRevision: status.latestRevision, status: "pending" });
}

async function claimSnapshot() {
  const [candidate] = await db.select().from(schema.backupSnapshots).where(and(inArray(schema.backupSnapshots.status, ["pending", "retrying"]), lte(schema.backupSnapshots.availableAt, new Date()))).orderBy(asc(schema.backupSnapshots.createdAt)).limit(1);
  if (!candidate) return null;
  const [claimed] = await db.update(schema.backupSnapshots).set({ status: "collecting", startedAt: new Date(), attempts: sql`${schema.backupSnapshots.attempts} + 1`, lastError: null }).where(and(eq(schema.backupSnapshots.id, candidate.id), inArray(schema.backupSnapshots.status, ["pending", "retrying"]))).returning();
  return claimed ?? null;
}

async function buildSnapshot(snapshot: typeof schema.backupSnapshots.$inferSelect) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "herboverflow-snapshot-")); const zipPath = path.join(temporaryDirectory, `${snapshot.id}.zip`);
  try {
    const captured = await db.transaction(async (tx) => {
      await tx.execute(sql`set transaction isolation level repeatable read read only`);
      const [boundary] = await tx.select({ revision: max(schema.backupOutbox.revision), consistency: sql<string>`txid_current_snapshot()::text` }).from(schema.backupOutbox);
      const tables = await loadBackupTables(tx);
      const migration = await tx.execute(sql`select max(created_at)::text as version from drizzle.__drizzle_migrations`);
      return { tables, revision: boundary?.revision ?? 0, consistency: boundary?.consistency ?? "unknown", schemaVersion: String((migration as unknown as { version: string | null }[])[0]?.version ?? "unknown") };
    });
    const assets = captured.tables["media-assets"] as (typeof schema.mediaAssets.$inferSelect)[];
    await db.update(schema.backupSnapshots).set({ status: "collecting", progressTotal: assets.length, includedRevision: captured.revision, consistencyBoundary: captured.consistency, schemaVersion: captured.schemaVersion }).where(eq(schema.backupSnapshots.id, snapshot.id));
    const missingMedia: schema.BackupMissingMedia[] = [];
    await runLimited(assets, 3, async (asset) => {
      const [cached] = await db.select().from(schema.backupMediaAssets).where(eq(schema.backupMediaAssets.mediaAssetId, asset.id)).limit(1);
      if (cached?.status === "verified" && cached.sourceFingerprint === mediaSourceFingerprint(asset)) return;
      if (cached?.status === "failed") { missingMedia.push(cachedMissingMedia(asset.id, cached.lastError)); return; }
      try { await cacheMediaAsset(asset); }
      catch (error) {
        const missing = backupMissingMedia(asset.id, error);
        missingMedia.push(missing);
        if (cached) await failMedia(asset.id, Math.max(1, cached.attempts + 1), error);
      }
    });
    if (missingMedia.length && !snapshot.allowIncomplete) throw new Error(`required media cache incomplete: ${missingMedia.map((item) => `${item.id}:${item.code}`).join(", ")}`);
    const includedAssetIds = assets.filter((asset) => !missingMedia.some((missing) => missing.id === asset.id)).map((asset) => asset.id);
    const cacheRows = includedAssetIds.length ? await db.select({ mediaAssetId: schema.backupMediaAssets.mediaAssetId, sha256: schema.backupMediaAssets.sha256, storageKey: schema.backupMediaObjects.storageKey, size: schema.backupMediaObjects.sizeBytes }).from(schema.backupMediaAssets).innerJoin(schema.backupMediaObjects, eq(schema.backupMediaObjects.sha256, schema.backupMediaAssets.sha256)).where(and(inArray(schema.backupMediaAssets.mediaAssetId, includedAssetIds), eq(schema.backupMediaAssets.status, "verified"))) : [];
    if (cacheRows.length !== includedAssetIds.length) throw new Error(`verified media cache incomplete: ${cacheRows.length}/${includedAssetIds.length}`);
    const cacheMap = new Map(cacheRows.map((row) => [row.mediaAssetId, row]));
    const media: CachedSnapshotMedia[] = assets.filter((asset) => includedAssetIds.includes(asset.id)).map((asset) => { const cached = cacheMap.get(asset.id)!; return { id: asset.id, filename: asset.originalFilename || asset.id, mimeType: asset.mimeType, width: asset.width, height: asset.height, size: Number(cached.size), sha256: cached.sha256!, storageKey: cached.storageKey }; });
    await db.update(schema.backupSnapshots).set({ status: "building" }).where(eq(schema.backupSnapshots.id, snapshot.id));
    const storage = getBackupStorage();
    await buildStreamingBackupArchive({ tables: captured.tables, media, storage, outputPath: zipPath, createdAt: new Date(), incomplete: missingMedia.length ? { missingMedia } : undefined, onProgress: async (current, total) => { if (current % 10 === 0 || current === total) await db.update(schema.backupSnapshots).set({ progressCurrent: current, progressTotal: total }).where(eq(schema.backupSnapshots.id, snapshot.id)); } });
    await db.update(schema.backupSnapshots).set({ status: "verifying" }).where(eq(schema.backupSnapshots.id, snapshot.id));
    const manifest = await verifyStreamingBackupArchive(zipPath); const zipSha256 = await sha256File(zipPath); const zipStat = await stat(zipPath); const storageKey = `snapshots/${snapshot.id}${missingMedia.length ? "-INCOMPLETE" : ""}.zip`;
    await storage.publishFile(storageKey, zipPath, { sha256: zipSha256, "snapshot-id": snapshot.id });
    const published = await inspectByteStream(await storage.readStream(storageKey));
    if (published.size !== zipStat.size || published.sha256 !== zipSha256) throw new Error("published snapshot verification failed");
    await db.transaction(async (tx) => {
      if (media.length) await tx.insert(schema.backupSnapshotMedia).values(media.map((item) => ({ snapshotId: snapshot.id, mediaAssetId: item.id, sha256: item.sha256 }))).onConflictDoNothing();
      await tx.update(schema.backupSnapshots).set({ status: missingMedia.length ? "incomplete" : "ready", completeness: missingMedia.length ? "incomplete" : "complete", missingMedia, storageBackend: storage.backend, storageKey, zipSha256, dataCardCount: captured.tables["crude-drugs"].length, mediaCount: manifest.media.count, mediaBytes: manifest.media.bytes, zipBytes: zipStat.size, progressCurrent: media.length, progressTotal: media.length, completedAt: new Date(), lastError: missingMedia.length ? `${missingMedia.length} required media assets are missing` : null }).where(eq(schema.backupSnapshots.id, snapshot.id));
      await tx.update(schema.backupSnapshots).set({ status: "superseded" }).where(and(ne(schema.backupSnapshots.id, snapshot.id), inArray(schema.backupSnapshots.status, ["pending", "retrying"]), lte(schema.backupSnapshots.targetRevision, captured.revision)));
    });
    await enforceSnapshotRetention();
  } catch (error) {
    const attempts = snapshot.attempts; const terminal = attempts >= Number(process.env.BACKUP_MAX_RETRIES ?? 8);
    await db.update(schema.backupSnapshots).set({ status: terminal ? "failed" : "retrying", availableAt: new Date(Date.now() + backupRetryDelayMs(attempts)), lastError: safeError(error) }).where(eq(schema.backupSnapshots.id, snapshot.id));
    throw error;
  } finally { await rm(temporaryDirectory, { recursive: true, force: true }); }
}

async function enforceSnapshotRetention() {
  const keep = Math.max(1, Number(process.env.BACKUP_SNAPSHOT_RETENTION_COUNT ?? 5));
  const rows = await db.select({ id: schema.backupSnapshots.id, status: schema.backupSnapshots.status }).from(schema.backupSnapshots).where(eq(schema.backupSnapshots.status, "ready")).orderBy(desc(schema.backupSnapshots.completedAt));
  const supersede = snapshotIdsBeyondRetention(rows, keep);
  if (supersede.length) await db.update(schema.backupSnapshots).set({ status: "superseded" }).where(inArray(schema.backupSnapshots.id, supersede));
}

async function runLimited<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>) { let cursor = 0; await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => { while (cursor < items.length) { const item = items[cursor++]; await task(item); } })); }
function safeError(error: unknown) { return (error instanceof Error ? error.message : "Unknown backup error").slice(0, 2000); }
export function mediaSourceFingerprint(asset: typeof schema.mediaAssets.$inferSelect) { return `${asset.blobPathname}|${asset.sizeBytes}|${asset.mimeType}|${asset.updatedAt.getTime()}`; }
function backupMissingMedia(id: string, error: unknown): schema.BackupMissingMedia {
  if (error instanceof MediaReadError) return { id, code: error.result.code, detail: error.result.detail };
  const message = safeError(error);
  if (message.includes("size mismatch")) return { id, code: "SIZE_MISMATCH", detail: message };
  return { id, code: "UNKNOWN", detail: message };
}
function backupFailureDetail(error: unknown) { const missing = error instanceof MediaReadError ? backupMissingMedia("unknown", error) : null; return missing ? `${missing.code}: ${missing.detail}` : safeError(error); }
function cachedMissingMedia(id: string, message: string | null): schema.BackupMissingMedia {
  const match = message?.match(/^(NOT_FOUND|STORAGE_ERROR|PERMISSION_ERROR|SIZE_MISMATCH|TRANSIENT_ERROR|UNKNOWN):\s*(.*)$/);
  return { id, code: match?.[1] ?? "UNKNOWN", detail: match?.[2] || message || "Media backup previously failed" };
}
