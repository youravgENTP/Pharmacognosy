import assert from "node:assert/strict";
import test from "node:test";
import { applyCollectionArchiveSnapshot } from "@/lib/collection-archive";

test("Collection Archive and Unarchive preserve document, revisions, members, and export input", () => {
  const source = { id: "collection", archivedAt: null as Date | null, document: { version: 1, blocks: [{ id: "text", type: "text", content: { text: "notes" } }] }, revisions: [{ revision: 1, document: { version: 1, blocks: [] } }], members: ["drug"], anchors: ["anchor"], exportName: "Final.xlsx" };
  const archivedAt = new Date("2026-10-27T00:00:00Z");
  const archived = applyCollectionArchiveSnapshot(source, "archive", archivedAt);
  assert.equal(archived.archivedAt?.toISOString(), archivedAt.toISOString());
  const restored = applyCollectionArchiveSnapshot(archived, "unarchive");
  assert.equal(restored.archivedAt, null);
  assert.deepEqual({ ...restored, archivedAt: source.archivedAt }, source);
});
