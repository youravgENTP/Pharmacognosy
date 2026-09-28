import assert from "node:assert/strict";
import test from "node:test";
import type { StudySection } from "@/lib/db/schema";
import { mergeImportedSections, prepareImport, scalarMergePatch, validateHierarchy, type ImportExistingDrug, type ImportFieldDefinition } from "@/lib/import-pipeline";
import { pharmacognosyImportV1Schema } from "@/lib/import-schema";

const ids = { component: "10000000-0000-4000-8000-000000000001", test: "10000000-0000-4000-8000-000000000002", pharmacology: "10000000-0000-4000-8000-000000000003", other: "10000000-0000-4000-8000-000000000004", mnemonic: "10000000-0000-4000-8000-000000000005" };
const fields: ImportFieldDefinition[] = [
  { id: ids.component, name: "성분", inputMode: "hierarchy4", position: 10, active: true },
  { id: ids.test, name: "확인시험", inputMode: "hierarchy3", position: 20, active: true },
  { id: ids.pharmacology, name: "약리", inputMode: "hierarchy3", position: 30, active: true },
  { id: ids.other, name: "기타", inputMode: "hierarchy4", position: 80, active: true },
  { id: ids.mnemonic, name: "암기법", inputMode: "hierarchy4", position: 90, active: true },
];
const existing: ImportExistingDrug = { id: "20000000-0000-4000-8000-000000000001", koreanName: "진피", latinName: "Existing Latin", origin: "existing origin", origins: [], scientificName: "Existing species", medicinalPart: "existing part", categoryId: null, familyId: "30000000-0000-4000-8000-000000000001", importance: "중요", sections: [section("성분", ids.component, "old component"), section("약리", ids.pharmacology, "old pharmacology")] };
const categorizedExisting: ImportExistingDrug = { ...existing, categoryId: "40000000-0000-4000-8000-000000000001" };
const categoryRows = [
  { id: "40000000-0000-4000-8000-000000000001", name: "과실류" },
  { id: "40000000-0000-4000-8000-000000000002", name: "종자류" },
];

function section(title: string, fieldDefinitionId: string, text: string): StudySection { return { id: `${fieldDefinitionId}-section`, fieldDefinitionId, title, items: [{ id: `${fieldDefinitionId}-item`, text }] }; }
function payload(drugs: unknown[]) { return pharmacognosyImportV1Schema.parse({ schema: "pharmacognosy.import", version: 1, drugs }); }
function prepare(drugs: unknown[], options: Partial<Parameters<typeof prepareImport>[1]> = {}) { return prepareImport(payload(drugs), { fields, existingDrugs: [], ...options }); }

test("old title-only and new field sections resolve to the current field definition", () => {
  const prepared = prepare([{ koreanName: "A", category: "분류", sections: [{ title: "주성분", items: [{ text: "one" }] }, { field: "확인시험법", title: "legacy title", items: [{ text: "two" }] }] }]);
  assert.deepEqual(prepared.drugs[0].sections.map((value) => value.fieldDefinitionId), [ids.component, ids.test]);
});

test("the new field key resolves without a legacy title", () => {
  const prepared = prepare([{ koreanName: "A", category: "분류", sections: [{ field: "성분", items: [{ text: "one" }] }] }]);
  assert.equal(prepared.drugs[0].sections[0].fieldDefinitionId, ids.component);
});

test("unknown sections map to 기타 and preserve their original heading", () => {
  const prepared = prepare([{ koreanName: "A", category: "분류", sections: [{ title: "교수님 추가 설명", items: [{ text: "내용" }] }] }]);
  const fallback = prepared.drugs[0].sections[0];
  assert.equal(fallback.fieldDefinitionId, ids.other);
  assert.equal(fallback.items[0].text, "교수님 추가 설명");
  assert.equal(fallback.items[0].children?.[0].text, "내용");
});

test("first-class, relationship, identification, and mnemonic headings never fall back to 기타", () => {
  const prepared = prepare([{ koreanName: "A", category: "분류", sections: ["기원", "연관생약", "가공 및 기타 사항", "암기법"].map((title) => ({ title, items: [{ text: "내용" }] })) }]);
  assert.equal(prepared.drugs[0].sections.length, 0);
  assert.equal(prepared.drugs[0].errors.filter((error) => error.code === "reserved-section").length, 4);
});

