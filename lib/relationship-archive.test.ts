import assert from "node:assert/strict";
import test from "node:test";
import { buildRelationshipClusters, classifyRelationship, type ClusterableRelationship, type RelationshipNode } from "@/lib/relationship-archive";

const node = (id: string, archived = false): RelationshipNode => ({ id, catalogIndex: archived ? null : Number(id), referenceIndex: null, archive: archived ? { prefix: "FM", name: "Midterm", originalIndex: Number(id) } : null });
const edge = (id: string, source: RelationshipNode, target: RelationshipNode): ClusterableRelationship => ({ id, type: "연관생약", source, target, status: classifyRelationship(Boolean(source.archive), Boolean(target.archive)) });

test("relationships classify as active, mixed, and archived", () => {
  assert.equal(classifyRelationship(false, false), "active"); assert.equal(classifyRelationship(false, true), "mixed"); assert.equal(classifyRelationship(true, true), "archived");
});

test("archive and unarchive immediately reclassify relationships", () => {
  assert.equal(edge("e", node("1"), node("2")).status, "active");
  assert.equal(edge("e", node("1"), node("2", true)).status, "mixed");
  assert.equal(edge("e", node("1", true), node("2", true)).status, "archived");
});

test("clusters never mix archive statuses", () => {
  const a = node("1"), b = node("2"), archivedB = node("2", true), archivedC = node("3", true);
  const clusters = buildRelationshipClusters([edge("active", a, b), edge("mixed", a, archivedB), edge("archived", archivedB, archivedC)]);
  assert.deepEqual(new Set(clusters.map((cluster) => cluster.status)), new Set(["active", "mixed", "archived"]));
  assert.ok(clusters.every((cluster) => cluster.edges.every((item) => item.status === cluster.status)));
});
