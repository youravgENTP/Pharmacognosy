import { z } from "zod";
import type { StudyBlock, StudyItem, StudySection } from "@/lib/db/schema";

const studyItemSchema: z.ZodType<StudyItem> = z.lazy(() => z.object({
  id: z.string().min(1), text: z.string(), html: z.string().optional(), bold: z.boolean().optional(), italic: z.boolean().optional(), highlight: z.boolean().optional(), linkedConstituentId: z.string().optional(), children: z.array(studyItemSchema).optional(),
}));
const imageBlockSchema = z.object({ id: z.string(), type: z.literal("image"), mediaAssetId: z.string().uuid(), size: z.enum(["small", "medium", "large", "full"]), widthPercent: z.number().optional(), xPercent: z.number().optional(), yPx: z.number().optional(), anchorItemId: z.string().optional(), anchorSide: z.enum(["before", "after"]).optional(), align: z.enum(["left", "center", "right"]).optional() });
const studyBlockSchema: z.ZodType<StudyBlock> = z.union([z.object({ id: z.string(), type: z.literal("items"), items: z.array(studyItemSchema) }), imageBlockSchema]);
const studySectionSchema: z.ZodType<StudySection> = z.object({ id: z.string(), title: z.string(), fieldDefinitionId: z.string().optional(), items: z.array(studyItemSchema), blocks: z.array(studyBlockSchema).optional() });

export const backupDrugSchema = z.object({
  id: z.string().uuid(), catalogIndex: z.number().int().nullable(), referenceIndex: z.number().int().nullable(), koreanName: z.string(), latinName: z.string().nullable(), origin: z.string().nullable(), origins: z.array(z.object({ nameKo: z.string().nullable(), scientificName: z.string().nullable() })), scientificName: z.string().nullable(), medicinalPart: z.string().nullable(), categoryId: z.string().uuid().nullable(), familyId: z.string().uuid().nullable(), importance: z.enum(["중요", "중간", "비중요"]), sections: z.array(studySectionSchema), createdAt: z.string().or(z.date()), updatedAt: z.string().or(z.date()),
});

export type BackupDrug = z.infer<typeof backupDrugSchema>;
export type RestoreFieldKey = "basic" | "origins" | "family" | "importance" | "identification" | `section:${string}`;
export type RestoreSelection = { drugId: string; fields: RestoreFieldKey[] };

export function restoreFieldOptions(drug: BackupDrug) {
  return [
    { key: "basic" as const, label: "기본 정보" },
    { key: "origins" as const, label: "기원 / 기원식물" },
    { key: "family" as const, label: "Family" },
    { key: "importance" as const, label: "중요도" },
    { key: "identification" as const, label: "연관·유사·가공 정보" },
    ...drug.sections.map((section) => ({ key: `section:${section.id}` as const, label: section.title })),
  ];
}

export function applySelectedDrugFields(current: BackupDrug, backup: BackupDrug, fields: RestoreFieldKey[], dependencyIds: { categoryId?: string | null; familyId?: string | null } = {}) {
  const next: BackupDrug = structuredClone(current);
  if (fields.includes("basic")) Object.assign(next, { catalogIndex: backup.catalogIndex, referenceIndex: backup.referenceIndex, koreanName: backup.koreanName, latinName: backup.latinName, scientificName: backup.scientificName, medicinalPart: backup.medicinalPart, categoryId: dependencyIds.categoryId === undefined ? backup.categoryId : dependencyIds.categoryId });
  if (fields.includes("origins")) Object.assign(next, { origin: backup.origin, origins: structuredClone(backup.origins) });
  if (fields.includes("family")) next.familyId = dependencyIds.familyId === undefined ? backup.familyId : dependencyIds.familyId;
  if (fields.includes("importance")) next.importance = backup.importance;
  for (const field of fields) {
    if (!field.startsWith("section:")) continue;
    const id = field.slice("section:".length);
    const replacement = backup.sections.find((section) => section.id === id);
    if (!replacement) throw new Error(`백업에서 section ${id}을 찾을 수 없습니다.`);
    const currentIndex = next.sections.findIndex((section) => section.id === id || (replacement.fieldDefinitionId && section.fieldDefinitionId === replacement.fieldDefinitionId));
    if (currentIndex >= 0) next.sections[currentIndex] = structuredClone(replacement);
    else next.sections.push(structuredClone(replacement));
  }
  next.updatedAt = new Date();
  return next;
}

export function referencedMediaIds(sections: StudySection[]) {
  const ids = new Set<string>();
  for (const section of sections) for (const block of section.blocks ?? []) if (block.type === "image") ids.add(block.mediaAssetId);
  return ids;
}

export function rewriteSectionMedia(section: StudySection, ids: Map<string, string>) {
  return { ...structuredClone(section), blocks: section.blocks?.map((block) => block.type === "image" && ids.has(block.mediaAssetId) ? { ...block, mediaAssetId: ids.get(block.mediaAssetId)! } : structuredClone(block)) };
}

export function referencedTaxonIds(sections: StudySection[]) {
  const ids = new Set<string>();
  const visit = (items: StudyItem[]) => items.forEach((item) => { if (item.linkedConstituentId) ids.add(item.linkedConstituentId); if (item.children) visit(item.children); });
  for (const section of sections) {
    visit(section.items);
    for (const block of section.blocks ?? []) if (block.type === "items") visit(block.items);
  }
  return ids;
}

export function rewriteSectionTaxa(section: StudySection, ids: Map<string, string>) {
  const rewrite = (items: StudyItem[]): StudyItem[] => items.map((item) => ({ ...structuredClone(item), ...(item.linkedConstituentId && ids.has(item.linkedConstituentId) ? { linkedConstituentId: ids.get(item.linkedConstituentId)! } : {}), ...(item.children ? { children: rewrite(item.children) } : {}) }));
  return { ...structuredClone(section), items: rewrite(section.items), blocks: section.blocks?.map((block) => block.type === "items" ? { ...block, items: rewrite(block.items) } : structuredClone(block)) };
}