test("hierarchy overflow is rejected while valid hierarchy passes", () => {
  const depth4 = [{ text: "1", children: [{ text: "2", children: [{ text: "3", children: [{ text: "4" }] }] }] }];
  assert.equal(validateHierarchy("성분", depth4, "hierarchy4").length, 0);
  assert.equal(validateHierarchy("약리", depth4, "hierarchy3")[0].code, "hierarchy-overflow");
  assert.equal(validateHierarchy("텍스트", [{ text: "one" }, { text: "two" }], "text")[0].code, "text-hierarchy");
});

test("a valid hierarchy3 tree passes validation", () => {
  const depth3 = [{ text: "1", children: [{ text: "2", children: [{ text: "3" }] }] }];
  assert.deepEqual(validateHierarchy("확인시험", depth3, "hierarchy3"), []);
});

test("obvious typo normalization is deterministic and reviewable", () => {
  const prepared = prepare([{ koreanName: "A", category: "분류", family: { scientificName: "Ploygonaceae" }, scientificName: "Rheumpalmatum", sections: [{ field: "성분", items: [{ text: "anthraquionone" }] }] }]);
  assert.equal(prepared.drugs[0].input.family?.scientificName, "Polygonaceae");
  assert.equal(prepared.drugs[0].input.scientificName, "Rheum palmatum");
  assert.equal(prepared.drugs[0].sections[0].items[0].text, "anthraquinone");
  assert.equal(prepared.drugs[0].corrections.length, 3);
});

test("merge scalar patch updates only explicitly supplied properties", () => {
  const input = payload([{ koreanName: "진피", category: "과실류", origin: "new origin" }]).drugs[0];
  const patch = scalarMergePatch(input, { categoryId: "category" });
  assert.deepEqual(patch, { categoryId: "category", origin: "new origin" });
  assert.equal(Object.hasOwn(patch, "importance"), false);
  assert.equal(Object.hasOwn(patch, "familyId"), false);
});

test("omitted importance never resets an existing importance", () => {
  const input = payload([{ koreanName: "진피", category: "과실류" }]).drugs[0];
  const patch = scalarMergePatch(input, { categoryId: "category" });
  assert.equal(Object.hasOwn(patch, "importance"), false);
  assert.equal(existing.importance, "중요");
});

test("merge replaces only its matching section and preserves unrelated sections", () => {
  const prepared = prepare([{ koreanName: "진피", category: "과실류", sections: [{ field: "성분", items: [{ text: "new component" }] }] }], { existingDrugs: [existing] });
  let sequence = 0;
  const merged = mergeImportedSections(existing.sections, prepared.drugs[0].sections, fields, false, () => `new-${++sequence}`);
  assert.equal(merged.find((value) => value.title === "성분")?.items[0].text, "new component");
  assert.equal(merged.find((value) => value.title === "약리")?.items[0].text, "old pharmacology");
  assert.equal(merged.find((value) => value.title === "성분")?.id, existing.sections[0].id);
});

test("mnemonic stays out of crude-drug content and only adds an empty field shell", () => {
  const prepared = prepare([{ koreanName: "A", category: "분류", mnemonic: { items: [{ text: "remember" }] } }]);
  assert.equal(prepared.drugs[0].sections.length, 0);
  const merged = mergeImportedSections([], prepared.drugs[0].sections, fields, true, () => "generated");
  assert.deepEqual(merged[0].items, []);
  assert.equal(merged[0].fieldDefinitionId, ids.mnemonic);
});

test("relationships between payload drugs resolve regardless of order", () => {
  const prepared = prepare([{ koreanName: "B", category: "분류" }, { koreanName: "A", category: "분류", relationships: [{ targetKoreanName: "B", type: "related" }] }]);
  assert.equal(prepared.drugs[1].relationships[0].source, "payload");
  assert.equal(prepared.drugs[1].relationships[0].type, "연관생약");
  assert.equal(prepared.drugs[1].warnings.length, 0);
});

