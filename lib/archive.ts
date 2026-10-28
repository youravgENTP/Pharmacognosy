import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { archiveEntries, archiveGroups, categories, crudeDrugs } from "@/lib/db/schema";
import { archiveIndexKey, archivedDisplayIndex, chooseUnarchiveIndex, originalDrugIndex, type ArchiveIndexType } from "@/lib/archive-policy";

export type ArchivePreview = {
  group: { id: string; name: string; prefix: string };
  drugs: { id: string; koreanName: string; categoryName: string | null; importance: string; originalIndexType: ArchiveIndexType; originalIndex: number; sourceIndex: string; displayIndex: string }[];
  conflicts: string[];
};

export async function previewArchive(groupId: string, drugIds: string[]): Promise<ArchivePreview> {
  const ids = [...new Set(drugIds)];
  const [group] = await db.select({ id: archiveGroups.id, name: archiveGroups.name, prefix: archiveGroups.prefix }).from(archiveGroups).where(eq(archiveGroups.id, groupId)).limit(1);
  if (!group) throw new Error("Archive 그룹을 찾을 수 없습니다.");
  const rows = ids.length ? await db.select({ id: crudeDrugs.id, koreanName: crudeDrugs.koreanName, catalogIndex: crudeDrugs.catalogIndex, referenceIndex: crudeDrugs.referenceIndex, categoryName: categories.name, importance: crudeDrugs.importance, archivedId: archiveEntries.id }).from(crudeDrugs).leftJoin(categories, eq(categories.id, crudeDrugs.categoryId)).leftJoin(archiveEntries, eq(archiveEntries.drugId, crudeDrugs.id)).where(inArray(crudeDrugs.id, ids)).orderBy(asc(crudeDrugs.catalogIndex)) : [];
  const occupiedIndexes = new Set((await db.select({ type: archiveEntries.originalIndexType, value: archiveEntries.originalIndex }).from(archiveEntries).where(eq(archiveEntries.archiveGroupId, groupId))).map((row) => archiveIndexKey(row.type, row.value)));
  const conflicts: string[] = [];
  if (rows.length !== ids.length) conflicts.push("존재하지 않는 생약이 선택에 포함되어 있습니다.");
  for (const row of rows) {
    if (row.archivedId) conflicts.push(`${row.koreanName}: 이미 Archive되어 있습니다.`);
    const original = originalDrugIndex(row);
    if (!original) conflicts.push(`${row.koreanName}: 활성 인덱스가 없거나 인덱스 상태가 올바르지 않습니다.`);
    if (original && occupiedIndexes.has(archiveIndexKey(original.type, original.value))) conflicts.push(`${row.koreanName}: ${archivedDisplayIndex(group.prefix, original.value, original.type)} 인덱스가 이미 사용 중입니다.`);
  }
  return { group, conflicts, drugs: rows.flatMap((row) => { const original = originalDrugIndex(row); return original ? [{ id: row.id, koreanName: row.koreanName, categoryName: row.categoryName, importance: row.importance, originalIndexType: original.type, originalIndex: original.value, sourceIndex: original.type === "reference" ? `R${String(original.value).padStart(2, "0")}` : String(original.value), displayIndex: archivedDisplayIndex(group.prefix, original.value, original.type) }] : []; }) };
}

