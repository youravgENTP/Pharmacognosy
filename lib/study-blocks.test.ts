import assert from "node:assert/strict";
import test from "node:test";
import type { StudyBlock, StudyItem } from "@/lib/db/schema";
import { appendStudyItem, normalizeStudyBlocks, visibleStudyBlocks } from "@/lib/study-blocks";

const item = (id: string): StudyItem => ({ id, text: id });

test("image may be the final block without a synthetic empty item row", () => {
  const blocks: StudyBlock[] = [
    { id: "items", type: "items", items: [item("one")] },
    { id: "image", type: "image", mediaAssetId: "asset", size: "medium", align: "left" },
    { id: "ghost", type: "items", items: [] },
  ];
  assert.deepEqual(normalizeStudyBlocks(blocks).map((block) => block.id), ["items", "image"]);
  assert.deepEqual(visibleStudyBlocks(blocks, blocks[0]).map((block) => block.id), ["items", "image"]);
});

test("an explicit item after an image creates a new items block after it", () => {
  const blocks: StudyBlock[] = [
    { id: "items", type: "items", items: [item("one")] },
    { id: "image", type: "image", mediaAssetId: "asset", size: "medium", align: "left" },
  ];
  const next = appendStudyItem(blocks, item("two"), () => "after-image");
  assert.deepEqual(next.map((block) => block.id), ["items", "image", "after-image"]);
  assert.equal(next[2].type === "items" && next[2].items[0].id, "two");
});

test("an explicit item continues the trailing items block", () => {
  const blocks: StudyBlock[] = [{ id: "items", type: "items", items: [item("one")] }];
  const next = appendStudyItem(blocks, item("two"), () => "unused");
  assert.deepEqual(next[0].type === "items" && next[0].items.map((entry) => entry.id), ["one", "two"]);
});
