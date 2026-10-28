import assert from "node:assert/strict";
import test from "node:test";
import { assignmentIdsInScope, categorySelectionState, exportScopeDrugIds, exportScopeOptions, isDrugVisibleInExportScope, scopeCategories, toggleCategorySelection, type ExportSelectionDrug } from "@/lib/export/selection";

const active = (id: string, categoryId: string): ExportSelectionDrug => ({ id, catalogIndex: Number(id.slice(1)), referenceIndex: null, archive: null, categoryId, categoryName: categoryId, categoryPosition: categoryId === "과실류" ? 1 : 2 });
const archived = (id: string, groupId: string, prefix: string, categoryId: string, originalIndexType: "catalog" | "reference" = "catalog"): ExportSelectionDrug => ({ id, catalogIndex: null, referenceIndex: null, archive: { groupId, prefix, name: groupId === "midterm" ? "중간범위" : "이전시험", originalIndexType, originalIndex: Number(id.slice(1)) }, categoryId, categoryName: categoryId, categoryPosition: 1 });
const reference = (id: string): ExportSelectionDrug => ({ id, catalogIndex: null, referenceIndex: 3, archive: null, categoryId: "참고", categoryName: "참고", categoryPosition: 9 });
const drugs = [active("a1", "과실류"), active("a2", "과실류"), active("a3", "엽류"), archived("m1", "midterm", "FM", "과실류"), archived("m2", "midterm", "FM", "참고", "reference"), archived("o1", "old", "OLD", "과실류"), reference("r1")];

test("active all-selection includes active R drugs and excludes every Archive drug", () => {
  assert.deepEqual(exportScopeDrugIds(drugs, "active"), ["a1", "a2", "a3", "r1"]);
  assert.equal(isDrugVisibleInExportScope(drugs.at(-1)!, "active"), true);
});

test("archive scope selects only its actual archive group without hardcoded prefixes", () => {
  assert.deepEqual(exportScopeDrugIds(drugs, "archive:midterm"), ["m1", "m2"]);
  assert.equal(isDrugVisibleInExportScope(drugs.at(-1)!, "archive:midterm"), false);
  assert.deepEqual(exportScopeDrugIds(drugs, "archive:old"), ["o1"]);
  assert.deepEqual(exportScopeOptions(drugs).map((scope) => scope.key), ["active", "archive:midterm", "archive:old"]);
});

test("category click toggles all, partial, and none while preserving other categories", () => {
  const categories = scopeCategories(drugs, "active");
  const fruit = categories.find((category) => category.id === "과실류")!.drugIds;
  const leaf = categories.find((category) => category.id === "엽류")!.drugIds;
  let selected = toggleCategorySelection(new Set<string>(), fruit);
  assert.equal(categorySelectionState(selected, fruit), "all");
  selected.delete(fruit[0]);
  assert.equal(categorySelectionState(selected, fruit), "partial");
  selected = toggleCategorySelection(selected, fruit);
  assert.equal(categorySelectionState(selected, fruit), "all");
  selected = toggleCategorySelection(selected, leaf);
  selected = toggleCategorySelection(selected, fruit);
  assert.deepEqual([...selected], leaf);
});

test("scope changes can replace selection consistently and assignments stay in scope", () => {
  const activeIds = new Set(exportScopeDrugIds(drugs, "active"));
  assert.deepEqual(assignmentIdsInScope(["a1", "m1", "r1"], activeIds), ["a1", "r1"]);
  const archivedIds = new Set(exportScopeDrugIds(drugs, "archive:midterm"));
  assert.deepEqual(assignmentIdsInScope(["a1", "m1", "o1"], archivedIds), ["m1"]);
});
