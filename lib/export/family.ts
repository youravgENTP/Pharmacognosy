import "server-only";
import { readMediaAsset } from "@/lib/media/read";
import { getFamilyExplorerData } from "@/lib/data/family";
import { loadDrugExportCards, type DrugExportOptions } from "@/lib/export/drugs";
import { composeFamilyExportCards } from "@/lib/export/family-document";
import { prepareStudyField } from "@/lib/export/prepare-drug";
import type { PdfCard } from "@/lib/export/common";
import { logDataCardExportWarning } from "@/lib/export/errors";

export async function loadFamilyExportCards(familyId: string, viewingUserId: string, options: DrugExportOptions): Promise<PdfCard[] | null> {
  const family = (await getFamilyExplorerData()).find((item) => item.id === familyId);
  if (!family) return null;
  const summary = await prepareStudyField(family.id, "Summary", family.summary, family.summaryBlocks, async (mediaAssetId) => {
    const media = await readMediaAsset(mediaAssetId);
    return media?.buffer ? { buffer: Buffer.from(media.buffer), mimeType: media.asset.mimeType, width: media.asset.width, height: media.asset.height } : null;
  }, ({ error, ...context }) => logDataCardExportWarning("family summary image skipped", error, context));
  const fields = [] as PdfCard["fields"];
  if (summary.lines.length || summary.images?.length) fields.push(summary);
  if (family.drugs.length) fields.push({ title: "소속 생약", lines: [{ text: family.drugs.map((drug) => drug.koreanName).join(", ") }] });
  const cover: PdfCard = {
    title: family.koreanName,
    latinName: family.scientificName,
    subtitle: [family.scientificName, family.acceptedScientificName && family.acceptedScientificName !== family.scientificName ? `Accepted: ${family.acceptedScientificName}` : null].filter(Boolean).join(" · "),
    role: "cover",
    fields,
  };
  const drugCards = await loadDrugExportCards(family.drugs.map((drug) => drug.id), viewingUserId, options);
  return composeFamilyExportCards(cover, family.drugs, drugCards);
}
