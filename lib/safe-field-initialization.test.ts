import assert from "node:assert/strict";
import test from "node:test";
import { buildPlanInitializationPreview, createEmptyFieldSections, type InitializableField, type PlanInitializationDrug } from "@/lib/empty-field-initialization";
import { safeMaintenancePlanSchema, type SafeMaintenancePlan } from "@/lib/safe-maintenance-plan";

const names = ["성분", "약리", "응용", "처방·생약유래 의약품", "주의·부작용·독성", "기타", "암기법"];
const positions = [10, 40, 50, 60, 70, 80, 90];
const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const fields: InitializableField[] = names.map((name, index) => ({ id: uuid(index + 1000), name, inputMode: "hierarchy4", position: positions[index], active: true }));

function plan(): SafeMaintenancePlan {
  return safeMaintenancePlanSchema.parse({
    format: "herboverflow.safe-maintenance-plan", version: 1, sourceBackup: "HerbOverflow-Backup-2026-10-27T06-04-47-823Z.zip", sourceWorkbook: "source.xlsx",
    notForNormalImport: true, databaseOperationsRequireLivePreviewAndBackup: true,
    excludeFields: ["확인시험", "규격시험·정량·기준", "교수니 밑줄"], defaultFields: fields.map(({ id, name, inputMode, position }) => ({ id, name, inputMode, position })),
    rules: { reindex: "safe", initialize: "empty", archive: "exclude", preview: "verify" },
    statsAtBackup: { targetCount: 153, indexChanges: 0, emptySections: 146, existingSections: 7 },
    drugs: Array.from({ length: 153 }, (_, index) => ({ drugId: uuid(index + 1), koreanName: `생약${index + 1}`, category: "피류", expectedCatalogIndex: index + 1, targetCatalogIndex: index + 1, sectionsAtBackup: index < 7 ? 1 : 0, initializeFieldsOnlyIfEmpty: index >= 7 })),
  });
}

function liveDrugs(): PlanInitializationDrug[] {
  return plan().drugs.map((drug, index) => ({ id: drug.drugId, koreanName: drug.koreanName, categoryName: drug.category, catalogIndex: drug.expectedCatalogIndex, referenceIndex: null, archived: false, sections: index < 7 ? [{ id: `existing-${index}`, title: "기존", items: [{ id: "note", text: "보존" }], blocks: [] }] : [] }));
}

test("only 146 completely empty cards receive the exact seven planned fields", () => {
  const preview = buildPlanInitializationPreview(plan(), liveDrugs(), fields);
  assert.equal(preview.canExecute, true);
  assert.deepEqual(preview.summary, { requested: 153, initialize: 146, excludedExisting: 7, changedSinceBackup: 0, conflicts: 0 });
  const sections = createEmptyFieldSections(fields, (() => { let value = 0; return () => `new-${++value}`; })());
  assert.deepEqual(sections.map((section) => section.title), names);
  assert.ok(sections.every((section) => section.items.length === 0 && section.blocks?.length === 0));
  assert.ok(!sections.some((section) => ["확인시험", "규격시험·정량·기준", "교수니 밑줄"].includes(section.title)));
});

test("any existing section after Preview is excluded without overwriting its content", () => {
  const current = liveDrugs();
  const original = [{ id: "new-note", title: "기타", items: [{ id: "i", text: "새 필기" }], blocks: [] }];
  current[7].sections = structuredClone(original);
  const preview = buildPlanInitializationPreview(plan(), current, fields);
  assert.equal(preview.summary.initialize, 145);
  assert.equal(preview.summary.changedSinceBackup, 1);
  assert.deepEqual(current[7].sections, original);
});

test("field-definition drift and inactive targets block execution", () => {
  const changedFields = fields.map((field, index) => index ? field : { ...field, active: false });
  const preview = buildPlanInitializationPreview(plan(), liveDrugs(), changedFields);
  assert.equal(preview.canExecute, false);
  assert.match(preview.errors.join(" "), /Field Definition '성분'/);
});
