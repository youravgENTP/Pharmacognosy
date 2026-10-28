"use client";

import JSZip from "jszip";
import type { BackupMediaPlanItem } from "@/lib/backup/media-plan";

const CACHE_DB = "herboverflow-backup-media-v1";
const CACHE_STORE = "verified-media";
const DOWNLOAD_CONCURRENCY = 3;
const MAX_ATTEMPTS = 3;

type SnapshotPlan = { snapshotId: string; capturedAt: string; databaseUrl: string; filename: string; media: { count: number; bytes: number; limitBytes: number; supported: boolean; files: BackupMediaPlanItem[] } };
type CachedMedia = { id: string; fingerprint: string; size: number; sha256: string; blob: Blob };
export type LocalFullBackupProgress = { phase: "snapshot" | "database" | "media" | "building" | "verifying" | "download"; current: number; total: number; bytes: number; label: string };
export type LocalMediaFailure = { id: string; filename: string; code: string; detail: string };

export class LocalFullBackupError extends Error {
  constructor(message: string, public failures: LocalMediaFailure[]) { super(message); this.name = "LocalFullBackupError"; }
}

export async function createAndDownloadLocalFullBackup(snapshotId: string, onProgress?: (progress: LocalFullBackupProgress) => void) {
  onProgress?.({ phase: "snapshot", current: 0, total: 1, bytes: 0, label: "고정된 DB 스냅샷 확인 중" });
  const planResponse = await fetch(`/api/backup/synchronize/${snapshotId}`, { cache: "no-store" });
  const planBody = await planResponse.json().catch(() => ({}));
  if (!planResponse.ok) throw new Error(planBody.error ?? "로컬 전체 백업 계획을 불러오지 못했습니다.");
  const plan = planBody as SnapshotPlan;
  if (!plan.media.supported) throw new Error(`이미지 원본 ${formatBytes(plan.media.bytes)}가 현재 브라우저 안전 한도 ${formatBytes(plan.media.limitBytes)}를 초과합니다.`);

  onProgress?.({ phase: "database", current: 0, total: 1, bytes: 0, label: "불변 DB ZIP 다운로드 중" });
  const databaseResponse = await fetch(plan.databaseUrl, { cache: "no-store" });
  if (!databaseResponse.ok) throw new Error("불변 DB ZIP을 다운로드하지 못했습니다.");
  const databaseBlob = await databaseResponse.blob();
  const zip = await JSZip.loadAsync(databaseBlob, { checkCRC32: true });
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("DB ZIP에 manifest.json이 없습니다.");
  const manifest = JSON.parse(await manifestFile.async("string")) as { schema: string; version: number; files: Record<string, { sha256: string; count: number }>; media: { count: number; bytes: number; files: { id: string; archivePath: string; filename: string; mimeType: string; width: number; height: number; size: number; sha256: string }[] } };
  if (manifest.schema !== "herboverflow.backup" || manifest.version !== 1) throw new Error("지원하지 않는 백업 manifest입니다.");
  await verifyDatabaseFiles(zip, manifest.files);

  let completed = 0;
  let completedBytes = 0;
  const failures: LocalMediaFailure[] = [];
  const verified = new Map<string, CachedMedia>();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, Math.max(1, plan.media.files.length)) }, async () => {
    while (cursor < plan.media.files.length) {
      const item = plan.media.files[cursor++];
      try {
        const media = await getVerifiedMedia(item);
        verified.set(item.id, media);
        completedBytes += media.size;
      } catch (error) {
        const detail = error instanceof Error ? error.message : "알 수 없는 이미지 다운로드 오류";
        const code = error instanceof MediaDownloadError ? error.code : "UNKNOWN";
        failures.push({ id: item.id, filename: item.filename, code, detail });
      } finally {
        completed++;
        onProgress?.({ phase: "media", current: completed, total: plan.media.files.length, bytes: completedBytes, label: `이미지 수집·검증 ${completed}/${plan.media.files.length}` });
      }
    }
  });
  await Promise.all(workers);
  if (failures.length) throw new LocalFullBackupError(`${failures.length}개 이미지 원본을 검증하지 못했습니다. 성공한 파일은 브라우저 캐시에 보존되어 재시도 시 재사용됩니다.`, failures);

  const mediaFiles: { id: string; archivePath: string; filename: string; mimeType: string; width: number; height: number; size: number; sha256: string }[] = [];
  for (const item of plan.media.files) {
    const media = verified.get(item.id)!;
    zip.file(item.archivePath, media.blob);
    mediaFiles.push({ id: item.id, archivePath: item.archivePath, filename: item.filename, mimeType: item.mimeType, width: item.width, height: item.height, size: media.size, sha256: media.sha256 });
  }
  manifest.media = { count: mediaFiles.length, bytes: mediaFiles.reduce((sum, item) => sum + item.size, 0), files: mediaFiles };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  onProgress?.({ phase: "building", current: 0, total: 100, bytes: completedBytes, label: "브라우저에서 전체 ZIP 생성 중" });
  const output = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, (metadata) => onProgress?.({ phase: "building", current: Math.round(metadata.percent), total: 100, bytes: completedBytes, label: `전체 ZIP 생성 ${Math.round(metadata.percent)}%` }));
  onProgress?.({ phase: "verifying", current: 0, total: mediaFiles.length, bytes: output.size, label: "완성된 ZIP 무결성 재검증 중" });
  await verifyCompletedArchive(output, manifest, (current) => onProgress?.({ phase: "verifying", current, total: mediaFiles.length, bytes: output.size, label: `완성 ZIP 검증 ${current}/${mediaFiles.length}` }));

  const url = URL.createObjectURL(output);
  const link = document.createElement("a");
  link.href = url; link.download = plan.filename; link.style.display = "none";
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  onProgress?.({ phase: "download", current: 1, total: 1, bytes: output.size, label: "검증 완료 · 로컬 다운로드 시작됨" });
  return { filename: plan.filename, size: output.size, mediaCount: mediaFiles.length };
}

