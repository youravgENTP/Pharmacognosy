import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, crudeDrugIdentityTerms, crudeDrugRelationships, crudeDrugs, drugIdentityTerms, families, relationshipTypes } from "@/lib/db/schema";

export async function getDrugProfile(id: string) {
  const [drug] = await db.select({
    id: crudeDrugs.id, catalogIndex: crudeDrugs.catalogIndex, koreanName: crudeDrugs.koreanName, latinName: crudeDrugs.latinName, origin: crudeDrugs.origin, origins: crudeDrugs.origins,
    scientificName: crudeDrugs.scientificName, medicinalPart: crudeDrugs.medicinalPart, familyId: crudeDrugs.familyId, importance: crudeDrugs.importance,
    sections: crudeDrugs.sections, category: categories.name, familyKorean: families.koreanName, familyScientific: families.scientificName,
  }).from(crudeDrugs).leftJoin(categories, eq(crudeDrugs.categoryId, categories.id)).leftJoin(families, eq(crudeDrugs.familyId, families.id)).where(eq(crudeDrugs.id, id)).limit(1);
  if (!drug) return null;
  const [relationships, names, identityTerms] = await Promise.all([
    db.select({ id: crudeDrugRelationships.id, sourceId: crudeDrugRelationships.sourceId, targetId: crudeDrugRelationships.targetId, type: relationshipTypes.name }).from(crudeDrugRelationships).innerJoin(relationshipTypes, eq(crudeDrugRelationships.typeId, relationshipTypes.id)).where(or(eq(crudeDrugRelationships.sourceId, id), eq(crudeDrugRelationships.targetId, id))),
    db.select({ id: crudeDrugs.id, catalogIndex: crudeDrugs.catalogIndex, referenceIndex: crudeDrugs.referenceIndex, name: crudeDrugs.koreanName, latinName: crudeDrugs.latinName }).from(crudeDrugs),
    db.select({ id: drugIdentityTerms.id, name: drugIdentityTerms.name }).from(crudeDrugIdentityTerms).innerJoin(drugIdentityTerms, eq(drugIdentityTerms.id, crudeDrugIdentityTerms.termId)).where(eq(crudeDrugIdentityTerms.crudeDrugId, id)).orderBy(crudeDrugIdentityTerms.position),
  ]);
  const nameMap = new Map(names.map((row) => [row.id, row.name]));
  const indexMap = new Map(names.map((row) => [row.id, row.catalogIndex]));
  const referenceIndexMap = new Map(names.map((row) => [row.id, row.referenceIndex]));
  const linked = relationships.map((row) => { const drugId = row.sourceId === id ? row.targetId : row.sourceId; return { id: row.id, drugId, catalogIndex: indexMap.get(drugId) ?? null, referenceIndex: referenceIndexMap.get(drugId) ?? null, name: nameMap.get(drugId)!, type: row.type === "유사생약" ? "유사생약" as const : "연관생약" as const }; }).filter((row) => row.name);
  const relatedDrugs = linked.filter((row) => row.type === "연관생약");
  const similarDrugs = linked.filter((row) => row.type === "유사생약");
  const availableDrugs = names.filter((row) => row.id !== id && !linked.some((related) => related.drugId === row.id));
  const titleAliases: Record<string, string> = { "확인시험법": "확인시험", "주의 및 부작용 / 독성": "주의·부작용·독성" };
  const normalized = drug.sections.filter((section) => section.title !== "연관생약").map((section) => ({ ...section, title: titleAliases[section.title] ?? section.title }));
  return { ...drug, sections: normalized, family: [drug.familyKorean, drug.familyScientific].filter(Boolean).join(" · ") || null, identityTerms, relatedDrugs, similarDrugs, availableDrugs };
}
