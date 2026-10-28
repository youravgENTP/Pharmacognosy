import "server-only";
import { loadBackupPolicy } from "@/lib/backup/settings";
import { databaseClient } from "@/lib/db";
import { backupCoversCurrentSchema, COLLECTION_ARCHIVE_MIGRATION_AT, collectionMigrationState } from "@/lib/db/migration-health";

export class MaintenancePrerequisiteError extends Error {
  constructor(message: string, readonly code: "MIGRATION_REQUIRED" | "MIGRATION_INCONSISTENT" | "BACKUP_REQUIRED") { super(message); }
}

export async function maintenanceReadiness(requiredBackupAt?: Date | null, now = new Date()) {
  const [column] = await databaseClient<{ exists: boolean }[]>`select exists(select 1 from information_schema.columns where table_schema=current_schema() and table_name='collections' and column_name='archived_at') as exists`;
  const [migration] = await databaseClient<{ recorded: boolean; latest: string | null }[]>`select exists(select 1 from drizzle.__drizzle_migrations where created_at=${String(COLLECTION_ARCHIVE_MIGRATION_AT)}) as recorded, max(created_at)::text as latest from drizzle.__drizzle_migrations`;
  const migrationState = collectionMigrationState(Boolean(column?.exists), Boolean(migration?.recorded));
  const policy = await loadBackupPolicy();
  const latestMigrationAt = Math.max(Number(migration?.latest ?? 0), requiredBackupAt?.getTime() ?? 0);
  return { migrationState, backupReady: migrationState === "ready" && backupCoversCurrentSchema(policy.lastSuccessfulLocalBackupAt, latestMigrationAt, now), lastSuccessfulBackupAt: policy.lastSuccessfulLocalBackupAt, requiredBackupAt: requiredBackupAt?.toISOString() ?? null };
}

export async function assertMaintenanceReady(requiredBackupAt?: Date | null) {
  const readiness = await maintenanceReadiness(requiredBackupAt);
  if (readiness.migrationState === "migration-missing") throw new MaintenancePrerequisiteError("0015 Migration을 적용한 뒤 다시 시도해 주세요.", "MIGRATION_REQUIRED");
  if (readiness.migrationState !== "ready") throw new MaintenancePrerequisiteError("Migration Journal과 실제 DB schema가 일치하지 않습니다.", "MIGRATION_INCONSISTENT");
  if (!readiness.backupReady) throw new MaintenancePrerequisiteError("계획의 원본 시점 이후 현재 schema에서 검증된 최근 Backup을 먼저 생성해 주세요.", "BACKUP_REQUIRED");
  return readiness;
}
