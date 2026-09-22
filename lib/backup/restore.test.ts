import assert from "node:assert/strict";
import test from "node:test";
import { applySelectedDrugFields, referencedMediaIds, referencedTaxonIds, rewriteSectionMedia, rewriteSectionTaxa, type BackupDrug } from "@/lib/backup/restore";

const base = (name: string): BackupDrug => ({ id: "10000000-0000-4000-8000-000000000001", catalogIndex: 1, referenceIndex: 1, koreanName: name, latinName: null, origin: null, origins: [], scientificName: null, medicinalPart: null, categoryId: null, familyId: null, importance: "중간", sections: [{ id: "keep", title: "약리", items: [{ id: "current", text: "current" }] }, { id: "replace", fieldDefinitionId: "30000000-0000-4000-8000-000000000003", title: "성분", items: [{ id: "old", text: "old" }] }], createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") });

test("selective one-section restore replaces exactly and leaves every unselected field untouched", () => {
  const current = base("현재 이름");
  const backup = base("백업 이름");
  backup.importance = "중요";
  backup.sections[1] = { id: "replace", fieldDefinitionId: "30000000-0000-4000-8000-000000000003", title: "성분", items: [{ id: "restored", text: "A", html: "<em>A</em>" }] };
  const restored = applySelectedDrugFields(current, backup, ["section:replace"]);
  assert.equal(restored.koreanName, "현재 이름");
  assert.equal(restored.importance, "중간");
  assert.deepEqual(restored.sections[0], current.sections[0]);
  assert.deepEqual(restored.sections[1], backup.sections[1]);
});

test("selected Data Card metadata restores without changing unselected sections", () => {
  const current = base("현재 이름");
  const backup = base("백업 이름");
  backup.catalogIndex = 77;
  const restored = applySelectedDrugFields(current, backup, ["basic"]);
  assert.equal(restored.koreanName, "백업 이름");
  assert.equal(restored.catalogIndex, 77);
  assert.deepEqual(restored.sections, current.sections);
});

test("related image and taxonomy IDs are discovered and safely rewritten", () => {
  const section = { id: "s", title: "성분", items: [{ id: "a", text: "root", children: [{ id: "b", text: "child", linkedConstituentId: "taxon-old" }] }], blocks: [{ id: "image", type: "image" as const, mediaAssetId: "20000000-0000-4000-8000-000000000002", size: "medium" as const }, { id: "items", type: "items" as const, items: [{ id: "c", text: "block", linkedConstituentId: "taxon-two" }] }] };
  assert.deepEqual([...referencedMediaIds([section])], ["20000000-0000-4000-8000-000000000002"]);
  assert.deepEqual(new Set(referencedTaxonIds([section])), new Set(["taxon-old", "taxon-two"]));
  const media = rewriteSectionMedia(section, new Map([["20000000-0000-4000-8000-000000000002", "20000000-0000-4000-8000-000000000009"]]));
  const taxa = rewriteSectionTaxa(media, new Map([["taxon-old", "taxon-new"], ["taxon-two", "taxon-three"]]));
  assert.equal(taxa.blocks?.[0].type === "image" && taxa.blocks[0].mediaAssetId, "20000000-0000-4000-8000-000000000009");
  assert.equal(taxa.items[0].children?.[0].linkedConstituentId, "taxon-new");
  assert.equal(taxa.blocks?.[1].type === "items" && taxa.blocks[1].items[0].linkedConstituentId, "taxon-three");
});
