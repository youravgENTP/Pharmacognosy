import type { StudyBlock, StudyItem } from "@/lib/db/schema";

export function visibleStudyBlocks(blocks: StudyBlock[], fallback: StudyBlock): StudyBlock[] {
  const visible = blocks.filter(hasStudyBlockContent);
  return visible.length ? visible : [fallback];
}

export function normalizeStudyBlocks(blocks: StudyBlock[]): StudyBlock[] {
  return blocks.filter(hasStudyBlockContent);
}

function hasStudyBlockContent(block: StudyBlock) {
  if (block.type === "image") return true;
  if (block.type === "text") return Boolean(block.content.text || block.content.html);
  return block.items.length > 0;
}

export function appendStudyItem(
  blocks: StudyBlock[],
  item: StudyItem,
  createId: () => string,
): StudyBlock[] {
  const next = structuredClone(blocks);
  const last = next.at(-1);

  if (last?.type === "items") {
    last.items = last.items.length ? [...last.items, item] : [item];
    return next;
  }

  next.push({ id: createId(), type: "items", items: [item] });
  return next;
}
