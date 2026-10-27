import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { loadBackupPolicy } from "@/lib/backup/settings";
import { db, databaseClient } from "@/lib/db";
import { archiveEntries, categories, crudeDrugs, fieldDefinitions, userDrugMnemonics } from "@/lib/db/schema";
import { backupCoversCurrentSchema, COLLECTION_ARCHIVE_MIGRATION_AT, collectionMigrationState } from "@/lib/db/migration-health";
import { appendEmptyFieldSections, classifyEmptyDataCard, type InitializableDrug, type InitializableField } from "@/lib/empty-field-initialization";

export class InitializationPrerequisiteError extends Error {
  constructor(message: string, readonly code: "MIGRATION_REQUIRED" | "MIGRATION_INCONSISTENT" | "BACKUP_REQUIRED") { super(message); }
}

export async function fieldInitializationReadiness(now = new Date()) {
  const [column] = await databaseClient<{ exists: boolean }[]>`select exists(select 1 from information_schema.columns where table_schema=current_schema() and table_name='collections' and column_name='archived_at') as exists`;
  const [migration] = await databaseClient<{ recorded: boolean; latest: string | null }[]>`select exists(select 1 from drizzle.__drizzle_migrations where created_at=${String(COLLECTION_ARCHIVE_MIGRATION_AT)}) as recorded, max(created_at)::text as latest from drizzle.__drizzle_migrations`;
  const migrationState = collectionMigrationState(Boolean(column?.exists), Boolean(migration?.recorded));
  const policy = await loadBackupPolicy();
  const latestMigrationAt = Number(migration?.latest ?? 0);
  return { migrationState, backupReady: migrationState === "ready" && backupCoversCurrentSchema(policy.lastSuccessfulLocalBackupAt, latestMigrationAt, now), lastSuccessfulBackupAt: policy.lastSuccessfulLocalBackupAt };
}

async function assertReady() {
  const readiness = await fieldInitializationReadiness();
  if (readiness.migrationState === "migration-missing") throw new InitializationPrerequisiteError("0015 Migration을 적용한 뒤 다시 시도해 주세요.", "MIGRATION_REQUIRED");
  if (readiness.migrationState !== "ready") throw new InitializationPrerequisiteError("Migration Journal과 실제 collections schema가 일치하지 않습니다. 자동 실행하지 말고 수동 점검이 필요합니다.", "MIGRATION_INCONSISTENT");
  if (!readiness.backupReady) throw new InitializationPrerequisiteError("현재 schema 기준으로 검증된 최근 Backup을 먼저 생성해 주세요.", "BACKUP_REQUIRED");
  return readiness;
}

type Executor = Pick<typeof db, "select">;
async function loadContext(executor: Executor = db) {
  const [fields, drugs, mnemonics] = await Promise.all([
    executor.select({ id: fieldDefinitions.id, name: fieldDefinitions.name, inputMode: fieldDefinitions.inputMode, position: fieldDefinitions.position, active: fieldDefinitions.active }).from(fieldDefinitions).where(eq(fieldDefinitions.active, true)).orderBy(asc(fieldDefinitions.position), asc(fieldDefinitions.name)),
    executor.select({ id: crudeDrugs.id, koreanName: crudeDrugs.koreanName, categoryName: categories.name, catalogIndex: crudeDrugs.catalogIndex, referenceIndex: crudeDrugs.referenceIndex, sections: crudeDrugs.sections, updatedAt: crudeDrugs.updatedAt, archivedId: archiveEntries.id }).from(crudeDrugs).leftJoin(categories, eq(categories.id, crudeDrugs.categoryId)).leftJoin(archiveEntries, eq(archiveEntries.drugId, crudeDrugs.id)),
    executor.select({ drugId: userDrugMnemonics.drugId, items: userDrugMnemonics.items, blocks: userDrugMnemonics.blocks }).from(userDrugMnemonics),
  ]);
  const mnemonicByDrug = new Map<string, { items: unknown[]; blocks: unknown[] }>();
  for (const row of mnemonics) {
    const current = mnemonicByDrug.get(row.drugId) ?? { items: [], blocks: [] };
    if (Array.isArray(row.items)) current.items.push(...row.items); else current.items.push(row.items);
    if (Array.isArray(row.blocks)) current.blocks.push(...row.blocks); else current.blocks.push(row.blocks);
    mnemonicByDrug.set(row.drugId, current);
  }
  const values: (InitializableDrug & { updatedAt: Date })[] = drugs.map((row) => ({ id: row.id, koreanName: row.koreanName, categoryName: row.categoryName, catalogIndex: row.catalogIndex, referenceIndex: row.referenceIndex, archived: row.archivedId != null, sections: row.sections, updatedAt: row.updatedAt, mnemonicItems: mnemonicByDrug.get(row.id)?.items, mnemonicBlocks: mnemonicByDrug.get(row.id)?.blocks }));
  return { fields: fields as InitializableField[], drugs: values };
}