async function getVerifiedMedia(item: BackupMediaPlanItem) {
  const cached = await readCache(item.id).catch(() => undefined);
  if (cached && cached.fingerprint === item.sourceFingerprint && cached.size === item.size && await sha256Blob(cached.blob) === cached.sha256) {
    const source = await fetch(`/api/backup/media/${item.id}?fingerprint=${encodeURIComponent(item.sourceFingerprint)}`, { method: "HEAD", cache: "no-store" }).catch(() => null);
    if (source?.ok && source.headers.get("x-herboverflow-media-sha256") === cached.sha256) return cached;
    if (source?.ok) { await deleteCache(item.id).catch(() => undefined); throw new MediaDownloadError("SOURCE_CHANGED", "원본 내용이 캐시 이후 변경되었습니다. metadata를 확인한 뒤 새 동기화를 시작해 주세요.", false); }
  }
  if (cached) await deleteCache(item.id).catch(() => undefined);

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`/api/backup/media/${item.id}?fingerprint=${encodeURIComponent(item.sourceFingerprint)}`, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new MediaDownloadError(typeof body.code === "string" ? body.code : response.status === 404 ? "NOT_FOUND" : response.status === 403 ? "PERMISSION_ERROR" : "STORAGE_ERROR", body.error ?? `HTTP ${response.status}`, Boolean(body.retryable));
      }
      const blob = await response.blob();
      if (blob.size !== item.size) throw new MediaDownloadError("SIZE_MISMATCH", `실제 크기 ${blob.size}와 스냅샷 metadata ${item.size}가 다릅니다.`, false);
      const digest = await sha256Blob(blob);
      const serverDigest = response.headers.get("x-herboverflow-media-sha256");
      if (!serverDigest || digest !== serverDigest) throw new MediaDownloadError("HASH_MISMATCH", "서버와 브라우저 SHA-256 검증값이 다릅니다.", true);
      const value = { id: item.id, fingerprint: item.sourceFingerprint, size: blob.size, sha256: digest, blob };
      await writeCache(value).catch(() => undefined);
      return value;
    } catch (error) {
      lastError = error;
      if (error instanceof MediaDownloadError && !error.retryable) break;
      if (attempt + 1 < MAX_ATTEMPTS) await delay(500 * 2 ** attempt);
    }
  }
  throw lastError;
}

