import JSZip from "jszip";
import type { BackupMediaPlanItem } from "@/lib/backup/media-plan";

export type BackupDownloadProgress = { phase: "preparing" | "downloading" | "saving"; loaded: number; total: number | null };
export type FullMediaBackupProgress = { phase: "planning" | "database" | "media" | "packing" | "saving"; completed: number; total: number; loadedBytes: number; totalBytes: number; current?: string };

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

export async function downloadBackupWithMedia(onProgress?: (progress: FullMediaBackupProgress) => void) {
  onProgress?.({ phase: "planning", completed: 0, total: 0, loadedBytes: 0, totalBytes: 0 });
  const planResponse = await fetch("/api/backup/media", { cache: "no-store" });
  const plan = await planResponse.json();
  if (!planResponse.ok) throw new Error(plan.error ?? "이미지 백업 계획을 만들지 못했습니다.");
  if (!plan.supported) throw new Error(`이미지 원본 합계 ${formatClientBytes(plan.bytes)}가 이 브라우저 ZIP 경로의 안전 한도 ${formatClientBytes(plan.limitBytes)}를 초과합니다. 청크 백업이 필요합니다.`);
  onProgress?.({ phase: "database", completed: 0, total: plan.count, loadedBytes: 0, totalBytes: plan.bytes });
  const databaseResponse = await fetch("/api/backup", { cache: "no-store" });
  if (!databaseResponse.ok) { const body = await databaseResponse.json().catch(() => ({})); throw new Error(body.error ?? "기본 데이터 백업을 생성하지 못했습니다."); }
  const zip = await JSZip.loadAsync(await databaseResponse.arrayBuffer(), { checkCRC32: true });
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("기본 백업에 manifest.json이 없습니다.");
  const manifest = JSON.parse(await manifestFile.async("string"));
  const files = await downloadMediaFiles(plan.files as BackupMediaPlanItem[], plan.bytes, onProgress);
  for (const file of files) zip.file(file.archivePath, file.bytes);
  manifest.media = { count: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0), files: files.map((file) => ({ id: file.id, archivePath: file.archivePath, filename: file.filename, mimeType: file.mimeType, width: file.width, height: file.height, size: file.size, sha256: file.sha256 })) };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, (metadata) => onProgress?.({ phase: "packing", completed: files.length, total: files.length, loadedBytes: Math.round(metadata.percent), totalBytes: 100 }));
  if (!blob.size) throw new Error("생성된 이미지 포함 백업이 비어 있습니다.");
  const filename = `HerbOverflow-Backup-With-Images-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  saveBlob(blob, filename);
  onProgress?.({ phase: "saving", completed: files.length, total: files.length, loadedBytes: blob.size, totalBytes: blob.size });
  return { size: blob.size, filename, mediaCount: files.length, mediaBytes: manifest.media.bytes as number };
}

type DownloadedMedia = BackupMediaPlanItem & { size: number; sha256: string; bytes: Uint8Array };

async function downloadMediaFiles(files: BackupMediaPlanItem[], totalBytes: number, onProgress?: (progress: FullMediaBackupProgress) => void) {
  const results = new Array<DownloadedMedia>(files.length);
  const failures: string[] = [];
  let cursor = 0; let completed = 0; let loadedBytes = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= files.length) return;
      const item = files[index];
      onProgress?.({ phase: "media", completed, total: files.length, loadedBytes, totalBytes, current: item.filename });
      try {
        const response = await fetch(`/api/backup/media/${item.id}`, { cache: "no-store" });
        if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? `HTTP ${response.status}`); }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const serverHash = response.headers.get("x-herboverflow-media-sha256");
        const hash = await browserSha256(bytes);
        if (bytes.length !== item.size) throw new Error(`크기 불일치: 예상 ${item.size}, 실제 ${bytes.length}`);
        if (!serverHash || hash !== serverHash) throw new Error("SHA-256 검증 실패");
        results[index] = { ...item, size: bytes.length, sha256: hash, bytes };
        loadedBytes += bytes.length; completed++;
        onProgress?.({ phase: "media", completed, total: files.length, loadedBytes, totalBytes, current: item.filename });
      } catch (error) { failures.push(`${item.filename} (${item.id}): ${error instanceof Error ? error.message : "다운로드 실패"}`); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, Math.max(1, files.length)) }, () => worker()));
  if (failures.length) throw new Error(`이미지 원본 ${failures.length}개를 가져오지 못해 완전 백업을 생성하지 않았습니다. ${failures.slice(0, 3).join(" / ")}`);
  return results;
}

async function browserSha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.style.display = "none";
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function formatClientBytes(value: number) { return value < 1024 ** 2 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 ** 2).toFixed(1)} MB`; }
