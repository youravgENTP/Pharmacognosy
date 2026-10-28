import assert from "node:assert/strict";
import test from "node:test";
import { compareDrugIndexes, formatDrugIndex } from "@/lib/drug-index";

test("active, reference, and archived indexes use independent display systems", () => {
  assert.equal(formatDrugIndex(1), "1");
  assert.equal(formatDrugIndex(null, 2), "R02");
  assert.equal(formatDrugIndex(null, null, { prefix: "FM", originalIndex: 1 }), "FM01");
  assert.equal(formatDrugIndex(null, null, { prefix: "FM", originalIndex: 15 }), "FM15");
  assert.equal(formatDrugIndex(null, null, { prefix: "FM", originalIndexType: "reference", originalIndex: 3 }), "FMR03");
});

test("archived indexes sort after active indexes and before reference indexes", () => {
  const rows = [
    { catalogIndex: null, referenceIndex: 1, name: "참고" },
    { catalogIndex: null, archive: { prefix: "FM", originalIndex: 2 }, name: "보관2" },
    { catalogIndex: 1, name: "활성" },
    { catalogIndex: null, archive: { prefix: "FM", originalIndex: 1 }, name: "보관1" },
  ].sort(compareDrugIndexes);
  assert.deepEqual(rows.map((row) => row.name), ["활성", "보관1", "보관2", "참고"]);
});
