import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crudeDrugs, families, type OriginPlant } from "@/lib/db/schema";

export async function GET() {
  const [familyRows, drugRows] = await Promise.all([
    db.select({ id: families.id, koreanName: families.koreanName, scientificName: families.scientificName, acceptedScientificName: families.acceptedScientificName }).from(families).orderBy(asc(families.koreanName)),
    db.select({ id: crudeDrugs.id, koreanName: crudeDrugs.koreanName, latinName: crudeDrugs.latinName, origin: crudeDrugs.origin, origins: crudeDrugs.origins, scientificName: crudeDrugs.scientificName }).from(crudeDrugs).orderBy(asc(crudeDrugs.catalogIndex), asc(crudeDrugs.referenceIndex)),
  ]);
  const originMap = new Map<string, OriginPlant & { drugs: { id: string; name: string }[] }>();
  for (const drug of drugRows) {
    const source = drug.origins.length ? drug.origins : (drug.origin || drug.scientificName ? [{ nameKo: drug.origin, scientificName: drug.scientificName }] : []);
    for (const origin of source) {
      if (!origin.nameKo && !origin.scientificName) continue;
      const key = `${origin.nameKo ?? ""}\u0000${origin.scientificName ?? ""}`.toLocaleLowerCase();
      const existing = originMap.get(key) ?? { ...origin, drugs: [] };
      if (!existing.drugs.some((item) => item.id === drug.id)) existing.drugs.push({ id: drug.id, name: drug.koreanName });
      originMap.set(key, existing);
    }
  }
  return NextResponse.json({ origins: [...originMap.values()], families: familyRows });
}
