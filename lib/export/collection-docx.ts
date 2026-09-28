import "server-only";
import type { CollectionDocument } from "@/lib/db/schema";
import { createCardsDocx } from "@/lib/export/docx";
import { prepareCollectionExportCard } from "@/lib/export/prepare-collection";
import { readMediaAsset } from "@/lib/media/read";

export async function createCollectionDocx(name: string, document: CollectionDocument) {
  const card = await prepareCollectionExportCard(name, document, async (id) => {
    const media = await readMediaAsset(id);
    if (!media?.buffer) return null;
    return { buffer: Buffer.from(media.buffer), mimeType: media.asset.mimeType, width: media.asset.width, height: media.asset.height };
  }, ({ blockId, mediaAssetId, error }) => {
    console.warn("[CollectionExport] DOCX image skipped", { blockId, mediaAssetId, message: error instanceof Error ? error.message : String(error) });
  });
  return createCardsDocx([card], 1);
}
