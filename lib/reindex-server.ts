import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { archiveEntries, crudeDrugs } from "@/lib/db/schema";
import { buildReindexPlan, type ReindexInput } from "@/lib/reindex";

async function loadReindexDrugs(executor: Pick<typeof db, "select"> = db) {
  return executor.select({ id: crudeDrugs.id, koreanName: crudeDrugs.koreanName, catalogIndex: crudeDrugs.catalogIndex, referenceIndex: crudeDrugs.referenceIndex, archivedId: archiveEntries.id })
    .from(crudeDrugs).leftJoin(archiveEntries, eq(archiveEntries.drugId, crudeDrugs.id)).orderBy(asc(crudeDrugs.catalogIndex))
    .then((rows) => rows.map((row) => ({ ...row, archived: row.archivedId != null })));
}

export async function previewReindex(input: ReindexInput[]) {
  return buildReindexPlan(input, await loadReindexDrugs());
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
