import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { archiveEntries, archiveGroups, categories, crudeDrugs } from "@/lib/db/schema";

export type ArchivePreview = {
  group: { id: string; name: string; prefix: string };
  drugs: { id: string; koreanName: string; categoryName: string | null; importance: string; originalIndex: number; displayIndex: string }[];
  conflicts: string[];
};

export function archivedDisplayIndex(prefix: string, originalIndex: number) {
  return `${prefix}${String(originalIndex).padStart(2, "0")}`;
}

export async function previewArchive(groupId: string, drugIds: string[]): Promise<ArchivePreview> {
  const ids = [...new Set(drugIds)];
  const [group] = await db.select({ id: archiveGroups.id, name: archiveGroups.name, prefix: archiveGroups.prefix }).from(archiveGroups).where(eq(archiveGroups.id, groupId)).limit(1);
  if (!group) throw new Error("Archive 그룹을 찾을 수 없습니다.");
  const rows = ids.length ? await db.select({ id: crudeDrugs.id, koreanName: crudeDrugs.koreanName, catalogIndex: crudeDrugs.catalogIndex, referenceIndex: crudeDrugs.referenceIndex, categoryName: categories.name, importance: crudeDrugs.importance, archivedId: archiveEntries.id }).from(crudeDrugs).leftJoin(categories, eq(categories.id, crudeDrugs.categoryId)).leftJoin(archiveEntries, eq(archiveEntries.drugId, crudeDrugs.id)).where(inArray(crudeDrugs.id, ids)).orderBy(asc(crudeDrugs.catalogIndex)) : [];
  const occupiedIndexes = new Set((await db.select({ value: archiveEntries.originalIndex }).from(archiveEntries).where(eq(archiveEntries.archiveGroupId, groupId))).map((row) => row.value));
  const conflicts: string[] = [];
  if (rows.length !== ids.length) conflicts.push("존재하지 않는 생약이 선택에 포함되어 있습니다.");
  for (const row of rows) {
    if (row.archivedId) conflicts.push(`${row.koreanName}: 이미 Archive되어 있습니다.`);
    if (row.catalogIndex == null) conflicts.push(`${row.koreanName}: 활성 인덱스가 없습니다.`);
    if (row.referenceIndex != null) conflicts.push(`${row.koreanName}: 참고 생약은 Archive할 수 없습니다.`);
    if (row.catalogIndex != null && occupiedIndexes.has(row.catalogIndex)) conflicts.push(`${row.koreanName}: ${group.prefix}${String(row.catalogIndex).padStart(2, "0")} 인덱스가 이미 사용 중입니다.`);
  }
  return { group, conflicts, drugs: rows.filter((row): row is typeof row & { catalogIndex: number } => row.catalogIndex != null).map((row) => ({ id: row.id, koreanName: row.koreanName, categoryName: row.categoryName, importance: row.importance, originalIndex: row.catalogIndex, displayIndex: archivedDisplayIndex(group.prefix, row.catalogIndex) })) };
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
    const invalid = rows.find((row) => row.archivedId || row.catalogIndex == null || row.referenceIndex != null);
    if (invalid) throw new Error(`${invalid.koreanName}은(는) 현재 Archive할 수 없습니다.`);
    await tx.insert(archiveEntries).values(rows.map((row) => ({ archiveGroupId: groupId, drugId: row.id, originalIndex: row.catalogIndex!, archivedBy: userId })));
    await tx.update(crudeDrugs).set({ catalogIndex: null, updatedAt: new Date() }).where(inArray(crudeDrugs.id, ids));
    return { archived: rows.length, group: { id: group.id, name: group.name, prefix: group.prefix } };
  });
}

export async function unarchiveDrug(entryId: string, requestedIndex: number | undefined, userId: string) {
  void userId;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('herboverflow-archive-catalog'))`);
    const [entry] = await tx.select({ id: archiveEntries.id, drugId: archiveEntries.drugId, originalIndex: archiveEntries.originalIndex, koreanName: crudeDrugs.koreanName, catalogIndex: crudeDrugs.catalogIndex }).from(archiveEntries).innerJoin(crudeDrugs, eq(crudeDrugs.id, archiveEntries.drugId)).where(eq(archiveEntries.id, entryId)).limit(1);
    if (!entry) throw new Error("Archive 항목을 찾을 수 없습니다.");
    if (entry.catalogIndex != null) throw new Error("이미 활성 인덱스가 있는 Archive 항목입니다.");
    let catalogIndex = requestedIndex ?? entry.originalIndex;
    const [collision] = await tx.select({ id: crudeDrugs.id }).from(crudeDrugs).where(eq(crudeDrugs.catalogIndex, catalogIndex)).limit(1);
    if (collision) {
      if (requestedIndex !== undefined) throw new Error(`활성 인덱스 ${requestedIndex}은(는) 이미 사용 중입니다.`);
      const used = new Set((await tx.select({ value: crudeDrugs.catalogIndex }).from(crudeDrugs).where(isNotNull(crudeDrugs.catalogIndex))).map((row) => row.value));
      catalogIndex = 1;
      while (used.has(catalogIndex)) catalogIndex++;
    }
    await tx.update(crudeDrugs).set({ catalogIndex, updatedAt: new Date() }).where(and(eq(crudeDrugs.id, entry.drugId), isNull(crudeDrugs.catalogIndex)));
    await tx.delete(archiveEntries).where(eq(archiveEntries.id, entry.id));
    return { drugId: entry.drugId, koreanName: entry.koreanName, catalogIndex };
  });
}
