import { createHash } from "node:crypto";
import JSZip from "jszip";
import { z } from "zod";

export const BACKUP_SCHEMA = "herboverflow.backup" as const;
export const BACKUP_VERSION = 1 as const;

export const BACKUP_TABLE_FILES = [
  "categories", "families", "crude-drugs", "field-definitions",
  "drug-identity-terms", "crude-drug-identity-terms", "relationship-types",
  "crude-drug-relationships", "constituents", "constituent-taxa",
  "constituent-taxon-edges", "constituent-memberships", "crude-drug-constituents",
  "constituent-media", "constituent-taxon-media", "user-drug-mnemonics",
  "user-mnemonic-preferences", "legacy-drug-mnemonics", "collections",
  "collection-members", "collection-revisions", "decks", "word-cards",
  "concept-anchors", "concept-connections", "media-assets", "app-settings",
  "archive-groups", "archive-entries", "user-attribution",
] as const;

export type BackupTableName = typeof BACKUP_TABLE_FILES[number];
export type BackupTables = Record<BackupTableName, unknown[]>;
export type BackupMediaFile = { id: string; archivePath: string; filename: string; mimeType: string; width: number; height: number; size: number; sha256: string; bytes: Buffer };

const manifestSchema = z.object({
  schema: z.literal(BACKUP_SCHEMA),
  version: z.literal(BACKUP_VERSION),
  createdAt: z.string().datetime(),
  source: z.object({ app: z.literal("HerbOverflow") }),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  files: z.record(z.string(), z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), count: z.number().int().nonnegative() })),
  media: z.object({ count: z.number().int().nonnegative(), bytes: z.number().int().nonnegative(), files: z.array(z.object({ id: z.string().uuid(), archivePath: z.string(), filename: z.string(), mimeType: z.string(), width: z.number().int().positive(), height: z.number().int().positive(), size: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })) }),
  incomplete: z.object({ missingMedia: z.array(z.object({ id: z.string().uuid(), code: z.string(), detail: z.string() })) }).optional(),
  security: z.object({ authSecretsExcluded: z.literal(true), excludedTables: z.array(z.string()) }),
});

export type BackupManifest = z.infer<typeof manifestSchema>;

export function validateBackupManifest(value: unknown): BackupManifest {
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) throw new Error("지원하지 않거나 손상된 HerbOverflow 백업입니다.");
  return parsed.data;
}

export async function createBackupArchive(tables: BackupTables, _media: BackupMediaFile[], createdAt = new Date()) {
  return createArchive(tables, [], createdAt);
}

export async function createBackupArchiveWithMedia(tables: BackupTables, media: BackupMediaFile[], createdAt = new Date()) {
  return createArchive(tables, media, createdAt);
}

async function createArchive(tables: BackupTables, media: BackupMediaFile[], createdAt: Date) {
  const zip = new JSZip();
  const counts: Record<string, number> = {};
  const files: BackupManifest["files"] = {};

  for (const name of BACKUP_TABLE_FILES) {
    const rows = tables[name];
    const content = JSON.stringify(rows, null, 2);
    const path = `database/${name}.json`;
    zip.file(path, content);
    counts[name] = rows.length;
    files[path] = { sha256: sha256(content), count: rows.length };
  }

  const mediaIds = new Set<string>();
  const mediaPaths = new Set<string>();
  let mediaBytes = 0;
  for (const item of media) {
    if (!safeMediaArchivePath(item.archivePath)) throw new Error(`안전하지 않은 미디어 경로입니다: ${item.archivePath}`);
    if (mediaIds.has(item.id) || mediaPaths.has(item.archivePath)) throw new Error("중복된 미디어 ID 또는 경로가 있습니다.");
    if (item.bytes.length !== item.size || sha256(item.bytes) !== item.sha256) throw new Error(`미디어 파일 ${item.id}의 크기 또는 체크섬이 일치하지 않습니다.`);
    mediaIds.add(item.id); mediaPaths.add(item.archivePath); mediaBytes += item.size;
    zip.file(item.archivePath, item.bytes);
  }

  const manifest: BackupManifest = {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    createdAt: createdAt.toISOString(),
    source: { app: "HerbOverflow" },
    counts,
    files,
    media: { count: media.length, bytes: mediaBytes, files: media.map((item) => ({ id: item.id, archivePath: item.archivePath, filename: item.filename, mimeType: item.mimeType, width: item.width, height: item.height, size: item.size, sha256: item.sha256 })) },
    security: { authSecretsExcluded: true, excludedTables: ["session", "account", "verification", "user_invitations"] },
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  return { buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } }), manifest };
}

