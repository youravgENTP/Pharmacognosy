import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { BACKUP_TABLE_FILES, createBackupArchive, parseBackupArchive, sha256, type BackupTables } from "@/lib/backup/archive";
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

test("v1 archive includes every content table, actual media bytes, and no auth-secret table", async () => {
  const { tables, media, bytes } = fixture();
  tables["user-attribution"] = [{ id: "user-1", name: "Editor", email: "editor@example.com" }];
  const { buffer, manifest } = await createBackupArchive(tables, media, new Date("2026-09-23T07:30:00.000Z"));
  const zip = await JSZip.loadAsync(buffer);
  for (const name of BACKUP_TABLE_FILES) assert.ok(zip.file(`database/${name}.json`), `${name} table missing`);
  for (const forbidden of ["session", "account", "verification", "password", "access-token", "refresh-token"]) assert.equal(zip.file(`database/${forbidden}.json`), null);
  assert.equal(manifest.security.authSecretsExcluded, true);
  assert.deepEqual(await zip.file(media[0].archivePath)!.async("nodebuffer"), bytes);
});

test("archive round-trip preserves rich hierarchy and positioned image blocks exactly", async () => {
  const { tables, media } = fixture();
  const { buffer } = await createBackupArchive(tables, media);
  const parsed = await parseBackupArchive(buffer);
  const drug = backupDrugSchema.parse(parsed.tables["crude-drugs"][0]);
  assert.deepEqual(drug.sections, (tables["crude-drugs"][0] as { sections: unknown }).sections);
  assert.equal(parsed.media.get(mediaId)?.toString(), "real-image-bytes");
});

test("backup creation fails visibly when media metadata has no actual bytes", async () => {
  const { tables } = fixture();
  await assert.rejects(() => createBackupArchive(tables, []), /실제 파일이 없어/);
});

test("backup creation rejects a content reference whose media metadata is missing", async () => {
  const tables = emptyTables();
  tables["crude-drugs"] = [{ sections: [{ blocks: [{ type: "image", mediaAssetId: mediaId }] }] }];
  await assert.rejects(() => createBackupArchive(tables, []), /metadata가 없어/);
});

test("missing media and incompatible manifests are rejected", async () => {
  const { tables, media } = fixture();
  const { buffer } = await createBackupArchive(tables, media);
  const missingZip = await JSZip.loadAsync(buffer);
  missingZip.remove(media[0].archivePath);
  const missingBuffer = await missingZip.generateAsync({ type: "nodebuffer" });
  await assert.rejects(() => parseBackupArchive(missingBuffer), /미디어 파일/);
  const incompatibleZip = await JSZip.loadAsync(buffer);
  const manifest = JSON.parse(await incompatibleZip.file("manifest.json")!.async("string"));
  manifest.version = 99;
  incompatibleZip.file("manifest.json", JSON.stringify(manifest));
  const incompatibleBuffer = await incompatibleZip.generateAsync({ type: "nodebuffer" });
  await assert.rejects(() => parseBackupArchive(incompatibleBuffer), /지원하지 않거나 손상된/);
});
