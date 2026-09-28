import type { CollectionDocument, CollectionImageBlock, StudyItem } from "@/lib/db/schema";
import { hierarchyMarker, plainText, richTextRuns, type PdfCard, type PdfField } from "@/lib/export/common";
import { exportImageBuffer } from "@/lib/export/images";

export type CollectionExportMedia = { buffer: Buffer; mimeType: string; width: number; height: number };
export type CollectionExportWarning = { blockId: string; mediaAssetId: string; error: unknown };

export async function prepareCollectionExportCard(
  name: string,
  document: CollectionDocument,
  loadMedia: (id: string) => Promise<CollectionExportMedia | null>,
  warn: (warning: CollectionExportWarning) => void,
): Promise<PdfCard> {
  const fields: PdfField[] = [];
  for (const block of document.blocks) {
    if (block.type === "heading") {
      const title = plainText(block.content.html, block.content.text).trim();
      if (title) fields.push({ title, lines: [] });
    } else if (block.type === "text") {
      const text = plainText(block.content.html, block.content.text).trim();
      if (text) fields.push({ title: "", lines: [{ text, html: block.content.html, runs: richTextRuns(block.content.html, text) }] });
    } else if (block.type === "hierarchy") {
      const nestedBlocks = block.blocks ?? [];
      if (nestedBlocks.length) {
        for (const nested of nestedBlocks) {
          if (nested.type === "items") {
            const lines = hierarchyLines(nested.items);
            if (lines.length) fields.push({ title: "", lines });
          } else if (nested.type === "image") {
            const image = await prepareImage(block.id, nested, loadMedia, warn);
            if (image) fields.push({ title: "", lines: [], images: [image] });
          } else {
            const text = plainText(nested.content.html, nested.content.text).trim();
            if (text) fields.push({ title: "", lines: [{ text, html: nested.content.html, runs: richTextRuns(nested.content.html, text) }] });
          }
        }
      } else {
        const lines = hierarchyLines(block.items);
        if (lines.length) fields.push({ title: "", lines });
      }
    } else if (block.type === "image") {
      const image = await prepareImage(block.id, block, loadMedia, warn);
      if (image) fields.push({ title: "", lines: [], images: [image] });
    } else {
      fields.push({ title: "", lines: [], table: block });
    }
  }
  return { title: name, fields };
}

function hierarchyLines(items: StudyItem[], depth = 0): PdfField["lines"] {
  return items.flatMap((item, index) => {
    const content = plainText(item.html, item.text).trim();
    const marker = `${hierarchyMarker(depth, index)} `;
    const html = item.html ? `${marker}${item.html}` : undefined;
    const current = content ? [{ text: `${marker}${content}`, html, runs: richTextRuns(html, `${marker}${content}`), indent: depth * 13, bold: item.bold, italic: item.italic }] : [];
    return [...current, ...hierarchyLines(item.children ?? [], depth + 1)];
  });
}

async function prepareImage(
  blockId: string,
  block: Pick<CollectionImageBlock, "mediaAssetId" | "widthPercent" | "align"> | { mediaAssetId: string; widthPercent?: number; xPercent?: number; align?: "left" | "center" | "right"; size: "small" | "medium" | "large" | "full" },
  loadMedia: (id: string) => Promise<CollectionExportMedia | null>,
  warn: (warning: CollectionExportWarning) => void,
) {
  if (!block.mediaAssetId) return null;
  try {
    const media = await loadMedia(block.mediaAssetId);
    if (!media?.buffer.length) throw new Error("Media asset is missing or empty");
    if (!Number.isFinite(media.width) || media.width <= 0 || !Number.isFinite(media.height) || media.height <= 0) throw new Error(`Invalid image geometry: ${media.width}x${media.height}`);
    const sizePercent = "size" in block ? { small: 25, medium: 50, large: 75, full: 100 }[block.size] : 100;
    const widthPercent = clamp(block.widthPercent ?? sizePercent, 15, 100);
    const defaultX = block.align === "right" ? 100 - widthPercent : block.align === "center" ? (100 - widthPercent) / 2 : 0;
    return {
      buffer: await exportImageBuffer(Buffer.from(media.buffer), media.mimeType),
      width: media.width,
      height: media.height,
      widthPercent,
      xPercent: clamp("xPercent" in block ? block.xPercent ?? defaultX : defaultX, 0, 100 - widthPercent),
      align: block.align,
    };
  } catch (error) {
    warn({ blockId, mediaAssetId: block.mediaAssetId, error });
    return null;
  }
}

function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }
