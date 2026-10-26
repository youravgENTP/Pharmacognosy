import assert from "node:assert/strict";
import test from "node:test";
import { allocateCatalogIndex } from "@/lib/catalog-index";

test("a cleared active catalog restarts allocation at one", () => {
  const used = new Set<number>();
  assert.equal(allocateCatalogIndex(used), 1);
  assert.equal(allocateCatalogIndex(used), 2);
});

test("allocation follows payload order and fills the lowest free active index", () => {
  const used = new Set([1, 3]);
  assert.equal(allocateCatalogIndex(used), 2);
  assert.equal(allocateCatalogIndex(used), 4);
});

test("an explicitly requested active index cannot collide", () => {
  assert.throws(() => allocateCatalogIndex(new Set([1]), 1), /already in use/);
});
