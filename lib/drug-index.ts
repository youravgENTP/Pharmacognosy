export type ArchiveIndex = { prefix: string; originalIndex: number } | null | undefined;

export function formatDrugIndex(catalogIndex: number | null, referenceIndex: number | null = null, archive?: ArchiveIndex) {
  if (catalogIndex != null) return String(catalogIndex);
  if (referenceIndex != null) return `R${String(referenceIndex).padStart(2, "0")}`;
  if (archive) return `${archive.prefix}${String(archive.originalIndex).padStart(2, "0")}`;
  return "—";
}

export function compareDrugIndexes(
  a: { catalogIndex: number | null; referenceIndex?: number | null; archive?: ArchiveIndex; koreanName?: string; name?: string },
  b: { catalogIndex: number | null; referenceIndex?: number | null; archive?: ArchiveIndex; koreanName?: string; name?: string },
) {
  const aReference = a.referenceIndex != null;
  const bReference = b.referenceIndex != null;
  if (aReference !== bReference) return aReference ? 1 : -1;
  const aArchived = Boolean(a.archive);
  const bArchived = Boolean(b.archive);
  if (aArchived !== bArchived) return aArchived ? 1 : -1;
  const numeric = aReference
    ? (a.referenceIndex ?? Number.MAX_SAFE_INTEGER) - (b.referenceIndex ?? Number.MAX_SAFE_INTEGER)
    : aArchived
      ? (a.archive?.prefix ?? "").localeCompare(b.archive?.prefix ?? "") || (a.archive?.originalIndex ?? Number.MAX_SAFE_INTEGER) - (b.archive?.originalIndex ?? Number.MAX_SAFE_INTEGER)
      : (a.catalogIndex ?? Number.MAX_SAFE_INTEGER) - (b.catalogIndex ?? Number.MAX_SAFE_INTEGER);
  return numeric || (a.koreanName ?? a.name ?? "").localeCompare(b.koreanName ?? b.name ?? "", "ko");
}