test("unresolved external relationship targets produce a visible safe-skip warning", () => {
  const prepared = prepare([{ koreanName: "A", category: "분류", relationships: [{ targetKoreanName: "Missing", type: "연관생약" }] }]);
  assert.equal(prepared.drugs[0].relationships[0].resolvable, false);
  assert.equal(prepared.drugs[0].warnings[0].code, "unresolved-relationship");
  assert.match(prepared.drugs[0].preview.relationshipAction, /건너뜀/);
});

test("family matching ignores trivial whitespace and case differences", () => {
  const prepared = prepare([{ koreanName: "A", category: "분류", family: { scientificName: "  polygonaceae " } }], { families: [{ id: "family", koreanName: "마디풀과", scientificName: "Polygonaceae" }] });
  assert.match(prepared.drugs[0].preview.familyAction, /기존 과 사용/);
});

test("a genuinely new family is reported for transactional creation", () => {
  const prepared = prepare([{ koreanName: "A", category: "분류", family: { scientificName: "Rutaceae", koreanName: "운향과" } }], { families: [] });
  assert.match(prepared.drugs[0].preview.familyAction, /새 과 생성/);
});

test("preview identifies updated and preserved fields for a real merge", () => {
  const prepared = prepare([{ koreanName: "진피", category: "과실류", sections: [{ field: "성분", items: [{ text: "new" }] }] }], { existingDrugs: [existing] });
  assert.deepEqual(prepared.drugs[0].preview.fieldsUpdated, ["성분"]);
  assert.deepEqual(prepared.drugs[0].preview.fieldsPreserved, ["약리"]);
});

test("existing drug with omitted category preserves category and omits categoryId from its patch", () => {
  const input = payload([{ koreanName: "진피", sections: [{ field: "성분", items: [{ text: "new" }] }] }]).drugs[0];
  const prepared = prepareImport({ schema: "pharmacognosy.import", version: 1, drugs: [input] }, { fields, existingDrugs: [categorizedExisting], categories: categoryRows });
  const patch = scalarMergePatch(prepared.drugs[0].input, { familyId: categorizedExisting.familyId });
  assert.equal(prepared.drugs[0].errors.length, 0);
  assert.equal(prepared.drugs[0].preview.categoryAction, "기존 분류 유지");
  assert.equal(Object.hasOwn(patch, "categoryId"), false);
});

test("existing drug with supplied category updates categoryId", () => {
  const input = payload([{ koreanName: "진피", category: "종자류" }]).drugs[0];
  const prepared = prepareImport({ schema: "pharmacognosy.import", version: 1, drugs: [input] }, { fields, existingDrugs: [categorizedExisting], categories: categoryRows });
  const patch = scalarMergePatch(input, { categoryId: categoryRows[1].id });
  assert.equal(patch.categoryId, categoryRows[1].id);
  assert.equal(prepared.drugs[0].preview.categoryAction, "분류 변경 · 과실류 → 종자류");
});

test("new drug with supplied category remains valid", () => {
  const prepared = prepare([{ koreanName: "신규", category: "종자류" }], { categories: categoryRows });
  assert.equal(prepared.canCommit, true);
  assert.equal(prepared.drugs[0].preview.categoryAction, "신규 분류 · 종자류");
});

test("new drug with omitted category gets a blocking validation error", () => {
  const prepared = prepare([{ koreanName: "신규" }]);
  assert.equal(prepared.canCommit, false);
  assert.equal(prepared.drugs[0].errors.find((error) => error.code === "missing-category")?.message, "신규 생약은 category가 필요합니다.");
});

test("existing drug with omitted category and importance preserves both values", () => {
  const input = payload([{ koreanName: "진피" }]).drugs[0];
  const patch = scalarMergePatch(input, {});
  assert.equal(Object.hasOwn(patch, "categoryId"), false);
  assert.equal(Object.hasOwn(patch, "importance"), false);
  assert.equal(categorizedExisting.categoryId, categoryRows[0].id);
  assert.equal(categorizedExisting.importance, "중요");
});

test("category is never inferred from Latin name or scientific fields", () => {
  const prepared = prepare([{ koreanName: "신규", latinName: "Test Semen", scientificName: "Plantus semen" }]);
  assert.equal(prepared.drugs[0].input.category, undefined);
  assert.ok(prepared.drugs[0].errors.some((error) => error.code === "missing-category"));
});
