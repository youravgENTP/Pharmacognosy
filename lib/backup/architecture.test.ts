import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../drizzle/0017_dry_nitro.sql", import.meta.url);
const workerUrl = new URL("./worker.ts", import.meta.url);
const lifecycleMigrationUrl = new URL("../../drizzle/0019_safe_wallflower.sql", import.meta.url);

test("backup migration installs transactional outbox triggers for every required mutation domain", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of ["crude_drugs", "user_drug_mnemonics", "user_mnemonic_preferences", "crude_drug_relationships", "constituents", "constituent_taxa", "families", "categories", "collections", "collection_revisions", "concept_anchors", "concept_connections", "media_assets", "archive_groups", "archive_entries", "app_settings"]) assert.match(sql, new RegExp(`'${table}'`));
  assert.match(sql, /AFTER INSERT OR UPDATE OR DELETE/);
  assert.match(sql, /INSERT INTO backup_outbox/);
  assert.match(sql, /IF TG_TABLE_NAME = 'media_assets'/);
  assert.match(sql, /initial-backfill/);
});

test("snapshot references prevent cached media deletion and publication states are explicit", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /backup_snapshot_media_sha256_backup_media_objects_sha256_fk/);
  assert.match(sql, /ON DELETE restrict/i);
  for (const state of ["pending", "collecting", "building", "verifying", "ready", "failed", "retrying", "superseded"]) {
    const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
    assert.match(schema, new RegExp(`"${state}"`));
  }
});

test("media backfill and duplicate upload jobs are resumable and idempotent", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const worker = await readFile(workerUrl, "utf8");
  assert.match(sql, /INSERT INTO backup_media_assets[\s\S]*SELECT id, 'pending' FROM media_assets ON CONFLICT \(media_asset_id\) DO NOTHING/);
  assert.match(sql, /ON CONFLICT \(media_asset_id\) DO UPDATE SET status='pending'/);
  assert.match(worker, /abandoned media job recovered/);
  assert.match(worker, /backupRetryDelayMs\(attempts\)/);
  assert.match(worker, /runLimited\(ids, 3/);
});

test("worker verifies before atomic publication and records a consistent revision boundary", async () => {
  const worker = await readFile(workerUrl, "utf8");
  const verifyAt = worker.indexOf("verifyStreamingBackupArchive(zipPath)");
  const publishAt = worker.indexOf("storage.publishFile");
  const readyAt = worker.indexOf('status: missingMedia.length ? "incomplete" : "ready"');
  assert.ok(verifyAt >= 0 && publishAt > verifyAt && readyAt > publishAt);
  assert.match(worker, /repeatable read read only/i);
  assert.match(worker, /txid_current_snapshot\(\)/);
  assert.match(worker, /inspectByteStream\(await storage\.readStream\(storageKey\)\)/);
});

test("reconciliation covers worker downtime without coupling primary saves to processing", async () => {
  const worker = await readFile(workerUrl, "utf8");
  const route = await readFile(new URL("../../app/api/drugs/[id]/route.ts", import.meta.url), "utf8");
  assert.match(worker, /abandoned job recovered/);
  assert.match(worker, /interrupted snapshot recovered/);
  assert.match(worker, /RECONCILE/);
  assert.match(route, /db\.transaction/);
  assert.ok(route.indexOf("tx.update(crudeDrugs)") < route.indexOf("tx.insert(dataCardRevisions)"));
  assert.match(route, /lockDataCardMutation/);
});

test("Data Card autosave migration removes only the synchronous crude_drugs outbox trigger and preserves a recovery record", async () => {
  const sql = await readFile(lifecycleMigrationUrl, "utf8");
  assert.match(sql, /DROP TRIGGER IF EXISTS "backup_outbox_crude_drugs" ON "crude_drugs"/);
  assert.match(sql, /CREATE TABLE "data_card_revisions"/);
  assert.match(sql, /INSERT INTO "data_card_revisions"/);
  assert.match(sql, /to_jsonb\("crude_drugs"\)/);
});

test("a frozen Data Card snapshot is published unchanged even after a newer revision exists", async () => {
  const worker = await readFile(workerUrl, "utf8");
  assert.match(worker, /frozenAt: now/);
  assert.match(worker, /const frozenAt = snapshot\.frozenAt \?\? snapshot\.createdAt/);
  assert.doesNotMatch(worker, /newer Data Card revision was saved before this snapshot started/);
  assert.match(worker, /terminal \? "failed" : "retrying"/);
});

test("manual synchronization freezes tables before the asynchronous worker and uses the shared mutation lock", async () => {
  const route = await readFile(new URL("../../app/api/backup/synchronize/route.ts", import.meta.url), "utf8");
  const editorRoute = await readFile(new URL("../../app/api/drugs/[id]/editing-session/route.ts", import.meta.url), "utf8");
  const worker = await readFile(workerUrl, "utf8");
  assert.ok(route.indexOf("lockManualSynchronization") < route.indexOf("loadBackupTables(tx)"));
  assert.ok(route.indexOf("loadBackupTables(tx)") < route.indexOf("after(async"));
  assert.match(route, /backupSnapshotCaptures/);
  assert.match(editorRoute, /closeVerified: true/);
  assert.match(worker, /manualCapture\.tables as BackupTables/);
});

test("every application-controlled Data Card exit delegates to verified close", async () => {
  const modal = await readFile(new URL("../../components/profile-modal.tsx", import.meta.url), "utf8");
  const guard = await readFile(new URL("../../components/data-card-save-guard.tsx", import.meta.url), "utf8");
  const editor = await readFile(new URL("../../components/drug-editor.tsx", import.meta.url), "utf8");
  assert.match(modal, /requestClose\(\(\) => router\.back\(\)\)/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /event\.target === event\.currentTarget/);
  assert.match(guard, /document\.addEventListener\("click", click, true\)/);
  assert.match(guard, /window\.addEventListener\("popstate", popState\)/);
  assert.match(guard, /window\.addEventListener\("beforeunload", beforeUnload\)/);
  assert.match(editor, /revision\.current !== expectedDraftRevision/);
  assert.match(editor, /method: "DELETE"/);
});
