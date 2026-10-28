import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { archiveEntries, categories, crudeDrugs, fieldDefinitions } from "@/lib/db/schema";
import { buildPlanInitializationPreview, createEmptyFieldSections, type InitializableField, type PlanInitializationDrug } from "@/lib/empty-field-initialization";
import { assertMaintenanceReady, maintenanceReadiness } from "@/lib/maintenance-readiness";
import { sourceBackupTimestamp, type SafeMaintenancePlan } from "@/lib/safe-maintenance-plan";

type Executor = Pick<typeof db, "select">;

async function loadContext(plan: SafeMaintenancePlan, executor: Executor = db) {
  const ids = plan.drugs.map((drug) => drug.drugId);
  const fieldIds = plan.defaultFields.map((field) => field.id);
  const [fields, drugs] = await Promise.all([
    executor.select({ id: fieldDefinitions.id, name: fieldDefinitions.name, inputMode: fieldDefinitions.inputMode, position: fieldDefinitions.position, active: fieldDefinitions.active }).from(fieldDefinitions).where(inArray(fieldDefinitions.id, fieldIds)).orderBy(asc(fieldDefinitions.position), asc(fieldDefinitions.name)),
    executor.select({ id: crudeDrugs.id, koreanName: crudeDrugs.koreanName, categoryName: categories.name, catalogIndex: crudeDrugs.catalogIndex, referenceIndex: crudeDrugs.referenceIndex, sections: crudeDrugs.sections, updatedAt: crudeDrugs.updatedAt, archivedId: archiveEntries.id }).from(crudeDrugs).leftJoin(categories, eq(categories.id, crudeDrugs.categoryId)).leftJoin(archiveEntries, eq(archiveEntries.drugId, crudeDrugs.id)).where(inArray(crudeDrugs.id, ids)),
  ]);
  return {
    fields: fields as InitializableField[],
    drugs: drugs.map((row): PlanInitializationDrug & { updatedAt: Date } => ({ id: row.id, koreanName: row.koreanName, categoryName: row.categoryName, catalogIndex: row.catalogIndex, referenceIndex: row.referenceIndex, archived: row.archivedId != null, sections: row.sections, updatedAt: row.updatedAt })),
  };
}

export async function previewEmptyFieldInitialization(plan: SafeMaintenancePlan) {
  const requiredBackupAt = sourceBackupTimestamp(plan.sourceBackup);
  const [readiness, context] = await Promise.all([maintenanceReadiness(requiredBackupAt), loadContext(plan)]);
  return { readiness, preview: buildPlanInitializationPreview(plan, context.drugs, context.fields) };
}

export async function executeEmptyFieldInitialization(plan: SafeMaintenancePlan) {
  const requiredBackupAt = sourceBackupTimestamp(plan.sourceBackup);
  await assertMaintenanceReady(requiredBackupAt);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('herboverflow-archive-catalog'))`);
    const context = await loadContext(plan, tx);
    const preview = buildPlanInitializationPreview(plan, context.drugs, context.fields);
    if (!preview.canExecute) throw new Error(preview.errors.join("\n"));
    const byId = new Map(context.drugs.map((drug) => [drug.id, drug]));
    const initialized: { id: string; koreanName: string }[] = [];
    const conflicts: { id: string; koreanName: string; reason: string }[] = [];
    for (const candidate of preview.initialize) {
      const drug = byId.get(candidate.id)!;
      const sections = createEmptyFieldSections(context.fields);
      const rows = await tx.update(crudeDrugs).set({ sections, updatedAt: new Date() }).where(and(eq(crudeDrugs.id, candidate.id), eq(crudeDrugs.updatedAt, drug.updatedAt!), sql`${crudeDrugs.sections} = '[]'::jsonb`)).returning({ id: crudeDrugs.id, sections: crudeDrugs.sections });
      if (!rows.length) conflicts.push({ id: candidate.id, koreanName: candidate.koreanName, reason: "Preview 이후 Data Card가 변경되어 초기화하지 않았습니다." });
      else if (rows[0].sections.length !== 7) throw new Error(`${candidate.koreanName}: 생성된 기본 필드 수 검증에 실패했습니다.`);
      else initialized.push({ id: candidate.id, koreanName: candidate.koreanName });
    }
    return { initialized: initialized.length, excluded: preview.excluded.length, conflicts, drugs: initialized };
  }, { isolationLevel: "serializable" });
}
