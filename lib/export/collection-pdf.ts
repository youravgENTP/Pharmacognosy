import "server-only";
import type { CollectionDocument, StudyItem } from "@/lib/db/schema";
import { hierarchyMarker, plainText, richTextRuns } from "@/lib/export/common";
import { createCardsPdf, type PdfField } from "@/lib/export/pdf";
import { readMediaAsset } from "@/lib/media/read";
import { exportImageBuffer } from "@/lib/export/images";

export async function createCollectionPdf(name: string, document: CollectionDocument) {
  const fields: PdfField[] = [];
  for (const block of document.blocks) {
    if (block.type === "heading") fields.push({ title: plainText(block.content.html, block.content.text), lines: [] });
    else if (block.type === "text") fields.push({ title: "", lines: [{ text: plainText(block.content.html, block.content.text), runs: richTextRuns(block.content.html, block.content.text) }] });
    else if (block.type === "hierarchy") { const lines: PdfField["lines"] = []; const visit = (items: StudyItem[], depth: number) => items.forEach((item, index) => { lines.push({ text: `${hierarchyMarker(depth, index)} ${plainText(item.html, item.text)}`, indent: depth * 13 }); visit(item.children ?? [], depth + 1); }); const itemBlocks = (block.blocks ?? []).filter((item) => item.type === "items"); if (itemBlocks.length) for (const item of itemBlocks) visit(item.items, 0); else visit(block.items, 0); fields.push({ title: "", lines }); }
    else if (block.type === "image") { const media = block.mediaAssetId ? await readMediaAsset(block.mediaAssetId).catch(() => null) : null; if (media?.buffer) fields.push({ title: "", lines: [], images: [{ buffer: await exportImageBuffer(Buffer.from(media.buffer), media.asset.mimeType), width: media.asset.width, height: media.asset.height }] }); }
    else fields.push({ title: "표", lines: [], table: block });
  }
  return createCardsPdf([{ title: name, fields }], 1);
}
