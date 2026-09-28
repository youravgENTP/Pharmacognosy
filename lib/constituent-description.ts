import type { StudyBlock, StudyItem } from "@/lib/db/schema";

type DescriptionSource = { id: string; description: string | null; descriptionItems?: StudyItem[]; descriptionBlocks?: StudyBlock[] };
type LegacyMedia = { id: string; taxonId: string; mediaAssetId: string };

export function taxonDescriptionDraft(node: DescriptionSource | undefined, media: LegacyMedia[]) {
  if (!node) return { items: [] as StudyItem[], blocks: [] as StudyBlock[] };
  const items = node.descriptionItems?.length ? node.descriptionItems : node.description?.trim() ? [{ id: `legacy-description-${node.id}`, text: node.description.trim() }] : [];
  if (node.descriptionBlocks?.length) return { items, blocks: node.descriptionBlocks };
  const blocks: StudyBlock[] = items.length ? [{ id: `legacy-items-${node.id}`, type: "items", items }] : [];
  for (const image of media.filter((item) => item.taxonId === node.id)) blocks.push({ id: `legacy-image-${image.id}`, type: "image", mediaAssetId: image.mediaAssetId, size: "medium", widthPercent: 50, xPercent: 0, align: "left" });
  return { items, blocks };
}

export function taxonDescriptionText(items: StudyItem[]): string {
  return items.flatMap((item) => [item.text.trim(), taxonDescriptionText(item.children ?? [])]).filter(Boolean).join(" ").trim();
}
