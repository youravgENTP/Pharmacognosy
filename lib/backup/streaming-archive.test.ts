import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, truncate } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { BACKUP_TABLE_FILES, parseBackupArchive, sha256, type BackupTables } from "@/lib/backup/archive";
import type { BackupStorage } from "@/lib/backup/storage";
import { buildStreamingBackupArchive, inspectByteStream, sha256File, verifyStreamingBackupArchive } from "@/lib/backup/streaming-archive";

function emptyTables(): BackupTables {
  return Object.fromEntries(BACKUP_TABLE_FILES.map((name) => [name, []])) as unknown as BackupTables;
}

test("a prebuilt streaming ZIP includes cached media and remains v1-restore parseable", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "herboverflow-stream-test-"));
  try {
    const outputPath = path.join(directory, "snapshot.zip");
    const id = "20000000-0000-4000-8000-000000000002";
    const bytes = Buffer.from("verified-original-image");
    const objects = new Map([["media/object", bytes]]);
    const storage: BackupStorage = {
      backend: "local",
      async putBuffer() {}, async publishFile() {},
      async readStream(key) { const value = objects.get(key); if (!value) throw new Error("missing object"); return Readable.from(value); },
      async head(key) { const value = objects.get(key); return value ? { size: value.length, metadata: {} } : null; },
      async downloadUrl() { return null; },
    };
    const tables = emptyTables();
    tables["crude-drugs"] = [{ id: "10000000-0000-4000-8000-000000000001", koreanName: "연교", sections: [{ blocks: [{ type: "image", mediaAssetId: id }] }] }];
    tables["media-assets"] = [{ id, originalFilename: "plant.png", mimeType: "image/png", width: 10, height: 10, sizeBytes: bytes.length }];
    const progress: number[] = [];
    const manifest = await buildStreamingBackupArchive({ tables, media: [{ id, filename: "plant.png", mimeType: "image/png", width: 10, height: 10, size: bytes.length, sha256: sha256(bytes), storageKey: "media/object" }], storage, outputPath, createdAt: new Date("2026-10-28T00:00:00.000Z"), onProgress(current) { progress.push(current); } });
    assert.equal(manifest.media.count, 1);
    assert.deepEqual(progress, [1]);
    const verified = await verifyStreamingBackupArchive(outputPath);
    assert.equal(verified.media.files[0].sha256, sha256(bytes));
    assert.match(await sha256File(outputPath), /^[a-f0-9]{64}$/);
    assert.deepEqual(await inspectByteStream(Readable.from(bytes)), { size: bytes.length, sha256: sha256(bytes) });
    const parsed = await parseBackupArchive(await readFile(outputPath));
    assert.deepEqual(parsed.media.get(id), bytes);
    assert.deepEqual(parsed.tables["crude-drugs"], tables["crude-drugs"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an interrupted partial ZIP cannot pass verification", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "herboverflow-partial-test-"));
  try {
    const outputPath = path.join(directory, "partial.zip");
    const storage: BackupStorage = { backend: "local", async putBuffer() {}, async publishFile() {}, async readStream() { return Readable.from(Buffer.from("image")); }, async head() { return null; }, async downloadUrl() { return null; } };
    await buildStreamingBackupArchive({ tables: emptyTables(), media: [], storage, outputPath, createdAt: new Date() });
    await truncate(outputPath, 20);
    await assert.rejects(() => verifyStreamingBackupArchive(outputPath));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("streaming incomplete ZIP declares omitted media instead of claiming full verification", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "herboverflow-incomplete-test-"));
  try {
    const outputPath = path.join(directory, "incomplete.zip");
    const storage: BackupStorage = { backend: "local", async putBuffer() {}, async publishFile() {}, async readStream() { return Readable.from(Buffer.from("image")); }, async head() { return null; }, async downloadUrl() { return null; } };
    const missingId = "20000000-0000-4000-8000-000000000002";
    await buildStreamingBackupArchive({ tables: emptyTables(), media: [], storage, outputPath, createdAt: new Date(), incomplete: { missingMedia: [{ id: missingId, code: "NOT_FOUND", detail: "missing source" }] } });
    const manifest = await verifyStreamingBackupArchive(outputPath);
    assert.deepEqual(manifest.incomplete?.missingMedia, [{ id: missingId, code: "NOT_FOUND", detail: "missing source" }]);
    assert.equal(manifest.media.count, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
