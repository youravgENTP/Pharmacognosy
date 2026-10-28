export type ExportScopeKey = "active" | `archive:${string}`;
export type ExportSelectionDrug = {
  id: string;
  catalogIndex: number | null;
  referenceIndex: number | null;
  archive?: { groupId: string; prefix: string; name: string; originalIndex: number } | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryPosition: number | null;
};

export type ExportScopeOption = { key: ExportScopeKey; label: string; count: number };
export type CategorySelectionState = "none" | "partial" | "all";

export function exportScopeOptions(drugs: ExportSelectionDrug[]): ExportScopeOption[] {
  const groups = new Map<string, { prefix: string; name: string; count: number }>();
  for (const drug of drugs) if (drug.archive) {
    const current = groups.get(drug.archive.groupId) ?? { prefix: drug.archive.prefix, name: drug.archive.name, count: 0 };
    current.count++; groups.set(drug.archive.groupId, current);
  }
  return [
    { key: "active", label: "Active / 기말범위", count: drugs.filter((drug) => isDrugInExportScope(drug, "active")).length },
    ...[...groups].sort(([, left], [, right]) => left.prefix.localeCompare(right.prefix) || left.name.localeCompare(right.name, "ko")).map(([groupId, group]) => ({ key: `archive:${groupId}` as const, label: `Archived / ${group.name} (${group.prefix})`, count: group.count })),
  ];
}

export function scopeForInitialDrug(drug?: ExportSelectionDrug): ExportScopeKey {
  return drug?.archive ? `archive:${drug.archive.groupId}` : "active";
}

export function isDrugInExportScope(drug: ExportSelectionDrug, scope: ExportScopeKey) {
  if (scope === "active") return drug.catalogIndex != null && !drug.archive;
  return drug.archive?.groupId === scope.slice("archive:".length);
}

export function isDrugVisibleInExportScope(drug: ExportSelectionDrug, scope: ExportScopeKey) {
  return isDrugInExportScope(drug, scope) || drug.referenceIndex != null;
}

export function exportScopeDrugIds(drugs: ExportSelectionDrug[], scope: ExportScopeKey) {
  return drugs.filter((drug) => isDrugInExportScope(drug, scope)).map((drug) => drug.id);
}

export function scopeCategories(drugs: ExportSelectionDrug[], scope: ExportScopeKey) {
  const map = new Map<string, { id: string; name: string; position: number; drugIds: string[] }>();
  for (const drug of drugs) if (isDrugInExportScope(drug, scope) && drug.categoryId && drug.categoryName) {
    const current = map.get(drug.categoryId) ?? { id: drug.categoryId, name: drug.categoryName, position: drug.categoryPosition ?? Number.MAX_SAFE_INTEGER, drugIds: [] };
    current.drugIds.push(drug.id); map.set(drug.categoryId, current);
  }
  return [...map.values()].sort((left, right) => left.position - right.position || left.name.localeCompare(right.name, "ko"));
}

export function categorySelectionState(selected: ReadonlySet<string>, ids: readonly string[]): CategorySelectionState {
  if (!ids.length || ids.every((id) => !selected.has(id))) return "none";
  return ids.every((id) => selected.has(id)) ? "all" : "partial";
}

export function toggleCategorySelection(selected: ReadonlySet<string>, ids: readonly string[]) {
  const next = new Set(selected);
  if (categorySelectionState(selected, ids) === "all") for (const id of ids) next.delete(id);
  else for (const id of ids) next.add(id);
  return next;
}

export function assignmentIdsInScope(drugIds: readonly string[], scopedIds: ReadonlySet<string>) {
  return drugIds.filter((id) => scopedIds.has(id));
}
