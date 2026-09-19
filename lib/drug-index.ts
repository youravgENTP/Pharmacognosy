export function formatDrugIndex(catalogIndex: number | null, referenceIndex: number | null = null) {
  if (catalogIndex != null) return String(catalogIndex);
  if (referenceIndex != null) return `R${String(referenceIndex).padStart(2, "0")}`;
  return "—";
}

export function compareDrugIndexes(
  a: { catalogIndex: number | null; referenceIndex?: number | null; koreanName?: string; name?: string },
  b: { catalogIndex: number | null; referenceIndex?: number | null; koreanName?: string; name?: string },
) {
  const aReference = a.referenceIndex != null;
  const bReference = b.referenceIndex != null;
  if (aReference !== bReference) return aReference ? 1 : -1;
  const numeric = aReference ? (a.referenceIndex ?? Number.MAX_SAFE_INTEGER) - (b.referenceIndex ?? Number.MAX_SAFE_INTEGER) : (a.catalogIndex ?? Number.MAX_SAFE_INTEGER) - (b.catalogIndex ?? Number.MAX_SAFE_INTEGER);
  return numeric || (a.koreanName ?? a.name ?? "").localeCompare(b.koreanName ?? b.name ?? "", "ko");
}
