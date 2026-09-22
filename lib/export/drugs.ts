import "server-only";
import { getDrugProfile } from "@/lib/data/drug";
import { selectMnemonicVersions, type MnemonicExportMode } from "@/lib/data/mnemonics";
import type { StudyItem } from "@/lib/db/schema";
import { hierarchyMarker, plainText, richTextRuns, studyImages, type PdfField, type PdfCard } from "@/lib/export/common";
import { readMediaAsset } from "@/lib/media/read";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { fieldDefinitions } from "@/lib/db/schema";
import { exportImageBuffer } from "@/lib/export/images";

export type DrugExportOptions = { mnemonicMode: MnemonicExportMode; mnemonicUserId?: string };

export async function loadDrugExportCards(ids: string[], viewingUserId: string, options: DrugExportOptions): Promise<PdfCard[]> {
  const cards: PdfCard[] = [];
  const activeFieldIds = new Set((await db.select({ id: fieldDefinitions.id }).from(fieldDefinitions).where(eq(fieldDefinitions.active, true))).map((field) => field.id));
  for (const id of ids) {
    const drug = await getDrugProfile(id); if (!drug) continue;
    const fields: PdfField[] = [];
    if (drug.scientificName) fields.push({ title: "학명", lines: [{ text: drug.scientificName, italic: true }] });
    if (drug.medicinalPart) fields.push({ title: "약용부위", lines: [{ text: drug.medicinalPart }] });
    const originLines = drug.origins.length ? drug.origins.map((origin) => [origin.nameKo, origin.scientificName].filter(Boolean).join(" · ")) : [drug.origin].filter(Boolean) as string[];
    if (originLines.length) fields.push({ title: "기원", lines: originLines.map((text) => ({ text })) });
    if (drug.family) fields.push({ title: "과", lines: [{ text: drug.family }] });
    if (drug.relatedDrugs.length) fields.push({ title: "연관생약", lines: drug.relatedDrugs.map((item) => ({ text: item.name })) });
    if (drug.similarDrugs.length) fields.push({ title: "유사생약", lines: drug.similarDrugs.map((item) => ({ text: item.name })) });
    if (drug.identityTerms.length) fields.push({ title: "가공 및 기타 사항", lines: [{ text: drug.identityTerms.map((term) => term.name).join(" · ") }] });
    for (const section of drug.sections.filter((section) => section.title !== "암기법" && (!section.fieldDefinitionId || activeFieldIds.has(section.fieldDefinitionId)))) fields.push(await studyField(section.title, section.items, section.blocks ?? []));
    const mnemonics = await selectMnemonicVersions(id, viewingUserId, options.mnemonicMode, options.mnemonicUserId);
    for (const mnemonic of mnemonics) fields.push(await studyField(mnemonics.length > 1 ? `암기법 · ${mnemonic.userName}` : "암기법", mnemonic.items, mnemonic.blocks));
    cards.push({ title: drug.koreanName, subtitle: [drug.latinName, drug.importance].filter(Boolean).join(" · "), fields: fields.filter((field) => field.lines.length || field.images?.length) });
  }
  return cards;
}

async function studyField(title: string, items: StudyItem[], blocks: import("@/lib/db/schema").StudyBlock[]): Promise<PdfField> {
  const lines: PdfField["lines"] = [];
  const visit = (rows: StudyItem[], depth: number) => rows.forEach((item, index) => { const marker = `${hierarchyMarker(depth, index)} `; const html = item.html ? `${marker}${item.html}` : undefined; lines.push({ text: `${marker}${plainText(item.html, item.text)}`, html, runs: richTextRuns(html, `${marker}${item.text}`), indent: depth * 13, bold: item.bold, italic: item.italic, gapAfter: 2 }); visit(item.children ?? [], depth + 1); });
  const itemBlocks = (blocks ?? []).filter((block): block is Extract<import("@/lib/db/schema").StudyBlock, { type: "items" }> => block.type === "items");
  if (itemBlocks.length) for (const block of itemBlocks) visit(block.items, 0); else visit(items, 0);
  const images = (await Promise.all(studyImages(blocks).map(async (image) => { const media = await readMediaAsset(image.mediaAssetId).catch(() => null); return media?.buffer ? { buffer: await exportImageBuffer(Buffer.from(media.buffer), media.asset.mimeType), width: media.asset.width, height: media.asset.height } : null; }))).filter((value): value is NonNullable<typeof value> => Boolean(value));
  return { title, lines, images };
}
