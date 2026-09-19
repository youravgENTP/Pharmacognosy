import { db } from "@/lib/db";
import { crudeDrugs, families, type StudyBlock, type StudySection } from "@/lib/db/schema";

export type MediaReference = { entityType: "drug" | "family"; entityId: string; entityName: string; fieldName: string };

export async function getMediaReferences() {
  const [drugs, familyRows] = await Promise.all([
    db.select({ id: crudeDrugs.id, name: crudeDrugs.koreanName, sections: crudeDrugs.sections }).from(crudeDrugs),
    db.select({ id: families.id, name: families.koreanName, blocks: families.summaryBlocks }).from(families),
  ]);
  const references = new Map<string, MediaReference[]>();
  const add = (assetId: string, value: MediaReference) => references.set(assetId, [...(references.get(assetId) ?? []), value]);
  for (const drug of drugs) for (const section of drug.sections as StudySection[]) for (const block of section.blocks ?? []) if (block.type === "image") add(block.mediaAssetId, { entityType: "drug", entityId: drug.id, entityName: drug.name, fieldName: section.title });
  for (const family of familyRows) for (const block of family.blocks as StudyBlock[]) if (block.type === "image") add(block.mediaAssetId, { entityType: "family", entityId: family.id, entityName: family.name, fieldName: "Summary" });
  return references;
}