export async function parseBackupArchive(input: Buffer | ArrayBuffer) {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(input, { checkCRC32: true }); }
  catch { throw new Error("백업 ZIP 파일을 읽을 수 없습니다."); }
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("manifest.json이 없는 백업입니다.");
  let rawManifest: unknown;
  try { rawManifest = JSON.parse(await manifestFile.async("string")); }
  catch { throw new Error("백업 manifest가 올바른 JSON이 아닙니다."); }
  const manifest = validateBackupManifest(rawManifest);
  const tables = {} as BackupTables;

  for (const name of BACKUP_TABLE_FILES) {
    const path = `database/${name}.json`;
    const file = zip.file(path);
    const expected = manifest.files[path];
    if (["user-mnemonic-preferences", "archive-groups", "archive-entries"].includes(name) && !file && !expected && manifest.counts[name] === undefined) {
      tables[name] = [];
      continue;
    }
    if (!file || !expected) throw new Error(`백업에 ${path} 파일이 없습니다.`);
    if (manifest.counts[name] !== expected.count) throw new Error(`${path} 행 수 metadata가 일치하지 않습니다.`);
    const content = await file.async("string");
    if (sha256(content) !== expected.sha256) throw new Error(`${path} 체크섬이 일치하지 않습니다.`);
    let rows: unknown;
    try { rows = JSON.parse(content); } catch { throw new Error(`${path} 파일이 올바른 JSON이 아닙니다.`); }
    if (!Array.isArray(rows) || rows.length !== expected.count) throw new Error(`${path} 행 수가 manifest와 일치하지 않습니다.`);
    tables[name] = rows;
  }

  const media = new Map<string, Buffer>();
  const mediaPaths = new Set<string>();
  for (const item of manifest.media.files) {
    if (!safeMediaArchivePath(item.archivePath)) throw new Error("안전하지 않은 미디어 경로가 포함되어 있습니다.");
    if (media.has(item.id) || mediaPaths.has(item.archivePath)) throw new Error("중복된 미디어 ID 또는 경로가 포함되어 있습니다.");
    mediaPaths.add(item.archivePath);
    const file = zip.file(item.archivePath);
    if (!file) throw new Error(`미디어 파일 ${item.archivePath}이 없습니다.`);
    const bytes = await file.async("nodebuffer");
    if (bytes.length !== item.size || sha256(bytes) !== item.sha256) throw new Error(`미디어 파일 ${item.archivePath}의 무결성 검증에 실패했습니다.`);
    media.set(item.id, bytes);
  }
  const zippedMediaPaths = Object.values(zip.files).filter((file) => !file.dir && file.name.startsWith("media/")).map((file) => file.name);
  if (zippedMediaPaths.length !== mediaPaths.size || zippedMediaPaths.some((path) => !mediaPaths.has(path))) throw new Error("Manifest와 ZIP의 미디어 파일 목록이 일치하지 않습니다.");
  if (media.size !== manifest.media.count || [...media.values()].reduce((sum, bytes) => sum + bytes.length, 0) !== manifest.media.bytes) throw new Error("미디어 파일 집계가 manifest와 일치하지 않습니다.");
  return { manifest, tables, media };
}

export async function verifyGeneratedBackup(buffer: Buffer, expected: BackupTables) {
  const parsed = await parseBackupArchive(buffer);
  for (const name of BACKUP_TABLE_FILES) if (JSON.stringify(parsed.tables[name]) !== JSON.stringify(expected[name])) throw new Error(`생성된 Backup의 ${name} 데이터 검증에 실패했습니다.`);
  return parsed.manifest;
}

export function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }

export function safeMediaArchivePath(value: string) { return /^media\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && !value.includes(".."); }

export function backupFilename(prefix = "HerbOverflow-Backup", date = new Date()) {
  return `${prefix}-${date.toISOString().replace(/[:.]/g, "-")}.zip`;
}

export function collectReferencedMediaIds(tables: BackupTables) {
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "mediaAssetId" && typeof child === "string") ids.add(child);
      else visit(child);
    }
  };
  for (const [name, rows] of Object.entries(tables)) if (name !== "media-assets") visit(rows);
  return ids;
}
