import assert from "node:assert/strict";
import test from "node:test";
import { taxonDescriptionDraft, taxonDescriptionText } from "@/lib/constituent-description";

test("legacy Compound Tree descriptions and images open in the hierarchy editor", () => {
  const draft = taxonDescriptionDraft({ id: "taxon", description: "기존 설명", descriptionItems: [], descriptionBlocks: [] }, [{ id: "link", taxonId: "taxon", mediaAssetId: "00000000-0000-4000-8000-000000000001" }]);
  assert.deepEqual(draft.items, [{ id: "legacy-description-taxon", text: "기존 설명" }]);
  assert.equal(draft.blocks[0]?.type, "items");
  assert.deepEqual(draft.blocks[1], { id: "legacy-image-link", type: "image", mediaAssetId: "00000000-0000-4000-8000-000000000001", size: "medium", widthPercent: 50, xPercent: 0, align: "left" });
});

test("saved rich description takes precedence and keeps searchable text", () => {
  const items = [{ id: "root", text: "Alkaloid", children: [{ id: "child", text: "Indole" }] }];
  const blocks = [{ id: "items", type: "items" as const, items }];
  const draft = taxonDescriptionDraft({ id: "taxon", description: "old", descriptionItems: items, descriptionBlocks: blocks }, [{ id: "old-image", taxonId: "taxon", mediaAssetId: "ignored" }]);
  assert.equal(draft.blocks.length, 1);
  assert.equal(taxonDescriptionText(draft.items), "Alkaloid Indole");
});
