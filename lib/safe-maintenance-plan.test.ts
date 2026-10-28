import assert from "node:assert/strict";
import test from "node:test";
import { applyReindexPlanSnapshot, buildSafeReindexPlan, type ReindexDrug } from "@/lib/reindex";
import { safeMaintenancePlanSchema, type SafeMaintenancePlan } from "@/lib/safe-maintenance-plan";

const fieldNames = ["성분", "약리", "응용", "처방·생약유래 의약품", "주의·부작용·독성", "기타", "암기법"];
const fieldPositions = [10, 40, 50, 60, 70, 80, 90];
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

function maintenancePlan(reverse = false): SafeMaintenancePlan {
  return safeMaintenancePlanSchema.parse({
    format: "herboverflow.safe-maintenance-plan", version: 1, sourceBackup: "HerbOverflow-Backup-2026-10-27T06-04-47-823Z.zip", sourceWorkbook: "source.xlsx",
    notForNormalImport: true, databaseOperationsRequireLivePreviewAndBackup: true,
    excludeFields: ["확인시험", "규격시험·정량·기준", "교수니 밑줄"],
    defaultFields: fieldNames.map((name, index) => ({ id: uuid(index + 1000), name, inputMode: "hierarchy4", position: fieldPositions[index] })),
    rules: { reindex: "safe", initialize: "empty", archive: "exclude", preview: "verify" },
    statsAtBackup: { targetCount: 153, indexChanges: reverse ? 152 : 0, emptySections: 153, existingSections: 0 },
    drugs: Array.from({ length: 153 }, (_, index) => ({ drugId: uuid(index + 1), koreanName: `생약${index + 1}`, category: "피류", expectedCatalogIndex: index + 1, targetCatalogIndex: reverse ? 153 - index : index + 1, sectionsAtBackup: 0, initializeFieldsOnlyIfEmpty: true })),
  });
}

function rows(): ReindexDrug[] {
  return Array.from({ length: 153 }, (_, index) => ({ id: uuid(index + 1), koreanName: `생약${index + 1}`, catalogIndex: index + 1, referenceIndex: null, archived: false }));
}

test("safe maintenance schema requires 153 UUID targets covering indexes 1 through 153", () => {
  const plan = maintenancePlan();
  assert.equal(plan.drugs.length, 153);
  assert.deepEqual(plan.drugs.map((drug) => drug.targetCatalogIndex), Array.from({ length: 153 }, (_, index) => index + 1));
  assert.throws(() => safeMaintenancePlanSchema.parse({ ...plan, drugs: plan.drugs.slice(0, 152) }));
});

test("UUID reindex supports a full collision-safe reassignment plan", () => {
  const plan = buildSafeReindexPlan(maintenancePlan(true).drugs, rows());
  assert.equal(plan.canExecute, true);
  assert.equal(plan.summary.changed, 152);
  assert.deepEqual(applyReindexPlanSnapshot(rows(), plan).map((drug) => drug.catalogIndex), Array.from({ length: 153 }, (_, index) => 153 - index));
});

test("UUID reindex blocks current-index drift and preserves every non-index value", () => {
  const current = rows().map((row, index) => ({ ...row, sections: index ? [] : [{ id: "note" }], mnemonics: index ? [] : ["암기"], relationships: ["r"], collections: ["c"] }));
  current[0].catalogIndex = 999;
  const blocked = buildSafeReindexPlan(maintenancePlan(true).drugs, current);
  assert.equal(blocked.canExecute, false);
  assert.match(blocked.errors.join(" "), /예상 인덱스 1/);
  current[0].catalogIndex = 1;
  const after = applyReindexPlanSnapshot(current, buildSafeReindexPlan(maintenancePlan(true).drugs, current));
  assert.deepEqual({ ...after[0], catalogIndex: current[0].catalogIndex }, current[0]);
});
