import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, crudeDrugRelationships, crudeDrugs, families } from "@/lib/db/schema";

export async function getDrugProfile(id: string) {
  const [drug] = await db.select({
    id: crudeDrugs.id, catalogIndex: crudeDrugs.catalogIndex, koreanName: crudeDrugs.koreanName, latinName: crudeDrugs.latinName, origin: crudeDrugs.origin,
    scientificName: crudeDrugs.scientificName, medicinalPart: crudeDrugs.medicinalPart, importance: crudeDrugs.importance,
    sections: crudeDrugs.sections, category: categories.name, familyKorean: families.koreanName, familyScientific: families.scientificName,
  }).from(crudeDrugs).leftJoin(categories, eq(crudeDrugs.categoryId, categories.id)).leftJoin(families, eq(crudeDrugs.familyId, families.id)).where(eq(crudeDrugs.id, id)).limit(1);
  if (!drug) return null;
  const [relationships, names] = await Promise.all([
    db.select({ id: crudeDrugRelationships.id, sourceId: crudeDrugRelationships.sourceId, targetId: crudeDrugRelationships.targetId }).from(crudeDrugRelationships).where(or(eq(crudeDrugRelationships.sourceId, id), eq(crudeDrugRelationships.targetId, id))),
    db.select({ id: crudeDrugs.id, catalogIndex: crudeDrugs.catalogIndex, name: crudeDrugs.koreanName }).from(crudeDrugs),
  ]);
  const nameMap = new Map(names.map((row) => [row.id, row.name]));
  const indexMap = new Map(names.map((row) => [row.id, row.catalogIndex]));
  const relatedDrugs = relationships.map((row) => { const drugId = row.sourceId === id ? row.targetId : row.sourceId; return { id: row.id, drugId, catalogIndex: indexMap.get(drugId) ?? null, name: nameMap.get(drugId)! }; }).filter((row) => row.name);
  const availableDrugs = names.filter((row) => row.id !== id && !relatedDrugs.some((related) => related.drugId === row.id));
  const titleAliases: Record<string, string> = { "확인시험법": "확인시험", "주의 및 부작용 / 독성": "주의·부작용·독성" };
  const normalized = drug.sections.filter((section) => section.title !== "연관생약").map((section) => ({ ...section, title: titleAliases[section.title] ?? section.title }));
  return { ...drug, sections: normalized, family: [drug.familyKorean, drug.familyScientific].filter(Boolean).join(" · ") || null, relatedDrugs, availableDrugs };
}
