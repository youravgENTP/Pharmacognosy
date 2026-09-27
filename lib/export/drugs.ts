import "server-only";
import { getDrugProfile } from "@/lib/data/drug";
import { selectMnemonicVersions, type MnemonicExportMode } from "@/lib/data/mnemonics";
import type { PdfCard } from "@/lib/export/common";
import { readMediaAsset } from "@/lib/media/read";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { fieldDefinitions } from "@/lib/db/schema";
import { prepareDrugExportCard } from "@/lib/export/prepare-drug";
import { logDataCardExportError, logDataCardExportWarning } from "@/lib/export/errors";

export type DrugExportOptions = { mnemonicMode: MnemonicExportMode; mnemonicUserId?: string };

export async function loadDrugExportCards(ids: string[], viewingUserId: string, options: DrugExportOptions): Promise<PdfCard[]> {
  const cards: PdfCard[] = [];
  let activeFieldIds: Set<string>;
  try { activeFieldIds = new Set((await db.select({ id: fieldDefinitions.id }).from(fieldDefinitions).where(eq(fieldDefinitions.active, true))).map((field) => field.id)); }
  catch (error) { logDataCardExportError("field definition load failed", error); throw error; }
  for (const id of ids) {
    let drug: Awaited<ReturnType<typeof getDrugProfile>>;
    try { drug = await getDrugProfile(id); }
    catch (error) { logDataCardExportError("load profile failed", error, { drugId: id }); throw error; }
    if (!drug) continue;
    let mnemonics: Awaited<ReturnType<typeof selectMnemonicVersions>>;
    try { mnemonics = await selectMnemonicVersions(id, viewingUserId, options.mnemonicMode, options.mnemonicUserId); }
    catch (error) { logDataCardExportError("mnemonic load failed", error, { drugId: id, mnemonicMode: options.mnemonicMode }); throw error; }
    cards.push(await prepareDrugExportCard(id, drug, activeFieldIds, mnemonics, async (mediaAssetId) => {
      const media = await readMediaAsset(mediaAssetId);
      return media?.buffer ? { buffer: Buffer.from(media.buffer), mimeType: media.asset.mimeType, width: media.asset.width, height: media.asset.height } : null;
    }, ({ error, ...context }) => logDataCardExportWarning("image skipped", error, context)));
  }
  return cards;
}
