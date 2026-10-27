export const COLLECTION_ARCHIVE_MIGRATION_AT = 1793076195706;

export type CollectionMigrationState = "ready" | "migration-missing" | "journal-missing" | "schema-missing";

export function collectionMigrationState(columnExists: boolean, migrationRecorded: boolean): CollectionMigrationState {
  if (columnExists && migrationRecorded) return "ready";
  if (!columnExists && !migrationRecorded) return "migration-missing";
  return columnExists ? "journal-missing" : "schema-missing";
}

export function isUndefinedColumnError(error: unknown, column?: string): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown; cause?: unknown };
  const message = typeof value.message === "string" ? value.message : "";
  const matches = value.code === "42703" || /column .* does not exist/i.test(message);
  const ownMatch = matches && (!column || message.includes(column));
  return ownMatch || isUndefinedColumnError(value.cause, column);
}

export function backupCoversCurrentSchema(lastSuccessfulAt: string | null, latestMigrationAt: number, now = new Date(), maximumAgeMs = 24 * 60 * 60 * 1000) {
  if (!lastSuccessfulAt) return false;
  const success = new Date(lastSuccessfulAt).getTime();
  return Number.isFinite(success) && success >= latestMigrationAt && success <= now.getTime() && now.getTime() - success <= maximumAgeMs;
}
