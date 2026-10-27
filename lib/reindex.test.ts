import assert from "node:assert/strict";
import test from "node:test";
import { applyReindexPlanSnapshot, buildReindexPlan, type ReindexDrug } from "@/lib/reindex";

const drug = (id: string, koreanName: string, catalogIndex: number | null, extra: Partial<ReindexDrug> = {}): ReindexDrug => ({ id, koreanName, catalogIndex, referenceIndex: null, archived: false, ...extra });

test("Reindex supports a cyclic index swap", () => {
  const rows = [drug("a", "감초", 1), drug("b", "진피", 2), drug("c", "황기", 3)];
  const plan = buildReindexPlan([{ koreanName: "감초", catalogIndex: 2 }, { koreanName: "진피", catalogIndex: 3 }, { koreanName: "황기", catalogIndex: 1 }], rows);
  assert.equal(plan.canExecute, true);
  assert.deepEqual(applyReindexPlanSnapshot(rows, plan).map((row) => row.catalogIndex), [2, 3, 1]);
});

test("Reindex supports complete reassignment", () => {
  const rows = [drug("a", "A", 1), drug("b", "B", 2), drug("c", "C", 3), drug("d", "D", 4)];
  const plan = buildReindexPlan(rows.map((row, index) => ({ koreanName: row.koreanName, catalogIndex: 4 - index })), rows);
  assert.equal(plan.canExecute, true); assert.equal(plan.summary.changed, 4);
});

test("Reindex blocks duplicate targets and non-target collisions", () => {
  const rows = [drug("a", "A", 1), drug("b", "B", 2), drug("c", "C", 3)];
  assert.equal(buildReindexPlan([{ koreanName: "A", catalogIndex: 2 }, { koreanName: "B", catalogIndex: 2 }], rows).canExecute, false);
  const occupied = buildReindexPlan([{ koreanName: "A", catalogIndex: 3 }], rows);
  assert.equal(occupied.canExecute, false); assert.match(occupied.errors.join(" "), /변경 대상이 아닌 활성 생약 C/);
});

test("Reindex blocks missing, archived, and reference drugs", () => {
  const rows = [drug("a", "Archive", null, { archived: true }), drug("r", "Reference", null, { referenceIndex: 4 })];
  const plan = buildReindexPlan([{ koreanName: "Missing", catalogIndex: 1 }, { koreanName: "Archive", catalogIndex: 2 }, { koreanName: "Reference", catalogIndex: 3 }], rows);
  assert.equal(plan.canExecute, false); assert.match(plan.errors.join(" "), /정확히 일치/); assert.match(plan.errors.join(" "), /Archive 상태/); assert.match(plan.errors.join(" "), /R 인덱스/);
});

test("Reindex changes only catalogIndex and preserves sections and mnemonic state", () => {
  const before = [{ ...drug("a", "A", 1), sections: [{ id: "s", items: [{ text: "필기" }] }], mnemonics: [{ userId: "u", text: "암기" }], relationships: ["b"], collectionIds: ["c"] }];
  const after = applyReindexPlanSnapshot(before, buildReindexPlan([{ koreanName: "A", catalogIndex: 9 }], before));
  assert.equal(after[0].catalogIndex, 9);
  assert.deepEqual({ ...after[0], catalogIndex: before[0].catalogIndex }, before[0]);
});
