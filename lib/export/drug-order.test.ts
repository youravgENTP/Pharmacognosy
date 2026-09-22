import assert from "node:assert/strict";
import test from "node:test";
import { sortExportDrugs } from "@/lib/export/drug-order";

const drugs = [
  { id: "reference", catalogIndex: null, referenceIndex: 1, koreanName: "가시오갈피", importance: "중간" as const },
  { id: "three", catalogIndex: 3, referenceIndex: null, koreanName: "황기", importance: "중요" as const },
  { id: "one", catalogIndex: 1, referenceIndex: null, koreanName: "감초", importance: "비중요" as const },
  { id: "two", catalogIndex: 2, referenceIndex: null, koreanName: "갈근", importance: "중요" as const },
];

test("export index order uses catalog then reference indexes", () => {
  assert.deepEqual(sortExportDrugs(drugs, "index").map((drug) => drug.id), ["one", "two", "three", "reference"]);
});

test("export Korean name order uses Korean collation", () => {
  assert.deepEqual(sortExportDrugs(drugs, "name").map((drug) => drug.id), ["reference", "two", "one", "three"]);
});

test("export importance order uses index as its secondary key", () => {
  assert.deepEqual(sortExportDrugs(drugs, "importance").map((drug) => drug.id), ["two", "three", "reference", "one"]);
});