class MediaDownloadError extends Error {
  constructor(public code: string, message: string, public retryable: boolean) { super(message); }
}

async function verifyDatabaseFiles(zip: JSZip, files: Record<string, { sha256: string }>) {
  for (const [path, expected] of Object.entries(files)) {
    const file = zip.file(path); if (!file) throw new Error(`DB ZIP에 ${path}가 없습니다.`);
    if (await sha256Bytes(await file.async("uint8array")) !== expected.sha256) throw new Error(`${path} SHA-256 검증에 실패했습니다.`);
  }
}

async function verifyCompletedArchive(blob: Blob, expected: { media: { count: number; bytes: number; files: { id: string; archivePath: string; size: number; sha256: string }[] } }, progress: (current: number) => void) {
  const zip = await JSZip.loadAsync(blob, { checkCRC32: true });
  const manifestFile = zip.file("manifest.json"); if (!manifestFile) throw new Error("완성 ZIP manifest가 없습니다.");
  const actual = JSON.parse(await manifestFile.async("string")) as typeof expected;
  if (actual.media.count !== expected.media.count || actual.media.bytes !== expected.media.bytes) throw new Error("완성 ZIP 미디어 집계가 일치하지 않습니다.");
  const ids = new Set<string>(); const paths = new Set<string>(); let bytes = 0; let current = 0;
  for (const item of actual.media.files) {
    if (ids.has(item.id) || paths.has(item.archivePath) || !/^media\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(item.archivePath) || item.archivePath.includes("..")) throw new Error("완성 ZIP에 중복되거나 안전하지 않은 미디어 경로가 있습니다.");
    ids.add(item.id); paths.add(item.archivePath);
    const file = zip.file(item.archivePath); if (!file) throw new Error(`${item.archivePath}가 완성 ZIP에 없습니다.`);
    const value = await file.async("uint8array");
    if (value.byteLength !== item.size || await sha256Bytes(value) !== item.sha256) throw new Error(`${item.archivePath} 무결성 검증에 실패했습니다.`);
    bytes += value.byteLength; progress(++current);
  }
  const actualPaths = Object.values(zip.files).filter((file) => !file.dir && file.name.startsWith("media/")).map((file) => file.name);
  if (actualPaths.length !== paths.size || actualPaths.some((path) => !paths.has(path)) || bytes !== actual.media.bytes) throw new Error("Manifest와 완성 ZIP의 이미지 목록이 일치하지 않습니다.");
}

async function sha256Blob(blob: Blob) { return sha256Bytes(new Uint8Array(await blob.arrayBuffer())); }
async function sha256Bytes(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer))].map((value) => value.toString(16).padStart(2, "0")).join("");
}
function delay(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function formatBytes(value: number) { return value < 1024 ** 2 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 ** 2).toFixed(1)} MB`; }

function openCache() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(CACHE_STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function readCache(id: string) { const database = await openCache(); return transact<CachedMedia | undefined>(database, "readonly", (store) => store.get(id)); }
async function writeCache(value: CachedMedia) { const database = await openCache(); await transact(database, "readwrite", (store) => store.put(value)); }
async function deleteCache(id: string) { const database = await openCache(); await transact(database, "readwrite", (store) => store.delete(id)); }
function transact<T>(database: IDBDatabase, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => { const transaction = database.transaction(CACHE_STORE, mode); const request = operation(transaction.objectStore(CACHE_STORE)); let result: T; request.onsuccess = () => { result = request.result; }; request.onerror = () => { database.close(); reject(request.error); }; transaction.oncomplete = () => { database.close(); resolve(result); }; transaction.onerror = () => { database.close(); reject(transaction.error); }; });
}
