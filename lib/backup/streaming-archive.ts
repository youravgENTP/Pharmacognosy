import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { ZipArchive } from "archiver";
import unzipper from "unzipper";
import { BACKUP_SCHEMA, BACKUP_TABLE_FILES, BACKUP_VERSION, sha256, validateBackupManifest, type BackupManifest, type BackupTables } from "@/lib/backup/archive";
import { backupMediaArchivePath } from "@/lib/backup/media-plan";
import type { BackupStorage } from "@/lib/backup/storage";

export type CachedSnapshotMedia = { id: string; filename: string; mimeType: string; width: number; height: number; size: number; sha256: string; storageKey: string };

export async function buildStreamingBackupArchive(input: { tables: BackupTables; media: CachedSnapshotMedia[]; storage: BackupStorage; outputPath: string; createdAt: Date; onProgress?: (current: number, total: number) => Promise<void> | void }) {
  const output = createWriteStream(input.outputPath, { flags: "wx" });
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const completed = new Promise<void>((resolve, reject) => { output.on("close", resolve); output.on("error", reject); archive.on("error", reject); });
  archive.pipe(output);
  const counts: Record<string, number> = {};
  const files: BackupManifest["files"] = {};
  for (const name of BACKUP_TABLE_FILES) {
    const content = JSON.stringify(input.tables[name], null, 2);
    const archivePath = `database/${name}.json`;
    counts[name] = input.tables[name].length;
    files[archivePath] = { sha256: sha256(content), count: counts[name] };
    archive.append(content, { name: archivePath });
  }
  let mediaBytes = 0;
  for (let index = 0; index < input.media.length; index++) {
    const item = input.media[index];
    archive.append(await input.storage.readStream(item.storageKey), { name: backupMediaArchivePath(item.id, item.filename) });
    mediaBytes += item.size;
    await input.onProgress?.(index + 1, input.media.length);
  }
  const manifest: BackupManifest = {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    createdAt: input.createdAt.toISOString(),
    source: { app: "HerbOverflow" },
    counts,
    files,
    media: { count: input.media.length, bytes: mediaBytes, files: input.media.map((item) => ({ id: item.id, archivePath: backupMediaArchivePath(item.id, item.filename), filename: item.filename, mimeType: item.mimeType, width: item.width, height: item.height, size: item.size, sha256: item.sha256 })) },
    security: { authSecretsExcluded: true, excludedTables: ["session", "account", "verification", "user_invitations"] },
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
  await archive.finalize();
  await completed;
  return manifest;
}

export async function verifyStreamingBackupArchive(filename: string) {
  const observed = new Map<string, { size: number; sha256: string; content?: Buffer }>();
  const parser = createReadStream(filename).pipe(unzipper.Parse({ forceStream: true }));
  for await (const entry of parser) {
    if (entry.type !== "File") { entry.autodrain(); continue; }
    const hash = createHash("sha256"); const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of entry) { const bytes = Buffer.from(chunk); size += bytes.length; hash.update(bytes); if (entry.path === "manifest.json" || entry.path.startsWith("database/")) chunks.push(bytes); }
    observed.set(entry.path, { size, sha256: hash.digest("hex"), content: chunks.length ? Buffer.concat(chunks) : undefined });
  }
  const manifestEntry = observed.get("manifest.json");
  if (!manifestEntry?.content) throw new Error("생성된 ZIP에 manifest.json이 없습니다.");
  const manifest = validateBackupManifest(JSON.parse(manifestEntry.content.toString("utf8")));
  for (const [path, expected] of Object.entries(manifest.files)) {
    const actual = observed.get(path);
    if (!actual?.content || actual.sha256 !== expected.sha256) throw new Error(`${path} 무결성 검증에 실패했습니다.`);
    const rows = JSON.parse(actual.content.toString("utf8"));
    if (!Array.isArray(rows) || rows.length !== expected.count) throw new Error(`${path} 행 수 검증에 실패했습니다.`);
  }
  for (const expected of manifest.media.files) { const actual = observed.get(expected.archivePath); if (!actual || actual.size !== expected.size || actual.sha256 !== expected.sha256) throw new Error(`${expected.archivePath} 미디어 무결성 검증에 실패했습니다.`); }
  const declared = new Set(["manifest.json", ...Object.keys(manifest.files), ...manifest.media.files.map((item) => item.archivePath)]);
  if ([...observed.keys()].some((path) => !declared.has(path))) throw new Error("Manifest에 없는 파일이 ZIP에 포함되어 있습니다.");
  return manifest;
}

export async function sha256File(filename: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

export async function inspectByteStream(stream: NodeJS.ReadableStream) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    hash.update(bytes);
  }
  return { size, sha256: hash.digest("hex") };
}
