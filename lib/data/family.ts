import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, crudeDrugs, families } from "@/lib/db/schema";

export async function getFamilyExplorerData() {
  const rows = await db.select({
    familyId: families.id,
    koreanName: families.koreanName,
    scientificName: families.scientificName,
    acceptedScientificName: families.acceptedScientificName,
    summary: families.summary,
    drugId: crudeDrugs.id,
    catalogIndex: crudeDrugs.catalogIndex,
    drugKoreanName: crudeDrugs.koreanName,
    drugLatinName: crudeDrugs.latinName,
    categoryId: categories.id,
    categoryName: categories.name,
    categoryPosition: categories.position,
  }).from(families)
    .leftJoin(crudeDrugs, eq(crudeDrugs.familyId, families.id))
    .leftJoin(categories, eq(crudeDrugs.categoryId, categories.id))
    .orderBy(asc(families.koreanName), asc(categories.position), asc(crudeDrugs.catalogIndex));

  return Array.from(rows.reduce((map, row) => {
    if (!map.has(row.familyId)) map.set(row.familyId, {
      id: row.familyId,
      koreanName: row.koreanName,
      scientificName: row.scientificName,
      acceptedScientificName: row.acceptedScientificName,
      summary: row.summary,
      drugs: [] as { id: string; catalogIndex: number | null; koreanName: string; latinName: string | null; categoryId: string | null; categoryName: string }[],
    });
    if (row.drugId && row.drugKoreanName) map.get(row.familyId)!.drugs.push({
      id: row.drugId,
      catalogIndex: row.catalogIndex,
      koreanName: row.drugKoreanName,
      latinName: row.drugLatinName,
      categoryId: row.categoryId,
      categoryName: row.categoryName ?? "미분류",
    });
    return map;
  }, new Map<string, {
    id: string;
    koreanName: string;
    scientificName: string;
    acceptedScientificName: string | null;
    summary: typeof rows[number]["summary"];
    drugs: { id: string; catalogIndex: number | null; koreanName: string; latinName: string | null; categoryId: string | null; categoryName: string }[];
  }>()).values());
}
