import { asc, eq } from "drizzle-orm";
import { DrugBoard } from "@/components/drug-board";
import { db } from "@/lib/db";
import { categories, crudeDrugs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const rows = await db.select({
    categoryId: categories.id, categoryName: categories.name, categorySlug: categories.slug, categoryPosition: categories.position,
    id: crudeDrugs.id, catalogIndex: crudeDrugs.catalogIndex, referenceIndex: crudeDrugs.referenceIndex, koreanName: crudeDrugs.koreanName, latinName: crudeDrugs.latinName,
    origin: crudeDrugs.origin, scientificName: crudeDrugs.scientificName, importance: crudeDrugs.importance,
  }).from(categories).leftJoin(crudeDrugs, eq(crudeDrugs.categoryId, categories.id)).orderBy(asc(categories.position), asc(crudeDrugs.catalogIndex), asc(crudeDrugs.referenceIndex));
  const grouped = Array.from(rows.reduce((map, row) => {
    if (!map.has(row.categoryId)) map.set(row.categoryId, { id: row.categoryId, name: row.categoryName, slug: row.categorySlug, drugs: [] });
    if (row.id && row.koreanName) map.get(row.categoryId)!.drugs.push({ id: row.id, catalogIndex: row.catalogIndex, referenceIndex: row.referenceIndex, koreanName: row.koreanName, latinName: row.latinName, origin: row.origin, scientificName: row.scientificName, importance: row.importance! });
    return map;
  }, new Map<string, { id: string; name: string; slug: string; drugs: { id: string; catalogIndex: number | null; referenceIndex: number | null; koreanName: string; latinName: string | null; origin: string | null; scientificName: string | null; importance: "중요" | "중간" | "비중요" }[] }>()).values());
  return <div className="page wide"><DrugBoard categories={grouped}/></div>;
}
