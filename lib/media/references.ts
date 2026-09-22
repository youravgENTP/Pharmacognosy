import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { collections, constituentMedia, constituents, constituentTaxa, constituentTaxonMedia, crudeDrugs, families, legacyDrugMnemonics, user, userDrugMnemonics, type CollectionBlock, type StudyBlock, type StudySection } from "@/lib/db/schema";

export type MediaReference = { entityType: "drug" | "family" | "collection" | "constituent_taxon" | "constituent"; entityId: string; entityName: string; fieldName: string };

export async function getMediaReferences() {
  const [drugs, familyRows, collectionRows, mnemonicRows, legacyMnemonicRows, taxonMediaRows, constituentMediaRows] = await Promise.all([
    db.select({ id: crudeDrugs.id, name: crudeDrugs.koreanName, sections: crudeDrugs.sections }).from(crudeDrugs),
    db.select({ id: families.id, name: families.koreanName, blocks: families.summaryBlocks }).from(families),
    db.select({ id: collections.id, name: collections.name, document: collections.document }).from(collections),
    db.select({ id: crudeDrugs.id, name: crudeDrugs.koreanName, userName: user.name, blocks: userDrugMnemonics.blocks }).from(userDrugMnemonics).innerJoin(crudeDrugs, eq(crudeDrugs.id, userDrugMnemonics.drugId)).innerJoin(user, eq(user.id, userDrugMnemonics.userId)),
    db.select({ id: crudeDrugs.id, name: crudeDrugs.koreanName, blocks: legacyDrugMnemonics.blocks }).from(legacyDrugMnemonics).innerJoin(crudeDrugs, eq(crudeDrugs.id, legacyDrugMnemonics.drugId)),
    db.select({ assetId: constituentTaxonMedia.mediaAssetId, id: constituentTaxa.id, name: constituentTaxa.name }).from(constituentTaxonMedia).innerJoin(constituentTaxa, eq(constituentTaxa.id, constituentTaxonMedia.taxonId)),
    db.select({ assetId: constituentMedia.mediaAssetId, id: constituents.id, name: constituents.name }).from(constituentMedia).innerJoin(constituents, eq(constituents.id, constituentMedia.constituentId)),
  ]);
  const references = new Map<string, MediaReference[]>();
  const add = (assetId: string, value: MediaReference) => references.set(assetId, [...(references.get(assetId) ?? []), value]);
  for (const drug of drugs) for (const section of drug.sections as StudySection[]) for (const block of section.blocks ?? []) if (block.type === "image") add(block.mediaAssetId, { entityType: "drug", entityId: drug.id, entityName: drug.name, fieldName: section.title });
  for (const mnemonic of mnemonicRows) for (const block of mnemonic.blocks as StudyBlock[]) if (block.type === "image") add(block.mediaAssetId, { entityType: "drug", entityId: mnemonic.id, entityName: mnemonic.name, fieldName: `암기법 · ${mnemonic.userName}` });
  for (const mnemonic of legacyMnemonicRows) for (const block of mnemonic.blocks as StudyBlock[]) if (block.type === "image") add(block.mediaAssetId, { entityType: "drug", entityId: mnemonic.id, entityName: mnemonic.name, fieldName: "암기법 · 이전 공유 데이터" });
  for (const family of familyRows) for (const block of family.blocks as StudyBlock[]) if (block.type === "image") add(block.mediaAssetId, { entityType: "family", entityId: family.id, entityName: family.name, fieldName: "Summary" });
  for (const collection of collectionRows) for (const block of collection.document.blocks as CollectionBlock[]) { if (block.type === "image" && block.mediaAssetId) add(block.mediaAssetId, { entityType: "collection", entityId: collection.id, entityName: collection.name, fieldName: "Document" }); if (block.type === "hierarchy") for (const nested of block.blocks ?? []) if (nested.type === "image") add(nested.mediaAssetId, { entityType: "collection", entityId: collection.id, entityName: collection.name, fieldName: "Hierarchy" }); }
  for (const row of taxonMediaRows) add(row.assetId, { entityType: "constituent_taxon", entityId: row.id, entityName: row.name, fieldName: "Compound Tree" });
  for (const row of constituentMediaRows) add(row.assetId, { entityType: "constituent", entityId: row.id, entityName: row.name, fieldName: "Constituent" });
  return references;
}
