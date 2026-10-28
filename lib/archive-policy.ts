export type ArchiveIndexType = "catalog" | "reference";

export type OriginalDrugIndex = { type: ArchiveIndexType; value: number };

export function originalDrugIndex(drug: { catalogIndex: number | null; referenceIndex: number | null }): OriginalDrugIndex | null {
  if (drug.catalogIndex != null && drug.referenceIndex == null) return { type: "catalog", value: drug.catalogIndex };
  if (drug.referenceIndex != null && drug.catalogIndex == null) return { type: "reference", value: drug.referenceIndex };
  return null;
}

export function archiveIndexKey(type: ArchiveIndexType, value: number) {
  return `${type}:${value}`;
}

export function archivedDisplayIndex(prefix: string, originalIndex: number, type: ArchiveIndexType = "catalog") {
  return `${prefix}${type === "reference" ? "R" : ""}${String(originalIndex).padStart(2, "0")}`;
}

export function chooseUnarchiveIndex(type: ArchiveIndexType, originalIndex: number, requestedIndex: number | undefined, usedIndexes: ReadonlySet<number>) {
  let index = requestedIndex ?? originalIndex;
  if (!usedIndexes.has(index)) return index;
  const label = type === "reference" ? `R${String(index).padStart(2, "0")}` : String(index);
  if (type === "reference" || requestedIndex !== undefined) throw new Error(`${label} 인덱스가 이미 사용 중입니다. 사용 가능한 다른 ${type === "reference" ? "R " : ""}번호를 선택해 주세요.`);
  index = 1;
  while (usedIndexes.has(index)) index++;
  return index;
}
