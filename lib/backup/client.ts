export type BackupDownloadProgress = { phase: "preparing" | "downloading" | "saving"; loaded: number; total: number | null };

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