export async function archiveDrugs(groupId: string, drugIds: string[], userId: string) {
  const ids = [...new Set(drugIds)];
  if (!ids.length) throw new Error("Archive할 생약을 선택해 주세요.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('herboverflow-archive-catalog'))`);
    const [group] = await tx.select().from(archiveGroups).where(eq(archiveGroups.id, groupId)).limit(1);
    if (!group) throw new Error("Archive 그룹을 찾을 수 없습니다.");
    const rows = await tx.select({ id: crudeDrugs.id, koreanName: crudeDrugs.koreanName, catalogIndex: crudeDrugs.catalogIndex, referenceIndex: crudeDrugs.referenceIndex, archivedId: archiveEntries.id }).from(crudeDrugs).leftJoin(archiveEntries, eq(archiveEntries.drugId, crudeDrugs.id)).where(inArray(crudeDrugs.id, ids));
    if (rows.length !== ids.length) throw new Error("존재하지 않는 생약이 선택에 포함되어 있습니다.");
    const plans = rows.map((row) => ({ row, original: originalDrugIndex(row) }));
    const invalid = plans.find(({ row, original }) => row.archivedId || !original);
    if (invalid) throw new Error(`${invalid.row.koreanName}은(는) 현재 Archive할 수 없습니다.`);
    const occupied = new Set((await tx.select({ type: archiveEntries.originalIndexType, value: archiveEntries.originalIndex }).from(archiveEntries).where(eq(archiveEntries.archiveGroupId, groupId))).map((item) => archiveIndexKey(item.type, item.value)));
    for (const plan of plans) {
      const original = plan.original!;
      const key = archiveIndexKey(original.type, original.value);
      if (occupied.has(key)) throw new Error(`${plan.row.koreanName}: ${archivedDisplayIndex(group.prefix, original.value, original.type)} 인덱스가 이미 사용 중입니다.`);
      occupied.add(key);
    }
    await tx.insert(archiveEntries).values(plans.map(({ row, original }) => ({ archiveGroupId: groupId, drugId: row.id, originalIndexType: original!.type, originalIndex: original!.value, archivedBy: userId })));
    for (const { row, original } of plans) await tx.update(crudeDrugs).set(original!.type === "reference" ? { referenceIndex: null, updatedAt: new Date() } : { catalogIndex: null, updatedAt: new Date() }).where(eq(crudeDrugs.id, row.id));
    return { archived: rows.length, group: { id: group.id, name: group.name, prefix: group.prefix } };
  });
}

export async function unarchiveDrug(entryId: string, requestedIndex: number | undefined, userId: string) {
  void userId;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('herboverflow-archive-catalog'))`);
    const [entry] = await tx.select({ id: archiveEntries.id, drugId: archiveEntries.drugId, originalIndexType: archiveEntries.originalIndexType, originalIndex: archiveEntries.originalIndex, koreanName: crudeDrugs.koreanName, catalogIndex: crudeDrugs.catalogIndex, referenceIndex: crudeDrugs.referenceIndex }).from(archiveEntries).innerJoin(crudeDrugs, eq(crudeDrugs.id, archiveEntries.drugId)).where(eq(archiveEntries.id, entryId)).limit(1);
    if (!entry) throw new Error("Archive 항목을 찾을 수 없습니다.");
    if (entry.catalogIndex != null || entry.referenceIndex != null) throw new Error("이미 활성 인덱스가 있는 Archive 항목입니다.");
    const indexColumn = entry.originalIndexType === "reference" ? crudeDrugs.referenceIndex : crudeDrugs.catalogIndex;
    const used = new Set((await tx.select({ value: indexColumn }).from(crudeDrugs).where(isNotNull(indexColumn))).flatMap((row) => row.value == null ? [] : [row.value]));
    const restoredIndex = chooseUnarchiveIndex(entry.originalIndexType, entry.originalIndex, requestedIndex, used);
    const [updated] = await tx.update(crudeDrugs).set(entry.originalIndexType === "reference" ? { referenceIndex: restoredIndex, updatedAt: new Date() } : { catalogIndex: restoredIndex, updatedAt: new Date() }).where(and(eq(crudeDrugs.id, entry.drugId), isNull(crudeDrugs.catalogIndex), isNull(crudeDrugs.referenceIndex))).returning({ id: crudeDrugs.id });
    if (!updated) throw new Error("Archive 해제 직전에 인덱스 상태가 변경되었습니다. 다시 시도해 주세요.");
    await tx.delete(archiveEntries).where(eq(archiveEntries.id, entry.id));
    return { drugId: entry.drugId, koreanName: entry.koreanName, indexType: entry.originalIndexType, index: restoredIndex, displayIndex: entry.originalIndexType === "reference" ? `R${String(restoredIndex).padStart(2, "0")}` : String(restoredIndex) };
  });
}
