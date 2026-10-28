export const DEFAULT_FULL_MEDIA_BACKUP_LIMIT_BYTES = 250 * 1024 * 1024;

export type BackupMediaPlanItem = {
  id: string;
  archivePath: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  sourceFingerprint: string;
};

export function backupMediaArchivePath(id: string, filename: string | null) {
  const safeName = (filename ?? "image").normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/\.{2,}/g, ".").replace(/^[.-]+|[.-]+$/g, "").slice(0, 100) || "image";
  return `media/${id}-${safeName}`;
}

export function createMediaBackupPlan(assets: { id: string; originalFilename: string | null; mimeType: string; width: number; height: number; sizeBytes: number; sourceFingerprint?: string }[], limitBytes = DEFAULT_FULL_MEDIA_BACKUP_LIMIT_BYTES) {
  const files: BackupMediaPlanItem[] = assets.map((asset) => ({ id: asset.id, archivePath: backupMediaArchivePath(asset.id, asset.originalFilename), filename: asset.originalFilename || asset.id, mimeType: asset.mimeType, width: asset.width, height: asset.height, size: asset.sizeBytes, sourceFingerprint: asset.sourceFingerprint ?? `${asset.id}:${asset.sizeBytes}` }));
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  return { count: files.length, bytes, limitBytes, supported: bytes <= limitBytes, files };
}