function buildPreview(context: Awaited<ReturnType<typeof loadContext>>) {
  const surveyed = context.drugs.filter((drug) => classifyEmptyDataCard(drug, context.fields).status !== "out-of-scope");
  const classified = surveyed.map((drug) => ({ drug, classification: classifyEmptyDataCard(drug, context.fields) }));
  return {
    summary: {
      surveyed: surveyed.length,
      initialize: classified.filter((item) => item.classification.status === "initialize").length,
      excludedForContent: classified.filter((item) => item.classification.status === "excluded-content").length,
      manualReview: classified.filter((item) => item.classification.status === "manual-review").length,
      alreadyInitialized: classified.filter((item) => item.classification.status === "already-initialized").length,
    },
    initialize: classified.filter((item) => item.classification.status === "initialize").map(({ drug, classification }) => ({ id: drug.id, koreanName: drug.koreanName, categoryName: drug.categoryName!, fields: classification.fieldsToAdd.map((field) => field.name) })),
    excluded: classified.filter((item) => item.classification.status === "excluded-content").map(({ drug, classification }) => ({ id: drug.id, koreanName: drug.koreanName, reason: classification.reason })),
    manualReview: classified.filter((item) => item.classification.status === "manual-review").map(({ drug, classification }) => ({ id: drug.id, koreanName: drug.koreanName, reason: classification.reason })),
  };
}

export async function previewEmptyFieldInitialization() {
  const readiness = await fieldInitializationReadiness();
  if (readiness.migrationState !== "ready") return { readiness, preview: null };
  return { readiness, preview: buildPreview(await loadContext()) };
}

export async function executeEmptyFieldInitialization(drugIds: string[]) {
  await assertReady();
  const requested = [...new Set(drugIds)];
  return db.transaction(async (tx) => {
    // Serialize against Import and Archive/Unarchive while the target scope is
    // re-evaluated. Serializable isolation also rejects a concurrent content
    // insert that would invalidate the empty-card decision.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('herboverflow-archive-catalog'))`);
    const context = await loadContext(tx);
    const byId = new Map(context.drugs.map((drug) => [drug.id, drug]));
    const initialized: { id: string; koreanName: string }[] = [];
    const conflicts: { id: string; koreanName: string; reason: string }[] = [];
    for (const id of requested) {
      const drug = byId.get(id);
      if (!drug) { conflicts.push({ id, koreanName: "알 수 없는 생약", reason: "Preview 이후 생약을 찾을 수 없습니다." }); continue; }
      const classification = classifyEmptyDataCard(drug, context.fields);
      if (classification.status !== "initialize" || !Array.isArray(drug.sections)) { conflicts.push({ id, koreanName: drug.koreanName, reason: `현재 상태가 변경되어 초기화하지 않았습니다: ${classification.reason}` }); continue; }
      const sections = appendEmptyFieldSections(drug.sections, classification.fieldsToAdd);
      const rows = await tx.update(crudeDrugs).set({ sections, updatedAt: new Date() }).where(and(eq(crudeDrugs.id, id), eq(crudeDrugs.updatedAt, drug.updatedAt), sql`${crudeDrugs.sections} = ${JSON.stringify(drug.sections)}::jsonb`)).returning({ id: crudeDrugs.id });
      if (!rows.length) conflicts.push({ id, koreanName: drug.koreanName, reason: "Preview 이후 Data Card가 변경되어 초기화하지 않았습니다." });
      else initialized.push({ id, koreanName: drug.koreanName });
    }
    return { initialized: initialized.length, conflicts, drugs: initialized };
  }, { isolationLevel: "serializable" });
}
