import assert from "node:assert/strict";
import test from "node:test";
import { archiveIndexKey, archivedDisplayIndex, chooseUnarchiveIndex, originalDrugIndex } from "@/lib/archive-policy";

test("active catalog and R drugs produce distinct Archive index identities", () => {
  assert.deepEqual(originalDrugIndex({ catalogIndex: 3, referenceIndex: null }), { type: "catalog", value: 3 });
  assert.deepEqual(originalDrugIndex({ catalogIndex: null, referenceIndex: 3 }), { type: "reference", value: 3 });
  assert.notEqual(archiveIndexKey("catalog", 3), archiveIndexKey("reference", 3));
  assert.equal(archivedDisplayIndex("FM", 3, "catalog"), "FM03");
  assert.equal(archivedDisplayIndex("FM", 3, "reference"), "FMR03");
});

test("mixed catalog and R Archive plans preserve each original index type", () => {
  const plans = [{ catalogIndex: 35, referenceIndex: null }, { catalogIndex: null, referenceIndex: 3 }].map(originalDrugIndex);
  assert.deepEqual(plans, [{ type: "catalog", value: 35 }, { type: "reference", value: 3 }]);
});

test("R unarchive restores its original number and reports collisions for explicit safe choice", () => {
  assert.equal(chooseUnarchiveIndex("reference", 3, undefined, new Set([1, 2])), 3);
  assert.throws(() => chooseUnarchiveIndex("reference", 3, undefined, new Set([3])), /R03.*이미 사용 중.*다른 R 번호/);
  assert.equal(chooseUnarchiveIndex("reference", 3, 4, new Set([3])), 4);
});

test("legacy catalog unarchive keeps its next-free fallback but never overwrites an explicit collision", () => {
  assert.equal(chooseUnarchiveIndex("catalog", 3, undefined, new Set([1, 2, 3])), 4);
  assert.throws(() => chooseUnarchiveIndex("catalog", 3, 2, new Set([2])), /이미 사용 중/);
});
