import type { ImportanceLevel, StudyBlock, StudyItem, StudySection } from "@/lib/db/schema";
import { hierarchyMarker, plainText, richTextRuns, studyImages, type PdfCard, type PdfField } from "@/lib/export/common";
import { exportImageBuffer } from "@/lib/export/images";
import { formatDrugIndex } from "@/lib/drug-index";

export type ExportDrugProfile = {
  catalogIndex?: number | null;
  referenceIndex?: number | null;
  koreanName: string;
  latinName: string | null;
  importance: ImportanceLevel;
  scientificName: string | null;
  medicinalPart: string | null;
  origin: string | null;
  origins: { nameKo: string | null; scientificName: string | null }[];
  family: string | null;
  relatedDrugs: { name: string }[];
  similarDrugs: { name: string }[];
  identityTerms: { name: string }[];
  sections: StudySection[];
};

export type ExportMnemonic = { userName: string; items: StudyItem[]; blocks: StudyBlock[] };
export type ExportMedia = { buffer: Buffer; mimeType: string; width: number; height: number };
export type ExportImageWarning = { drugId: string; section: string; mediaAssetId: string; mimeType?: string; error: unknown };

export async function prepareDrugExportCard(
  drugId: string,
  drug: ExportDrugProfile,
  activeFieldIds: ReadonlySet<string>,
  mnemonics: ExportMnemonic[],
  loadMedia: (id: string) => Promise<ExportMedia | null>,
  warn: (warning: ExportImageWarning) => void,
): Promise<PdfCard> {
  const fields: PdfField[] = [];
  const origins = normalizedOrigins(drug);
  if (drug.scientificName && !origins.carriesScientificName) fields.push({ title: "학명", lines: [{ text: drug.scientificName, italic: true }] });
  if (drug.medicinalPart) fields.push({ title: "약용부위", lines: [{ text: drug.medicinalPart }] });
  if (origins.lines.length) fields.push({ title: "기원", lines: origins.lines.map((text) => ({ text })) });
  if (drug.family) fields.push({ title: "과", lines: [{ text: drug.family }] });
  if (drug.relatedDrugs.length) fields.push({ title: "연관생약", lines: drug.relatedDrugs.map((item) => ({ text: item.name })) });
  if (drug.similarDrugs.length) fields.push({ title: "유사생약", lines: drug.similarDrugs.map((item) => ({ text: item.name })) });
  if (drug.identityTerms.length) fields.push({ title: "가공 및 기타 사항", lines: [{ text: drug.identityTerms.map((term) => term.name).join(" · ") }] });
  for (const section of drug.sections.filter((section) => section.title !== "암기법" && (!section.fieldDefinitionId || activeFieldIds.has(section.fieldDefinitionId)))) fields.push(await prepareStudyField(drugId, section.title, section.items, section.blocks ?? [], loadMedia, warn));
  for (const mnemonic of mnemonics) fields.push(await prepareStudyField(drugId, mnemonics.length > 1 ? `암기법 · ${mnemonic.userName}` : "암기법", mnemonic.items, mnemonic.blocks, loadMedia, warn));
  return {
    title: drug.koreanName,
    subtitle: [drug.latinName, drug.importance].filter(Boolean).join(" · "),
    exportIndex: drug.catalogIndex != null || drug.referenceIndex != null ? formatDrugIndex(drug.catalogIndex ?? null, drug.referenceIndex ?? null) : undefined,
    latinName: drug.latinName ?? undefined,
    fields: fields.filter((field) => field.lines.length || field.images?.length),
  };
}

export async function prepareStudyField(drugId: string, title: string, items: StudyItem[], blocks: StudyBlock[], loadMedia: (id: string) => Promise<ExportMedia | null>, warn: (warning: ExportImageWarning) => void): Promise<PdfField> {
  const lines: PdfField["lines"] = [];
  const visit = (rows: StudyItem[], depth: number) => rows.forEach((item, index) => { const content = plainText(item.html, item.text).trim(); if (content) { const marker = `${hierarchyMarker(depth, index)} `; const html = item.html ? `${marker}${item.html}` : undefined; lines.push({ text: `${marker}${content}`, html, runs: richTextRuns(html, `${marker}${content}`), indent: depth * 13, bold: item.bold, italic: item.italic, gapAfter: 2 }); } visit(item.children ?? [], depth + 1); });
  const itemBlocks = blocks.filter((block): block is Extract<StudyBlock, { type: "items" }> => block.type === "items");
  if (itemBlocks.length) for (const block of itemBlocks) visit(block.items, 0); else visit(items, 0);
  const images = (await Promise.all(studyImages(blocks).map(async (image) => {
    let media: ExportMedia | null = null;
    try {
      media = await loadMedia(image.mediaAssetId);
      if (!media?.buffer.length) throw new Error("Media asset is missing or empty");
      if (!validDimension(media.width) || !validDimension(media.height)) throw new Error(`Invalid image geometry: ${media.width}x${media.height}`);
      const widthPercent = clampPercent(image.widthPercent ?? imageSizePercent(image.size), 15, 100);
      const defaultX = image.align === "right" ? 100 - widthPercent : image.align === "center" ? (100 - widthPercent) / 2 : 0;
      return {
        buffer: await exportImageBuffer(Buffer.from(media.buffer), media.mimeType),
        width: media.width,
        height: media.height,
        widthPercent,
        xPercent: clampPercent(image.xPercent ?? defaultX, 0, 100 - widthPercent),
        align: image.align,
      };
    } catch (error) {
      warn({ drugId, section: title, mediaAssetId: image.mediaAssetId, mimeType: media?.mimeType, error });
      return null;
    }
  }))).filter((value): value is NonNullable<typeof value> => Boolean(value));
  return { title, lines, images };
}

function validDimension(value: number) { return Number.isFinite(value) && value > 0; }

function normalizedOrigins(drug: Pick<ExportDrugProfile, "origin" | "origins" | "scientificName">) {
  const scientificName = drug.scientificName?.trim();
  if (drug.origins.length) {
    const rows = drug.origins.map((origin) => ({ nameKo: origin.nameKo?.trim(), scientificName: origin.scientificName?.trim() })).filter((origin) => origin.nameKo || origin.scientificName);
    const hasOriginScientificName = rows.some((origin) => origin.scientificName);
    if (rows.length === 1 && scientificName && !rows[0].scientificName) rows[0].scientificName = scientificName;
    return { lines: rows.map((origin) => [origin.nameKo, origin.scientificName].filter(Boolean).join(" · ")), carriesScientificName: hasOriginScientificName || Boolean(rows.length === 1 && scientificName) };
  }
  const origin = drug.origin?.trim();
  if (!origin) return { lines: [], carriesScientificName: false };
  if (!scientificName || origin.toLocaleLowerCase().includes(scientificName.toLocaleLowerCase())) return { lines: [origin], carriesScientificName: Boolean(scientificName && origin.toLocaleLowerCase().includes(scientificName.toLocaleLowerCase())) };
  return { lines: [`${origin} · ${scientificName}`], carriesScientificName: true };
}

function imageSizePercent(size: Extract<StudyBlock, { type: "image" }>["size"]) { return { small: 25, medium: 50, large: 75, full: 100 }[size]; }
function clampPercent(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }
