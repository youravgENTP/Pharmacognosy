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
  "user-attribution",
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
  security: z.object({ authSecretsExcluded: z.literal(true), excludedTables: z.array(z.string()) }),
});

export type BackupManifest = z.infer<typeof manifestSchema>;

export async function createBackupArchive(tables: BackupTables, media: BackupMediaFile[], createdAt = new Date()) {
  const assetRows = tables["media-assets"].map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row) || typeof (row as { id?: unknown }).id !== "string") throw new Error("media-assets 백업 행이 올바르지 않습니다.");
    return row as { id: string; archivePath?: unknown; sha256?: unknown };
  });
  const mediaById = new Map(media.map((item) => [item.id, item]));
  if (mediaById.size !== media.length) throw new Error("중복된 미디어 ID는 백업할 수 없습니다.");
  for (const id of collectReferencedMediaIds(tables)) if (!assetRows.some((row) => row.id === id)) throw new Error(`콘텐츠가 참조하는 미디어 ${id}의 metadata가 없어 백업을 중단했습니다.`);
  for (const row of assetRows) {
    const file = mediaById.get(row.id);
    if (!file) throw new Error(`미디어 ${row.id}의 실제 파일이 없어 백업을 중단했습니다.`);
    if (row.archivePath !== file.archivePath || row.sha256 !== file.sha256 || file.size !== file.bytes.length || file.sha256 !== sha256(file.bytes)) throw new Error(`미디어 ${row.id}의 metadata 또는 checksum이 일치하지 않습니다.`);
  }
  if (assetRows.length !== media.length) throw new Error("미디어 metadata와 실제 파일 수가 일치하지 않습니다.");
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

  for (const item of media) zip.file(item.archivePath, item.bytes);
  const manifest: BackupManifest = {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    createdAt: createdAt.toISOString(),
    source: { app: "HerbOverflow" },
    counts,
    files,
    media: { count: media.length, bytes: media.reduce((sum, item) => sum + item.bytes.length, 0), files: media.map((item) => ({ id: item.id, archivePath: item.archivePath, filename: item.filename, mimeType: item.mimeType, width: item.width, height: item.height, size: item.size, sha256: item.sha256 })) },
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
  const parsed = manifestSchema.safeParse(rawManifest);
  if (!parsed.success) throw new Error("지원하지 않거나 손상된 HerbOverflow 백업입니다.");
  const manifest = parsed.data;
  const tables = {} as BackupTables;

  for (const name of BACKUP_TABLE_FILES) {
    const path = `database/${name}.json`;
    const file = zip.file(path);
    const expected = manifest.files[path];
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
    if (!item.archivePath.startsWith("media/") || item.archivePath.includes("..")) throw new Error("안전하지 않은 미디어 경로가 포함되어 있습니다.");
    if (media.has(item.id) || mediaPaths.has(item.archivePath)) throw new Error("중복된 미디어 ID 또는 경로가 포함되어 있습니다.");
    mediaPaths.add(item.archivePath);
    const file = zip.file(item.archivePath);
    if (!file) throw new Error(`미디어 파일 ${item.archivePath}이 없습니다.`);
    const bytes = await file.async("nodebuffer");
    if (bytes.length !== item.size || sha256(bytes) !== item.sha256) throw new Error(`미디어 파일 ${item.archivePath}의 무결성 검증에 실패했습니다.`);
    media.set(item.id, bytes);
  }
  if (media.size !== manifest.media.count || [...media.values()].reduce((sum, bytes) => sum + bytes.length, 0) !== manifest.media.bytes) throw new Error("미디어 파일 집계가 manifest와 일치하지 않습니다.");
  return { manifest, tables, media };
}

export function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }

export function backupFilename(prefix = "HerbOverflow-Backup", date = new Date()) {
  return `${prefix}-${date.toISOString().replace(/[:.]/g, "-")}.zip`;
}

function collectReferencedMediaIds(tables: BackupTables) {
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
