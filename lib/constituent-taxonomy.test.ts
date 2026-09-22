import assert from "node:assert/strict";
import test from "node:test";
import { descendantIds, hasDirectedPath, taxonomyIndent, validateParentLink, type TaxonomyEdge } from "@/lib/constituent-taxonomy";

const ids = Array.from({ length: 9 }, (_, index) => `L${index}`);
const deepEdges: TaxonomyEdge[] = ids.slice(1).map((id, index) => ({ parentId: ids[index], childId: id }));

test("nodes can be added continuously through eight hierarchy levels", () => {
  const nodeIds = new Set([ids[0]]);
  const edges: TaxonomyEdge[] = [];
  for (let index = 1; index < ids.length; index++) {
    nodeIds.add(ids[index]);
    assert.equal(validateParentLink(nodeIds, edges, ids[index], ids[index - 1]), undefined);
    edges.push({ parentId: ids[index - 1], childId: ids[index] });
  }
  assert.equal(hasDirectedPath(edges, "L0", "L8"), true);
  assert.deepEqual([...descendantIds("L0", edges)], ids);
  assert.equal(validateParentLink(nodeIds, edges, "L0", "L8"), "cycle");
});

test("valid deep children are accepted while invalid parents are rejected", () => {
  const nodeIds = new Set([...ids, "L9"]);
  assert.equal(validateParentLink(nodeIds, deepEdges, "L9", "L8"), undefined);
  assert.equal(validateParentLink(nodeIds, deepEdges, "L8", "L8"), "self-parent");
  assert.equal(validateParentLink(nodeIds, deepEdges, "L9", "missing"), "missing-parent");
});

test("visual indentation grows compactly without changing logical depth", () => {
  assert.equal(taxonomyIndent(4), 88);
  assert.equal(taxonomyIndent(8), 128);
  assert.ok(taxonomyIndent(100) > taxonomyIndent(8));
});
