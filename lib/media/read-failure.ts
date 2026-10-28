export type MediaStorageKind = "local" | "database" | "vercel_blob";
export type MediaReadFailureCode = "NOT_FOUND" | "STORAGE_ERROR" | "PERMISSION_ERROR" | "TRANSIENT_ERROR" | "UNKNOWN";
export type MediaReadFailure = { ok: false; code: MediaReadFailureCode; storage: MediaStorageKind; detail: string; retryable: boolean; statusCode?: number };

export function mediaReadFailure(code: MediaReadFailureCode, storage: MediaStorageKind, detail: string, retryable: boolean, statusCode?: number): MediaReadFailure {
  return { ok: false, code, storage, detail, retryable, ...(statusCode === undefined ? {} : { statusCode }) };
}

export function classifyStorageStatus(statusCode: number, storage: MediaStorageKind): MediaReadFailure {
  if (statusCode === 401 || statusCode === 403) return mediaReadFailure("PERMISSION_ERROR", storage, `Storage access was denied (${statusCode})`, false, statusCode);
  if (statusCode === 404) return mediaReadFailure("NOT_FOUND", storage, "Blob object was not found", false, statusCode);
  if (statusCode === 408 || statusCode === 429 || statusCode >= 500) return mediaReadFailure("TRANSIENT_ERROR", storage, `Storage temporarily failed (${statusCode})`, true, statusCode);
  return mediaReadFailure("STORAGE_ERROR", storage, `Storage returned status ${statusCode}`, false, statusCode);
}

export function classifyStorageError(error: unknown, storage: MediaStorageKind): MediaReadFailure {
  const value = error as { code?: string; status?: number; statusCode?: number; name?: string };
  const status = value?.statusCode ?? value?.status;
  if (typeof status === "number") return classifyStorageStatus(status, storage);
  if (value?.code === "ENOENT") return mediaReadFailure("NOT_FOUND", storage, "Storage object was not found", false);
  if (value?.code === "EACCES" || value?.code === "EPERM") return mediaReadFailure("PERMISSION_ERROR", storage, "Storage access was denied", false);
  if (["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENETUNREACH"].includes(value?.code ?? "")) return mediaReadFailure("TRANSIENT_ERROR", storage, `Temporary storage error: ${value.code}`, true);
  return mediaReadFailure("UNKNOWN", storage, `Storage read failed: ${value?.name ?? "unknown error"}`, true);
}
