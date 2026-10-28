export type BackupDownloadProgress = { phase: "preparing" | "downloading" | "saving"; loaded: number; total: number | null };
export type FullBackupSnapshot = { id: string; status: string; includedRevision: number | null; createdAt: string; completedAt: string | null; dataCardCount: number | null; mediaCount: number | null; mediaBytes: number | null; zipBytes: number | null; progressCurrent: number; progressTotal: number; lastError: string | null };
export type FailedBackupMedia = { id: string; attempts: number; lastError: string | null; updatedAt: string };
export type IncrementalBackupStatus = { enabled: boolean; storageConfigured: boolean; latestRevision: number; lastChangeAt: string | null; latestReady: FullBackupSnapshot | null; active: FullBackupSnapshot | null; pendingMedia: number; failedMedia: number; failedMediaItems: FailedBackupMedia[]; worker: { status: string; heartbeatAt: string; lastRunCompletedAt: string | null; lastError: string | null } | null; storageBytes: number; pendingChanges: number; synchronized: boolean; download: { available: boolean; stale: boolean } };
export type SynchronizationBlocker = { sessionId: string; drugId: string; koreanName: string; displayIndex: string; catalogIndex: number | null; referenceIndex: number | null; userId: string; userName: string; userEmail: string; lastSeenAt: string; closedAt: string | null; closeVerified: boolean; lastError: string | null; state: "active" | "expired-unverified" | "verification-failed" };
export type SynchronizationReadiness = { canSynchronize: boolean; enabled: boolean; storageConfigured: boolean; mode: "initial" | "incremental"; latestReady: { id: string; completedAt: string | null } | null; active: { id: string; status: string } | null; blockers: SynchronizationBlocker[] };

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

export async function requestFullSnapshot(allowIncomplete = false) {
  const response = await fetch("/api/backup/full", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowIncomplete }) }); const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "전체 스냅샷 생성을 요청하지 못했습니다.");
  return body as { snapshot: FullBackupSnapshot; coalesced: boolean };
}

export async function getSynchronizationReadiness() {
  const response = await fetch("/api/backup/synchronize", { cache: "no-store" }); const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "동기화 상태를 확인하지 못했습니다.");
  return body as SynchronizationReadiness;
}

export async function synchronizeBackupNow() {
  const response = await fetch("/api/backup/synchronize", { method: "POST" }); const body = await response.json();
  if (!response.ok) { const error = new Error(body.error ?? "동기화를 시작하지 못했습니다.") as Error & { details?: unknown }; error.details = body; throw error; }
  return body as { snapshotId: string; status: string; mode: "initial" | "incremental"; workerTriggered: boolean };
}

export async function diagnoseBackupMedia(ids: string[]) {
  const response = await fetch(`/api/backup/media/diagnostics?ids=${encodeURIComponent(ids.join(","))}`, { cache: "no-store" }); const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "미디어 진단에 실패했습니다.");
  return body as { diagnostics: { id: string; code: string | null; detail: string; storage: string | null; actualSizeBytes: number | null; metadata: { sizeBytes: number } | null; references: { entityType: string; entityId: string; entityName: string; fieldName: string }[] }[] };
}

export async function retryBackupMedia(ids: string[]) {
  const response = await fetch("/api/backup/media/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }); const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "실패 미디어 재시도 요청에 실패했습니다.");
  return body as { retried: number; ids: string[]; ignored: string[] };
}

export function downloadBackupWithMedia(snapshotId: string) {
  const link = document.createElement("a");
  link.href = `/api/backup/full/${snapshotId}`;
  link.style.display = "none";
  link.download = "";
  document.body.append(link); link.click(); link.remove();
  return { snapshotId };
}
