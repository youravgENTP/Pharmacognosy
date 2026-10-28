import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { archiveEntries, crudeDrugs } from "@/lib/db/schema";
import { assertMaintenanceReady, maintenanceReadiness } from "@/lib/maintenance-readiness";
import { buildReindexPlan, buildSafeReindexPlan, type ReindexInput } from "@/lib/reindex";
import { sourceBackupTimestamp, type SafeMaintenancePlan } from "@/lib/safe-maintenance-plan";

async function loadReindexDrugs(executor: Pick<typeof db, "select"> = db) {
  return executor.select({ id: crudeDrugs.id, koreanName: crudeDrugs.koreanName, catalogIndex: crudeDrugs.catalogIndex, referenceIndex: crudeDrugs.referenceIndex, archivedId: archiveEntries.id })
    .from(crudeDrugs).leftJoin(archiveEntries, eq(archiveEntries.drugId, crudeDrugs.id)).orderBy(asc(crudeDrugs.catalogIndex))
    .then((rows) => rows.map((row) => ({ ...row, archived: row.archivedId != null })));
}

export async function previewReindex(input: ReindexInput[]) {
  return buildReindexPlan(input, await loadReindexDrugs());
}

export async function previewSafeReindex(plan: SafeMaintenancePlan) {
  const requiredBackupAt = sourceBackupTimestamp(plan.sourceBackup);
  const [reindex, readiness] = await Promise.all([buildSafeReindexPlan(plan.drugs, await loadReindexDrugs()), maintenanceReadiness(requiredBackupAt)]);
  return { ...reindex, mode: "safe-maintenance" as const, readiness };
}

export async function executeReindex(input: ReindexInput[]) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('herboverflow-archive-catalog'))`);
    const plan = buildReindexPlan(input, await loadReindexDrugs(tx));
    if (!plan.canExecute) throw new Error(plan.errors.join("\n"));
    const changes = plan.items.filter((item): item is typeof item & { id: string } => item.changed && item.id !== null);
    if (!changes.length) return { changed: 0, items: [] };

    const allIndexes = (await tx.select({ value: crudeDrugs.catalogIndex }).from(crudeDrugs)).flatMap((row) => row.value == null ? [] : [row.value]);
    let temporary = Math.min(0, ...allIndexes) - 1;
    for (const item of changes) {
      await tx.update(crudeDrugs).set({ catalogIndex: temporary-- }).where(eq(crudeDrugs.id, item.id));
    }
    for (const item of changes) {
      await tx.update(crudeDrugs).set({ catalogIndex: item.targetIndex }).where(eq(crudeDrugs.id, item.id));
    }
    return { changed: changes.length, items: changes.map(({ id, koreanName, currentIndex, targetIndex }) => ({ id, koreanName, currentIndex, targetIndex })) };
  });
}

export async function executeSafeReindex(planInput: SafeMaintenancePlan) {
  const requiredBackupAt = sourceBackupTimestamp(planInput.sourceBackup);
  await assertMaintenanceReady(requiredBackupAt);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('herboverflow-archive-catalog'))`);
    const plan = buildSafeReindexPlan(planInput.drugs, await loadReindexDrugs(tx));
    if (!plan.canExecute) throw new Error(plan.errors.join("\n"));
    const changes = plan.items.filter((item): item is typeof item & { id: string; expectedIndex: number } => item.changed && item.id !== null && item.expectedIndex !== undefined);
    if (!changes.length) return { changed: 0, items: [], verifiedRange: true };

    const allIndexes = (await tx.select({ value: crudeDrugs.catalogIndex }).from(crudeDrugs)).flatMap((row) => row.value == null ? [] : [row.value]);
    let temporary = Math.min(0, ...allIndexes) - 1;
    for (const item of changes) {
      const rows = await tx.update(crudeDrugs).set({ catalogIndex: temporary }).where(and(eq(crudeDrugs.id, item.id), eq(crudeDrugs.catalogIndex, item.expectedIndex))).returning({ id: crudeDrugs.id });
      if (!rows.length) throw new Error(`${item.koreanName}: Preview 이후 현재 번호가 변경되어 전체 Reindex를 취소했습니다.`);
      temporary--;
    }
    for (const item of changes) {
      const rows = await tx.update(crudeDrugs).set({ catalogIndex: item.targetIndex }).where(eq(crudeDrugs.id, item.id)).returning({ id: crudeDrugs.id });
      if (!rows.length) throw new Error(`${item.koreanName}: 목표 번호 적용에 실패해 전체 Reindex를 취소했습니다.`);
    }
    const final = await loadReindexDrugs(tx);
    const finalPlan = buildSafeReindexPlan(planInput.drugs.map((drug) => ({ ...drug, expectedCatalogIndex: drug.targetCatalogIndex })), final);
    const verifiedRange = finalPlan.canExecute && finalPlan.items.every((item) => item.currentIndex === item.targetIndex);
    if (!verifiedRange) throw new Error("Reindex 후 1~153 검증에 실패해 전체 작업을 취소했습니다.");
    return { changed: changes.length, verifiedRange, items: changes.map(({ id, koreanName, currentIndex, targetIndex }) => ({ id, koreanName, currentIndex, targetIndex })) };
  }, { isolationLevel: "serializable" });
}
