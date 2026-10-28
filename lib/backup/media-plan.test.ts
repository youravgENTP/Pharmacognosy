import assert from "node:assert/strict";
import test from "node:test";
import { backupMediaArchivePath, createMediaBackupPlan } from "@/lib/backup/media-plan";

test("media backup plan reports total size and creates safe unique archive paths", () => {
  const files = [
    { id: "10000000-0000-4000-8000-000000000001", originalFilename: "약재 ../ 사진.png", mimeType: "image/png", width: 10, height: 20, sizeBytes: 7 },
    { id: "20000000-0000-4000-8000-000000000002", originalFilename: "약재 ../ 사진.png", mimeType: "image/png", width: 10, height: 20, sizeBytes: 8 },
  ];
  const plan = createMediaBackupPlan(files, 20);
  assert.equal(plan.bytes, 15);
  assert.equal(plan.supported, true);
  assert.equal(new Set(plan.files.map((file) => file.archivePath)).size, 2);
  assert.ok(plan.files.every((file) => /^media\/[A-Za-z0-9._-]+$/.test(file.archivePath) && !file.archivePath.includes("..")));
  assert.equal(createMediaBackupPlan(files, 14).supported, false);
});

test("archive path sanitization cannot escape the media directory", () => {
  assert.equal(backupMediaArchivePath("10000000-0000-4000-8000-000000000001", "../../secret.png").startsWith("media/10000000-0000-4000-8000-000000000001-"), true);
});
