import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { BACKUP_TABLE_FILES, collectReferencedMediaIds, createBackupArchive, createBackupArchiveWithMedia, parseBackupArchive, sha256, verifyGeneratedBackup, type BackupTables } from "@/lib/backup/archive";
import { backupDrugSchema } from "@/lib/backup/restore";

const drugId = "10000000-0000-4000-8000-000000000001";
const mediaId = "20000000-0000-4000-8000-000000000002";

function emptyTables(): BackupTables {
  return Object.fromEntries(BACKUP_TABLE_FILES.map((name) => [name, []])) as unknown as BackupTables;
}

function fixture() {
  const tables = emptyTables();
  tables["crude-drugs"] = [{ id: drugId, catalogIndex: 1, referenceIndex: 2, koreanName: "연교", latinName: "Forsythiae Fructus", origin: null, origins: [{ nameKo: "의성개나리", scientificName: "Forsythia viridissima" }], scientificName: null, medicinalPart: "열매", categoryId: null, familyId: null, importance: "중요", sections: [{ id: "section-1", title: "성분", items: [{ id: "item-1", text: "Lignan", html: "<strong>Lignan</strong>", bold: true, children: [{ id: "item-2", text: "phillyrin" }] }], blocks: [{ id: "items-1", type: "items", items: [{ id: "item-1", text: "Lignan", html: "<strong>Lignan</strong>", bold: true, children: [{ id: "item-2", text: "phillyrin" }] }] }, { id: "image-1", type: "image", mediaAssetId: mediaId, size: "large", widthPercent: 63, xPercent: 11, yPx: 24, anchorItemId: "item-1", anchorSide: "after", align: "right" }] }], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" }];
  const bytes = Buffer.from("real-image-bytes");
  const archivePath = `media/${mediaId}-plant.png`;
  const checksum = sha256(bytes);
  tables["media-assets"] = [{ id: mediaId, blobUrl: "https://example.invalid/plant.png", blobPathname: "media/plant.png", originalFilename: "plant.png", sizeBytes: bytes.length, mimeType: "image/png", width: 640, height: 480, archivePath, sha256: checksum }];
  const media = [{ id: mediaId, archivePath, filename: "plant.png", mimeType: "image/png", width: 640, height: 480, size: bytes.length, sha256: checksum, bytes }];
  return { tables, media, bytes };
}

test("v1 archive includes every database table and excludes media binaries and auth secrets", async () => {
  const { tables, media } = fixture();
  tables["user-attribution"] = [{ id: "user-1", name: "Editor", email: "editor@example.com" }];
  const { buffer, manifest } = await createBackupArchive(tables, media, new Date("2026-09-23T07:30:00.000Z"));
  const zip = await JSZip.loadAsync(buffer);
  for (const name of BACKUP_TABLE_FILES) assert.ok(zip.file(`database/${name}.json`), `${name} table missing`);
  for (const forbidden of ["session", "account", "verification", "password", "access-token", "refresh-token"]) assert.equal(zip.file(`database/${forbidden}.json`), null);
  assert.equal(manifest.security.authSecretsExcluded, true);
  assert.equal(zip.file(media[0].archivePath), null);
  assert.deepEqual(manifest.media, { count: 0, bytes: 0, files: [] });
  assert.deepEqual(JSON.parse(await zip.file("database/media-assets.json")!.async("string")), tables["media-assets"]);
});

test("archive round-trip preserves rich hierarchy, image references, and media metadata", async () => {
  const { tables, media } = fixture();
  const { buffer } = await createBackupArchive(tables, media);
  const parsed = await parseBackupArchive(buffer);
  const drug = backupDrugSchema.parse(parsed.tables["crude-drugs"][0]);
  assert.deepEqual(drug.sections, (tables["crude-drugs"][0] as { sections: unknown }).sections);
  assert.deepEqual(parsed.tables["media-assets"], tables["media-assets"]);
  assert.equal(parsed.media.size, 0);
  assert.deepEqual(parsed.manifest.media, { count: 0, bytes: 0, files: [] });
});

test("image-inclusive backup stores originals and verifies manifest size and SHA-256", async () => {
  const { tables, media, bytes } = fixture();
  const { buffer, manifest } = await createBackupArchiveWithMedia(tables, media);
  assert.equal(manifest.media.count, 1);
  assert.equal(manifest.media.bytes, bytes.length);
  assert.equal(manifest.media.files[0].sha256, sha256(bytes));
  const parsed = await parseBackupArchive(buffer);
  assert.deepEqual(parsed.media.get(media[0].id), bytes);
});

test("image-inclusive backup fails closed on missing or corrupt image bytes while lightweight backup remains usable", async () => {
  const { tables, media } = fixture();
  const corrupt = [{ ...media[0], bytes: Buffer.from("wrong") }];
  await assert.rejects(() => createBackupArchiveWithMedia(tables, corrupt), /크기 또는 체크섬/);
  const lightweight = await createBackupArchive(tables, corrupt);
  assert.equal((await parseBackupArchive(lightweight.buffer)).manifest.media.count, 0);
});

test("image-inclusive parser rejects extra media files not declared by the manifest", async () => {
  const { tables, media } = fixture();
  const generated = await createBackupArchiveWithMedia(tables, media);
  const zip = await JSZip.loadAsync(generated.buffer);
  zip.file("media/extra.png", Buffer.from("extra"));
  const tampered = await zip.generateAsync({ type: "nodebuffer" });
  await assert.rejects(() => parseBackupArchive(tampered), /Manifest와 ZIP/);
});

test("backup round-trip preserves Collection Archive state with document and revisions", async () => {
  const { tables } = fixture();
  tables.collections = [{ id: "30000000-0000-4000-8000-000000000003", name: "기말", archivedAt: "2026-10-27T00:00:00.000Z", document: { version: 1, blocks: [] }, revision: 2 }];
  tables["collection-revisions"] = [{ id: "40000000-0000-4000-8000-000000000004", collectionId: "30000000-0000-4000-8000-000000000003", revision: 1, document: { version: 1, blocks: [{ id: "h", type: "heading" }] } }];
  const parsed = await parseBackupArchive((await createBackupArchive(tables, [])).buffer);
  assert.deepEqual(parsed.tables.collections, tables.collections);
  assert.deepEqual(parsed.tables["collection-revisions"], tables["collection-revisions"]);
});

test("backup verification preserves mnemonics, canonical preferences, relationships, and concept anchors", async () => {
  const { tables } = fixture();
  tables["user-drug-mnemonics"] = [{ id: "m", drugId, userId: "u", items: [{ id: "i", text: "암기" }], blocks: [] }];
  tables["user-mnemonic-preferences"] = [{ userId: "u", drugId, preferredMnemonicUserId: "u", active: true }];
  tables["crude-drug-relationships"] = [{ id: "r", sourceId: drugId, targetId: "other", typeId: "type" }];
  tables["concept-anchors"] = [{ id: "a", ownerType: "drug", ownerId: drugId, targetType: "study_item", targetRef: { sectionId: "s" } }];
  const generated = await createBackupArchive(tables, []);
  await verifyGeneratedBackup(generated.buffer, tables);
  const parsed = await parseBackupArchive(generated.buffer);
  for (const name of ["user-drug-mnemonics", "user-mnemonic-preferences", "crude-drug-relationships", "concept-anchors"] as const) assert.deepEqual(parsed.tables[name], tables[name]);
});

test("backup creation succeeds when media metadata has no actual bytes", async () => {
  const { tables } = fixture();
  const { buffer } = await createBackupArchive(tables, []);
  const parsed = await parseBackupArchive(buffer);
  assert.equal(parsed.media.size, 0);
  assert.equal(parsed.tables["media-assets"].length, 1);
});

test("backup creation succeeds when a content media reference has no metadata row", async () => {
  const tables = emptyTables();
  tables["crude-drugs"] = [{ sections: [{ blocks: [{ type: "image", mediaAssetId: mediaId }] }] }];
  const { buffer } = await createBackupArchive(tables, []);
  const parsed = await parseBackupArchive(buffer);
  assert.deepEqual(parsed.tables["crude-drugs"], tables["crude-drugs"]);
});

test("media reference collection ignores orphan media metadata", () => {
  const tables = emptyTables();
  tables["media-assets"] = [{ id: "30000000-0000-4000-8000-000000000003" }];
  tables["crude-drugs"] = [{ sections: [{ blocks: [{ type: "image", mediaAssetId: mediaId }] }] }];
  assert.deepEqual([...collectReferencedMediaIds(tables)], [mediaId]);
});

test("a zero-media archive parses normally and incompatible manifests are rejected", async () => {
  const { tables, media } = fixture();
  const { buffer } = await createBackupArchive(tables, media);
  const parsed = await parseBackupArchive(buffer);
  assert.equal(parsed.manifest.media.count, 0);
  assert.equal(parsed.media.size, 0);
  const incompatibleZip = await JSZip.loadAsync(buffer);
  const manifest = JSON.parse(await incompatibleZip.file("manifest.json")!.async("string"));
  manifest.version = 99;
  incompatibleZip.file("manifest.json", JSON.stringify(manifest));
  const incompatibleBuffer = await incompatibleZip.generateAsync({ type: "nodebuffer" });
  await assert.rejects(() => parseBackupArchive(incompatibleBuffer), /지원하지 않거나 손상된/);
});

test("older v1 backups without the optional mnemonic preference table remain importable", async () => {
  const { tables } = fixture();
  const { buffer } = await createBackupArchive(tables, []);
  const zip = await JSZip.loadAsync(buffer);
  zip.remove("database/user-mnemonic-preferences.json");
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  delete manifest.counts["user-mnemonic-preferences"];
  delete manifest.files["database/user-mnemonic-preferences.json"];
  zip.file("manifest.json", JSON.stringify(manifest));
  const parsed = await parseBackupArchive(await zip.generateAsync({ type: "nodebuffer" }));
  assert.deepEqual(parsed.tables["user-mnemonic-preferences"], []);
});

test("older v1 backups without archive tables remain importable", async () => {
  const { tables } = fixture();
  const { buffer } = await createBackupArchive(tables, []);
  const zip = await JSZip.loadAsync(buffer);
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  for (const name of ["archive-groups", "archive-entries"]) {
    zip.remove(`database/${name}.json`);
    delete manifest.counts[name];
    delete manifest.files[`database/${name}.json`];
  }
  zip.file("manifest.json", JSON.stringify(manifest));
  const parsed = await parseBackupArchive(await zip.generateAsync({ type: "nodebuffer" }));
  assert.deepEqual(parsed.tables["archive-groups"], []);
  assert.deepEqual(parsed.tables["archive-entries"], []);
});
