export type BackupDownloadProgress = { phase: "preparing" | "downloading" | "saving"; loaded: number; total: number | null };
export type FullBackupSnapshot = { id: string; status: string; includedRevision: number | null; createdAt: string; completedAt: string | null; dataCardCount: number | null; mediaCount: number | null; mediaBytes: number | null; zipBytes: number | null; progressCurrent: number; progressTotal: number; lastError: string | null };
export type IncrementalBackupStatus = { enabled: boolean; storageConfigured: boolean; latestRevision: number; lastChangeAt: string | null; latestReady: FullBackupSnapshot | null; active: FullBackupSnapshot | null; pendingMedia: number; failedMedia: number; worker: { status: string; heartbeatAt: string; lastRunCompletedAt: string | null; lastError: string | null } | null; storageBytes: number; pendingChanges: number; synchronized: boolean; download: { available: boolean; stale: boolean } };

export async function downloadFullBackup(filenameOverride?: string, onProgress?: (progress: BackupDownloadProgress) => void) {
  onProgress?.({ phase: "preparing", loaded: 0, total: null });
  const response = await fetch("/api/backup", { cache: "no-store" });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? "백업을 생성하지 못했습니다."); }
  const totalHeader = Number(response.headers.get("content-length"));
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : null;
  let blob: Blob;
  if (response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); loaded += value.byteLength;
      onProgress?.({ phase: "downloading", loaded, total });
    }
    blob = new Blob(chunks as BlobPart[], { type: response.headers.get("content-type") ?? "application/zip" });
  } else {
    blob = await response.blob();
    onProgress?.({ phase: "downloading", loaded: blob.size, total: blob.size });
  }
  if (!blob.size) throw new Error("생성된 백업 파일이 비어 있습니다.");
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = filenameOverride ?? disposition.match(/filename="([^"]+)"/)?.[1] ?? "HerbOverflow-Backup.zip";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.style.display = "none";
  document.body.append(link);
  onProgress?.({ phase: "saving", loaded: blob.size, total: blob.size });
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { size: blob.size, filename };
}

export function preRestoreFilename(date = new Date()) { return `HerbOverflow-PreRestore-${date.toISOString().replace(/[:.]/g, "-")}.zip`; }

export async function getFullBackupStatus() {
  const response = await fetch("/api/backup/full", { cache: "no-store" }); const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "전체 백업 상태를 불러오지 못했습니다.");
  return body as IncrementalBackupStatus;
}

export async function requestFullSnapshot() {
  const response = await fetch("/api/backup/full", { method: "POST" }); const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "전체 스냅샷 생성을 요청하지 못했습니다.");
  return body as { snapshot: FullBackupSnapshot; coalesced: boolean };
}

export function downloadBackupWithMedia(snapshotId: string) {
  const link = document.createElement("a");
  link.href = `/api/backup/full/${snapshotId}`;
  link.style.display = "none";
  link.download = "";
  document.body.append(link); link.click(); link.remove();
  return { snapshotId };
}
