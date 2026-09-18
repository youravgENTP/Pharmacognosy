import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import familyBase from "../data/botanical-families.json";

type FamilySeed = { korean_name: string; scientific_name: string; herbal_drugs: string[] };

const acceptedNames: Record<string, string> = {
  Cruciferae: "Brassicaceae",
  Leguminosae: "Fabaceae",
  Palmae: "Arecaceae",
  Gramineae: "Poaceae",
  Compositae: "Asteraceae",
  Umbelliferae: "Apiaceae",
  Labiatae: "Lamiaceae",
};

const drugNameAliases: Record<string, string> = {
  "홉(호프)": "홉,호프",
  "육종용": "육종용(열당)",
};

async function main() {
  const { db, databaseClient } = await import("../lib/db");
  const { crudeDrugs, families } = await import("../lib/db/schema");
  let familyRows = await db.select().from(families);
  const drugs = await db.select({ id: crudeDrugs.id, koreanName: crudeDrugs.koreanName }).from(crudeDrugs);
  const drugByName = new Map(drugs.map((drug) => [drug.koreanName, drug.id]));
  const missing: string[] = [];
  let linked = 0;

  for (const source of familyBase.families as FamilySeed[]) {
    const acceptedScientificName = acceptedNames[source.scientific_name] ?? null;
    let family = familyRows.find((row) => row.scientificName === source.scientific_name)
      ?? familyRows.find((row) => acceptedScientificName && (row.scientificName === acceptedScientificName || row.acceptedScientificName === acceptedScientificName));
    if (family) {
      [family] = await db.update(families).set({ koreanName: source.korean_name, scientificName: source.scientific_name, acceptedScientificName, updatedAt: new Date() }).where(eq(families.id, family.id)).returning();
    } else {
      [family] = await db.insert(families).values({ koreanName: source.korean_name, scientificName: source.scientific_name, acceptedScientificName }).returning();
    }
    familyRows = familyRows.filter((row) => row.id !== family.id).concat(family);
    for (const drugName of source.herbal_drugs) {
      const drugId = drugByName.get(drugNameAliases[drugName] ?? drugName);
      if (!drugId) { missing.push(drugName); continue; }
      await db.update(crudeDrugs).set({ familyId: family.id, updatedAt: new Date() }).where(eq(crudeDrugs.id, drugId));
      linked += 1;
    }
  }

  console.log(`Botanical families merged: ${(familyBase.families as FamilySeed[]).length} families, ${linked} drug links.${missing.length ? ` Missing drugs: ${[...new Set(missing)].join(", ")}` : ""}`);
  await databaseClient.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
