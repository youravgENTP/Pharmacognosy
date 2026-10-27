import assert from "node:assert/strict";
import test from "node:test";
import { mergeImportedSections, prepareImport, type ImportExistingDrug, type ImportFieldDefinition } from "@/lib/import-pipeline";
import { pharmacognosyImportV1Schema } from "@/lib/import-schema";

const fields: ImportFieldDefinition[] = [
  { id: "field-a", name: "성분", inputMode: "hierarchy4", position: 10, active: true },
  { id: "field-b", name: "약리", inputMode: "hierarchy4", position: 40, active: true },
];
const existing: ImportExistingDrug = { id: "drug", koreanName: "기존", catalogIndex: 1, referenceIndex: null, latinName: null, origin: null, origins: [], scientificName: null, medicinalPart: null, categoryId: "category", familyId: null, importance: "중간", sections: [] };

test("new Import with omitted sections previews and creates default active fields", () => {
  const payload = pharmacognosyImportV1Schema.parse({ schema: "pharmacognosy.import", version: 1, drugs: [{ koreanName: "신규", category: "피류" }] });
  const prepared = prepareImport(payload, { fields, existingDrugs: [], categories: [{ id: "category", name: "피류" }] });
  assert.equal(prepared.drugs[0].preview.defaultFieldsInitialized, true);
  assert.deepEqual(prepared.drugs[0].sections.map((section) => section.fieldDefinitionId), ["field-a", "field-b"]);
  assert.deepEqual(prepared.drugs[0].preview.fieldsAdded, ["성분", "약리"]);
});

test("new Import with sections: [] also creates defaults", () => {
  const payload = pharmacognosyImportV1Schema.parse({ schema: "pharmacognosy.import", version: 1, drugs: [{ koreanName: "신규", category: "피류", sections: [] }] });
  assert.equal(prepareImport(payload, { fields, existingDrugs: [] }).drugs[0].sections.length, 2);
});

test("existing Import Merge never force-adds defaults or changes existing sections", () => {
  const withNotes = { ...existing, sections: [{ id: "existing-section", fieldDefinitionId: "field-a", title: "성분", items: [{ id: "note", text: "보존할 필기" }], blocks: [] }] };
  const payload = pharmacognosyImportV1Schema.parse({ schema: "pharmacognosy.import", version: 1, drugs: [{ koreanName: "기존", sections: [] }] });
  const prepared = prepareImport(payload, { fields, existingDrugs: [withNotes], categories: [{ id: "category", name: "피류" }] });
  assert.equal(prepared.drugs[0].preview.defaultFieldsInitialized, false);
  assert.deepEqual(prepared.drugs[0].sections, []);
  assert.deepEqual(mergeImportedSections(withNotes.sections, prepared.drugs[0].sections, fields), withNotes.sections);
});
