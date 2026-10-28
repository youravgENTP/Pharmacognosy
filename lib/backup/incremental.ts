export function backupRetryDelayMs(attempt: number, baseMs = 30_000, maximumMs = 60 * 60 * 1000) {
  return Math.min(maximumMs, baseMs * 2 ** Math.max(0, attempt - 1));
}

export function backupFreshness(latestRevision: number, includedRevision: number | null | undefined) {
  const pendingChanges = Math.max(0, latestRevision - (includedRevision ?? 0));
  return { pendingChanges, synchronized: pendingChanges === 0 && includedRevision != null };
}

export function shouldScheduleSnapshot(input: { pendingChanges: number; hasActiveBuild: boolean; oldestPendingAt?: Date | null; latestReadyAt?: Date | null; now?: Date; debounceMs: number; maximumStalenessMs: number; force?: boolean }) {
  if (input.hasActiveBuild || input.pendingChanges === 0) return false;
  if (input.force) return true;
  const now = (input.now ?? new Date()).getTime();
  if (!input.latestReadyAt || now - input.latestReadyAt.getTime() >= input.maximumStalenessMs) return true;
  return Boolean(input.oldestPendingAt && now - input.oldestPendingAt.getTime() >= input.debounceMs);
}

export function snapshotDownloadState(latestRevision: number, snapshot?: { includedRevision: number | null; status: string } | null) {
  if (!snapshot || snapshot.status !== "ready" || snapshot.includedRevision == null) return { available: false, stale: true };
  return { available: true, stale: snapshot.includedRevision < latestRevision };
}

export function snapshotIdsBeyondRetention(snapshots: { id: string; status: string }[], keep: number) {
  const retained = Math.max(1, keep);
  return snapshots.filter((snapshot) => snapshot.status === "ready").slice(retained).map((snapshot) => snapshot.id);
}
